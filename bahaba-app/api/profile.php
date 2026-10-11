<?php

require __DIR__ . '/bootstrap.php';

$user = bahaba_authenticated_app_user($pdo);
if (!$user) {
    respond(['error' => 'Sign in to access your profile.'], 401);
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    respond(['user' => public_user($user)]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'PUT') {
    respond(['error' => 'Method not allowed.'], 405);
}

$data = request_json();
$updates = [];
$params = ['id' => (int) $user['id']];
if (array_diff(array_keys($data), ['username', 'password', 'current_password', 'selected_location'])) {
    respond(['error' => 'Only your name, password, and desired location can be changed.'], 422);
}
if (array_key_exists('selected_location', $data)) {
    $location = bahaba_location_by_id((string) $data['selected_location']);
    if (!$location) respond(['error' => 'Choose one of the supported locations.'], 422);
    $updates = ['selected_location = :selected_location', 'region = :region', 'city = :city', 'barangays = :barangays'];
    $params += ['selected_location' => $location['id'], 'region' => $location['region'], 'city' => $location['city'], 'barangays' => json_encode([])];
}
if (array_key_exists('username', $data)) {
    $name = trim((string) $data['username']);
    if (strlen($name) < 3 || strlen($name) > 50) respond(['error' => 'Name must be between 3 and 50 characters.'], 422);
    $updates[] = 'username = :username';
    $params['username'] = $name;
}
if (array_key_exists('password', $data)) {
    $password = (string) $data['password'];
    if (!password_verify((string) ($data['current_password'] ?? ''), $user['password_hash'])) {
        respond(['error' => 'Your current password is incorrect.'], 422);
    }
    if (strlen($password) < 8) respond(['error' => 'New password must be at least 8 characters.'], 422);
    $updates[] = 'password_hash = :password_hash';
    $params['password_hash'] = password_hash($password, PASSWORD_DEFAULT);
}
if (!$updates) respond(['error' => 'No profile changes supplied.'], 422);
try {
    $statement = $pdo->prepare('UPDATE users SET ' . implode(', ', $updates) . ' WHERE id = :id');
    $statement->execute($params);
} catch (PDOException $exception) {
    if ($exception->getCode() === '23000') respond(['error' => 'That name is already in use. Choose another name.'], 409);
    throw $exception;
}

$statement = $pdo->prepare('SELECT * FROM users WHERE id = :id LIMIT 1');
$statement->execute(['id' => (int) $user['id']]);
respond(['user' => public_user($statement->fetch())]);
