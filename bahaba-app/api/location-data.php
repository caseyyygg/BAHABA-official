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
$ids = bahaba_preferred_locations($user);
$current = (string) ($_GET['current'] ?? '');
if (bahaba_psgc_by_id($current)) $ids[] = $current;
$ids = array_values(array_unique($ids));
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
     WHERE p.id IN ($scope) AND a.status = 'published'
     ORDER BY a.created_at DESC, a.id DESC LIMIT 50"
);
$announcementsStatement->execute($ids);
$commandCenterStatement = $pdo->prepare(
    'SELECT name, hotline, telephone, mobile_number, address, email, facebook_page, emergency_contact, other_information, updated_at
     FROM command_centers WHERE location_id = :location_id LIMIT 1'
);
$commandCenterStatement->execute(['location_id' => $locationId]);
$evacuationCentersStatement = $pdo->prepare(
    'SELECT id, city, barangay, name, address, capacity, evacuees, created_at
     FROM evacuation_centers WHERE location_id = :location_id
     ORDER BY barangay, name, id'
);
$evacuationCentersStatement->execute(['location_id' => $locationId]);

// Raw NLP content is administrative until reviewed into a verified report.

respond([
    'selected_location' => $locationId,
    'reports' => $reportsStatement->fetchAll(),
    'nlp_events' => [],
    'announcements' => $announcementsStatement->fetchAll(),
    'command_center' => $commandCenterStatement->fetch() ?: null,
    'evacuation_centers' => $evacuationCentersStatement->fetchAll(),
]);
