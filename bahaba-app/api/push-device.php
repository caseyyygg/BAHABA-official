<?php
require __DIR__ . '/bootstrap.php';
if (!in_array($_SERVER['REQUEST_METHOD'], ['POST', 'DELETE'], true)) respond(['error' => 'Method not allowed.'], 405);
$user = bahaba_authenticated_app_user($pdo);
if (!$user || empty($user['email_verified_at'])) respond(['error' => 'Verify your account and sign in first.'], 401);
$data = request_json();
$action = (string) ($data['action'] ?? 'register');
$token = trim((string) ($data['token'] ?? ''));
if (!in_array($action, ['register', 'unregister'], true)) respond(['error' => 'Unsupported device action.'], 422);
if (strlen($token) < 20 || strlen($token) > 4096 || preg_match('/[\r\n\x00]/', $token)) respond(['error' => 'The push registration token is invalid.'], 422);
$hash = hash('sha256', $token);
if ($action === 'unregister' || $_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $statement = $pdo->prepare('DELETE FROM resident_push_devices WHERE user_id=? AND token_hash=?');
    $statement->execute([(int) $user['id'], $hash]);
    respond(['success' => true]);
}
$statement = $pdo->prepare("INSERT INTO resident_push_devices(token_hash,user_id,platform,token_value) VALUES(?,?,'android',?) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id),platform='android',token_value=VALUES(token_value),updated_at=CURRENT_TIMESTAMP");
$statement->execute([$hash, (int) $user['id'], $token]);
respond(['success' => true]);
