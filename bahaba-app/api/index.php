<?php
// API Router
require __DIR__ . '/bootstrap.php';

// Parse the request path
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$path = preg_replace('#^/api/#', '', $path);
$path = rtrim($path, '/');

if (!$path || $path === '') {
    http_response_code(404);
    echo json_encode(['error' => 'API endpoint not found']);
    exit;
}

// Extract the filename (e.g., 'login.php' from 'login')
$filename = basename($path);
if (strpos($filename, '.') === false) {
    $filename = $filename . '.php';
}

$filepath = __DIR__ . '/' . basename($filename);

if (file_exists($filepath) && is_file($filepath)) {
    // Prevent infinite recursion - don't include index.php itself
    if (basename($filepath) === 'index.php') {
        http_response_code(404);
        echo json_encode(['error' => 'API endpoint not found']);
        exit;
    }
    include $filepath;
} else {
    http_response_code(404);
    echo json_encode(['error' => 'API endpoint not found']);
}

