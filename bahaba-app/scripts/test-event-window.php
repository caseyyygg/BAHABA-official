<?php
function bahaba_legacy_psgc(string $id): string { return $id; }
function bahaba_location_by_id(string $id): array { return ['id'=>$id,'city'=>'Navotas','map_city'=>'Navotas']; }
function bahaba_supported_locations(): array { return []; }
require __DIR__ . '/../../deploy/render-api/admin-source/nlp-flood-events.php';
require __DIR__ . '/../../deploy/render-api/admin-source/report-point.php';

function assert_window(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$now = strtotime('2026-11-05 16:00:00 UTC');
$state = ['phase' => 'INACTIVE', 'last_post_at' => null, 'cycle_floor' => null];
assert_window(BAHABA_FLOOD_POSTS === 1 && BAHABA_FLOOD_WINDOW === 86400 && BAHABA_FLOOD_IDLE === 86400, 'Test signals must use a one-post daily window and expire at Philippine midnight.');
assert_window(bahaba_flood_day_bounds($now)===['start'=>$now,'end'=>$now+86400], 'The daily signal window must start at midnight Philippine time and end at the next midnight.');
$matchedLocations = [['key'=>'daanghari','label'=>'Daanghari','precision'=>'barangay','feature_id'=>'PH1307503005','latitude'=>null,'longitude'=>null]];
assert_window(bahaba_flood_refreshed_locations_json($matchedLocations)===json_encode($matchedLocations,JSON_THROW_ON_ERROR), 'Reconciliation must save a newly matched barangay for an existing post.');
assert_window(bahaba_flood_refreshed_locations_json([])===null, 'A failed re-match must not replace a previously saved location.');
$barangayData=json_decode((string)file_get_contents(__DIR__.'/../../deploy/render-api/admin-source/map-data/barangays.json'),true,512,JSON_THROW_ON_ERROR);
$daanghari=null;
foreach($barangayData['features'] as $feature) if($feature['id']==='PH1307503005'){$daanghari=$feature;break;}
assert_window($daanghari!==null,'Daanghari must exist in the supported barangay geometry.');
$coordinate=$daanghari['geometry']['coordinates'][0][0];
$config=['verified_flood_locations'=>[[
    'id'=>'daanghari-floodgate','city_id'=>'1380900000','name'=>'Daanghari Floodgate',
    'aliases'=>['test floodgate'],'verification_reference'=>'reviewed map reference',
    'barangay_feature_id'=>'PH1307503005','longitude'=>$coordinate[0],'latitude'=>$coordinate[1],
]]];
$barangayOnly=bahaba_flood_locations('1380900000','Flooding reported in Daanghari');
assert_window(count($barangayOnly)===1 && $barangayOnly[0]['precision']==='barangay','A barangay-only post must shade the barangay, not create a point.');
$specific=bahaba_flood_locations('1380900000','Flooding reported near Daanghari and the test floodgate');
assert_window(count($specific)===1 && $specific[0]['precision']==='landmark','A specific verified place must create a precise ping instead of shading its whole barangay.');
$barangayAdminPins=bahaba_flood_barangay_admin_pins([
    ['label'=>'Daanghari','precision_level'=>'barangay','barangay_feature_id'=>'PH1307503005'],
    ['label'=>'Daanghari Floodgate','precision_level'=>'landmark','barangay_feature_id'=>'PH1307503005'],
    ['label'=>'Other','precision_level'=>'barangay','barangay_feature_id'=>'PH1307503001'],
],'Daanghari','Navotas');
assert_window(count($barangayAdminPins)===2 && $barangayAdminPins[1]['precision_level']==='landmark','A barangay-scoped LGU admin must see exact pings that fall within its assigned barangay.');
$zero = bahaba_flood_transition($state, $now, $now, 0);
$one = bahaba_flood_transition($state, $now, $now, 1);
assert_window(!$zero['activate'], 'Zero eligible posts must not activate an event.');
assert_window($one['activate'] && $one['phase'] === 'ACTIVE', 'One eligible post must activate an event.');
$lateDay = bahaba_flood_transition($state, $now + 23 * 3600, $now + 23 * 3600, 1);
assert_window($lateDay['activate'], 'A post at 11 PM Philippine time must remain eligible that same day.');
$outsideWindow = bahaba_flood_transition($state, $now - 1, $now, 1);
assert_window(!$outsideWindow['activate'], 'A post from before midnight Philippine time must not activate today’s signal.');
$future = bahaba_flood_transition($state, $now + 1, $now, 1);
assert_window(!$future['activate'], 'A future-dated post must not activate an event.');
$stillActive = ['phase' => 'ACTIVE', 'last_post_at' => gmdate('Y-m-d H:i:s', $now + 23 * 3600), 'cycle_floor' => null];
$activeResult = bahaba_flood_transition($stillActive, $now + 23 * 3600, $now + 23 * 3600, 1);
assert_window(!$activeResult['expire'] && $activeResult['phase'] === 'ACTIVE', 'A city event must remain active through 11:59 PM Philippine time.');
$expired = bahaba_flood_transition($stillActive, $now + 23 * 3600, $now + 86400, 1);
assert_window($expired['expire'] && !$expired['activate'], 'An active signal must expire at midnight Philippine time.');

echo "PASS one-post activation, Philippine midnight window boundary, stale/future rejection and daily expiry.\n";
