<?php

require __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    respond(['error' => 'Method not allowed.'], 405);
}

$user = bahaba_authenticated_app_user($pdo);
if (!$user) {
    respond(['error' => 'Sign in to access location data.'], 401);
}

$locationId = bahaba_normalize_location_id($user['selected_location'] ?? null);
if (!$locationId) {
    respond(['error' => 'Your account does not have a supported location. Update it in Settings.'], 403);
}

$reportsStatement = $pdo->prepare(
    'SELECT id, city, barangay, severity, description, status, photo, created_at
     FROM reports WHERE location_id = :location_id ORDER BY created_at DESC, id DESC LIMIT 100'
);
$reportsStatement->execute(['location_id' => $locationId]);
$announcementsStatement = $pdo->prepare(
    "SELECT id, city, barangay, title, body, status, created_at
     FROM announcements WHERE location_id = :location_id AND status = 'published'
     ORDER BY created_at DESC, id DESC LIMIT 50"
);
$announcementsStatement->execute(['location_id' => $locationId]);
$commandCenterStatement = $pdo->prepare(
    'SELECT name, hotline, telephone, mobile_number, address, email, facebook_page, emergency_contact, other_information, updated_at
     FROM command_centers WHERE location_id = :location_id LIMIT 1'
);
$commandCenterStatement->execute(['location_id' => $locationId]);

$nlpEvents = [];
if (bahaba_table_exists($pdo, 'nlp_events')) {
    $nlpStatement = $pdo->prepare(
        "SELECT id, post_text AS description, severity, city, barangay, detected_at AS created_at
         FROM nlp_events WHERE location_id = :location_id AND classification = 'Flood'
         ORDER BY detected_at DESC, id DESC LIMIT 100"
    );
    $nlpStatement->execute(['location_id' => $locationId]);
    $nlpEvents = $nlpStatement->fetchAll();
}

respond([
    'selected_location' => $locationId,
    'reports' => $reportsStatement->fetchAll(),
    'nlp_events' => $nlpEvents,
    'announcements' => $announcementsStatement->fetchAll(),
    'command_center' => $commandCenterStatement->fetch() ?: null,
]);
