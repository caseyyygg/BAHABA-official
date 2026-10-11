<?php
require_once $sharedApiDirectory.'/collected-summary.php';
$pdo->exec("SET time_zone = '+00:00'");
if($method==='GET' && in_array($action,['collected-summary','collected-summary-export','nlp-events'],true)){
    $admin=current_admin($pdo);
    if(!$admin){http_response_code(401);echo json_encode(['error'=>'Sign in first.']);exit;}
    if(($admin['status']??'')!=='active'||!in_array(strtolower($admin['acls']['approval_board']??''),['full','edit','view'],true)){http_response_code(403);echo json_encode(['error'=>'Reports access required.']);exit;}
    $location=requested_location($admin,$_GET['location']??$admin['assigned_location']??null);
    $barangay=!is_platform_admin($admin)&&!empty($admin['barangay'])&&$admin['barangay']!=='All barangays'?$admin['barangay']:trim((string)($_GET['barangay']??''));
    if($action==='nlp-events'){
        $pdo->exec("SET time_zone = '+00:00'");
        $cursor=filter_var($_GET['before']??PHP_INT_MAX,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
        $asOf=filter_var($_GET['as_of']??time(),FILTER_VALIDATE_INT,['options'=>['min_range'=>1,'max_range'=>time()]]);
        if(!$cursor||!$asOf){http_response_code(422);echo json_encode(['error'=>'Invalid feed cursor.']);exit;}
        $where='location_id=? AND received_at>=FROM_UNIXTIME(?)-INTERVAL 24 HOUR AND received_at<=FROM_UNIXTIME(?)';$params=[$location['id'],$asOf,$asOf];
        if($barangay!==''){$where.=' AND barangay=?';$params[]=$barangay;}
        $stats=$pdo->prepare("SELECT COUNT(*) total,SUM(classification='Flood') flood,SUM(classification='Non-Flood') nonFlood,SUM(severity='High') highSeverity,AVG(confidence_percent) avgConfidence FROM nlp_events WHERE $where");$stats->execute($params);
        $query=$pdo->prepare("SELECT * FROM nlp_events WHERE $where AND id<? ORDER BY id DESC LIMIT 101");$query->execute([...$params,$cursor]);$events=$query->fetchAll();$more=count($events)>100;if($more)array_pop($events);
        echo json_encode(['events'=>$events,'next_before'=>$more?(int)end($events)['id']:null,'as_of'=>$asOf,'stats'=>$stats->fetch(),'ingestionConfigured'=>$nlpIngestionConfigured,'nlpService'=>nlp_service_status()]);exit;
    }
    $year=($_GET['year']??'')!==''?filter_var($_GET['year'],FILTER_VALIDATE_INT,['options'=>['min_range'=>2000,'max_range'=>(int)date('Y')]]):null;
    if($year===false){http_response_code(422);echo json_encode(['error'=>'Choose a valid year.']);exit;}
    try{
        $rows=bahaba_collected_rows($pdo,$location['id'],$barangay,$year);$monthly=bahaba_collected_rollup($rows);$yearly=bahaba_collected_rollup($rows,true);
        $years=$pdo->prepare("SELECT DISTINCT YEAR(CONVERT_TZ(received_at,'+00:00','+08:00')) year FROM nlp_events WHERE location_id=?".($barangay!==''?' AND barangay=?':'').' ORDER BY year DESC');$years->execute($barangay!==''?[$location['id'],$barangay]:[$location['id']]);
        if($action==='collected-summary-export'){
            $header=['Period','Barangay','Collected posts','Flood posts','Non-flood posts','High flood posts','Medium flood posts','Low flood posts'];
            $detail=[['Month','Barangay','Platform','Classification','Severity','Urgency','Collected posts','Average confidence']];foreach($rows as $row)$detail[]=[substr($row['report_month'],0,7),$row['barangay'],$row['source'],$row['classification'],$row['severity'],$row['urgency'],(int)$row['total'],round((float)$row['average_confidence'],2)];
            $content=bahaba_collected_xlsx(['Read me'=>[['Location',$location['name']??$location['city']],['Period',$year?:'Latest 12 calendar months'],['Timezone','Asia/Manila'],['Scope','Posts collected more than 24 hours ago. Current feed is excluded.'],['Interpretation','NLP flood classifications are signals, not verified flood incidents. Counts are posts, not distinct floods. Missing data does not mean no flooding.'],['Month basis','Collection time; the social post may describe an older event.']], 'Monthly'=>[$header,...array_map('array_values',$monthly)],'Yearly'=>[$header,...array_map('array_values',$yearly)],'Source detail'=>$detail]);
            header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');header('Content-Disposition: attachment; filename="bahaba-collection-'.($year?:'12-months').'.xlsx"');header('Cache-Control: private, no-store');echo $content;exit;
        }
        echo json_encode(['location'=>$location,'rows'=>$rows,'monthly'=>$monthly,'yearly'=>$yearly,'years'=>$years->fetchAll(PDO::FETCH_COLUMN),'year'=>$year,'timezone'=>'Asia/Manila']);
    }catch(Throwable $error){http_response_code(503);echo json_encode(['error'=>'Collected summary is unavailable. Check the database and PHP ZIP extension for Excel export.']);}
    exit;
}
