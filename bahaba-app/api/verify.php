<?php

require __DIR__ . '/bootstrap.php';

$token = (string) ($_GET['token'] ?? '');
$hash = hash('sha256', $token);
$statement = $pdo->prepare('SELECT id FROM users WHERE verification_token_hash = :token AND verification_expires_at > NOW() AND email_verified_at IS NULL LIMIT 1');
$statement->execute(['token' => $hash]);
$user = $statement->fetch();

if (!$user) {
    http_response_code(400);
    header_remove('Content-Type');
    echo '<h1>Activation link is invalid or expired.</h1><p>Return to BAHABA and request a new account.</p>';
    exit;
}

$update = $pdo->prepare('UPDATE users SET email_verified_at = NOW(), verification_token_hash = NULL, verification_expires_at = NULL WHERE id = :id');
$update->execute(['id' => $user['id']]);
header('Location: ' . $config['app_url'] . '?verified=1');