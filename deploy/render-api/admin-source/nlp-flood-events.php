<?php
/** City-wide social flood signals. A signal never establishes official verification. */
const BAHABA_FLOOD_POSTS = 20;
const BAHABA_FLOOD_WINDOW = 900;
const BAHABA_FLOOD_IDLE = 3600;

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
    $last = isset($state['last_post_at']) ? strtotime($state['last_post_at'].' UTC') : 0;
    $floor = isset($state['cycle_floor']) ? strtotime($state['cycle_floor'].' UTC') : 0;
    $expired = ($state['phase']??'INACTIVE') === 'ACTIVE' && $last <= $now-BAHABA_FLOOD_IDLE;
    if ($expired) { $floor = $last+BAHABA_FLOOD_IDLE; $state['phase']='EXPIRED'; }
    $valid = $published > $floor && $published <= $now && $published > $now-BAHABA_FLOOD_IDLE;
    $activate = $valid && ($state['phase']??'INACTIVE') !== 'ACTIVE'
        && $published >= $now-BAHABA_FLOOD_WINDOW && ($recent>=BAHABA_FLOOD_POSTS || $trusted);
    $active = !$expired && ($state['phase']??'INACTIVE') === 'ACTIVE';
    return ['expire'=>$expired, 'floor'=>$floor, 'accept'=>$valid, 'activate'=>$activate,
        'phase'=>$activate || ($active && $valid) ? 'ACTIVE' : ($active ? 'ACTIVE' : ($recent>0 ? 'MONITORING' : ($state['phase']??'INACTIVE'))),
        'last_post'=>($valid && ($active || $activate)) ? max($last,$published) : $last];
}

function bahaba_flood_locations(string $cityId, string $text, string $barangay = ''): array {
    global $config;
    static $geometry;
    $geometry ??= json_decode((string)file_get_contents(__DIR__.'/map-data/barangays.json'),true);
    $scope = bahaba_location_by_id($cityId);
    foreach (bahaba_supported_locations() as $legacy) if (bahaba_legacy_psgc($legacy['id'])===$cityId) { $scope=$legacy; break; }
    $normalize = static fn($value)=>mb_strtolower(trim(preg_replace('/\s*\([^)]*\)/u','',(string)$value)));
    $features=[]; $matches=[];
    foreach ($geometry['features']??[] as $feature) {
        $p=$feature['properties'];
        if (($p['city']??'')!==($scope['map_city']??$scope['city']??'') ||
            (!empty($scope['map_municipality']) && ($p['municipality']??'')!==$scope['map_municipality'])) continue;
        $features[(string)$feature['id']]=$feature;
        foreach (array_unique([$p['name']??'', $p['sourceName']??'']) as $name) {
            if ($name!=='' && ($normalize($barangay)===$normalize($name) ||
                preg_match('/\b(?:brgy\.?|barangay)\s+'.preg_quote($name,'/').'(?![\pL\pN])/iu',$text))) {
                $matches[(string)$feature['id']]=['key'=>hash('sha256','barangay:'.$cityId.':'.$feature['id']),
                    'label'=>$p['name'], 'precision'=>'barangay', 'feature_id'=>(string)$feature['id'], 'latitude'=>null, 'longitude'=>null];
            }
        }
    }
    // Street/landmark coordinates must come from a reviewed gazetteer, never the NLP model.
    $precise=[];
    foreach ($config['verified_flood_locations']??[] as $place) {
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
        // Exact locations also contribute to their barangay outline.
        $matches[(string)$feature['id']]=['key'=>hash('sha256','barangay:'.$cityId.':'.$feature['id']),
            'label'=>$feature['properties']['name'],'precision'=>'barangay','feature_id'=>(string)$feature['id'],'latitude'=>null,'longitude'=>null];
    }
    // Ambiguous identically named barangays do not produce an invented location.
    $names=[]; foreach ($matches as $match) $names[$normalize($match['label'])]=($names[$normalize($match['label'])]??0)+1;
    return array_values(array_merge($precise,array_filter($matches,fn($m)=>$names[$normalize($m['label'])]===1)));
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
    if ($state['phase']!=='ACTIVE' || strtotime($state['last_post_at'].' UTC')>$now-BAHABA_FLOOD_IDLE) return;
    $expired=gmdate('Y-m-d H:i:s',strtotime($state['last_post_at'].' UTC')+BAHABA_FLOOD_IDLE);
    $pdo->prepare("UPDATE nlp_city_flood_events SET status='EXPIRED',expired_at=? WHERE id=? AND status='ACTIVE'")->execute([$expired,$state['event_id']]);
    $pdo->prepare("UPDATE nlp_city_flood_state SET phase='EXPIRED',event_id=NULL,cycle_floor=? WHERE city_id=?")->execute([$expired,$state['city_id']]);
    $state['phase']='EXPIRED'; $state['event_id']=null; $state['cycle_floor']=$expired;
}

function bahaba_flood_sync_pins(PDO $pdo, int $eventId, ?int $clock = null): void {
    $now=$clock??time();
    $stmt=$pdo->prepare('SELECT * FROM nlp_city_flood_posts WHERE event_id=? AND published_at>=? AND published_at<=?');
    $stmt->execute([$eventId,gmdate('Y-m-d H:i:s',$now-BAHABA_FLOOD_WINDOW),gmdate('Y-m-d H:i:s',$now)]);
    $groups=[]; $rank=['Low'=>1,'Mid'=>2,'High'=>3];
    foreach ($stmt->fetchAll() as $post) foreach (json_decode($post['locations_json'],true)?:[] as $place) {
        $key=$place['key'];
        if (!isset($groups[$key])) $groups[$key]=$place+['count'=>0,'latest'=>$post['published_at'],'severity'=>'Low'];
        $groups[$key]['count']++; $groups[$key]['latest']=max($groups[$key]['latest'],$post['published_at']);
        if (($rank[$post['severity']]??1)>$rank[$groups[$key]['severity']]) $groups[$key]['severity']=$post['severity'];
    }
    // A city event must not imply that each barangay is flooded. Keep a
    // barangay/landmark outline only when that exact place has its own 20-post window.
    $pdo->prepare('DELETE FROM nlp_city_flood_pins WHERE event_id=?')->execute([$eventId]);
    $upsert=$pdo->prepare('INSERT INTO nlp_city_flood_pins(event_id,location_key,label,precision_level,barangay_feature_id,latitude,longitude,post_count,latest_post_at,severity)
        VALUES(?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE post_count=VALUES(post_count),latest_post_at=VALUES(latest_post_at),severity=VALUES(severity)');
    foreach ($groups as $key=>$place) {
        if ($place['count'] < BAHABA_FLOOD_POSTS) continue;
        $upsert->execute([$eventId,$key,$place['label'],$place['precision'],$place['feature_id'],
            $place['latitude'],$place['longitude'],$place['count'],$place['latest'],$place['severity']]);
    }
}

function bahaba_process_city_flood_post(PDO $pdo, ?string $locationId, string $barangay, array $post, ?int $clock = null): array {
    $now=$clock??time(); $city=bahaba_flood_city($locationId);
    $result=['required_posts'=>BAHABA_FLOOD_POSTS,'window_minutes'=>15,'eligible_posts'=>0,'report_id'=>null,'event_id'=>null,'phase'=>'INACTIVE'];
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
    $pdo->prepare('INSERT IGNORE INTO nlp_city_flood_state(city_id,city_name) VALUES(?,?)')->execute([$city['id'],$city['name']]);
    $pdo->beginTransaction();
    try {
        $lock=$pdo->prepare('SELECT * FROM nlp_city_flood_state WHERE city_id=? FOR UPDATE');$lock->execute([$city['id']]);$state=$lock->fetch();
        bahaba_flood_expire_locked($pdo,$state,$now);
        $floor=$state['cycle_floor'] ? strtotime($state['cycle_floor'].' UTC') : 0;
        if ($published<=$floor || $published<=$now-BAHABA_FLOOD_IDLE) { $pdo->commit(); return array_replace($result,['phase'=>$state['phase'],'event_id'=>$state['event_id'],'ineligible_reason'=>'Historical post']); }
        $key=hash('sha256',$city['id'].':'.strtolower($post['source']??'').':'.$id);
        $locations=bahaba_flood_locations($city['id'],(string)($post['post_text']??$post['text']??''),$barangay);
        $insert=$pdo->prepare('INSERT IGNORE INTO nlp_city_flood_posts(post_key,city_id,source,source_post_id,published_at,severity,post_url,locations_json) VALUES(?,?,?,?,?,?,?,?)');
        $severity=['low'=>'Low','mid'=>'Mid','medium'=>'Mid','high'=>'High'][strtolower($post['severity']??'low')]??'Low';
        $insert->execute([$key,$city['id'],$post['source']??'Unknown',$id,gmdate('Y-m-d H:i:s',$published),$severity,$post['post_url']??null,json_encode($locations,JSON_THROW_ON_ERROR)]);
        $new=$insert->rowCount()>0;
        $windowStart=max($now-BAHABA_FLOOD_WINDOW,$floor);
        $count=$pdo->prepare('SELECT COUNT(*) AS total,MAX(published_at) AS latest FROM nlp_city_flood_posts WHERE city_id=? AND published_at>=? AND published_at<=? AND published_at>?');
        $count->execute([$city['id'],gmdate('Y-m-d H:i:s',$windowStart),gmdate('Y-m-d H:i:s',$now),gmdate('Y-m-d H:i:s',$floor)]);$recent=$count->fetch();
        $result['eligible_posts']=(int)$recent['total'];
        $transition=bahaba_flood_transition($state,$published,$now,(int)$recent['total'],$new&&bahaba_flood_trusted($post,$pdo));
        if ($new && $transition['activate']) {
            $pdo->prepare('INSERT INTO nlp_city_flood_events(city_id,trigger_type,activated_at,window_start,last_post_at) VALUES(?,?,?,?,?)')
                ->execute([$city['id'],bahaba_flood_trusted($post,$pdo)?'trusted_publisher':'threshold',gmdate('Y-m-d H:i:s',$now),gmdate('Y-m-d H:i:s',$windowStart),$recent['latest']]);
            $state['event_id']=(int)$pdo->lastInsertId();$state['phase']='ACTIVE';$state['last_post_at']=$recent['latest'];
            $pdo->prepare('UPDATE nlp_city_flood_posts SET event_id=? WHERE city_id=? AND event_id IS NULL AND published_at>=? AND published_at<=?')
                ->execute([$state['event_id'],$city['id'],gmdate('Y-m-d H:i:s',$windowStart),gmdate('Y-m-d H:i:s',$now)]);
            $pdo->prepare('INSERT IGNORE INTO nlp_flood_alert_outbox(event_id,created_at) VALUES(?,?)')->execute([$state['event_id'],gmdate('Y-m-d H:i:s',$now)]);
            $result['activated']=true;
        } elseif ($new && $state['phase']==='ACTIVE') {
            $event=$pdo->prepare('SELECT window_start FROM nlp_city_flood_events WHERE id=?');$event->execute([$state['event_id']]);
            if (gmdate('Y-m-d H:i:s',$published)>=$event->fetchColumn()) {
                $pdo->prepare('UPDATE nlp_city_flood_posts SET event_id=? WHERE post_key=?')->execute([$state['event_id'],$key]);
                $state['last_post_at']=max($state['last_post_at'],gmdate('Y-m-d H:i:s',$published));
                $pdo->prepare('UPDATE nlp_city_flood_events SET last_post_at=? WHERE id=?')->execute([$state['last_post_at'],$state['event_id']]);
            }
        } elseif ($state['phase']!=='ACTIVE' && $result['eligible_posts']>0) $state['phase']='MONITORING';
        $pdo->prepare('UPDATE nlp_city_flood_state SET phase=?,event_id=?,last_post_at=? WHERE city_id=?')->execute([$state['phase'],$state['event_id'],$state['last_post_at'],$city['id']]);
        if ($new && $state['phase']==='ACTIVE') bahaba_flood_sync_pins($pdo,(int)$state['event_id'],$now);
        $result['phase']=$state['phase'];$result['event_id']=$state['event_id'];$result['city_id']=$city['id'];
        $pdo->commit();
        if (!empty($result['activated']) && function_exists('bahaba_publish_flood_signal_push')) {
            try { bahaba_publish_flood_signal_push($pdo, (int) $result['event_id']); }
            catch (Throwable $pushError) { error_log('BANTALA preliminary flood push could not be sent: ' . $pushError->getMessage()); }
        }
        return $result;
    } catch (Throwable $error) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $error; }
}

function bahaba_flood_snapshot(PDO $pdo, ?string $cityId = null): array {
    bahaba_flood_schema($pdo);$now=time();
    $query=$pdo->prepare('SELECT city_id FROM nlp_city_flood_state'.($cityId?' WHERE city_id=?':''));$query->execute($cityId?[$cityId]:[]);
    foreach ($query->fetchAll() as $row) {
        $pdo->beginTransaction();
        try { $lock=$pdo->prepare('SELECT * FROM nlp_city_flood_state WHERE city_id=? FOR UPDATE');$lock->execute([$row['city_id']]);$state=$lock->fetch();
            bahaba_flood_expire_locked($pdo,$state,$now);$activeEvent=$state['phase']==='ACTIVE'?(int)$state['event_id']:0;$pdo->commit();
            if($activeEvent)bahaba_flood_sync_pins($pdo,$activeEvent,$now);
        } catch(Throwable $error) { if($pdo->inTransaction())$pdo->rollBack();throw $error; }
    }
    $states=$pdo->prepare('SELECT s.*,e.activated_at,e.expired_at,e.trigger_type,
        (SELECT COUNT(*) FROM nlp_city_flood_posts p WHERE p.city_id=s.city_id AND p.published_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 15 MINUTE) AND p.published_at<=UTC_TIMESTAMP() AND (s.cycle_floor IS NULL OR p.published_at>s.cycle_floor)) AS post_count,
        (SELECT COUNT(*) FROM nlp_city_flood_posts p WHERE p.event_id=s.event_id) AS event_post_count
        FROM nlp_city_flood_state s LEFT JOIN nlp_city_flood_events e ON e.id=s.event_id'.($cityId?' WHERE s.city_id=?':''));$states->execute($cityId?[$cityId]:[]);
    $pins=$pdo->prepare("SELECT p.*,e.city_id,e.verification_status FROM nlp_city_flood_pins p JOIN nlp_city_flood_events e ON e.id=p.event_id WHERE e.status='ACTIVE'".($cityId?' AND e.city_id=?':''));$pins->execute($cityId?[$cityId]:[]);
    $history=$pdo->prepare('SELECT * FROM nlp_city_flood_events'.($cityId?' WHERE city_id=?':'').' ORDER BY id DESC LIMIT 50');$history->execute($cityId?[$cityId]:[]);
    return ['required_posts'=>BAHABA_FLOOD_POSTS,'window_minutes'=>15,'inactivity_minutes'=>60,'cities'=>$states->fetchAll(),'pins'=>$pins->fetchAll(),'history'=>$history->fetchAll(),'server_time'=>gmdate('c')];
}
