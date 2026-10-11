<?php

function bahaba_ensure_report_summary(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS report_monthly_summary (
        bucket_key CHAR(64) PRIMARY KEY,
        report_month DATE NOT NULL,
        location_id VARCHAR(32) NOT NULL,
        city VARCHAR(100) NOT NULL,
        barangay VARCHAR(100) NOT NULL,
        severity VARCHAR(16) NOT NULL,
        status VARCHAR(24) NOT NULL,
        source VARCHAR(50) NOT NULL,
        report_count BIGINT UNSIGNED NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_summary_location_month (location_id, report_month)
    ) ENGINE=InnoDB");
}

// Summarize and delete the exact same locked rows in one transaction.
// A rollback leaves both raw reports and permanent totals unchanged.
function bahaba_archive_expired_reports(PDO $pdo, int $batchLimit = 1000): int
{
    bahaba_ensure_report_summary($pdo);
    $pdo->exec("SET time_zone = '+08:00'");
    if (!(int) $pdo->query("SELECT GET_LOCK('bahaba_report_retention', 5)")->fetchColumn()) {
        throw new RuntimeException('Another report retention run is in progress.');
    }
    $deleted = 0;
    try {
        do {
            $pdo->beginTransaction();
            $rows = $pdo->query("SELECT id, DATE_FORMAT(created_at, '%Y-%m-01') AS report_month,
                COALESCE(location_id, '') AS location_id, city, barangay, severity, status, source
                FROM reports WHERE created_at < CURRENT_TIMESTAMP - INTERVAL 30 DAY
                ORDER BY id LIMIT " . max(1, min(1000, $batchLimit)) . ' FOR UPDATE')->fetchAll(PDO::FETCH_ASSOC);
            $buckets = [];
            foreach ($rows as $row) {
                $row['location_id'] = bahaba_normalize_location_id($row['location_id'])
                    ?? bahaba_normalize_location_id($row['city']) ?? '';
                $identity = array_intersect_key($row, array_flip(['report_month', 'location_id', 'city', 'barangay', 'severity', 'status', 'source']));
                $key = hash('sha256', json_encode($identity, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
                if (!isset($buckets[$key])) $buckets[$key] = $identity + ['bucket_key' => $key, 'report_count' => 0];
                $buckets[$key]['report_count']++;
            }
            $save = $pdo->prepare('INSERT INTO report_monthly_summary
                (bucket_key, report_month, location_id, city, barangay, severity, status, source, report_count)
                VALUES (:bucket_key, :report_month, :location_id, :city, :barangay, :severity, :status, :source, :report_count)
                ON DUPLICATE KEY UPDATE report_count = report_count + VALUES(report_count)');
            foreach ($buckets as $bucket) $save->execute($bucket);
            if ($rows) {
                $ids = array_map(static fn ($row) => (int) $row['id'], $rows);
                $count = $pdo->exec('DELETE FROM reports WHERE id IN (' . implode(',', $ids) . ')');
                if ($count !== count($rows)) throw new RuntimeException('Report archive count mismatch.');
                $deleted += $count;
            }
            $pdo->commit();
        } while ($rows);
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    } finally {
        $pdo->query("SELECT RELEASE_LOCK('bahaba_report_retention')");
    }
    return $deleted;
}

function bahaba_report_trends(PDO $pdo, string $locationId): array
{
    // One SQL snapshot combines archived summaries and live rows without double counting.
    $statement = $pdo->prepare("SELECT report_month, barangay, severity, status, SUM(report_count) AS report_count FROM (
        SELECT report_month, barangay, severity, status, report_count FROM report_monthly_summary WHERE location_id = :archived_location
        UNION ALL
        SELECT DATE_FORMAT(created_at, '%Y-%m-01'), barangay, severity, status, 1 FROM reports WHERE location_id = :live_location
    ) combined GROUP BY report_month, barangay, severity, status ORDER BY report_month");
    $statement->execute(['archived_location' => $locationId, 'live_location' => $locationId]);
    return $statement->fetchAll(PDO::FETCH_ASSOC);
}
