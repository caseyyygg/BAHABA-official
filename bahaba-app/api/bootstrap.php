<?php

require_once __DIR__ . '/location_helpers.php';
require_once __DIR__ . '/psgc.php';

// API errors must never turn into HTML pages that the resident client cannot parse.
ini_set('display_errors', '0');
set_exception_handler(static function (Throwable $error): void {
    error_log('BAHABA API failed: ' . $error->getMessage());
    http_response_code($error instanceof PDOException ? 503 : 500);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'The service is temporarily unavailable. Please try again shortly.']);
});

$configPath = __DIR__ . '/config.php';
if (!is_file($configPath)) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Create api/config.php from api/config.example.php first.']);
    exit;
}

$config = require $configPath;
$publicOrigin = rtrim((string) (getenv('BAHABA_PUBLIC_ORIGIN') ?: ''), '/');
if ($publicOrigin !== '') {
    $config['api_url'] = $publicOrigin . '/api';
    $config['app_url'] = $publicOrigin;
    $config['frontend_origin'] = $publicOrigin;
}

// Set CORS headers FIRST, before anything else
header('Content-Type: application/json');
$allowedOrigins = array_values(array_unique([
    $config['frontend_origin'] ?? '',
    'http://localhost:5173',
    'http://localhost:5175',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5175',
]));
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';

// Always set CORS headers for preflight and actual requests
if (in_array($origin, $allowedOrigins, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
} else {
    header('Access-Control-Allow-Origin: ' . ($config['frontend_origin'] ?? 'http://localhost:5173'));
}

header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Max-Age: 86400');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Now configure and start session
session_set_cookie_params([
    'httponly' => true,
    'samesite' => 'Lax',
    'secure' => false,
    'lifetime' => 30 * 24 * 60 * 60, // 30 days
]);
ini_set('session.gc_maxlifetime', 30 * 24 * 60 * 60); // 30 days
ini_set('session.cookie_lifetime', 30 * 24 * 60 * 60); // 30 days
session_start();

try {
    $pdo = new PDO(
        $config['db']['dsn'],
        $config['db']['username'],
        $config['db']['password'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC],
    );
} catch (PDOException $exception) {
    http_response_code(500);
    echo json_encode(['error' => 'Database connection failed. Check api/config.php.']);
    exit;
}

bahaba_ensure_location_schema($pdo);
require_once __DIR__.'/password-recovery.php';
bahaba_reset_schema($pdo);
bahaba_ensure_column($pdo, 'reports', 'map_hidden', 'BOOLEAN NOT NULL DEFAULT FALSE');
bahaba_ensure_psgc_schema($pdo);

function request_json(): array
{
    $payload = json_decode(file_get_contents('php://input'), true);
    return is_array($payload) ? $payload : [];
}

function respond(array $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data);
    exit;
}

function public_user(array $user): array
{
    return [
        'preferred_locations' => bahaba_preferred_locations($user),
        'preferences_updated_at' => $user['preferences_updated_at'] ?? null,
        'id' => (int) $user['id'],
        'email' => $user['email'],
        'username' => $user['username'],
        'location' => $user['location'],
        'selected_location' => $user['selected_location'] ?? null,
        'selected_location_name' => bahaba_location_display_name($user['selected_location'] ?? null),
        'region' => $user['region'],
        'city' => $user['city'],
        'barangays' => $user['barangays'] ? json_decode($user['barangays'], true) : [],
    ];
}

