<?php

require __DIR__ . '/bootstrap.php';
header('Cache-Control: no-store, private');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    respond(['error' => 'Method not allowed.'], 405);
}

$user = bahaba_authenticated_app_user($pdo);
if (!$user) {
    respond(['error' => 'Sign in to access location data.'], 401);
}

$locationId = bahaba_normalize_location_id($user['selected_location'] ?? null);
$preferredIds = bahaba_preferred_locations($user);
$current = (string) ($_GET['current'] ?? '');
$currentId = bahaba_psgc_by_id($current) ? $current : null;
$requestedLocation = trim((string) ($_GET['location'] ?? ''));
if ($requestedLocation !== '') {
    $requestedLocationId = bahaba_normalize_location_id($requestedLocation);
    if (!$requestedLocationId) respond(['error' => 'Choose a supported location.'], 422);
    $allowedIds = array_values(array_unique(array_filter([
        ...$preferredIds,
        $locationId,
        $currentId,
    ])));
    if (!in_array($requestedLocationId, $allowedIds, true)) respond(['error' => 'That location is not in your preferred or current locations.'], 403);
    $locationId = $requestedLocationId;
    $ids = [$requestedLocationId];
} else {
    $ids = $preferredIds;
    if ($currentId) $ids[] = $currentId;
    $ids = array_values(array_unique($ids));
}
$scope = $ids ? implode(',', array_fill(0, count($ids), '?')) : 'NULL';

$reportsStatement = $pdo->prepare(
    "SELECT r.id, p.city, p.province, p.id AS psgc_id, r.barangay, r.barangay_feature_id, r.latitude, r.longitude, r.street_name, r.severity, r.description, r.status, r.photo, r.created_at
     FROM reports r LEFT JOIN locations l ON l.id=r.location_id JOIN psgc_locations p ON p.id=COALESCE(r.psgc_id,l.psgc_id)
     WHERE p.id IN ($scope) AND r.status='verified' ORDER BY r.created_at DESC, r.id DESC LIMIT 100"
);
$reportsStatement->execute($ids);
$announcementsStatement = $pdo->prepare(
    "SELECT a.id, p.city, p.province, p.id AS psgc_id, a.barangay, a.title, a.body, a.status, a.created_at
     FROM announcements a LEFT JOIN locations l ON l.id=a.location_id JOIN psgc_locations p ON p.id=COALESCE(a.psgc_id,l.psgc_id)
     WHERE p.id IN ($scope) AND a.status = 'published' AND a.expires_at > NOW()
     ORDER BY a.created_at DESC, a.id DESC LIMIT 50"
);
$announcementsStatement->execute($ids);
$commandCenterStatement = $pdo->prepare(
    'SELECT c.name, c.hotline, c.telephone, c.mobile_number, c.address, c.email, c.facebook_page, c.emergency_contact, c.other_information, c.updated_at
     FROM command_centers c LEFT JOIN locations l ON l.id = c.location_id
     WHERE c.location_id = :location_id OR l.psgc_id = :psgc_id LIMIT 1'
);
$commandCenterStatement->execute(['location_id' => $locationId, 'psgc_id' => $locationId]);
$evacuationCentersStatement = $pdo->prepare(
    'SELECT e.id, e.city, e.barangay, e.name, e.address, e.map_link, e.capacity, e.evacuees, e.created_at
     FROM evacuation_centers e LEFT JOIN locations l ON l.id = e.location_id
     WHERE e.location_id = :location_id OR l.psgc_id = :psgc_id
     ORDER BY e.barangay, e.name, e.id'
);
$evacuationCentersStatement->execute(['location_id' => $locationId, 'psgc_id' => $locationId]);

// Raw NLP content is administrative until reviewed into a verified report.

respond([
    'selected_location' => $locationId,
    'reports' => $reportsStatement->fetchAll(),
    'nlp_events' => [],
    'announcements' => $announcementsStatement->fetchAll(),
    'command_center' => $commandCenterStatement->fetch() ?: null,
    'evacuation_centers' => $evacuationCentersStatement->fetchAll(),
]);
