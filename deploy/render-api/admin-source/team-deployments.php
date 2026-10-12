<?php
if(in_array($action,['team-deployments','team-deployment-save','team-deployment-delete'],true)){
    $admin=current_admin($pdo);
    $fail=static function(int $status,string $message):never{http_response_code($status);echo json_encode(['error'=>$message]);exit;};
    if(!$admin || ($admin['status']??'')!=='active')$fail(401,'Sign in first.');
    $permission=strtolower($admin['acls']['products']??'');
    if(!in_array($permission,['full','edit','view'],true))$fail(403,'Evacuees access required.');
    $write=$method==='POST';
    if(($action==='team-deployments' && $method!=='GET')||($action!=='team-deployments' && !$write))$fail(405,'Method not allowed.');
    if($write&&!in_array($permission,['full','edit'],true))$fail(403,'Team management requires edit access.');
    $location=requested_location($admin,$write?($input['location_id']??$admin['assigned_location']??null):($_GET['location']??$admin['assigned_location']??null));
    $assigned=!is_platform_admin($admin)&&!empty($admin['barangay'])&&$admin['barangay']!=='All barangays'?$admin['barangay']:'';
    $pdo->exec("CREATE TABLE IF NOT EXISTS team_deployments (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,location_id VARCHAR(32) NOT NULL,barangay VARCHAR(150) NOT NULL,
        name VARCHAR(150) NOT NULL,personnel INT UNSIGNED NOT NULL,contact VARCHAR(150) NOT NULL DEFAULT '',
        status VARCHAR(20) NOT NULL DEFAULT 'deployed',created_by BIGINT UNSIGNED NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_team_scope(location_id,barangay,status)) ENGINE=InnoDB");
    $pdo->exec("CREATE TABLE IF NOT EXISTS team_deployment_audit (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,team_id BIGINT UNSIGNED NOT NULL,admin_id BIGINT UNSIGNED NOT NULL,
        action VARCHAR(20) NOT NULL,snapshot JSON NOT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB");
    $_SESSION['team_csrf']??=bin2hex(random_bytes(24));
    if(!$write){
        $barangay=$assigned!==''?$assigned:trim((string)($_GET['barangay']??''));if($barangay==='All barangays')$barangay='';
        $stmt=$pdo->prepare('SELECT * FROM team_deployments WHERE location_id=?'.($barangay!==''?' AND barangay=?':'').' ORDER BY id DESC');$stmt->execute($barangay!==''?[$location['id'],$barangay]:[$location['id']]);
        echo json_encode(['teams'=>$stmt->fetchAll(),'can_edit'=>in_array($permission,['full','edit'],true),'csrf'=>$_SESSION['team_csrf']]);exit;
    }
    if(!hash_equals($_SESSION['team_csrf'],$_SERVER['HTTP_X_CSRF_TOKEN']??''))$fail(403,'Refresh team deployments and try again.');
    $id=isset($input['id'])?filter_var($input['id'],FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]):null;
    if($id===false||($action==='team-deployment-delete'&&!$id))$fail(422,'Provide a valid team ID.');
    $barangay=trim((string)($input['barangay']??''));$name=trim((string)($input['name']??''));$contact=trim((string)($input['contact']??''));$status=$input['status']??'deployed';
    $personnel=filter_var($input['personnel']??null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1,'max_range'=>100000]]);
    if($action==='team-deployment-save'){
        if($barangay===''||$barangay==='All barangays'||strlen($barangay)>150||$name===''||strlen($name)>150||strlen($contact)>150||!$personnel||!in_array($status,['deployed','standby','withdrawn'],true))$fail(422,'Choose a barangay and enter a team name, 1–100,000 personnel, and a valid status.');
        if($assigned!==''&&$assigned!==$barangay)$fail(403,'This barangay is outside your assignment.');
        $legacy=json_decode((string)file_get_contents(__DIR__.'/team-barangays.json'),true);
        $directory=json_decode((string)file_get_contents(__DIR__.'/map-data/barangay-options.json'),true);
        $psgc=bahaba_legacy_psgc($location['id'])?:$location['id'];
        $known=$legacy[$location['city']]??$legacy[$location['map_city']??'']??$legacy[str_replace(' City','',$location['city'])]??$directory['locations'][$psgc]??[];
        $normalize=static fn($name)=>strtolower(trim(preg_replace('/\s*\((?:Pob\.?|Poblacion)\)/i','',(string)$name)));
        $matches=array_filter($known,static fn($name)=>$normalize($name)===$normalize($barangay));
        if(!in_array($barangay,$known,true)&&count($matches)!==1&&$barangay!==$assigned)$fail(422,'Choose a barangay from the supported location list.');
    }
    try{
        $pdo->beginTransaction();$old=null;
        if($id){$stmt=$pdo->prepare('SELECT * FROM team_deployments WHERE id=? FOR UPDATE');$stmt->execute([$id]);$old=$stmt->fetch();
            if(!$old){$pdo->rollBack();$fail(404,'Team deployment not found.');}
            if($old['location_id']!==$location['id']||($assigned!==''&&$old['barangay']!==$assigned)){$pdo->rollBack();$fail(403,'Team deployment is outside your assignment.');}
        }
        if($action==='team-deployment-delete'){$pdo->prepare('DELETE FROM team_deployments WHERE id=?')->execute([$id]);$snapshot=$old;$decision='delete';}
        else{
            $snapshot=['location_id'=>$location['id'],'barangay'=>$barangay,'name'=>$name,'personnel'=>$personnel,'contact'=>$contact,'status'=>$status];
            if($id)$pdo->prepare('UPDATE team_deployments SET barangay=?,name=?,personnel=?,contact=?,status=? WHERE id=?')->execute([$barangay,$name,$personnel,$contact,$status,$id]);
            else{$pdo->prepare('INSERT INTO team_deployments(location_id,barangay,name,personnel,contact,status,created_by) VALUES(?,?,?,?,?,?,?)')->execute([$location['id'],$barangay,$name,$personnel,$contact,$status,$admin['id']]);$id=(int)$pdo->lastInsertId();}
            $decision=$old?'update':'create';$snapshot=['before'=>$old,'after'=>$snapshot];
        }
        $pdo->prepare('INSERT INTO team_deployment_audit(team_id,admin_id,action,snapshot) VALUES(?,?,?,?)')->execute([$id,$admin['id'],$decision,json_encode($snapshot,JSON_THROW_ON_ERROR)]);$pdo->commit();
        echo json_encode(['success'=>true,'id'=>$id]);
    }catch(Throwable $error){if($pdo->inTransaction())$pdo->rollBack();$fail(503,'Team deployment could not be saved.');}
    exit;
}
