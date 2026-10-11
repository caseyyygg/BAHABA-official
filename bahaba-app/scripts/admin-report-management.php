<?php
// Included after the original admin API parses method, action and JSON input.
bahaba_ensure_column($pdo, 'reports', 'map_hidden', 'BOOLEAN NOT NULL DEFAULT FALSE');
bahaba_ensure_column($pdo, 'reports', 'source_posts', 'JSON NULL');
if ($method === 'GET' && $action === 'managed-reports') {
    $admin=current_admin($pdo);
    if(!$admin || ($admin['status']??'')!=='active'){http_response_code(401);echo json_encode(['error'=>'Sign in first.']);exit;}
    $permission=strtolower((string)($admin['acls']['approval_board']??''));
    if(!in_array($permission,['full','edit','view'],true)){http_response_code(403);echo json_encode(['error'=>'Report access required.']);exit;}
    $where=["r.status <> 'rejected'"];$params=[];$platform=is_platform_admin($admin);
    $locationId=trim((string)($_GET['location']??''));
    if(!$platform || $locationId!==''){$scope=requested_location($admin,$locationId!==''?$locationId:($admin['assigned_location']??null));$where[]='r.location_id=?';$params[]=$scope['id'];}
    if(!$platform && !empty($admin['barangay']) && $admin['barangay']!=='All barangays'){$where[]='r.barangay=?';$params[]=$admin['barangay'];}
    $visibility=(string)($_GET['visibility']??'all');$status=(string)($_GET['status']??'all');
    if(!in_array($visibility,['all','hidden','visible'],true)||!in_array($status,['all','pending','verified','rejected'],true)){http_response_code(422);echo json_encode(['error'=>'Invalid report filter.']);exit;}
    if($visibility!=='all'){$where[]='r.map_hidden=?';$params[]=$visibility==='hidden'?1:0;}
    if($status!=='all'){$where[]='r.status=?';$params[]=$status;}
    $search=substr(trim((string)($_GET['search']??'')),0,120);
    if($search!==''){$where[]='(CAST(r.id AS CHAR) LIKE ? OR r.city LIKE ? OR r.barangay LIKE ? OR r.description LIKE ?)';for($i=0;$i<4;$i++)$params[]='%'.$search.'%';}
    $page=filter_var($_GET['page']??1,FILTER_VALIDATE_INT,['options'=>['min_range'=>1,'max_range'=>100000]]);
    if($page===false){http_response_code(422);echo json_encode(['error'=>'Invalid page.']);exit;}
    $clause=$where?' WHERE '.implode(' AND ',$where):'';
    $stmt=$pdo->prepare('SELECT COUNT(*) FROM reports r'.$clause);$stmt->execute($params);$total=(int)$stmt->fetchColumn();$pages=max(1,(int)ceil($total/50));$page=min($page,$pages);$offset=($page-1)*50;
    $stmt=$pdo->prepare('SELECT r.id,r.location_id,r.city,r.barangay,r.severity,r.status,r.source,r.platform,r.original_post_url,r.source_posts,r.map_hidden,r.description,r.created_at FROM reports r'.$clause.' ORDER BY r.id DESC LIMIT 50 OFFSET '.$offset);$stmt->execute($params);
    echo json_encode(['reports'=>$stmt->fetchAll(),'total'=>$total,'page'=>$page,'pages'=>$pages,'platform'=>$platform,'can_hide'=>in_array($permission,['full','edit'],true),'can_delete'=>in_array($permission,['full','edit'],true)]);exit;
}

if ($method === 'GET' && $action === 'report-management-session') {
    $admin = current_admin($pdo);
    if (!$admin || ($admin['status'] ?? '') !== 'active') { http_response_code(401); echo json_encode(['error'=>'Sign in first.']); exit; }
    $_SESSION['report_management_csrf'] ??= bin2hex(random_bytes(24));
    echo json_encode(['csrf'=>$_SESSION['report_management_csrf']]); exit;
}
if ($method === 'POST' && in_array($action, ['report-map-visibility','report-delete'], true)) {
    $admin = current_admin($pdo);
    if (!$admin || ($admin['status'] ?? '') !== 'active') { http_response_code(401); echo json_encode(['error'=>'Sign in first.']); exit; }
    $permission = strtolower((string) ($admin['acls']['approval_board'] ?? 'no_access'));
    if (!in_array($permission, ['full','edit'], true)) {
        http_response_code(403); echo json_encode(['error'=>'You do not have permission to manage this report.']); exit;
    }
    if (!isset($_SESSION['report_management_csrf']) || !hash_equals($_SESSION['report_management_csrf'], $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')) {
        http_response_code(403); echo json_encode(['error'=>'Refresh the page and try again.']); exit;
    }
    $id = filter_var($input['id'] ?? null, FILTER_VALIDATE_INT, ['options'=>['min_range'=>1]]);
    if (!$id || ($action === 'report-map-visibility' && !is_bool($input['hidden'] ?? null))) {
        http_response_code(422); echo json_encode(['error'=>'Provide a valid report ID and visibility.']); exit;
    }
    $lookup = $pdo->prepare('SELECT * FROM reports WHERE id=?'); $lookup->execute([$id]); $report=$lookup->fetch();
    if (!$report) { http_response_code(404); echo json_encode(['error'=>'Report not found.']); exit; }
    requested_location($admin, $report['location_id'] ?: bahaba_normalize_location_id($report['city']));
        if(!is_platform_admin($admin) && !empty($admin['barangay']) && $admin['barangay']!=='All barangays' && strcasecmp($admin['barangay'],$report['barangay'])!==0){if($pdo->inTransaction())$pdo->rollBack();http_response_code(403);echo json_encode(['error'=>'This report is outside your assigned barangay.']);exit;}
    $pdo->exec("CREATE TABLE IF NOT EXISTS report_management_audit (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, report_id BIGINT UNSIGNED NOT NULL,
        admin_id BIGINT UNSIGNED NOT NULL, action VARCHAR(32) NOT NULL, snapshot JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX idx_report_management(report_id)
    ) ENGINE=InnoDB");
    try {
        $pdo->beginTransaction();
        $lock=$pdo->prepare('SELECT * FROM reports WHERE id=? FOR UPDATE');$lock->execute([$id]);$report=$lock->fetch();
        if (!$report) { $pdo->rollBack(); http_response_code(404); echo json_encode(['error'=>'Report not found.']); exit; }
        // Recheck location after locking so a reassignment cannot bypass scope checks.
        requested_location($admin, $report['location_id'] ?: bahaba_normalize_location_id($report['city']));
        if(!is_platform_admin($admin) && !empty($admin['barangay']) && $admin['barangay']!=='All barangays' && strcasecmp($admin['barangay'],$report['barangay'])!==0){if($pdo->inTransaction())$pdo->rollBack();http_response_code(403);echo json_encode(['error'=>'This report is outside your assigned barangay.']);exit;}
        $decision=$action==='report-delete'?'delete':($input['hidden']?'hide':'show');
        $pdo->prepare('INSERT INTO report_management_audit(report_id,admin_id,action,snapshot) VALUES(?,?,?,?)')->execute([$id,$admin['id'],$decision,json_encode($report,JSON_THROW_ON_ERROR)]);
        if ($action==='report-delete') $pdo->prepare('DELETE FROM reports WHERE id=?')->execute([$id]);
        else $pdo->prepare('UPDATE reports SET map_hidden=? WHERE id=?')->execute([$input['hidden']?1:0,$id]);
        $pdo->commit(); echo json_encode(['success'=>true,'id'=>$id,'action'=>$decision]);
    } catch (Throwable $error) {
        if($pdo->inTransaction())$pdo->rollBack();http_response_code(500);echo json_encode(['error'=>'The report could not be updated. Please try again.']);
    }
    exit;
}
