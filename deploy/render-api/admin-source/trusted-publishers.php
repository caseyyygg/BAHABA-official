<?php
if (in_array($action,['trusted-publishers','trusted-publisher-save'],true)) {
    header('Cache-Control: no-store, private');
    $fail=static function($status,$message){http_response_code($status);echo json_encode(['error'=>$message]);exit;};
    $admin=current_admin($pdo);
    if (!$admin || ($admin['status']??'')!=='active') $fail(401,'Sign in first.');
    if (!is_platform_admin($admin) || strtolower($admin['acls']['admin_overview']??'')!=='full') $fail(403,'Only the platform administrator can approve trusted publishers.');
    require_once __DIR__.'/nlp-flood-events.php';bahaba_flood_schema($pdo);
    $_SESSION['trusted_publishers_csrf']??=bin2hex(random_bytes(24));
    if ($action==='trusted-publishers' && $method==='GET') {
        echo json_encode(['publishers'=>$pdo->query('SELECT platform,publisher_id,publisher_type,profile_url,evidence_url,approved_at,active FROM nlp_trusted_publishers ORDER BY platform,publisher_id')->fetchAll(),'csrf'=>$_SESSION['trusted_publishers_csrf']]);exit;
    }
    if ($action!=='trusted-publisher-save' || $method!=='POST') $fail(405,'Method not allowed.');
    if (!hash_equals($_SESSION['trusted_publishers_csrf'],$_SERVER['HTTP_X_CSRF_TOKEN']??'')) $fail(403,'Refresh trusted sources and try again.');
    $platform=strtolower(trim((string)($input['platform']??'')));$id=trim((string)($input['publisher_id']??''));
    $type=$input['publisher_type']??'';$profile=trim((string)($input['profile_url']??''));$evidence=trim((string)($input['evidence_url']??''));
    if (!in_array($platform,['facebook','x','threads'],true) || !ctype_digit($id) || strlen($id)>191 || !in_array($type,['government','news'],true)) $fail(422,'Choose a platform, numeric publisher ID, and government/news category.');
    foreach ([$profile,$evidence] as $url) if (strlen($url)>2048 || !filter_var($url,FILTER_VALIDATE_URL) || parse_url($url,PHP_URL_SCHEME)!=='https') $fail(422,'Provide HTTPS profile and verification-evidence links.');
    $host=strtolower((string)parse_url($profile,PHP_URL_HOST));$domains=['facebook'=>['facebook.com'],'x'=>['x.com','twitter.com'],'threads'=>['threads.com','threads.net']][$platform];
    if (!array_filter($domains,fn($domain)=>$host===$domain||str_ends_with($host,'.'.$domain))) $fail(422,'The profile URL must belong to the selected platform.');
    if (($input['review_confirmed']??false)!==true) $fail(422,'Confirm that you verified this publisher identity and its official affiliation.');
    $pdo->prepare('INSERT INTO nlp_trusted_publishers(platform,publisher_id,publisher_type,profile_url,evidence_url,approved_by,approved_at,active) VALUES(?,?,?,?,?,?,UTC_TIMESTAMP(),?) ON DUPLICATE KEY UPDATE publisher_type=VALUES(publisher_type),profile_url=VALUES(profile_url),evidence_url=VALUES(evidence_url),approved_by=VALUES(approved_by),approved_at=VALUES(approved_at),active=VALUES(active)')
        ->execute([$platform,$id,$type,$profile,$evidence,$admin['id'],($input['active']??true)?1:0]);
    echo json_encode(['success'=>true]);exit;
}
