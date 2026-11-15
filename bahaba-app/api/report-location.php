<?php
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/resident-report-location.php';
header('Cache-Control: no-store, private');
if ($_SERVER['REQUEST_METHOD'] !== 'GET') respond(['error' => 'Method not allowed.'], 405);
if (!bahaba_authenticated_app_user($pdo)) respond(['error' => 'Sign in first.'], 401);
if (!is_numeric($_GET['latitude'] ?? null) || !is_numeric($_GET['longitude'] ?? null) || !is_numeric($_GET['accuracy'] ?? null)) {
    respond(['error' => 'Valid GPS coordinates and accuracy are required.'], 422);
}

try {
    $location = bahaba_resident_report_location(
        (float) $_GET['latitude'],
        (float) $_GET['longitude'],
        (float) $_GET['accuracy'],
    );
    respond(['location' => $location]);
} catch (InvalidArgumentException $error) {
    respond(['error' => $error->getMessage()], 422);
}
