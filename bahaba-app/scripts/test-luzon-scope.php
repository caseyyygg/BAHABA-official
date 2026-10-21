<?php
require __DIR__ . '/../api/location_helpers.php';
require __DIR__ . '/../api/psgc.php';

function assert_scope(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$regions = [];
foreach (bahaba_psgc_locations() as $location) {
    $regions[$location['region']] = $location['id'];
}
foreach ([
    'Region I', 'Region II', 'Region III', 'Region IV-A', 'MIMAROPA Region',
    'Region V', 'National Capital Region', 'Cordillera Administrative Region',
] as $region) {
    assert_scope(isset($regions[$region]) && bahaba_psgc_is_luzon($regions[$region]), "Expected Luzon region: $region");
}
foreach (['Region VI', 'Region VII', 'Region VIII', 'Region IX', 'Region X', 'Region XI', 'Region XII', 'Region XIII', 'Bangsamoro Autonomous Region in Muslim Mindanao'] as $region) {
    assert_scope(isset($regions[$region]) && !bahaba_psgc_is_luzon($regions[$region]), "Out-of-scope region accepted: $region");
}
assert_scope(bahaba_luzon_location_by_id('navotas') !== null, 'Legacy Luzon location should remain accepted.');
assert_scope(bahaba_luzon_location_by_id($regions['Region VI']) === null, 'Visayas location should be rejected.');
$legacyPreferences = bahaba_preferred_locations(['preferred_locations' => json_encode([$regions['Region III'], $regions['Region VI']])]);
assert_scope($legacyPreferences === [$regions['Region III']], 'Existing non-Luzon preferences should be ignored without deleting account data.');
echo "PASS PSGC Luzon scope includes the eight supported island-group regions and rejects Visayas/Mindanao locations.\n";
