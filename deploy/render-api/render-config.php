<?php

$dbHost = getenv('DB_HOST') ?: '';
$dbName = getenv('DB_NAME') ?: '';
$dbUser = getenv('DB_USER') ?: '';
$dbPassword = getenv('DB_PASSWORD') ?: '';

return [
    'db' => [
        'dsn' => sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $dbHost, $dbName),
        'username' => $dbUser,
        'password' => $dbPassword,
    ],
    'api_url' => rtrim(getenv('PUBLIC_APP_URL') ?: '', '/') . '/api',
    'admin_api_url' => rtrim(getenv('PUBLIC_APP_URL') ?: '', '/') . '/admin-api.php',
    'admin_url' => rtrim(getenv('PUBLIC_APP_URL') ?: '', '/') . '/admin/',
    'app_url' => rtrim(getenv('PUBLIC_APP_URL') ?: '', '/'),
    'frontend_origin' => rtrim(getenv('PUBLIC_APP_URL') ?: '', '/'),
    'nlp_ingest_token' => getenv('NLP_INGEST_TOKEN') ?: '',
    'nlp_service_url' => rtrim(getenv('NLP_SERVICE_URL') ?: '', '/'),
    'nlp_service_token' => getenv('NLP_SERVICE_TOKEN') ?: '',
    'social_browser_url' => getenv('SOCIAL_BROWSER_URL') ?: '',
    'social_browser_token' => getenv('SOCIAL_BROWSER_TOKEN') ?: '',
    'trusted_social_publishers' => [],
    'mail_from' => getenv('SMTP_FROM') ?: 'no-reply@example.com',
    'smtp' => [
        'host' => getenv('SMTP_HOST') ?: '',
        'port' => (int) (getenv('SMTP_PORT') ?: 587),
        'username' => getenv('SMTP_USERNAME') ?: '',
        'password' => getenv('SMTP_PASSWORD') ?: '',
    ],
];
