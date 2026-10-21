<?php
/** Aggregate reported signals only. Never expose administrative social post text. */
function bahaba_resident_flood_signals(PDO $pdo, ?string $locationId=null): array {
    $empty=['cities'=>[],'pins'=>[],'server_time'=>gmdate('c')];$module=null;
    foreach ([dirname(__DIR__).'/nlp-flood-events.php',dirname(__DIR__,2).'/nlp-flood-events.php',dirname(__DIR__,2).'/deploy/render-api/admin-source/nlp-flood-events.php'] as $path) if(is_file($path)){$module=$path;break;}
    if(!$module)return $empty;
    require_once $module;
    $city=$locationId?bahaba_flood_city($locationId):null;
    if($locationId&&!$city)return $empty;
    $snapshot=bahaba_flood_snapshot($pdo,$city['id']??null);
    $cities=array_values(array_filter($snapshot['cities'],fn($row)=>$row['phase']==='ACTIVE'));
    $expiry=[];foreach($cities as $row)$expiry[$row['city_id']]=(strtotime($row['last_post_at'].' UTC')+3600)*1000;
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
        $pin['expires_at_ms']=$expiry[$pin['city_id']]??0;
    }unset($pin);
    return ['cities'=>$cities,'pins'=>array_values(array_filter($pins,fn($p)=>$p['geometry']!==null)),'server_time'=>$snapshot['server_time']];
}
