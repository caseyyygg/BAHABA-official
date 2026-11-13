<?php

require __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond(['error' => 'Method not allowed.'], 405);
$token = (string) (request_json()['token'] ?? '');
if (!preg_match('/^[a-f0-9]{64}$/D', $token)) {
    respond(['error' => 'This confirmation link is invalid or expired. Request a new one.'], 422);
}

$pdo->beginTransaction();
try {
    $statement = $pdo->prepare('SELECT user_id FROM account_deletion_requests WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP() FOR UPDATE');
    $statement->execute([hash('sha256', $token)]);
    $userId = $statement->fetchColumn();
    if (!$userId) {
        $pdo->rollBack();
        respond(['error' => 'This confirmation link is invalid or expired. Request a new one.'], 422);
    }

    $userId = (int) $userId;
    $pdo->prepare('DELETE FROM resident_push_deliveries WHERE token_hash IN (SELECT token_hash FROM resident_push_devices WHERE user_id = ?)')->execute([$userId]);
    $pdo->prepare("DELETE FROM location_mapping_review WHERE entity_table = 'users' AND entity_id = ?")->execute([(string) $userId]);
    $pdo->prepare("DELETE FROM password_resets WHERE scope = 'user' AND user_id = ?")->execute([$userId]);
    $account = $pdo->prepare('SELECT email FROM users WHERE id = ? FOR UPDATE');
    $account->execute([$userId]);
    $email = $account->fetchColumn();
    if ($email === false) throw new RuntimeException('The account no longer exists.');
    $pdo->prepare('DELETE FROM password_reset_limits WHERE bucket IN (?, ?)')->execute([
        hash('sha256', 'user:email:' . strtolower((string) $email)),
        hash('sha256', 'delete:email:' . strtolower((string) $email)),
    ]);
    $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$userId]);
    $pdo->commit();
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $error;
}

if (isset($_SESSION['user_id']) && (int) $_SESSION['user_id'] === $userId) {
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $cookie = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $cookie['path'], $cookie['domain'], $cookie['secure'], $cookie['httponly']);
    }
    session_destroy();
}
respond(['message' => 'Your BANTALA account has been permanently deleted.']);
