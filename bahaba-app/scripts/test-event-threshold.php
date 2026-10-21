<?php
require __DIR__.'/../api/location_helpers.php';
require __DIR__.'/../api/psgc.php';
require __DIR__.'/../../deploy/render-api/admin-source/report-point.php';
require __DIR__.'/../../deploy/render-api/admin-source/nlp-flood-events.php';
$pdo=new PDO('mysql:host=127.0.0.1;port=33319;charset=utf8mb4','root','',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
$database='bahaba_city_events_test';$config=['trusted_social_publishers'=>[]];
function check($ok,$message){if(!$ok)throw new RuntimeException($message);}
function post($id,$at,$extra=[]){return array_replace(['source'=>'Test','post_id'=>$id,'post_text'=>'Baha sa Navotas','classification'=>'Flood','severity'=>'high','timestamp'=>gmdate('c',$at)],$extra);}
if(($argv[1]??'')==='worker'){
    $pdo->exec("USE `$database`");$clock=(int)$argv[3];
    $result=bahaba_process_city_flood_post($pdo,'marikina','',post($argv[2],$clock),$clock);
    echo json_encode($result);exit;
}
$created=false;
try{
    $pdo->exec("CREATE DATABASE `$database`");$created=true;$pdo->exec("USE `$database`");bahaba_flood_schema($pdo);
    $base=time();
    for($i=1;$i<=12;$i++)$result=bahaba_process_city_flood_post($pdo,'navotas','',post('general-'.$i,$base-100+$i),$base);
    for($i=1;$i<=7;$i++)$result=bahaba_process_city_flood_post($pdo,'navotas','San Jose',post('jose-'.$i,$base-80+$i),$base);
    check($result['eligible_posts']===19&&$result['event_id']===null,'19 posts must not activate');
    $result=bahaba_process_city_flood_post($pdo,'navotas','San Jose',post('jose-8',$base-1),$base);
    $event=$result['event_id'];check($event!==null&&$result['phase']==='ACTIVE','20 city-wide posts must activate');
    $pins=$pdo->query('SELECT * FROM nlp_city_flood_pins WHERE event_id='.(int)$event)->fetchAll();
    check(count($pins)===0,'12 city-only plus 8 San Jose reports must activate only the city event');
    for($i=9;$i<=20;$i++)$result=bahaba_process_city_flood_post($pdo,'navotas','San Jose',post('jose-'.$i,$base-50+$i),$base);
    $pins=$pdo->query('SELECT * FROM nlp_city_flood_pins WHERE event_id='.(int)$event)->fetchAll();
    check(count($pins)===1&&(int)$pins[0]['post_count']===20,'A barangay pin requires 20 reports attributed to that barangay');
    check($pins[0]['latitude']===null,'Barangay-level reports must not invent coordinates');
    bahaba_process_city_flood_post($pdo,'navotas','San Jose',post('jose-20',$base+10),$base+10);
    check((int)$pdo->query('SELECT COUNT(*) FROM nlp_city_flood_posts')->fetchColumn()===32,'Duplicate ID counted twice');
    $result=bahaba_process_city_flood_post($pdo,'navotas','San Roque',post('later-1',$base+1500),$base+1500);
    check($result['event_id']===$event,'Active event must not require a second threshold');
    check((int)$pdo->query('SELECT COUNT(*) FROM nlp_city_flood_pins')->fetchColumn()===0,'A new city-only mention must not imply a barangay flood');
    bahaba_process_city_flood_post($pdo,'navotas','San Jose',post('later-2',$base+1501),$base+1501);
    $count=$pdo->query("SELECT post_count FROM nlp_city_flood_pins WHERE label LIKE 'San Jose%' AND event_id=".(int)$event)->fetchColumn();
    check($count===false,'One new barangay post must not meet the barangay threshold');
    $geometry=json_decode(file_get_contents(__DIR__.'/../../deploy/render-api/admin-source/map-data/barangays.json'),true);
    $jose=array_values(array_filter($geometry['features'],fn($f)=>($f['properties']['city']??'')==='Navotas'&&str_starts_with($f['properties']['name'],'San Jose')))[0];
    $ring=$jose['geometry']['type']==='MultiPolygon'?$jose['geometry']['coordinates'][0][0]:$jose['geometry']['coordinates'][0];
    [$lng,$lat]=$ring[0];
    $config['verified_flood_locations']=[['id'=>'fixture-landmark','city_id'=>'1380900000','barangay_feature_id'=>(string)$jose['id'],
        'name'=>'Synthetic verified landmark','latitude'=>$lat,'longitude'=>$lng,'verification_reference'=>'https://example.com/test-only']];
    bahaba_process_city_flood_post($pdo,'navotas','San Jose',post('precise',$base+1502,['post_text'=>'Baha sa Synthetic verified landmark, Navotas']),$base+1502);
    for($i=1;$i<=19;$i++)bahaba_process_city_flood_post($pdo,'navotas','San Jose',post('precise-more-'.$i,$base+1502+$i,['post_text'=>'Baha sa Synthetic verified landmark, Navotas']),$base+1502+$i);
    check((int)$pdo->query('SELECT COUNT(*) FROM nlp_city_flood_pins WHERE latitude IS NOT NULL')->fetchColumn()===1,'A threshold-qualified reviewed landmark should use its verified point');
    bahaba_flood_sync_pins($pdo,(int)$event,$base+2422);
    check((int)$pdo->query('SELECT COUNT(*) FROM nlp_city_flood_pins WHERE event_id='.(int)$event)->fetchColumn()===0,'Barangay pins should expire when their own rolling window falls below threshold');
    bahaba_process_city_flood_post($pdo,'navotas','',post('delayed',$base+100),$base+3000);
    $last=$pdo->query('SELECT last_post_at FROM nlp_city_flood_events WHERE id='.(int)$event)->fetchColumn();
    check($last===gmdate('Y-m-d H:i:s',$base+1502),'Delayed post advanced inactivity clock');
    $expired=bahaba_process_city_flood_post($pdo,'navotas','',post('too-old',$base+1400),$base+5121);
    check($expired['phase']==='EXPIRED','60-minute inactivity must expire the event');
    check($pdo->query('SELECT status FROM nlp_city_flood_events WHERE id='.(int)$event)->fetchColumn()==='EXPIRED','History must retain expired event');
    for($i=1;$i<=19;$i++)$result=bahaba_process_city_flood_post($pdo,'navotas','',post('fresh-'.$i,$base+5121+$i),$base+5141);
    check($result['event_id']===null,'New cycle must require a fresh threshold');
    $result=bahaba_process_city_flood_post($pdo,'navotas','',post('fresh-20',$base+5141),$base+5141);
    check($result['event_id']!==null&&$result['event_id']!==$event,'Fresh threshold must create a new historical cycle');
    $before=(int)$pdo->query('SELECT COUNT(*) FROM nlp_city_flood_posts')->fetchColumn();
    bahaba_process_city_flood_post($pdo,'malolos','',post('future',$base+100),$base);
    bahaba_process_city_flood_post($pdo,'malolos','',post('nonflood',$base,['classification'=>'Non-Flood']),$base);
    bahaba_process_city_flood_post($pdo,'malolos','',post('repost',$base,['is_repost'=>true]),$base);
    bahaba_process_city_flood_post($pdo,'malolos','',post('missing-time',$base,['timestamp'=>null]),$base);
    bahaba_process_city_flood_post($pdo,'malolos','',post('stale',$base-901),$base);
    check((int)$pdo->query("SELECT COUNT(*) FROM nlp_city_flood_posts WHERE source_post_id<>'stale'")->fetchColumn()===$before,'Future, non-flood, repost, or missing time counted');
    $config['trusted_social_publishers']=[['platform'=>'Test','publisher_id'=>'official-id','type'=>'government']];
    $impostor=bahaba_process_city_flood_post($pdo,'malolos','',post('impostor',$base,['publisher_id'=>'fake']),$base);
    check($impostor['event_id']===null,'Unlisted publisher bypassed threshold');
    check($impostor['eligible_posts']===1,'A post older than 15 minutes contributed to activation');
    $trusted=bahaba_process_city_flood_post($pdo,'malolos','',post('trusted',$base,['publisher_id'=>'official-id']),$base);
    check($trusted['event_id']!==null,'Listed publisher flood post must activate');
    check($pdo->query('SELECT verification_status FROM nlp_city_flood_events WHERE id='.(int)$trusted['event_id'])->fetchColumn()==='reported','Trusted source must not imply official incident verification');
    $clock=$base+10000;
    for($i=1;$i<=19;$i++)bahaba_process_city_flood_post($pdo,'marikina','',post('concurrent-'.$i,$clock),$clock);
    $workers=[];
    foreach(['concurrent-20','concurrent-21'] as $id){
        $process=proc_open([PHP_BINARY,__FILE__,'worker',$id,(string)$clock],[1=>['pipe','w'],2=>['pipe','w']],$pipes);
        $workers[]=[$process,$pipes];
    }
    foreach($workers as [$process,$pipes]){ $output=stream_get_contents($pipes[1]);$error=stream_get_contents($pipes[2]);fclose($pipes[1]);fclose($pipes[2]);check(proc_close($process)===0,'Concurrent worker failed: '.$error); }
    check((int)$pdo->query("SELECT COUNT(*) FROM nlp_city_flood_events WHERE city_id='1380700000'")->fetchColumn()===1,'Concurrent requests created duplicate alerts');
    check((int)$pdo->query("SELECT COUNT(*) FROM nlp_flood_alert_outbox o JOIN nlp_city_flood_events e ON e.id=o.event_id WHERE e.city_id='1380700000'")->fetchColumn()===1,'Concurrent notifications duplicated');
    echo "PASS 12+8 city activation, separate 20-report barangay pins, rolling-window pin expiry, 19/20 threshold, 60-minute event expiry, trusted-ID rules, duplicates, reposts, and concurrent activation\n";
}finally{if($created)$pdo->exec("DROP DATABASE `$database`");}
