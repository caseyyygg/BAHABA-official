<?php
header('Content-Type: application/json');
try {
    $config = require __DIR__ . '/api/config.php';
    $pdo = new PDO(
        $config['db']['dsn'],
        $config['db']['username'],
        $config['db']['password'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION],
    );
    $pdo->query('SELECT 1');
    echo json_encode(['ok' => true]);
} catch (Throwable $error) {
    error_log('BANTALA API health check failed.');
    http_response_code(503);
    echo json_encode(['ok' => false]);
}
