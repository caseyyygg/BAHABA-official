<?php

require __DIR__ . '/bootstrap.php';

if (empty($_SESSION['pending_user_id'])) {
    respond(['error' => 'No pending account found.'], 401);
}

$statement = $pdo->prepare('SELECT * FROM users WHERE id = :id LIMIT 1');
$statement->execute(['id' => $_SESSION['pending_user_id']]);
$user = $statement->fetch();

if ($user && (int)($user['password_reset_version'] ?? 0) !== (int)($_SESSION['pending_user_reset_version'] ?? 0)) {
    unset($_SESSION['pending_user_id']);
    respond(['error' => 'Please log in again with your current password.'], 401);
}
if (!$user || !$user['email_verified_at']) {
    respond(['error' => 'Your Gmail account is not activated yet.'], 403);
}

$_SESSION['user_id'] = (int) $user['id'];
$_SESSION['user_reset_version'] = (int)($user['password_reset_version'] ?? 0);
unset($_SESSION['pending_user_id']);
respond(['user' => public_user($user)]);
