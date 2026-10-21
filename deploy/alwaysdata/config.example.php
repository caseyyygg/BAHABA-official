<?php

// Copy this to api/config.php on the AlwaysData site, then fill in values
// privately. Do not commit the completed file.
return [
    'db' => [
        'dsn' => 'mysql:host=MYSQL_HOST_FROM_DASHBOARD;dbname=DATABASE_NAME;charset=utf8mb4',
        'username' => 'DATABASE_USER',
        'password' => 'DATABASE_PASSWORD',
    ],
    'api_url' => 'https://YOUR_CLOUDFLARE_PAGES_HOST/api',
    'admin_api_url' => 'https://YOUR_CLOUDFLARE_PAGES_HOST/admin-api.php',
    'admin_url' => 'https://YOUR_CLOUDFLARE_PAGES_HOST/admin/',
    'app_url' => 'https://YOUR_CLOUDFLARE_PAGES_HOST',
    'frontend_origin' => 'https://YOUR_CLOUDFLARE_PAGES_HOST',
    // Absolute path outside the website document root; never put the key in Git.
    'fcm_service_account_path' => '',
    'nlp_ingest_token' => 'GENERATE_A_LONG_RANDOM_TOKEN',
    'nlp_service_url' => '',
    'nlp_service_token' => '',
    'social_browser_url' => '',
    'social_browser_token' => '',
    'trusted_social_publishers' => [],
    'mail_from' => 'no-reply@YOUR_DOMAIN',
    'smtp' => [
        'host' => 'smtp-YOUR_ACCOUNT.alwaysdata.net',
        'port' => 465,
        'username' => 'YOUR_MAILBOX@YOUR_DOMAIN',
        'password' => 'SET_PRIVATELY_IN_API_CONFIG',
    ],
];
