<?php

return [
    'db' => [
        'dsn' => 'mysql:host=127.0.0.1;dbname=bahaba;charset=utf8mb4',
        'username' => 'root',
        'password' => '',
    ],
    'api_url' => 'http://localhost:8000/api',
    'app_url' => 'http://localhost:5173',
    'frontend_origin' => 'http://localhost:5173',
    'nlp_ingest_token' => 'replace-with-a-long-random-secret',
    'mail_from' => 'no-reply@example.com',
    'smtp' => [
        'host' => 'smtp.gmail.com',
        'port' => 587,
        'username' => 'your-gmail@gmail.com',
        'password' => 'your-google-app-password',
    ],
];
