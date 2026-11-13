<?php
/** Aggregate reported signals only. Never expose administrative social post text. */
function bahaba_resident_individual_reports(array $posts): array {
    $reports=[];
    foreach($posts as $post){
        $locations=json_decode((string)($post['locations_json']??''),true);
        $locations=is_array($locations)?$locations:[];
        $severity=['Low'=>'Low','Mid'=>'Medium','Medium'=>'Medium','High'=>'High'][ucfirst(strtolower((string)($post['severity']??'')))]??'Unspecified';
        $entries=$locations?:[['key'=>'city','label'=>$post['city_name']??'Location not identified','precision'=>'city','feature_id'=>'']];
        foreach($entries as $place){
            $locationKey=(string)($place['key']??'city');
            $reports[]=[
                'id'=>hash('sha256',implode(':',[(string)($post['source']??''),(string)($post['source_post_id']??''),$locationKey])),
                'city_id'=>(string)($post['city_id']??''),
                'city_name'=>(string)($post['city_name']??''),
                'barangay'=>($place['precision']??'')==='barangay'?(string)($place['label']??''):null,
                'barangay_feature_id'=>(string)($place['feature_id']??''),
                'label'=>(string)($place['label']??$post['city_name']??'Location not identified'),
                'precision_level'=>(string)($place['precision']??'city'),
                'latitude'=>is_numeric($place['latitude']??null)&&abs((float)$place['latitude'])<=90?(float)$place['latitude']:null,
                'longitude'=>is_numeric($place['longitude']??null)&&abs((float)$place['longitude'])<=180?(float)$place['longitude']:null,
                'severity'=>$severity,
                'source'=>(string)($post['source']??'Unknown'),
                'published_at'=>gmdate('Y-m-d\TH:i:s\Z',strtotime((string)$post['published_at'].' UTC')),
            ];
        }
    }
    return $reports;
}

function bahaba_resident_flood_signals(PDO $pdo, ?string $locationId=null): array {
    $empty=['cities'=>[],'pins'=>[],'individual_reports'=>[],'server_time'=>gmdate('c')];$module=null;
    foreach ([dirname(__DIR__).'/nlp-flood-events.php',dirname(__DIR__,2).'/nlp-flood-events.php',dirname(__DIR__,2).'/deploy/render-api/admin-source/nlp-flood-events.php'] as $path) if(is_file($path)){$module=$path;break;}
    if(!$module)return $empty;
    require_once $module;
    $city=$locationId?bahaba_flood_city($locationId):null;
    if($locationId&&!$city)return $empty;
    // Reconcile recent classified posts even when an older ingestion upload
    // saved the feed record before updating the resident signal tables.
    $reconcileIds=$city?[$city['id']]:array_values(array_unique(array_filter(array_map(
        fn($location)=>bahaba_flood_city($location['id']??null)['id']??null,
        bahaba_supported_locations()
    ))));
    foreach($reconcileIds as $reconcileId) bahaba_flood_backfill_recent($pdo,$reconcileId);
    $snapshot=bahaba_flood_snapshot($pdo,$city['id']??null);
    $dayExpiry=$snapshot['day_expires_at_ms'];
    $cities=array_values(array_filter($snapshot['cities'],fn($row)=>$row['phase']==='ACTIVE'));
    $expiry=[];foreach($cities as &$row){$expiry[$row['city_id']]=$dayExpiry;$row['expires_at_ms']=$dayExpiry;}unset($row);
    // Use the stored municipality polygon, never a bounding box or centroid.
    foreach($cities as &$city){
        $city['geometry']=null;
        $id=(string)$city['city_id'];
        if(preg_match('/^\d{10}$/',$id)){
            $path=__DIR__.'/municipality-geometry/'.$id.'.json.gz';
            if(is_file($path)){
                $raw=gzdecode((string)file_get_contents($path));
                $feature=$raw!==false?json_decode($raw,true):null;
                $shape=$feature['geometry']??$feature;
                if(in_array($shape['type']??'', ['Polygon','MultiPolygon'],true))$city['geometry']=$shape;
            }
        }
    }unset($city);
    $pins=$snapshot['pins'];$geometry=[];
    if($pins){$data=json_decode((string)file_get_contents(dirname($module).'/map-data/barangays.json'),true);foreach($data['features']??[] as $feature)$geometry[(string)$feature['id']]=$feature['geometry'];}
    foreach($pins as &$pin){
        $pin['geometry']=$pin['latitude']!==null&&$pin['longitude']!==null?['type'=>'Point','coordinates'=>[(float)$pin['longitude'],(float)$pin['latitude']]]:($geometry[$pin['barangay_feature_id']]??null);
        $pin['expires_at_ms']=$expiry[$pin['city_id']]??$dayExpiry;
    }unset($pin);
    $reports=array_map(fn($row)=>[
        'city_id'=>$row['city_id'],'city_name'=>$row['city_name'],
        'post_count'=>(int)$row['post_count'],'majority_severity'=>$row['majority_severity'],
        'expires_at_ms'=>$dayExpiry,
    ],array_values(array_filter($snapshot['cities'],fn($row)=>(int)$row['post_count']>0)));
    $individualReports=[];
    $postSql='SELECT p.city_id,p.source,p.source_post_id,p.published_at,p.severity,p.locations_json
        FROM nlp_city_flood_posts p WHERE p.published_at>=? AND p.published_at<=UTC_TIMESTAMP()'.
        ($city?' AND p.city_id=?':'').' ORDER BY p.published_at DESC,p.source_post_id DESC LIMIT 100';
    $postQuery=$pdo->prepare($postSql);
    $postQuery->execute(array_merge([gmdate('Y-m-d H:i:s',$snapshot['day_expires_at_ms']/1000-86400)],$city?[$city['id']]:[]));
    $postRows=$postQuery->fetchAll();
    foreach($postRows as &$postRow){
        $postLocation=bahaba_flood_city((string)$postRow['city_id']);
        $postRow['city_name']=$postLocation['name']??(string)$postRow['city_id'];
    }unset($postRow);
    $individualReports=bahaba_resident_individual_reports($postRows);
    foreach($individualReports as &$individualReport)$individualReport['expires_at_ms']=$dayExpiry;unset($individualReport);
    return ['cities'=>$cities,'reports'=>$reports,'individual_reports'=>$individualReports,'window_minutes'=>$snapshot['window_minutes'],'day_expires_at_ms'=>$dayExpiry,'pins'=>array_values(array_filter($pins,fn($p)=>$p['geometry']!==null)),'server_time'=>$snapshot['server_time']];
}

if (basename((string) ($_SERVER['SCRIPT_NAME'] ?? '')) === basename(__FILE__)) {
    require __DIR__ . '/bootstrap.php';
    header('Cache-Control: no-store, private');
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') respond(['error' => 'Method not allowed.'], 405);
    if (!bahaba_authenticated_app_user($pdo)) respond(['error' => 'Sign in first.'], 401);
    $locationId = trim((string) ($_GET['location'] ?? ''));
    if ($locationId !== '' && (!bahaba_psgc_by_id($locationId) || !bahaba_psgc_is_luzon($locationId))) {
        respond(['error' => 'Invalid location.'], 422);
    }
    respond(bahaba_resident_flood_signals($pdo, $locationId !== '' ? $locationId : null));
}
