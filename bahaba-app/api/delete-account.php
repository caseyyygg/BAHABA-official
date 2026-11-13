<?php

require __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond(['error' => 'Method not allowed.'], 405);
$user = bahaba_authenticated_app_user($pdo);
if (!$user || empty($user['email_verified_at'])) respond(['error' => 'Sign in with a verified account first.'], 401);

$password = (string) (request_json()['current_password'] ?? '');
if ($password === '' || !password_verify($password, (string) $user['password_hash'])) {
    respond(['error' => 'Your password is incorrect.'], 422);
}

$userId = (int) $user['id'];
$pdo->beginTransaction();
try {
    $tokens = $pdo->prepare('DELETE FROM resident_push_deliveries WHERE token_hash IN (SELECT token_hash FROM resident_push_devices WHERE user_id = ?)');
    $tokens->execute([$userId]);
    $pdo->prepare("DELETE FROM location_mapping_review WHERE entity_table = 'users' AND entity_id = ?")->execute([(string) $userId]);
    $pdo->prepare("DELETE FROM password_resets WHERE scope = 'user' AND user_id = ?")->execute([$userId]);
    $pdo->prepare('DELETE FROM password_reset_limits WHERE bucket IN (?, ?)')->execute([
        hash('sha256', 'user:email:' . strtolower((string) $user['email'])),
        hash('sha256', 'delete:email:' . strtolower((string) $user['email'])),
    ]);
    $statement = $pdo->prepare('DELETE FROM users WHERE id = ?');
    $statement->execute([$userId]);
    if ($statement->rowCount() !== 1) throw new RuntimeException('The account no longer exists.');
    $pdo->commit();
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $error;
}

$_SESSION = [];
if (ini_get('session.use_cookies')) {
    $cookie = session_get_cookie_params();
    setcookie(session_name(), '', time() - 42000, $cookie['path'], $cookie['domain'], $cookie['secure'], $cookie['httponly']);
}
session_destroy();
respond(['message' => 'Your BANTALA account has been deleted.']);
