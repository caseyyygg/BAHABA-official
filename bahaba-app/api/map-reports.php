<?php
require __DIR__ . '/bootstrap.php';
header('Cache-Control: no-store, private');
if ($_SERVER['REQUEST_METHOD'] !== 'GET') respond(['error' => 'Method not allowed.'], 405);
if (!bahaba_authenticated_app_user($pdo)) respond(['error' => 'Sign in first.'], 401);
$where = ["r.status = 'verified'", "r.map_hidden = FALSE"];
$params = [];
$location = (string) ($_GET['location'] ?? '');
if ($location !== '') {
    if (!bahaba_psgc_by_id($location)) respond(['error' => 'Invalid location.'], 422);
    $where[] = 'p.id = ?'; $params[] = $location;
}
$severity = (string) ($_GET['severity'] ?? '');
if ($severity !== '') {
    if (!in_array($severity, ['low', 'medium', 'high'], true)) respond(['error' => 'Invalid severity.'], 422);
    $where[] = 'r.severity = ?'; $params[] = $severity;
}
if (isset($_GET['bbox'])) {
    $bbox = explode(',', (string) $_GET['bbox']);
    if (count($bbox) !== 4 || count(array_filter($bbox, 'is_numeric')) !== 4) respond(['error' => 'Invalid bounds.'], 422);
    [$west, $south, $east, $north] = array_map('floatval', $bbox);
    if ($west < -180 || $east > 180 || $south < -90 || $north > 90 || $west >= $east || $south >= $north) respond(['error' => 'Invalid bounds.'], 422);
    $where[] = 'r.longitude BETWEEN ? AND ? AND r.latitude BETWEEN ? AND ?';
    array_push($params, $west, $east, $south, $north);
}
$before = (string) ($_GET['before'] ?? '');
if ($before !== '') {
    if (!ctype_digit($before)) respond(['error' => 'Invalid cursor.'], 422);
    $where[] = 'r.id < ?'; $params[] = $before;
}
$stmt = $pdo->prepare('SELECT r.id, p.id AS psgc_id, COALESCE(p.city,r.city) AS city, p.province, r.barangay,
    r.latitude, r.longitude, r.severity, r.description, r.created_at FROM reports r
    LEFT JOIN locations l ON l.id=r.location_id LEFT JOIN psgc_locations p ON p.id=COALESCE(r.psgc_id,l.psgc_id)
    WHERE ' . implode(' AND ', $where) . ' ORDER BY r.id DESC LIMIT 501');
$stmt->execute($params); $reports = $stmt->fetchAll();
$more = count($reports) > 500; if ($more) array_pop($reports);
respond(['reports' => $reports, 'next' => $more ? (string) end($reports)['id'] : null,
    'coverage_notice' => 'Available verified reports only. No reports does not confirm absence of flooding. Some LGUs do not supply data.']);
