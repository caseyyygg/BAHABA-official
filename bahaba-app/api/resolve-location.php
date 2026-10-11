<?php
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/municipality-boundaries.php';
header('Cache-Control: no-store, private');
if ($_SERVER['REQUEST_METHOD'] !== 'GET') respond(['error' => 'Method not allowed.'], 405);
if (!bahaba_authenticated_app_user($pdo)) respond(['error' => 'Sign in first.'], 401);
$id = (string) ($_GET['location'] ?? '');
$features = bahaba_municipality_features();
if ($id !== '') {
    if (!bahaba_psgc_by_id($id)) respond(['error' => 'Invalid PSGC location.'], 422);
    foreach ($features as $feature) if ($feature['id'] === $id) {
        [$w, $s, $e, $n] = $feature['bbox'];
        respond(['bounds' => [[$w, $s], [$e, $n]]]);
    }
    respond(['bounds' => null]);
}
if (!is_numeric($_GET['latitude'] ?? null) || !is_numeric($_GET['longitude'] ?? null)) respond(['error' => 'Invalid coordinates.'], 422);
$y = (float) $_GET['latitude']; $x = (float) $_GET['longitude'];
$accuracy = max(0, (float) ($_GET['accuracy'] ?? 100));
$matches = [];
foreach ($features as $feature) {
    [$w, $s, $e, $n] = $feature['bbox'];
    if ($x < $w || $x > $e || $y < $s || $y > $n) continue;
    $path = __DIR__ . '/municipality-geometry/' . $feature['id'] . '.json.gz';
    if (!is_file($path)) continue;
    $geometry = json_decode(gzdecode(file_get_contents($path)), true);
    if (bahaba_geometry_contains($geometry, $x, $y) && !bahaba_near_boundary($geometry, $x, $y, $accuracy + 50)) $matches[] = $feature['id'];
}
// Overlaps, missing geometry, disputed boundaries, or outside the Philippines fail closed.
respond(['location' => count($matches) === 1 ? bahaba_psgc_by_id($matches[0]) : null,
    'boundary_notice' => 'PSA/NAMRIA 2023 boundary snapshot; newer municipalities without matched geometry cannot be detected.']);
