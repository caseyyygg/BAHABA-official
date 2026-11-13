<?php
function bahaba_location_by_id(string $id): ?array
{
    return $id === '1380900000' ? ['id' => $id, 'city' => 'Navotas', 'map_city' => 'Navotas'] : null;
}
function bahaba_supported_locations(): array { return [['id' => 'navotas', 'name' => 'Navotas', 'city' => 'Navotas City', 'map_city' => 'Navotas']]; }
function bahaba_legacy_psgc(?string $id): ?string { return $id === 'navotas' ? '1380900000' : null; }
$locations = [['id' => 'navotas']];
$config = [];
require_once __DIR__.'/../../deploy/render-api/admin-source/nlp-flood-events.php';
require_once __DIR__.'/../../deploy/render-api/admin-source/nlp-location.php';

$cases = [
    [['Low'=>5, 'Mid'=>1, 'High'=>1], 'Low'], // Seven reports; one high must not override the majority.
    [['Low'=>1, 'Mid'=>5, 'High'=>1], 'Medium'],
    [['Low'=>1, 'Mid'=>1, 'High'=>5], 'High'],
    [['Low'=>3, 'Mid'=>3, 'High'=>1], 'Mixed'],
    [['Low'=>0, 'Mid'=>0, 'High'=>0], 'Unspecified'],
];
foreach ($cases as [$counts, $expected]) {
    $actual = bahaba_flood_majority_severity($counts);
    if ($actual !== $expected) throw new RuntimeException("Expected $expected, got $actual");
}
$locations = bahaba_flood_locations('1380900000', 'baha na sa navotaas daanghari');
if (count($locations) !== 1 || $locations[0]['label'] !== 'Daanghari' || $locations[0]['feature_id'] !== 'PH1307503005') {
    throw new RuntimeException('A plain Daanghari mention must map to its Navotas barangay outline.');
}
if (bahaba_flood_locations('1380900000', 'baha near Daangharim')) {
    throw new RuntimeException('A partial barangay-name match must not be mapped.');
}
foreach (['navotas', '1380900000'] as $locationId) {
    $filterIds = bahaba_nlp_location_filter_ids($locationId);
    sort($filterIds);
    if ($filterIds !== ['1380900000', 'navotas']) {
        throw new RuntimeException("Legacy and PSGC Navotas IDs must share the same feed filter: $locationId");
    }
}
echo "PASS: severity, barangay matching, and legacy/PSGC Navotas feed filters.\n";
