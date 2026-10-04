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
$location = bahaba_location_by_id((string) ($data['selected_location'] ?? ''));
if (!$location) {
    respond(['error' => 'Choose one of the supported locations.'], 422);
}

$statement = $pdo->prepare(
    'UPDATE users SET selected_location = :selected_location, region = :region, city = :city, barangays = :barangays WHERE id = :id'
);
$statement->execute([
    'selected_location' => $location['id'],
    'region' => $location['region'],
    'city' => $location['city'],
    'barangays' => json_encode([]),
    'id' => (int) $user['id'],
]);

$statement = $pdo->prepare('SELECT * FROM users WHERE id = :id LIMIT 1');
$statement->execute(['id' => (int) $user['id']]);
respond(['user' => public_user($statement->fetch())]);
