<?php
$config = require __DIR__ . '/../api/config.php';
require __DIR__ . '/../api/location_helpers.php';
require __DIR__ . '/../api/report-retention.php';
$pdo = new PDO($config['db']['dsn'], $config['db']['username'], $config['db']['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
bahaba_ensure_report_summary($pdo);
// Temporary tables shadow live tables on this connection only.
foreach (['reports', 'report_monthly_summary'] as $table) {
    $definition = $pdo->query('SHOW CREATE TABLE ' . $table)->fetch(PDO::FETCH_NUM)[1];
    $definition = preg_replace('/,\n\s*CONSTRAINT[^\n]+/', '', $definition);
    $pdo->exec(preg_replace('/^CREATE TABLE /', 'CREATE TEMPORARY TABLE ', $definition));
}
$pdo->exec("SET time_zone = '+08:00'");
$insert = $pdo->prepare("INSERT INTO reports (city, barangay, severity, reporter, source, description, status, location_id, created_at)
    VALUES ('Malolos City', 'Anilao', ?, 'Retention test', 'lgu', 'Temporary test only', ?, 'malolos', CURRENT_TIMESTAMP - INTERVAL ? DAY)");
$insert->execute(['high', 'verified', 40]);
$insert->execute(['high', 'verified', 40]);
$insert->execute(['low', 'rejected', 40]);
$insert->execute(['medium', 'pending', 5]);
function check(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
check(bahaba_archive_expired_reports($pdo, 1) === 3, 'Expired reports must be removed across batches');
check((int) $pdo->query('SELECT COUNT(*) FROM reports')->fetchColumn() === 1, 'Recent report must remain');
check((int) $pdo->query('SELECT SUM(report_count) FROM report_monthly_summary')->fetchColumn() === 3, 'Every expired report must be summarized');
check(bahaba_archive_expired_reports($pdo) === 0, 'Second run must not double count');
check((int) $pdo->query('SELECT SUM(report_count) FROM report_monthly_summary')->fetchColumn() === 3, 'Summary must stay unchanged');
$trends = bahaba_report_trends($pdo, 'malolos');
check(array_sum(array_column($trends, 'report_count')) === 4, 'Trends must include live and archived reports');
check(bahaba_report_trends($pdo, 'navotas') === [], 'Locations must be isolated');
// A failed summary write must roll back the corresponding raw-report deletion.
$insert->execute(['high', 'verified', 40]);
$pdo->exec('ALTER TABLE report_monthly_summary MODIFY report_count TINYINT UNSIGNED NOT NULL');
$pdo->exec("UPDATE report_monthly_summary SET report_count = 255 WHERE severity = 'high'");
$pdo->exec("SET SESSION sql_mode = 'STRICT_ALL_TABLES'");
$failed = false;
try { bahaba_archive_expired_reports($pdo); } catch (PDOException) { $failed = true; }
check($failed, 'Overflow must fail safely');
check((int) $pdo->query('SELECT COUNT(*) FROM reports')->fetchColumn() === 2, 'Failed archive must preserve raw reports');
echo "PASS: expiry, batching, idempotency, location scope, live/history totals, and rollback. Live reports untouched.\n";
