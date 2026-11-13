<?php
function bahaba_location_by_id(string $id): ?array {
    return ['id'=>$id,'city'=>'City of Navotas','map_city'=>'Navotas'];
}
function bahaba_supported_locations(): array {
    return [['id'=>'1380900000','name'=>'Navotas','city'=>'Navotas','aliases'=>[]]];
}
function bahaba_legacy_psgc(?string $id): ?string { return null; }
$config=[];
require_once __DIR__.'/../../deploy/render-api/admin-source/nlp-location.php';
require_once __DIR__.'/../../deploy/render-api/admin-source/nlp-flood-events.php';
$locationFilterIds=bahaba_nlp_location_filter_ids('1380900000');
if(!in_array('1380900000',$locationFilterIds,true)){
    fwrite(STDERR,"FAIL NLP feed location filter did not retain the Navotas PSGC identifier.\n");
    exit(1);
}
$resolvedCity=bahaba_nlp_location_id_from_hint(
    'Tangos North',
    'Sa may Tangos North 7/11, Navotas, may baha na po.'
);
if($resolvedCity!=='1380900000'){
    fwrite(STDERR,"FAIL city context was not recovered from the post when the NLP hint was only a barangay.\n");
    exit(1);
}
$nearbyCity=bahaba_nlp_location_id_from_hint(
    '',
    'May baha na po sa brgy. san jose, navatos hospital.'
);
if($nearbyCity!=='1380900000'){
    fwrite(STDERR,"FAIL the common Navotas typo was not mapped to its city.\n");
    exit(1);
}
$nearbyBarangay=bahaba_nlp_barangay($nearbyCity,'May baha na po sa brgy. san jose, navatos hospital.');
if($nearbyBarangay!=='San Jose (Pob.)'){
    fwrite(STDERR,"FAIL the short San Jose name did not resolve to Navotas San Jose (Pob.).\n");
    exit(1);
}
$nearbyLocations=bahaba_flood_locations(
    $nearbyCity,
    'May baha na po sa brgy. san jose, navatos hospital.',
    $nearbyBarangay
);
if(count($nearbyLocations)!==1
    ||$nearbyLocations[0]['precision']!=='barangay'
    ||$nearbyLocations[0]['label']!=='San Jose (Pob.)'
    ||$nearbyLocations[0]['feature_id']!=='PH1307503010'){
    fwrite(STDERR,"FAIL the screenshot post did not produce its Navotas barangay fallback signal.\n");
    exit(1);
}
$locations=bahaba_flood_locations(
    '1380900000',
    'Lumalala ang pagbaha sa Tangos North Highschool, Navotas.',
    'Tangos North'
);
if(count($locations)!==1
    ||$locations[0]['precision']!=='landmark'
    ||$locations[0]['label']!=='Tangos National High School'
    ||abs($locations[0]['latitude']-14.674708)>0.000001
    ||abs($locations[0]['longitude']-120.932092)>0.000001
    ||$locations[0]['feature_id']!=='PH1307503017'){
    fwrite(STDERR,"FAIL verified flood landmark did not resolve to the school pin.\n");
    exit(1);
}
echo "PASS verified flood landmark: Tangos North Highschool resolves to its mapped school point without street data.\n";

$tangosElementary=bahaba_flood_locations(
    '1380900000',
    'Flooding near Tangos Navotas elem, J. Pascual Street.',
    'Tangos North'
);
if(count($tangosElementary)!==1
    ||$tangosElementary[0]['precision']!=='landmark'
    ||$tangosElementary[0]['label']!=='Tangos Elementary School'
    ||$tangosElementary[0]['feature_id']!=='PH1307503017'
    ||abs($tangosElementary[0]['latitude']-14.6737408)>0.000001
    ||abs($tangosElementary[0]['longitude']-120.9346518)>0.000001){
    fwrite(STDERR,"FAIL Tangos Elementary School did not resolve to its verified Tangos South pin.\n");
    exit(1);
}
$tangosNorthElementary=bahaba_flood_locations(
    '1380900000',
    'Flooding near Tangos I Elementary School, Navotas.',
    'Tangos North'
);
if(count($tangosNorthElementary)!==1
    ||$tangosNorthElementary[0]['precision']!=='landmark'
    ||$tangosNorthElementary[0]['label']!=='Tangos I Elementary School'
    ||$tangosNorthElementary[0]['feature_id']!=='PH1307503017'
    ||abs($tangosNorthElementary[0]['latitude']-14.6740483)>0.000001
    ||abs($tangosNorthElementary[0]['longitude']-120.9323363)>0.000001){
    fwrite(STDERR,"FAIL Tangos I Elementary School did not resolve to its verified Tangos North pin.\n");
    exit(1);
}
echo "PASS verified flood landmarks: Tangos Elementary schools resolve to their own barangay pins.\n";

$barangayFeature=[
    'id'=>'PH1307503017',
    'geometry'=>[
        'type'=>'Polygon',
        'coordinates'=>[[[120.93,14.67],[120.94,14.67],[120.94,14.68],[120.93,14.68],[120.93,14.67]]],
    ],
];
$geocoded=bahaba_flood_select_geocoded_place([
    ['name'=>'Local Health Center','class'=>'amenity','type'=>'clinic','lat'=>'14.674','lon'=>'120.934','display_name'=>'Local Health Center, Tangos North, Navotas'],
], 'Local Health Center', '1380900000', 'Tangos North', $barangayFeature);
if(!$geocoded||$geocoded['precision']!=='landmark'||$geocoded['label']!=='Local Health Center'
    ||$geocoded['feature_id']!=='PH1307503017'||abs($geocoded['latitude']-14.674)>0.000001){
    fwrite(STDERR,"FAIL unique place inside the named barangay did not resolve to a landmark pin.\n");
    exit(1);
}

$school=bahaba_flood_select_geocoded_place([
    ['name'=>'Tangos National High School','class'=>'amenity','type'=>'school','lat'=>'14.6747194','lon'=>'120.9320877'],
], 'Tangos National High School', '1380900000', 'Tangos North', $barangayFeature);
if(!$school||$school['key']!==hash('sha256','place:1380900000:osm-way-623502739')
    ||$school['label']!=='Tangos National High School'
    ||abs($school['latitude']-14.674708)>0.000001
    ||abs($school['longitude']-120.932092)>0.000001){
    fwrite(STDERR,"FAIL geocoded verified school did not merge into its canonical landmark pin.\n");
    exit(1);
}

$mismatched=bahaba_flood_select_geocoded_place([
    ['name'=>'Tangos National High School','class'=>'amenity','type'=>'school','lat'=>'14.6747194','lon'=>'120.9320877'],
], 'Tangos North 7/11', '1380900000', 'Tangos North', $barangayFeature);
if($mismatched!==null){
    fwrite(STDERR,"FAIL unrelated in-barangay geocoder result was accepted for a different place hint.\n");
    exit(1);
}

$sevenEleven=bahaba_flood_select_geocoded_place([
    ['name'=>'7-Eleven','class'=>'shop','type'=>'convenience','lat'=>'14.674','lon'=>'120.934'],
], 'Tangos North 7/11', '1380900000', 'Tangos North', $barangayFeature);
if(!$sevenEleven||$sevenEleven['label']!=='7-Eleven'){
    fwrite(STDERR,"FAIL a matching 7/11 geocoder result was not resolved.\n");
    exit(1);
}

$specificHint=bahaba_flood_specific_place_hint(
    'Tangos North',
    'Sa may Tangos North 7/11, Navotas, may baha na po.',
    'Tangos North',
    'City of Navotas'
);
if($specificHint!=='7/11'){
    fwrite(STDERR,"FAIL specific landmark was not separated from the barangay context.\n");
    exit(1);
}
$hintWithoutNer=bahaba_flood_specific_place_hint(
    '',
    'Tangos North 7/11, Navotas, may baha na po.',
    'Tangos North',
    'City of Navotas'
);
if($hintWithoutNer!=='7/11'){
    fwrite(STDERR,"FAIL a named place in the post was not recovered when NLP returned no location hint.\n");
    exit(1);
}
$alfamartHint=bahaba_flood_specific_place_hint(
    'Navotas',
    'Baha sa may Tangos North. Tumataas ang tubig sa Alfamart sa Tangos North, Navotas.',
    'Tangos North',
    'City of Navotas'
);
if($alfamartHint!=='Alfamart'){
    fwrite(STDERR,"FAIL the full post was not searched for an Alfamart landmark after its barangay mention.\n");
    exit(1);
}
$alfamartWithoutNer=bahaba_flood_specific_place_hint(
    '',
    'May baha sa Alfamart, Navotas.',
    '',
    'City of Navotas'
);
if($alfamartWithoutNer!=='Alfamart'){
    fwrite(STDERR,"FAIL an Alfamart clue in the post was missed when NLP returned no place entity.\n");
    exit(1);
}

$photonResults=bahaba_flood_normalize_geocode_response([
    'features'=>[
        ['properties'=>['name'=>'7-Eleven','osm_key'=>'shop','type'=>'house'],
            'geometry'=>['coordinates'=>[120.934,14.674]]],
        ['properties'=>['name'=>'Unnamed place'],'geometry'=>['coordinates'=>[]]],
    ],
],true);
if(count($photonResults)!==1||$photonResults[0]['name']!=='7-Eleven'
    ||$photonResults[0]['lat']!=='14.674'||$photonResults[0]['lon']!=='120.934'){
    fwrite(STDERR,"FAIL Photon OpenStreetMap results were not normalized for landmark matching.\n");
    exit(1);
}

$photonPoint=bahaba_flood_select_geocoded_place(
    $photonResults,$specificHint,'1380900000','Tangos North',$barangayFeature
);
if(!$photonPoint||$photonPoint['label']!=='7-Eleven'){
    fwrite(STDERR,"FAIL an in-barangay Photon point matching the extracted landmark was not accepted.\n");
    exit(1);
}
$alfamartPoint=bahaba_flood_select_city_geocoded_place([
    ['name'=>'Alfamart','class'=>'shop','type'=>'convenience','lat'=>'14.674','lon'=>'120.934'],
],$alfamartWithoutNer,'1380900000',[$barangayFeature]);
if(count($alfamartPoint)!==1||$alfamartPoint[0]['label']!=='Alfamart'
    ||$alfamartPoint[0]['precision']!=='landmark'||$alfamartPoint[0]['feature_id']!=='PH1307503017'){
    fwrite(STDERR,"FAIL a unique Alfamart point in Navotas did not resolve without an explicit barangay.\n");
    exit(1);
}
$navotasFeatures=array_values(array_filter(
    bahaba_flood_map_geometry()['features'],
    static fn($feature)=>($feature['properties']['city']??'')==='Navotas'
));
$daanghariFeature=null;
foreach($navotasFeatures as $feature){
    if(($feature['properties']['name']??'')==='Daanghari'){$daanghariFeature=$feature;break;}
}
if(!$daanghariFeature){
    fwrite(STDERR,"FAIL the Navotas Daanghari boundary is missing from map data.\n");
    exit(1);
}
$alfamartBranches=[
    ['name'=>'Alfamart','class'=>'shop','type'=>'convenience','lat'=>'14.6494979','lon'=>'120.9570054'],
    ['name'=>'Alfamart','class'=>'shop','type'=>'convenience','lat'=>'14.6806745','lon'=>'120.9350381'],
    ['name'=>'Alfamart','class'=>'shop','type'=>'convenience','lat'=>'14.6670217','lon'=>'120.9404853'],
];
$unscopedAlfamarts=bahaba_flood_select_city_geocoded_place(
    $alfamartBranches,'Alfamart','1380900000',$navotasFeatures
);
if($unscopedAlfamarts!==[]){
    fwrite(STDERR,"FAIL the city-wide Alfamart search guessed one of several Navotas branches.\n");
    exit(1);
}
$daanghariAlfamart=bahaba_flood_select_geocoded_place(
    [$alfamartBranches[2]],'Alfamart','1380900000','Daanghari',$daanghariFeature
);
if(!$daanghariAlfamart||$daanghariAlfamart['label']!=='Alfamart'
    ||$daanghariAlfamart['precision']!=='landmark'
    ||$daanghariAlfamart['feature_id']!==(string)$daanghariFeature['id']){
    fwrite(STDERR,"FAIL the Alfamart branch identified by Navotas Daanghari did not produce its verified point.\n");
    exit(1);
}
$secondBarangayFeature=[
    'id'=>'PH1307503018',
    'properties'=>['name'=>'Other Barangay'],
    'geometry'=>[
        'type'=>'Polygon',
        'coordinates'=>[[[120.95,14.67],[120.96,14.67],[120.96,14.68],[120.95,14.68],[120.95,14.67]]],
    ],
];
$ambiguousAlfamart=bahaba_flood_select_city_geocoded_place([
    ['name'=>'Alfamart','class'=>'shop','type'=>'convenience','lat'=>'14.674','lon'=>'120.934'],
    ['name'=>'Alfamart','class'=>'shop','type'=>'convenience','lat'=>'14.674','lon'=>'120.954'],
],$alfamartWithoutNer,'1380900000',[$barangayFeature,$secondBarangayFeature]);
if($ambiguousAlfamart!==[]){
    fwrite(STDERR,"FAIL multiple Alfamart branches in different barangays were presented as a single pin.\n");
    exit(1);
}

$unmatchedOsmResults=bahaba_flood_normalize_geocode_response([
    'features'=>[
        ['properties'=>['name'=>'Tangos I Elementary School','osm_key'=>'amenity','type'=>'house'],
            'geometry'=>['coordinates'=>[120.9323363,14.6740483]]],
        ['properties'=>['name'=>'7-Eleven','osm_key'=>'shop','type'=>'house'],
            'geometry'=>['coordinates'=>[120.9531414,14.6454943]]],
    ],
],true);
if(bahaba_flood_select_geocoded_place(
    $unmatchedOsmResults,$specificHint,'1380900000','Tangos North',$barangayFeature
)!==null){
    fwrite(STDERR,"FAIL an unrelated or out-of-barangay OpenStreetMap result was accepted as the landmark.\n");
    exit(1);
}

$outside=bahaba_flood_select_geocoded_place([
    ['name'=>'Same Place','class'=>'amenity','type'=>'clinic','lat'=>'14.69','lon'=>'120.95'],
], 'Same Place, Tangos North, Navotas, Philippines', '1380900000', 'Tangos North', $barangayFeature);
if($outside!==null){
    fwrite(STDERR,"FAIL geocoder result outside the named barangay was not rejected.\n");
    exit(1);
}

$ambiguous=bahaba_flood_select_geocoded_place([
    ['name'=>'Market','class'=>'amenity','type'=>'marketplace','lat'=>'14.674','lon'=>'120.934'],
    ['name'=>'Market','class'=>'amenity','type'=>'marketplace','lat'=>'14.675','lon'=>'120.935'],
], 'Market, Tangos North, Navotas, Philippines', '1380900000', 'Tangos North', $barangayFeature);
if($ambiguous!==null){
    fwrite(STDERR,"FAIL ambiguous place results did not fall back to barangay shading.\n");
    exit(1);
}

echo "PASS automatic place resolution: extracted landmarks use OpenStreetMap POIs; unsafe matches fall back.\n";
