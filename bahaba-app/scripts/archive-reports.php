<?php
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$config = require __DIR__ . '/../api/config.php';
require __DIR__ . '/../api/location_helpers.php';
require __DIR__ . '/../api/report-retention.php';
$pdo = new PDO($config['db']['dsn'], $config['db']['username'], $config['db']['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
try {
    echo 'Reports summarized and removed: ' . bahaba_archive_expired_reports($pdo) . PHP_EOL;
} catch (Throwable $error) {
    fwrite(STDERR, 'Report retention failed: ' . $error->getMessage() . PHP_EOL);
    exit(1);
}
