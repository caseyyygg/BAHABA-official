<?php
/** City-wide social flood signals. A signal never establishes official verification. */
// Thesis demonstration: one eligible flood post activates a preliminary signal.
// Restore to 20 after the demonstration.
const BAHABA_FLOOD_POSTS = 1;
const BAHABA_FLOOD_WINDOW = 86400;
const BAHABA_FLOOD_IDLE = 86400;

function bahaba_flood_day_bounds(?int $clock = null): array {
    $manila = new DateTimeZone('Asia/Manila');
    $utc = new DateTimeZone('UTC');
    $today = (new DateTimeImmutable('@'.($clock ?? time())))->setTimezone($manila)->setTime(0,0,0);
    return [
        'start' => $today->setTimezone($utc)->getTimestamp(),
        'end' => $today->modify('+1 day')->setTimezone($utc)->getTimestamp(),
    ];
}

function bahaba_flood_schema(PDO $pdo): void {
    static $ready = [];
    $key = spl_object_id($pdo); if (isset($ready[$key])) return;
    $pdo->exec("CREATE TABLE IF NOT EXISTS nlp_city_flood_state (
        city_id VARCHAR(32) PRIMARY KEY, city_name VARCHAR(150) NOT NULL,
        phase VARCHAR(16) NOT NULL DEFAULT 'INACTIVE', event_id BIGINT UNSIGNED NULL,
        last_post_at DATETIME NULL, cycle_floor DATETIME NULL)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS nlp_city_flood_events (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, city_id VARCHAR(32) NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE', verification_status VARCHAR(16) NOT NULL DEFAULT 'reported',
        trigger_type VARCHAR(24) NOT NULL, activated_at DATETIME NOT NULL,
        window_start DATETIME NOT NULL, last_post_at DATETIME NOT NULL, expired_at DATETIME NULL,
        INDEX(city_id,status))");
    $pdo->exec("CREATE TABLE IF NOT EXISTS nlp_city_flood_posts (
        post_key CHAR(64) PRIMARY KEY, city_id VARCHAR(32) NOT NULL, event_id BIGINT UNSIGNED NULL,
        source VARCHAR(32) NOT NULL, source_post_id VARCHAR(191) NOT NULL,
        published_at DATETIME NOT NULL, severity VARCHAR(16) NOT NULL, post_url VARCHAR(2048) NULL,
        locations_json LONGTEXT NOT NULL, INDEX(city_id,published_at), INDEX(event_id))");
    $pdo->exec("CREATE TABLE IF NOT EXISTS nlp_city_flood_pins (
        event_id BIGINT UNSIGNED NOT NULL, location_key CHAR(64) NOT NULL,
        label VARCHAR(255) NOT NULL, precision_level VARCHAR(16) NOT NULL,
        barangay_feature_id VARCHAR(64) NOT NULL, latitude DECIMAL(10,7) NULL, longitude DECIMAL(10,7) NULL,
        post_count INT UNSIGNED NOT NULL, latest_post_at DATETIME NOT NULL, severity VARCHAR(16) NOT NULL,
        PRIMARY KEY(event_id,location_key))");
    $pdo->exec("CREATE TABLE IF NOT EXISTS nlp_flood_alert_outbox (
        event_id BIGINT UNSIGNED PRIMARY KEY, created_at DATETIME NOT NULL, delivered_at DATETIME NULL)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS nlp_trusted_publishers (
        platform VARCHAR(32) NOT NULL,publisher_id VARCHAR(191) NOT NULL,
        publisher_type VARCHAR(16) NOT NULL,profile_url VARCHAR(2048) NOT NULL,
        evidence_url VARCHAR(2048) NOT NULL,approved_by BIGINT UNSIGNED NOT NULL,
        approved_at DATETIME NOT NULL,active BOOLEAN NOT NULL DEFAULT TRUE,
        PRIMARY KEY(platform,publisher_id))");
    $pdo->exec("CREATE TABLE IF NOT EXISTS nlp_flood_geocode_cache (
        query_hash CHAR(64) PRIMARY KEY, query_text VARCHAR(512) NOT NULL,
        results_json LONGTEXT NOT NULL, expires_at DATETIME NOT NULL)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS nlp_flood_geocode_rate_limit (
        id TINYINT UNSIGNED PRIMARY KEY, last_request_at DATETIME NULL)");
    $ready[$key] = true;
}

function bahaba_flood_city(?string $locationId): ?array {
    if (!$locationId) return null;
    $id = bahaba_legacy_psgc($locationId) ?: $locationId;
    $city = bahaba_psgc_by_id($id);
    // Province names alone cannot identify a municipality-wide event.
    if (!$city) return null;
    return ['id'=>$id, 'name'=>$city['city'] ?? $city['name'] ?? $id];
}

function bahaba_flood_transition(array $state, int $published, int $now, int $recent, bool $trusted = false): array {
    $day = bahaba_flood_day_bounds($now);
    $last = isset($state['last_post_at']) ? strtotime($state['last_post_at'].' UTC') : 0;
    $floor = isset($state['cycle_floor']) ? strtotime($state['cycle_floor'].' UTC') : 0;
    $expired = ($state['phase']??'INACTIVE') === 'ACTIVE' && $last < $day['start'];
    if ($expired) { $floor = $day['start']-1; $state['phase']='EXPIRED'; }
    if (($state['phase']??'INACTIVE')!=='ACTIVE' || $floor < $day['start']) $floor = $day['start']-1;
    $valid = $published > $floor && $published <= $now && $published >= $day['start'];
    $activate = $valid && ($state['phase']??'INACTIVE') !== 'ACTIVE'
        && $published >= $now-BAHABA_FLOOD_WINDOW && ($recent>=BAHABA_FLOOD_POSTS || $trusted);
    $active = !$expired && ($state['phase']??'INACTIVE') === 'ACTIVE';
    return ['expire'=>$expired, 'floor'=>$floor, 'accept'=>$valid, 'activate'=>$activate,
        'phase'=>$activate || ($active && $valid) ? 'ACTIVE' : ($active ? 'ACTIVE' : ($recent>0 ? 'MONITORING' : ($state['phase']??'INACTIVE'))),
        'last_post'=>($valid && ($active || $activate)) ? max($last,$published) : $last];
}

function bahaba_flood_majority_severity(array $counts): string {
    $normalized=['Low'=>(int)($counts['Low']??0),'Mid'=>(int)($counts['Mid']??$counts['Medium']??0),'High'=>(int)($counts['High']??0)];
    $maximum=max($normalized);
    if($maximum<1)return 'Unspecified';
    $leaders=array_keys(array_filter($normalized,fn($count)=>$count===$maximum));
    if(count($leaders)!==1)return 'Mixed';
    return $leaders[0]==='Mid'?'Medium':$leaders[0];
}

function bahaba_flood_map_geometry(): array {
    static $geometry;
    if ($geometry===null) $geometry=json_decode((string)file_get_contents(__DIR__.'/map-data/barangays.json'),true,512,JSON_THROW_ON_ERROR);
    return $geometry;
}

function bahaba_flood_verified_locations(): array {
    global $config;
    static $locations;
    if ($locations!==null) return $locations;

    $path=__DIR__.'/flood-landmarks.json';
    if(!is_file($path)) $path=dirname(__DIR__,3).'/bahaba-app/src/assets/flood-landmarks.json';
    if(!is_file($path)) throw new RuntimeException('Verified flood landmark gazetteer is unavailable.');
    $gazetteer=json_decode((string)file_get_contents($path),true,512,JSON_THROW_ON_ERROR);
    if(!is_array($gazetteer)) throw new RuntimeException('Verified flood landmark gazetteer is malformed.');

    $indexed=[];
    foreach($gazetteer as $landmark){
        if(!is_array($landmark)||empty($landmark['city_id'])||empty($landmark['barangay_feature_id'])
            ||empty($landmark['verification_reference'])||!is_array($landmark['coordinates']??null)) continue;
        $landmark['longitude']=$landmark['coordinates'][0]??null;
        $landmark['latitude']=$landmark['coordinates'][1]??null;
        $indexed[(string)($landmark['id']??$landmark['name']??count($indexed))]=$landmark;
    }
    foreach(is_array($config['verified_flood_locations']??null)?$config['verified_flood_locations']:[] as $place){
        if(!is_array($place)) continue;
        $indexed[(string)($place['id']??$place['name']??count($indexed))]=$place;
    }
    return $locations=array_values($indexed);
}

function bahaba_flood_geocode_results(PDO $pdo, string $query, array $feature): ?array {
    global $config;
    $query=trim($query);
    if($query===''||mb_strlen($query)>512)return null;
    $queryHash=hash('sha256',mb_strtolower($query));
    $cached=$pdo->prepare('SELECT results_json FROM nlp_flood_geocode_cache WHERE query_hash=? AND expires_at>UTC_TIMESTAMP()');
    $cached->execute([$queryHash]);
    $cachedJson=$cached->fetchColumn();
    if($cachedJson!==false){
        $results=json_decode((string)$cachedJson,true);
        if(is_array($results))return $results;
        throw new RuntimeException('Cached place-geocoder response is malformed.');
    }

    $lockName='bahaba_place_geocode';
    $lock=$pdo->prepare('SELECT GET_LOCK(?,0)');$lock->execute([$lockName]);
    if((int)$lock->fetchColumn()!==1)return null;
    try{
        $cached->execute([$queryHash]);$cachedJson=$cached->fetchColumn();
        if($cachedJson!==false){
            $results=json_decode((string)$cachedJson,true);
            if(is_array($results))return $results;
            throw new RuntimeException('Cached place-geocoder response is malformed.');
        }
        $pdo->exec('INSERT IGNORE INTO nlp_flood_geocode_rate_limit(id,last_request_at) VALUES(1,NULL)');
        $last=$pdo->query('SELECT last_request_at FROM nlp_flood_geocode_rate_limit WHERE id=1')->fetchColumn();
        if($last!==false&&$last!==null&&time()-strtotime((string)$last.' UTC')<15)return null;
        $pdo->exec('UPDATE nlp_flood_geocode_rate_limit SET last_request_at=UTC_TIMESTAMP() WHERE id=1');

        $endpoint=trim((string)($config['place_geocoder_url']??'https://photon.komoot.io/api/'));
        if(!filter_var($endpoint,FILTER_VALIDATE_URL)||strtolower((string)parse_url($endpoint,PHP_URL_SCHEME))!=='https'){
            error_log('BANTALA place geocoding skipped: place_geocoder_url must be a valid HTTPS URL.');
            return null;
        }
        $isPhoton=strtolower((string)parse_url($endpoint,PHP_URL_HOST))==='photon.komoot.io';
        $parameters=$isPhoton
            ?['q'=>$query,'limit'=>'10','lang'=>'en']
            :['q'=>$query,'format'=>'jsonv2','addressdetails'=>'1','limit'=>'10','countrycodes'=>'ph'];
        if($isPhoton&&($center=bahaba_flood_geometry_center($feature['geometry']??null))){
            $parameters['lat']=$center[1];$parameters['lon']=$center[0];
        }
        $url=$endpoint.(str_contains($endpoint,'?')?'&':'?').http_build_query($parameters);
        $context=stream_context_create(['http'=>[
            'method'=>'GET','timeout'=>3,'ignore_errors'=>true,
            'header'=>"User-Agent: BANTALA-Flood-Map/1.0 (https://bantalafloodapp.pages.dev/)\r\nAccept: application/geo+json, application/json\r\n",
        ]]);
        $body=@file_get_contents($url,false,$context);
        $status=0;
        foreach($http_response_header??[] as $header)if(preg_match('/^HTTP\/\S+\s+(\d{3})/',$header,$match))$status=(int)$match[1];
        if($body===false||$status!==200){
            $error=error_get_last();
            error_log('BANTALA place geocoding failed'.($status?' with HTTP '.$status:'').(!empty($error['message'])?': '.$error['message']:''));
            return null;
        }
        $response=json_decode($body,true);
        if(!is_array($response)){
            error_log('BANTALA place geocoding returned malformed JSON.');
            return null;
        }
        $results=bahaba_flood_normalize_geocode_response($response,$isPhoton);
        $store=$pdo->prepare('INSERT INTO nlp_flood_geocode_cache(query_hash,query_text,results_json,expires_at) VALUES(?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 30 DAY)) ON DUPLICATE KEY UPDATE query_text=VALUES(query_text),results_json=VALUES(results_json),expires_at=VALUES(expires_at)');
        $store->execute([$queryHash,$query,json_encode($results,JSON_THROW_ON_ERROR)]);
        return $results;
    }finally{
        $release=$pdo->prepare('SELECT RELEASE_LOCK(?)');$release->execute([$lockName]);
    }
}

function bahaba_flood_normalize_geocode_response(array $response,bool $isPhoton): array {
    if(!$isPhoton)return $response;
    if(!is_array($response['features']??null)){
        error_log('BANTALA Photon place-geocoder response is malformed.');
        return [];
    }
    $results=[];
    foreach($response['features'] as $candidate){
        $properties=$candidate['properties']??[];$coordinates=$candidate['geometry']['coordinates']??[];
        if(!is_array($coordinates)||!is_numeric($coordinates[0]??null)||!is_numeric($coordinates[1]??null))continue;
        $results[]=['name'=>(string)($properties['name']??''),'class'=>(string)($properties['osm_key']??''),
            'type'=>(string)($properties['type']??''),'lat'=>(string)$coordinates[1],'lon'=>(string)$coordinates[0]];
    }
    return $results;
}

function bahaba_flood_geometry_center(?array $geometry): ?array {
    if(!is_array($geometry))return null;
    $longitudes=[];$latitudes=[];
    $visit=static function($coordinates)use(&$visit,&$longitudes,&$latitudes):void{
        if(!is_array($coordinates))return;
        if(isset($coordinates[0],$coordinates[1])&&is_numeric($coordinates[0])&&is_numeric($coordinates[1])){
            $longitudes[]=(float)$coordinates[0];$latitudes[]=(float)$coordinates[1];return;
        }
        foreach($coordinates as $coordinate)$visit($coordinate);
    };
    $visit($geometry['coordinates']??null);
    if(!$longitudes||!$latitudes)return null;
    return [(min($longitudes)+max($longitudes))/2,(min($latitudes)+max($latitudes))/2];
}

function bahaba_flood_specific_place_hint(string $hint,string $text,string $barangay,string $cityName): string {
    $normalize=static fn(string $value):string=>mb_strtolower(trim(preg_replace('/\s+/u',' ',preg_replace('/[^[:alnum:]]+/u',' ',$value))));
    $isSpecific=static fn(string $value):bool=>$value!==''&&!in_array($normalize($value),[
        'flood','flooding','baha','pagbaha','navotas','has flood','has flooding','may flood','may baha','may baha na po',
    ],true);
    $stripContext=static function(string $value)use($barangay,$cityName,$normalize):string{
        $cityContext=preg_replace('/^(?:city|municipality)\s+of\s+/iu','',$cityName);
        foreach(array_filter([$barangay,$cityName,$cityContext,'Philippines']) as $context){
            $pattern='/'.preg_quote(trim(preg_replace('/\s+/u',' ',$context)),'/').'/iu';
            $value=preg_replace($pattern,' ',$value);
        }
        $value=preg_replace('/\b(?:brgy\.?|barangay|city\s+of|city|municipality\s+of|municipality)\b/iu',' ',$value);
        $value=preg_replace('/\b(?:sa\s+may|malapit\s+sa|tapat\s+ng|near|beside|across\s+from|along|around|at|in|sa)\b/iu',' ',$value);
        return trim(preg_replace('/[\s,;:.-]+/u',' ',$value));
    };
    $candidate=$stripContext(trim($hint));
    if($isSpecific($candidate))return mb_substr($candidate,0,180);

    if(preg_match_all('/\b(?:sa(?:\s+may)?|malapit\s+sa|tapat\s+ng|sa\s+tapat\s+ng|katabi\s+ng|tabi\s+ng|harap(?:an)?\s+ng|likod\s+ng|near|beside|across\s+from|along|around|by)\s+([^,.;!?]+)/iu',$text,$matches)){
        foreach($matches[1] as $phrase){
            $candidate=$stripContext(trim($phrase));
            if($isSpecific($candidate))return mb_substr($candidate,0,180);
        }
    }
    if($barangay!==''&&preg_match('/(?<![\pL\pN])'.preg_quote($barangay,'/').'(?![\pL\pN])\s+([^,.;!?]+)/iu',$text,$match)){
        $candidate=$stripContext(trim($match[1]));
        if($isSpecific($candidate))return mb_substr($candidate,0,180);
    }
    return '';
}

function bahaba_flood_select_geocoded_place(array $results,string $query,string $cityId,string $barangay,array $feature): ?array {
    $matches=[];
    foreach($results as $result){
        $class=strtolower((string)($result['class']??''));
        $type=strtolower((string)($result['type']??''));
        $name=trim((string)($result['name']??''));
        if($name===''||in_array($class,['boundary'],true)
            ||($class==='place'&&in_array($type,['city','town','village','suburb','neighbourhood','quarter','borough','county','state'],true))
            ||!is_numeric($result['lat']??null)||!is_numeric($result['lon']??null))continue;
        $latitude=(float)$result['lat'];$longitude=(float)$result['lon'];
        if($latitude<4||$latitude>22||$longitude<116||$longitude>128
            ||!bahaba_report_point_inside($feature['geometry'],$longitude,$latitude))continue;
        $matches[]=['name'=>$name,'latitude'=>$latitude,'longitude'=>$longitude];
    }
    $unique=[];
    foreach($matches as $match){
        $duplicate=false;
        foreach($unique as &$other){
            if(mb_strtolower($other['name'])===mb_strtolower($match['name'])
                &&hypot($other['longitude']-$match['longitude'],$other['latitude']-$match['latitude'])<0.0003){
                $duplicate=true;break;
            }
        }unset($other);
        if(!$duplicate)$unique[]=$match;
    }
    if(count($unique)!==1)return null;
    $place=$unique[0];
    $normalizeName=static function(string $value): array {
        $normalized=mb_strtolower(trim(preg_replace('/[^[:alnum:]]+/u',' ',$value)));
        $normalized=preg_replace('/\b7\s+11\b/u','7 eleven',$normalized);
        return array_values(array_filter(explode(' ',$normalized),static fn($part)=>$part!==''));
    };
    $hintTokens=$normalizeName($query);
    if(!$hintTokens)return null;
    $candidateTokens=$normalizeName($place['name']);
    if(!$candidateTokens||array_diff($candidateTokens,$hintTokens))return null;

    foreach(bahaba_flood_verified_locations() as $known){
        if(($known['city_id']??'')!==$cityId
            ||(string)($known['barangay_feature_id']??'')!==(string)$feature['id']
            ||!is_numeric($known['latitude']??null)||!is_numeric($known['longitude']??null))continue;
        $knownNames=array_merge([(string)($known['name']??'')],is_array($known['aliases']??null)?$known['aliases']:[]);
        if(!in_array($normalizeName($place['name']),array_map(static fn($name)=>$normalizeName((string)$name),$knownNames),true))continue;
        $latitude=(float)$known['latitude'];$longitude=(float)$known['longitude'];
        $meanLatitude=deg2rad(($latitude+$place['latitude'])/2);
        $distance=hypot(($latitude-$place['latitude'])*111320,($longitude-$place['longitude'])*111320*cos($meanLatitude));
        if($distance>50)continue;
        $key=hash('sha256','place:'.$cityId.':'.($known['id']??$known['name']));
        return ['key'=>$key,'label'=>$known['name'],'precision'=>'landmark','feature_id'=>(string)$feature['id'],
            'latitude'=>$latitude,'longitude'=>$longitude];
    }

    $key=hash('sha256','geocoded:'.$cityId.':'.$feature['id'].':'.mb_strtolower($query));
    return ['key'=>$key,'label'=>$place['name'],'precision'=>'landmark','feature_id'=>(string)$feature['id'],
        'latitude'=>$place['latitude'],'longitude'=>$place['longitude']];
}

function bahaba_flood_select_city_geocoded_place(array $results,string $query,string $cityId,array $features): ?array {
    $places=[];
    foreach($results as $result){
        if(!is_numeric($result['lat']??null)||!is_numeric($result['lon']??null))continue;
        $latitude=(float)$result['lat'];$longitude=(float)$result['lon'];
        $containing=[];
        foreach($features as $feature){
            if(bahaba_report_point_inside($feature['geometry'],$longitude,$latitude))$containing[]=$feature;
        }
        if(count($containing)!==1)continue;
        $feature=$containing[0];
        $place=bahaba_flood_select_geocoded_place(
            [$result],$query,$cityId,(string)($feature['properties']['name']??''),$feature
        );
        if(!$place)continue;
        $places[]=['place'=>$place,'feature'=>$feature];
    }
    $unique=[];
    foreach($places as $candidate){
        $duplicate=false;
        foreach($unique as $other){
            if(mb_strtolower($other['place']['label'])===mb_strtolower($candidate['place']['label'])
                &&hypot($other['place']['longitude']-$candidate['place']['longitude'],
                    $other['place']['latitude']-$candidate['place']['latitude'])<0.0003){
                $duplicate=true;break;
            }
        }
        if(!$duplicate)$unique[]=$candidate;
    }
    if(count($unique)===1)return [$unique[0]['place']];
    if(count($unique)<2)return [];

    $featureIds=array_unique(array_map(static fn($candidate)=>(string)$candidate['feature']['id'],$unique));
    if(count($featureIds)!==1)return [];
    $feature=$unique[0]['feature'];
    return [[
        'key'=>hash('sha256','barangay:'.$cityId.':'.$feature['id']),
        'label'=>(string)$feature['properties']['name'],
        'precision'=>'barangay',
        'feature_id'=>(string)$feature['id'],
        'latitude'=>null,
        'longitude'=>null,
    ]];
}

function bahaba_flood_geocoded_location(PDO $pdo,string $hint,string $cityId,string $cityName,string $barangay,array $feature): ?array {
    $hint=trim(preg_replace('/\s+/u',' ',$hint));
    if(mb_strlen($hint)<3||mb_strlen($hint)>180)return null;
    $normalize=static fn($value)=>mb_strtolower(trim(preg_replace('/[^[:alnum:]]+/u',' ',(string)$value)));
    $normalizedHint=$normalize($hint);
    foreach([$cityName,$barangay] as $generic)if($normalizedHint===$normalize($generic))return null;
    if(in_array($normalizedHint,['philippines','metro manila','ncr','flood','flooding'],true))return null;

    $query=implode(', ',array_filter([$hint,$barangay,$cityName,'Philippines']));
    $results=bahaba_flood_geocode_results($pdo,$query,$feature);
    return $results?bahaba_flood_select_geocoded_place($results,$hint,$cityId,$barangay,$feature):null;
}

function bahaba_flood_locations(string $cityId,string $text,string $barangay='',string $locationHint='',?PDO $pdo=null): array {
    require_once __DIR__.'/report-point.php';
    global $config;
    $geometry=bahaba_flood_map_geometry();
    $scope = bahaba_location_by_id($cityId);
    foreach (bahaba_supported_locations() as $legacy) if (bahaba_legacy_psgc($legacy['id'])===$cityId) { $scope=$legacy; break; }
    $normalize = static fn($value)=>mb_strtolower(trim(preg_replace('/\s*\([^)]*\)/u','',(string)$value)));
    $features=[]; $matches=[];
    foreach ($geometry['features']??[] as $feature) {
        $p=$feature['properties'];
        if (($p['city']??'')!==($scope['map_city']??$scope['city']??'') ||
            (!empty($scope['map_municipality']) && ($p['municipality']??'')!==$scope['map_municipality'])) continue;
        $features[(string)$feature['id']]=$feature;
        $names=[];
        foreach ([$p['name']??'', $p['sourceName']??''] as $name) {
            if ($name==='') continue;
            $names[]=$name;
            $shortName=trim((string)preg_replace('/\s*\([^)]*\)/u','',$name));
            if($shortName!=='')$names[]=$shortName;
        }
        foreach (array_unique($names) as $name) {
            if ($name!=='' && ($normalize($barangay)===$normalize($name) ||
                preg_match('/\b(?:brgy\.?|barangay)\s+'.preg_quote($name,'/').'(?![\pL\pN])/iu',$text) ||
                preg_match('/(?<![\pL\pN])'.preg_quote($name,'/').'(?![\pL\pN])/iu',$text))) {
                $matches[(string)$feature['id']]=['key'=>hash('sha256','barangay:'.$cityId.':'.$feature['id']),
                    'label'=>$p['name'], 'precision'=>'barangay', 'feature_id'=>(string)$feature['id'], 'latitude'=>null, 'longitude'=>null];
            }
        }
    }
    // Street/landmark coordinates must come from a reviewed gazetteer, never the NLP model.
    $precise=[];
    foreach (bahaba_flood_verified_locations() as $place) {
        if (($place['city_id']??'')!==$cityId || empty($place['verification_reference'])) continue;
        $feature=$features[(string)($place['barangay_feature_id']??'')]??null;
        if (!$feature || !is_numeric($place['latitude']??null) || !is_numeric($place['longitude']??null)) continue;
        $matched=false;
        foreach (array_merge([$place['name']??''], $place['aliases']??[]) as $name) {
            if ($name!=='' && preg_match('/(?<![\pL\pN])'.preg_quote($name,'/').'(?![\pL\pN])/iu',$text)) $matched=true;
        }
        if (!$matched || !bahaba_report_point_inside($feature['geometry'],(float)$place['longitude'],(float)$place['latitude'])) continue;
        $key=hash('sha256','place:'.$cityId.':'.($place['id']??$place['name']));
        $precise[$key]=['key'=>$key,'label'=>$place['name'],'precision'=>'landmark','feature_id'=>(string)$feature['id'],
            'latitude'=>(float)$place['latitude'],'longitude'=>(float)$place['longitude']];
        // Prefer a precise ping over shading the whole barangay for this post.
        unset($matches[(string)$feature['id']]);
    }
    if(!$precise&&$pdo){
        $cityName=(string)($scope['city']??$scope['name']??$cityId);
        foreach($geometry['features']??[] as $candidateFeature){
            $candidateProperties=$candidateFeature['properties']??[];
            if(($candidateProperties['city']??'')!==($scope['map_city']??$scope['city']??'')
                ||(!empty($scope['map_municipality'])&&($candidateProperties['municipality']??'')!==$scope['map_municipality']))continue;
            if(!isset($matches[(string)$candidateFeature['id']]))continue;
            $name=(string)($candidateProperties['name']??'');
            if($name==='')continue;
            $specificHint=bahaba_flood_specific_place_hint($locationHint,$text,$name,$cityName);
            if($specificHint==='')continue;
            $place=bahaba_flood_geocoded_location($pdo,$specificHint,$cityId,$cityName,$name,$candidateFeature);
            if(!$place)continue;
            $precise[$place['key']]=$place;
            unset($matches[(string)$candidateFeature['id']]);
        }
    }
    if(!$precise&&$pdo){
        $cityName=(string)($scope['city']??$scope['name']??$cityId);
        $specificHint=bahaba_flood_specific_place_hint($locationHint,$text,$barangay,$cityName);
        if($specificHint!==''){
            $query=implode(', ',array_filter([$specificHint,$cityName,'Philippines']));
            $results=bahaba_flood_geocode_results($pdo,$query,['geometry'=>null]);
            if($results&&count($results)<10){
                $cityPlaces=bahaba_flood_select_city_geocoded_place($results,$specificHint,$cityId,array_values($features));
                foreach($cityPlaces as $place){
                    $precise[$place['key']]=$place;
                    unset($matches[$place['feature_id']]);
                }
            }
        }
    }
    // Ambiguous identically named barangays do not produce an invented location.
    $names=[]; foreach ($matches as $match) $names[$normalize($match['label'])]=($names[$normalize($match['label'])]??0)+1;
    return array_values(array_merge($precise,array_filter($matches,fn($m)=>$names[$normalize($m['label'])]===1)));
}

function bahaba_flood_refreshed_locations_json(array $locations): ?string {
    return $locations ? json_encode($locations,JSON_THROW_ON_ERROR) : null;
}

function bahaba_flood_barangay_admin_pins(array $pins, string $barangay, string $mapCity): array {
    $normalize=static fn($value)=>mb_strtolower(trim(preg_replace('/\s*\([^)]*\)/u','',(string)$value)));
    $geometry=bahaba_flood_map_geometry();
    $allowed=[];
    foreach($geometry['features']??[] as $feature){
        $properties=$feature['properties']??[];
        if(($properties['city']??'')!==$mapCity)continue;
        if($normalize($properties['name']??'')===$normalize($barangay) ||
            $normalize($properties['sourceName']??'')===$normalize($barangay)){
            $allowed[(string)$feature['id']]=true;
        }
    }
    return array_values(array_filter($pins,static fn($pin)=>isset($allowed[(string)($pin['barangay_feature_id']??'')])));
}

function bahaba_flood_trusted(array $post, ?PDO $pdo = null): bool {
    global $config;
    foreach ($config['trusted_social_publishers']??[] as $publisher) {
        if (in_array($publisher['type']??'', ['news','government'],true)
            && strtolower($publisher['platform']??'')===strtolower($post['source']??'')
            && ($post['publisher_id']??'')!=='' && (string)($publisher['publisher_id']??'')===(string)$post['publisher_id']) return true;
    }
    if ($pdo && !empty($post['publisher_id'])) {
        $stmt=$pdo->prepare('SELECT publisher_type FROM nlp_trusted_publishers WHERE platform=? AND publisher_id=? AND active=TRUE');
        $stmt->execute([strtolower($post['source']??''),(string)$post['publisher_id']]);
        return in_array($stmt->fetchColumn(),['news','government'],true);
    }
    return false;
}

function bahaba_flood_expire_locked(PDO $pdo, array &$state, int $now): void {
    $day=bahaba_flood_day_bounds($now);
    if ($state['phase']!=='ACTIVE' || strtotime($state['last_post_at'].' UTC')>=$day['start']) return;
    $expired=gmdate('Y-m-d H:i:s',$day['start']);
    $pdo->prepare("UPDATE nlp_city_flood_events SET status='EXPIRED',expired_at=? WHERE id=? AND status='ACTIVE'")->execute([$expired,$state['event_id']]);
    $floor=gmdate('Y-m-d H:i:s',$day['start']-1);
    $pdo->prepare("UPDATE nlp_city_flood_state SET phase='EXPIRED',event_id=NULL,cycle_floor=? WHERE city_id=?")->execute([$floor,$state['city_id']]);
    $state['phase']='EXPIRED'; $state['event_id']=null; $state['cycle_floor']=$floor;
}

function bahaba_flood_sync_pins(PDO $pdo, int $eventId, ?int $clock = null): void {
    $now=$clock??time();
    $day=bahaba_flood_day_bounds($now);
    $stmt=$pdo->prepare('SELECT * FROM nlp_city_flood_posts WHERE event_id=? AND published_at>=? AND published_at<=?');
    $stmt->execute([$eventId,gmdate('Y-m-d H:i:s',$day['start']),gmdate('Y-m-d H:i:s',$now)]);
    $groups=[];
    foreach ($stmt->fetchAll() as $post) foreach (json_decode($post['locations_json'],true)?:[] as $place) {
        $key=$place['key'];
        if (!isset($groups[$key])) $groups[$key]=$place+['count'=>0,'latest'=>$post['published_at'],'severity_counts'=>['Low'=>0,'Mid'=>0,'High'=>0]];
        $groups[$key]['count']++; $groups[$key]['latest']=max($groups[$key]['latest'],$post['published_at']);
        $severity=['Low'=>'Low','Mid'=>'Mid','Medium'=>'Mid','High'=>'High'][$post['severity']]??'Low';
        $groups[$key]['severity_counts'][$severity]++;
    }
    // Citywide posts activate one event. After activation, show every supported
    // barangay or verified landmark named by posts in today's PHT window;
    // do not require each location to independently reach the city threshold.
    $pdo->prepare('DELETE FROM nlp_city_flood_pins WHERE event_id=?')->execute([$eventId]);
    $upsert=$pdo->prepare('INSERT INTO nlp_city_flood_pins(event_id,location_key,label,precision_level,barangay_feature_id,latitude,longitude,post_count,latest_post_at,severity)
        VALUES(?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE post_count=VALUES(post_count),latest_post_at=VALUES(latest_post_at),severity=VALUES(severity)');
    foreach ($groups as $key=>$place) {
        $place['severity']=bahaba_flood_majority_severity($place['severity_counts']);
        $upsert->execute([$eventId,$key,$place['label'],$place['precision'],$place['feature_id'],
            $place['latitude'],$place['longitude'],$place['count'],$place['latest'],$place['severity']]);
    }
}

function bahaba_process_city_flood_post(PDO $pdo, ?string $locationId, string $barangay, array $post, ?int $clock = null, bool $sendPush = true): array {
    $now=$clock??time(); $city=bahaba_flood_city($locationId);
    $day=bahaba_flood_day_bounds($now);
    $result=['required_posts'=>BAHABA_FLOOD_POSTS,'window_minutes'=>(int)(BAHABA_FLOOD_WINDOW/60),'eligible_posts'=>0,'report_id'=>null,'event_id'=>null,'phase'=>'INACTIVE'];
    if (!$city || strtolower($post['classification']??'')!=='flood') return $result;
    $rawTime=trim((string)($post['timestamp']??''));
    if (!preg_match('/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/',$rawTime)) $rawTime='';
    try {
        $published=$rawTime!=='' ? (new DateTimeImmutable($rawTime,new DateTimeZone('UTC')))->getTimestamp() : 0;
        $errors=DateTimeImmutable::getLastErrors();
        if ($errors && ($errors['warning_count'] || $errors['error_count'])) $published=0;
    } catch (Throwable $e) { $published=0; }
    $id=trim((string)($post['original_post_id']??''));
    if ($id==='') $id=trim((string)($post['post_id']??''));
    if (!$published || $published>$now || $id==='' || !empty($post['is_repost'])) return $result+['ineligible_reason'=>'Missing/invalid publication time, original ID, or repost'];
    bahaba_flood_schema($pdo);
    $locations=$published>=$day['start']
        ?bahaba_flood_locations($city['id'],(string)($post['post_text']??$post['text']??''),$barangay,(string)($post['location']??''),$pdo)
        :[];
    $pdo->prepare('INSERT IGNORE INTO nlp_city_flood_state(city_id,city_name) VALUES(?,?)')->execute([$city['id'],$city['name']]);
    $pdo->beginTransaction();
    try {
        $lock=$pdo->prepare('SELECT * FROM nlp_city_flood_state WHERE city_id=? FOR UPDATE');$lock->execute([$city['id']]);$state=$lock->fetch();
        bahaba_flood_expire_locked($pdo,$state,$now);
        $floor=$state['cycle_floor'] ? strtotime($state['cycle_floor'].' UTC') : 0;
        if ($state['phase']!=='ACTIVE') $floor=$day['start']-1;
        if ($published<$day['start'] || $published>$now) { $pdo->commit(); return array_replace($result,['phase'=>$state['phase'],'event_id'=>$state['event_id'],'ineligible_reason'=>'Outside today’s Philippine-time window']); }
        $key=hash('sha256',$city['id'].':'.strtolower($post['source']??'').':'.$id);
        $insert=$pdo->prepare('INSERT IGNORE INTO nlp_city_flood_posts(post_key,city_id,source,source_post_id,published_at,severity,post_url,locations_json) VALUES(?,?,?,?,?,?,?,?)');
        $severity=['low'=>'Low','mid'=>'Mid','medium'=>'Mid','high'=>'High'][strtolower($post['severity']??'low')]??'Low';
        $insert->execute([$key,$city['id'],$post['source']??'Unknown',$id,gmdate('Y-m-d H:i:s',$published),$severity,$post['post_url']??null,json_encode($locations,JSON_THROW_ON_ERROR)]);
        $new=$insert->rowCount()>0;
        $locationsChanged=false;
        if (!$new && ($locationsJson=bahaba_flood_refreshed_locations_json($locations))!==null) {
            $refresh=$pdo->prepare('UPDATE nlp_city_flood_posts SET locations_json=? WHERE post_key=? AND locations_json<>?');
            $refresh->execute([$locationsJson,$key,$locationsJson]);$locationsChanged=$refresh->rowCount()>0;
        }
        $windowStart=$day['start'];
        $count=$pdo->prepare('SELECT COUNT(*) AS total,MAX(published_at) AS latest FROM nlp_city_flood_posts WHERE city_id=? AND published_at>=? AND published_at<=? AND published_at>?');
        $count->execute([$city['id'],gmdate('Y-m-d H:i:s',$windowStart),gmdate('Y-m-d H:i:s',$now),gmdate('Y-m-d H:i:s',$floor)]);$recent=$count->fetch();
        $result['eligible_posts']=(int)$recent['total'];
        $transition=bahaba_flood_transition($state,$published,$now,(int)$recent['total'],$new&&bahaba_flood_trusted($post,$pdo));
        $eventPostAttached=false;
        // A reconciled existing post can satisfy a newly lowered threshold.
        // The locked inactive phase and cycle floor prevent duplicate activation.
        if ($transition['activate']) {
            $pdo->prepare('INSERT INTO nlp_city_flood_events(city_id,trigger_type,activated_at,window_start,last_post_at) VALUES(?,?,?,?,?)')
                ->execute([$city['id'],bahaba_flood_trusted($post,$pdo)?'trusted_publisher':'threshold',gmdate('Y-m-d H:i:s',$now),gmdate('Y-m-d H:i:s',$windowStart),$recent['latest']]);
            $state['event_id']=(int)$pdo->lastInsertId();$state['phase']='ACTIVE';$state['last_post_at']=$recent['latest'];
            $pdo->prepare('UPDATE nlp_city_flood_posts SET event_id=? WHERE city_id=? AND event_id IS NULL AND published_at>=? AND published_at<=?')
                ->execute([$state['event_id'],$city['id'],gmdate('Y-m-d H:i:s',$windowStart),gmdate('Y-m-d H:i:s',$now)]);
            $pdo->prepare('INSERT IGNORE INTO nlp_flood_alert_outbox(event_id,created_at) VALUES(?,?)')->execute([$state['event_id'],gmdate('Y-m-d H:i:s',$now)]);
            $result['activated']=true;
        } elseif ($state['phase']==='ACTIVE') {
            $event=$pdo->prepare('SELECT window_start FROM nlp_city_flood_events WHERE id=?');$event->execute([$state['event_id']]);
            if (gmdate('Y-m-d H:i:s',$published)>=$event->fetchColumn()) {
                $attach=$pdo->prepare('UPDATE nlp_city_flood_posts SET event_id=? WHERE post_key=? AND (event_id IS NULL OR event_id<>?)');
                $attach->execute([$state['event_id'],$key,$state['event_id']]);$eventPostAttached=$attach->rowCount()>0;
                $state['last_post_at']=max($state['last_post_at'],gmdate('Y-m-d H:i:s',$published));
                $pdo->prepare('UPDATE nlp_city_flood_events SET last_post_at=? WHERE id=?')->execute([$state['last_post_at'],$state['event_id']]);
            }
        } elseif ($state['phase']!=='ACTIVE' && $result['eligible_posts']>0) $state['phase']='MONITORING';
        $pdo->prepare('UPDATE nlp_city_flood_state SET phase=?,event_id=?,last_post_at=? WHERE city_id=?')->execute([$state['phase'],$state['event_id'],$state['last_post_at'],$city['id']]);
        if ($state['phase']==='ACTIVE' && ($new || $locationsChanged || $eventPostAttached)) bahaba_flood_sync_pins($pdo,(int)$state['event_id'],$now);
        $result['phase']=$state['phase'];$result['event_id']=$state['event_id'];$result['city_id']=$city['id'];
        $pdo->commit();
        if ($sendPush && !empty($result['activated']) && function_exists('bahaba_publish_flood_signal_push')) {
            try { bahaba_publish_flood_signal_push($pdo, (int) $result['event_id']); }
            catch (Throwable $pushError) { error_log('BANTALA preliminary flood push could not be sent: ' . $pushError->getMessage()); }
        }
        return $result;
    } catch (Throwable $error) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $error; }
}

/** Import recent already-classified feed posts so map signals do not start empty after deployment. */
function bahaba_flood_backfill_recent(PDO $pdo, string $cityId, ?int $clock = null): void {
    $now=$clock??time();
    $day=bahaba_flood_day_bounds($now);
    $locationIds=[$cityId];
    foreach (bahaba_supported_locations() as $supported) {
        if (bahaba_legacy_psgc($supported['id']??null)===$cityId) $locationIds[]=$supported['id'];
    }
    $locationIds=array_values(array_unique($locationIds));
    $placeholders=implode(',',array_fill(0,count($locationIds),'?'));
    $query=$pdo->prepare("SELECT source,source_post_id,post_text,post_url,location,barangay,severity,published_at,location_id
        FROM nlp_events WHERE classification='Flood' AND location_id IN ($placeholders)
        AND published_at>=? AND published_at<=?
        ORDER BY published_at ASC,id ASC LIMIT 500");
    $query->execute(array_merge($locationIds,[gmdate('Y-m-d H:i:s',$day['start']),gmdate('Y-m-d H:i:s',$now)]));
    foreach ($query->fetchAll() as $row) {
        bahaba_process_city_flood_post($pdo,$row['location_id']?:$cityId,(string)($row['barangay']??''),[
            'classification'=>'Flood','source'=>$row['source'],'post_id'=>$row['source_post_id'],
            'post_text'=>$row['post_text'],'location'=>$row['location'],'post_url'=>$row['post_url'],'severity'=>$row['severity'],
            'timestamp'=>str_replace(' ','T',$row['published_at']).'Z',
        ],$now,false);
    }
}

function bahaba_flood_snapshot(PDO $pdo, ?string $cityId = null): array {
    bahaba_flood_schema($pdo);$now=time();$day=bahaba_flood_day_bounds($now);
    $query=$pdo->prepare('SELECT city_id FROM nlp_city_flood_state'.($cityId?' WHERE city_id=?':''));$query->execute($cityId?[$cityId]:[]);
    foreach ($query->fetchAll() as $row) {
        $pdo->beginTransaction();
        try { $lock=$pdo->prepare('SELECT * FROM nlp_city_flood_state WHERE city_id=? FOR UPDATE');$lock->execute([$row['city_id']]);$state=$lock->fetch();
            bahaba_flood_expire_locked($pdo,$state,$now);$activeEvent=$state['phase']==='ACTIVE'?(int)$state['event_id']:0;$pdo->commit();
            if($activeEvent)bahaba_flood_sync_pins($pdo,$activeEvent,$now);
        } catch(Throwable $error) { if($pdo->inTransaction())$pdo->rollBack();throw $error; }
    }
    $states=$pdo->prepare('SELECT s.*,e.activated_at,e.expired_at,e.trigger_type,
        (SELECT COUNT(*) FROM nlp_city_flood_posts p WHERE p.city_id=s.city_id AND p.published_at>=? AND p.published_at<=UTC_TIMESTAMP()) AS post_count,
        (SELECT SUM(p.severity=\'Low\') FROM nlp_city_flood_posts p WHERE p.city_id=s.city_id AND p.published_at>=? AND p.published_at<=UTC_TIMESTAMP()) AS low_posts,
        (SELECT SUM(p.severity=\'Mid\') FROM nlp_city_flood_posts p WHERE p.city_id=s.city_id AND p.published_at>=? AND p.published_at<=UTC_TIMESTAMP()) AS mid_posts,
        (SELECT SUM(p.severity=\'High\') FROM nlp_city_flood_posts p WHERE p.city_id=s.city_id AND p.published_at>=? AND p.published_at<=UTC_TIMESTAMP()) AS high_posts,
        (SELECT COUNT(*) FROM nlp_city_flood_posts p WHERE p.event_id=s.event_id) AS event_post_count
        FROM nlp_city_flood_state s LEFT JOIN nlp_city_flood_events e ON e.id=s.event_id'.($cityId?' WHERE s.city_id=?':''));$states->execute(array_merge(array_fill(0,4,gmdate('Y-m-d H:i:s',$day['start'])),$cityId?[$cityId]:[]));
    $cityRows=$states->fetchAll();foreach($cityRows as &$row){$row['severity_counts']=['Low'=>(int)($row['low_posts']??0),'Mid'=>(int)($row['mid_posts']??0),'High'=>(int)($row['high_posts']??0)];$row['majority_severity']=bahaba_flood_majority_severity($row['severity_counts']);}unset($row);
    $pins=$pdo->prepare("SELECT p.*,e.city_id,e.verification_status FROM nlp_city_flood_pins p JOIN nlp_city_flood_events e ON e.id=p.event_id WHERE e.status='ACTIVE'".($cityId?' AND e.city_id=?':''));$pins->execute($cityId?[$cityId]:[]);$pinRows=$pins->fetchAll();
    // Include provisional supported locations for residents in a selected
    // city and on the nationwide map. A barangay signal should not require the
    // separate citywide threshold before it can be displayed.
    $activePinCities=[];foreach($pinRows as $pin)$activePinCities[(string)$pin['city_id']]=true;
    $sql='SELECT city_id,locations_json,published_at,severity FROM nlp_city_flood_posts WHERE event_id IS NULL AND published_at>=? AND published_at<=?'.($cityId?' AND city_id=?':'');
    $recent=$pdo->prepare($sql);$params=[gmdate('Y-m-d H:i:s',$day['start']),gmdate('Y-m-d H:i:s',$now)];if($cityId)$params[]=$cityId;$recent->execute($params);
    $groups=[];
    foreach($recent->fetchAll() as $post){
        $postCity=(string)$post['city_id'];if(isset($activePinCities[$postCity]))continue;
        foreach(json_decode($post['locations_json'],true)?:[] as $place){
            $key=$postCity.':'.$place['key'];if(!isset($groups[$key]))$groups[$key]=['event_id'=>null,'city_id'=>$postCity,'location_key'=>$place['key'],'label'=>$place['label'],'precision_level'=>$place['precision'],'barangay_feature_id'=>$place['feature_id'],'latitude'=>$place['latitude'],'longitude'=>$place['longitude'],'post_count'=>0,'latest_post_at'=>$post['published_at'],'severity_counts'=>['Low'=>0,'Mid'=>0,'High'=>0],'verification_status'=>'reported','phase'=>'MONITORING'];
            $groups[$key]['post_count']++;$groups[$key]['latest_post_at']=max($groups[$key]['latest_post_at'],$post['published_at']);
            $severity=['Low'=>'Low','Mid'=>'Mid','Medium'=>'Mid','High'=>'High'][$post['severity']]??'Low';$groups[$key]['severity_counts'][$severity]++;
        }
    }
    foreach($groups as &$group)$group['severity']=bahaba_flood_majority_severity($group['severity_counts']);unset($group);
    $pinRows=array_merge($pinRows,array_values($groups));
    $history=$pdo->prepare('SELECT * FROM nlp_city_flood_events'.($cityId?' WHERE city_id=?':'').' ORDER BY id DESC LIMIT 50');$history->execute($cityId?[$cityId]:[]);
    return ['required_posts'=>BAHABA_FLOOD_POSTS,'window_minutes'=>(int)(BAHABA_FLOOD_WINDOW/60),'inactivity_minutes'=>(int)(BAHABA_FLOOD_IDLE/60),'day_expires_at_ms'=>$day['end']*1000,'cities'=>$cityRows,'pins'=>$pinRows,'history'=>$history->fetchAll(),'server_time'=>gmdate('c')];
}
