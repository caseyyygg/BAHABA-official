<?php
if ($action === 'social-accounts' || $action === 'social-browser') {
    header('Cache-Control: no-store, private');
    $fail = static function (int $code, string $message): never {
        http_response_code($code); echo json_encode(['error'=>$message]); exit;
    };
    $admin = current_admin($pdo);
    if (!$admin || ($admin['status']??'') !== 'active') $fail(401,'Sign in first.');
    $permission = strtolower($admin['acls']['approval_board']??'');
    if (!in_array($permission,['full','edit','view'],true)) $fail(403,'NLP access required.');
    $write = $action === 'social-browser';
    if ($method !== ($write?'POST':'GET')) $fail(405,'Method not allowed.');
    $location = requested_location($admin,$write?($input['location_id']??null):($_GET['location']??null));
    $_SESSION['social_csrf'] ??= bin2hex(random_bytes(24));
    if ($write) {
        if (!in_array($permission,['full','edit'],true)) $fail(403,'Edit access required.');
        if (!hash_equals($_SESSION['social_csrf'],$_SERVER['HTTP_X_CSRF_TOKEN']??'')) $fail(403,'Refresh social accounts and try again.');
    }
    $base = rtrim((string)(getenv('SOCIAL_BROWSER_URL') ?: ($config['social_browser_url']??'')),'/');
    $token = (string)(getenv('SOCIAL_BROWSER_TOKEN') ?: ($config['social_browser_token']??''));
    if (!$base || !$token) {
        if ($write) $fail(503,'Social account sign-in needs the hosted browser service.');
        echo json_encode(['available'=>false,'accounts'=>[],'csrf'=>$_SESSION['social_csrf'],'can_edit'=>false]); exit;
    }
    $scheme = parse_url($base,PHP_URL_SCHEME);
    $host = parse_url($base,PHP_URL_HOST);
    if ($scheme !== 'https' && !($scheme==='http' && in_array($host,['127.0.0.1','localhost'],true))) $fail(503,'Browser service requires HTTPS.');
    $endpoint = $write?'/browser':'/accounts/'.rawurlencode($location['id']);
    $options = ['method'=>$write?'POST':'GET','timeout'=>35,'ignore_errors'=>true,'follow_location'=>0,
        'header'=>"Authorization: Bearer $token\r\nContent-Type: application/json\r\n"];
    if ($write) {
        // Scope and browser ownership come only from the authorized server session.
        $payload = array_intersect_key($input,array_flip(['platform','operation','x','y','text','key','delta']));
        $payload['scope']=$location['id'];
        $payload['owner']=hash('sha256',session_id().':'.$admin['id']);
        $options['content']=json_encode($payload);
    }
    session_write_close();
    $response = @file_get_contents($base.$endpoint,false,stream_context_create(['http'=>$options]));
    $data = is_string($response)?json_decode($response,true):null;
    $status=503;
    $responseHeaders = function_exists('http_get_last_response_headers') ? http_get_last_response_headers() : ($http_response_header??[]);
    if (isset($responseHeaders[0]) && preg_match('/\s(\d{3})\s/',$responseHeaders[0],$match)) $status=(int)$match[1];
    if (!is_array($data)) $fail(503,'Social browser service is unavailable. Try again later.');
    if ($status>=400) $fail($status,is_string($data['detail']??null)?$data['detail']:'Browser request failed.');
    if (!$write) $data+=['available'=>true,'csrf'=>$_SESSION['social_csrf'],'can_edit'=>in_array($permission,['full','edit'],true)];
    echo json_encode($data); exit;
}
