<?php
/** One pending area report after 20 distinct, reliably located flood posts in 15 minutes. */
function bahaba_nlp_threshold(PDO $pdo, ?string $locationId, string $barangay): array {
    global $config, $input;
    // Publisher IDs must come from the authenticated collector, never from post text.
    $publisherId=trim((string)($input['publisher_id']??''));
    $platform=strtolower(trim((string)($input['source']??'')));
    $trusted=false;
    foreach($config['trusted_social_publishers']??[] as $publisher){
        if(in_array($publisher['type']??'', ['news','government'],true)
            && strtolower((string)($publisher['platform']??''))===$platform
            && $publisherId!=='' && (string)($publisher['publisher_id']??'')===$publisherId){$trusted=true;break;}
    }
    $result=['required_posts'=>20,'window_minutes'=>15,'eligible_posts'=>0,'report_id'=>null];
    $psgc=$locationId ? (bahaba_legacy_psgc($locationId) ?: (bahaba_psgc_by_id($locationId)['id']??null)) : null;
    if (!$psgc || $barangay==='') return $result;
    $scope=bahaba_location_by_id($locationId);
    $geometry=json_decode((string)file_get_contents(__DIR__.'/map-data/barangays.json'),true);
    $matches=[];
    $normalize=static fn($name)=>strtolower(trim(preg_replace('/\s*\([^)]*\)/','',(string)$name)));
    if (ctype_digit((string)$locationId)) { foreach(bahaba_supported_locations() as $legacy) if(bahaba_legacy_psgc($legacy['id'])===$psgc){$scope=$legacy;break;} }
    foreach($geometry['features']??[] as $feature){
        $p=$feature['properties'];
        if (($p['city']??'')!==($scope['map_city']??$scope['city']??'') || (!empty($scope['map_municipality']) && ($p['municipality']??'')!==$scope['map_municipality'])) continue;
        if ($normalize($p['name']??'')===$normalize($barangay) || $normalize($p['sourceName']??'')===$normalize($barangay)) $matches[]=$feature;
    }
    // Province-wide, duplicate or unavailable barangays remain in the NLP feed for review.
    if(count($matches)!==1)return $result;
    $feature=$matches[0];$key=hash('sha256',$psgc.':'.$feature['id']);
    if($trusted){
        $postId=trim((string)($input['post_id']??''));
        if($postId==='')return $result;
        $eventKey=hash('sha256',$platform.':'.$postId);
        $pdo->exec('CREATE TABLE IF NOT EXISTS nlp_trusted_pins (event_key CHAR(64) PRIMARY KEY, report_id BIGINT UNSIGNED NULL)');
        $pdo->beginTransaction();
        try{
            $pdo->prepare('INSERT IGNORE INTO nlp_trusted_pins(event_key) VALUES(?)')->execute([$eventKey]);
            $lock=$pdo->prepare('SELECT report_id FROM nlp_trusted_pins WHERE event_key=? FOR UPDATE');$lock->execute([$eventKey]);
            if(!$lock->fetchColumn()){
                $severity=['low'=>'low','mid'=>'medium','medium'=>'medium','high'=>'high'][strtolower($input['severity'])];
                $url=$input['post_url']??$input['original_post_url']??null;
                $stmt=$pdo->prepare("INSERT INTO reports(city,location_id,psgc_id,barangay,barangay_feature_id,severity,reporter,source,platform,original_post_url,source_posts,description,status,created_at) VALUES(?,?,?,?,?,?,?,'nlp',?,?,?,?,'verified',UTC_TIMESTAMP())");
                $stmt->execute([$scope['city'],$scope['id'],$psgc,$feature['properties']['name'],$feature['id'],$severity,'Trusted publisher: '.$publisherId,substr($platform,0,50),$url,json_encode($url?[['source'=>$platform,'url'=>$url]]:[],JSON_THROW_ON_ERROR),$input['post_text']??$input['text']]);
                $result['report_id']=(int)$pdo->lastInsertId();
                $pdo->prepare('UPDATE nlp_trusted_pins SET report_id=? WHERE event_key=?')->execute([$result['report_id'],$eventKey]);
            }
            $pdo->commit();$result['trusted_publisher']=true;return $result;
        }catch(Throwable $error){if($pdo->inTransaction())$pdo->rollBack();throw $error;}
    }
    $locationIds=[$psgc];foreach(bahaba_supported_locations() as $legacy)if(bahaba_legacy_psgc($legacy['id'])===$psgc)$locationIds[]=$legacy['id'];
    $placeholders=implode(',',array_fill(0,count($locationIds),'?'));
    $pdo->exec('CREATE TABLE IF NOT EXISTS nlp_pin_windows (group_key CHAR(64) PRIMARY KEY, last_event_id BIGINT UNSIGNED NOT NULL DEFAULT 0, last_report_at DATETIME NULL, report_id BIGINT UNSIGNED NULL)');
    $pdo->prepare('INSERT IGNORE INTO nlp_pin_windows(group_key) VALUES(?)')->execute([$key]);
    $pdo->beginTransaction();
    try {
        $stmt=$pdo->prepare('SELECT * FROM nlp_pin_windows WHERE group_key=? FOR UPDATE');$stmt->execute([$key]);$window=$stmt->fetch(PDO::FETCH_ASSOC);
        $stmt=$pdo->prepare("SELECT COUNT(DISTINCT CONCAT(source,':',COALESCE(source_post_id,SHA2(LOWER(TRIM(post_text)),256)))) AS total, MAX(id) AS last_id,
          MAX(CASE severity WHEN 'High' THEN 3 WHEN 'Mid' THEN 2 ELSE 1 END) AS severity_rank
          FROM nlp_events WHERE location_id IN ($placeholders) AND LOWER(TRIM(SUBSTRING_INDEX(barangay,'(',1)))=? AND classification='Flood' AND id>?
          AND detected_at BETWEEN DATE_SUB(UTC_TIMESTAMP(),INTERVAL 15 MINUTE) AND UTC_TIMESTAMP()");
        $stmt->execute([...$locationIds,$normalize($barangay),$window['last_event_id']]);$posts=$stmt->fetch(PDO::FETCH_ASSOC);$result['eligible_posts']=(int)$posts['total'];
        $recent=$window['last_report_at'] && strtotime($window['last_report_at'].' UTC')>time()-900;
        if($result['eligible_posts']>=20 && !$recent){
            $sourceQuery=$pdo->prepare("SELECT source,post_url FROM nlp_events WHERE location_id IN ($placeholders) AND LOWER(TRIM(SUBSTRING_INDEX(barangay,'(',1)))=? AND classification='Flood' AND id>? AND detected_at BETWEEN DATE_SUB(UTC_TIMESTAMP(),INTERVAL 15 MINUTE) AND UTC_TIMESTAMP() ORDER BY id DESC LIMIT 100");
            $sourceQuery->execute([...$locationIds,$normalize($barangay),$window['last_event_id']]);$sourcePosts=[];$platforms=[];
            foreach($sourceQuery->fetchAll(PDO::FETCH_ASSOC) as $post){$platforms[$post['source']]=true;$url=(string)($post['post_url']??'');if(filter_var($url,FILTER_VALIDATE_URL) && in_array(strtolower((string)parse_url($url,PHP_URL_SCHEME)),['http','https'],true))$sourcePosts[$url]=['source'=>$post['source'],'url'=>$url];}
            $sourcePosts=array_values($sourcePosts);
            $severity=[1=>'low',2=>'medium',3=>'high'][(int)$posts['severity_rank']];
            $stmt=$pdo->prepare("INSERT INTO reports(city,location_id,psgc_id,barangay,barangay_feature_id,severity,reporter,source,platform,original_post_url,source_posts,description,status,created_at) VALUES(?,?,?,?,?,?,?,'nlp',?,?,?,?,'pending',UTC_TIMESTAMP())");
            $stmt->execute([$scope['city'],$scope['id'],$psgc,$feature['properties']['name'],$feature['id'],$severity,'BAHABA NLP',substr(implode(', ',array_keys($platforms)),0,50),$sourcePosts[0]['url']??null,json_encode($sourcePosts,JSON_THROW_ON_ERROR), $posts['total'].' distinct flood posts in the past 15 minutes. Barangay-level signal; exact flood position unconfirmed. Awaiting LGU verification.']);
            $result['report_id']=(int)$pdo->lastInsertId();
            $pdo->prepare('UPDATE nlp_pin_windows SET last_event_id=?,last_report_at=UTC_TIMESTAMP(),report_id=? WHERE group_key=?')->execute([$posts['last_id'],$result['report_id'],$key]);
        }
        $pdo->commit();return $result;
    }catch(Throwable $error){if($pdo->inTransaction())$pdo->rollBack();throw $error;}
}
