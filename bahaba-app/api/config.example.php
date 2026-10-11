<?php

return [
    'db' => [
        'dsn' => 'mysql:host=127.0.0.1;dbname=bahaba;charset=utf8mb4',
        'username' => 'root',
        'password' => '',
    ],
    'api_url' => 'http://localhost:8000/api',
    // Set admin_api_url when the public API uses a different path, e.g. /admin-api.php.
    'admin_api_url' => 'http://localhost:8001/api.php',
    'admin_url' => 'http://localhost:8001',
    'app_url' => 'http://localhost:5173',
    'frontend_origin' => 'http://localhost:5173',
    'nlp_ingest_token' => 'replace-with-a-long-random-secret',
    // Exact platform/account IDs verified by your authenticated social collector.
    // Each entry: ['platform'=>'Facebook', 'publisher_id'=>'official-account-id', 'type'=>'government'].
    // type can be government or news. Display names and text never establish trust.
    'trusted_social_publishers' => [],
    'mail_from' => 'no-reply@example.com',
    'smtp' => [
        'host' => 'smtp.gmail.com',
        'port' => 587,
        'username' => 'your-gmail@gmail.com',
        'password' => 'your-google-app-password',
    ],
];
