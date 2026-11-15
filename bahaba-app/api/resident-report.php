<?php
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/resident-report-location.php';
header('Cache-Control: no-store, private');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond(['error' => 'Method not allowed.'], 405);
$user = bahaba_authenticated_app_user($pdo);
if (!$user) respond(['error' => 'Sign in first.'], 401);

$input = request_json();
$requestKey = strtolower(trim((string) ($input['request_key'] ?? '')));
if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/D', $requestKey)) {
    respond(['error' => 'A valid report request key is required.'], 422);
}
foreach (['latitude', 'longitude', 'accuracy'] as $field) {
    if (!is_numeric($input[$field] ?? null)) respond(['error' => 'Valid GPS coordinates and accuracy are required.'], 422);
}

try {
    $location = bahaba_resident_report_location(
        (float) $input['latitude'],
        (float) $input['longitude'],
        (float) $input['accuracy'],
    );
} catch (InvalidArgumentException $error) {
    respond(['error' => $error->getMessage()], 422);
}

$migrationVersion = 'resident_gps_reports_v1';
$migration = $pdo->prepare('SELECT 1 FROM schema_migrations WHERE version = ?');
$migration->execute([$migrationVersion]);
if (!$migration->fetchColumn()) {
    $lockName = 'bahaba_resident_reports_' . substr(hash('sha256', (string) $pdo->query('SELECT DATABASE()')->fetchColumn()), 0, 16);
    $lock = $pdo->prepare('SELECT GET_LOCK(?, 30)');
    $lock->execute([$lockName]);
    if ((int) $lock->fetchColumn() !== 1) respond(['error' => 'Report storage is being prepared. Please retry shortly.'], 503);
    try {
        $migration->execute([$migrationVersion]);
        if (!$migration->fetchColumn()) {
            bahaba_ensure_column($pdo, 'reports', 'resident_user_id', 'BIGINT UNSIGNED NULL');
            bahaba_ensure_column($pdo, 'reports', 'report_request_key', 'CHAR(36) NULL');
            bahaba_ensure_column($pdo, 'reports', 'gps_accuracy_m', 'DECIMAL(8,2) NULL');
            foreach ([
                'idx_reports_resident_user' => 'resident_user_id',
                'uq_reports_request_key' => 'report_request_key',
            ] as $index => $column) {
                $check = $pdo->prepare('SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?');
                $check->execute(['reports', $index]);
                if (!$check->fetchColumn()) {
                    $pdo->exec(sprintf('CREATE %s INDEX `%s` ON `reports` (`%s`)', str_starts_with($index, 'uq_') ? 'UNIQUE' : '', $index, $column));
                }
            }
            $pdo->prepare('INSERT IGNORE INTO schema_migrations (version) VALUES (?)')->execute([$migrationVersion]);
        }
    } finally {
        $pdo->prepare('SELECT RELEASE_LOCK(?)')->execute([$lockName]);
    }
}

$existing = $pdo->prepare('SELECT id, status FROM reports WHERE report_request_key = ? AND resident_user_id = ? LIMIT 1');
$existing->execute([$requestKey, (int) $user['id']]);
if ($report = $existing->fetch()) respond(['report' => $report, 'duplicate' => true], 200);

$description = trim(strip_tags((string) ($input['description'] ?? '')));
if (mb_strlen($description) > 1000) respond(['error' => 'Report details must be 1,000 characters or fewer.'], 422);
if ($description === '') $description = 'Resident GPS flood report. Pending LGU verification.';

try {
    $insert = $pdo->prepare("INSERT INTO reports
        (city, barangay, barangay_feature_id, latitude, longitude, severity, reporter, source, platform, location_id, description, status, resident_user_id, report_request_key, gps_accuracy_m)
        VALUES (?, ?, ?, ?, ?, 'medium', ?, 'citizen', 'resident-gps', ?, ?, 'pending', ?, ?, ?)");
    $insert->execute([
        $location['city'],
        $location['barangay'],
        $location['barangay_feature_id'],
        (float) $input['latitude'],
        (float) $input['longitude'],
        (string) $user['username'],
        $location['location_id'],
        $description,
        (int) $user['id'],
        $requestKey,
        (float) $input['accuracy'],
    ]);
    respond(['report' => ['id' => (int) $pdo->lastInsertId(), 'status' => 'pending'], 'duplicate' => false], 201);
} catch (PDOException $error) {
    if ((string) $error->getCode() !== '23000') throw $error;
    $existing->execute([$requestKey, (int) $user['id']]);
    if ($report = $existing->fetch()) respond(['report' => $report, 'duplicate' => true], 200);
    respond(['error' => 'This report request conflicts with another submission. Please restart the report.'], 409);
}
