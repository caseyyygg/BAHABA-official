<?php

require __DIR__ . '/bootstrap.php';

$data = request_json();
$email = strtolower(trim((string) ($data['email'] ?? '')));
$password = (string) ($data['password'] ?? '');

$statement = $pdo->prepare('SELECT * FROM users WHERE email = :email LIMIT 1');
$statement->execute(['email' => $email]);
$user = $statement->fetch();

if (!$user || !password_verify($password, $user['password_hash'])) {
    respond(['error' => 'The Gmail address or password is incorrect.'], 401);
}
if (!$user['email_verified_at']) {
    $_SESSION['pending_user_id'] = (int) $user['id'];
    respond(['error' => 'Please activate your account from the link sent to your Gmail first.', 'needsVerification' => true], 403);
}

$_SESSION['user_id'] = (int) $user['id'];
respond(['user' => public_user($user)]);
