<?php
// Local admin prototype only. Production authentication/API integration is separate.
declare(strict_types=1);
header('Content-Type: application/json');
function out(array $data, int $status=200): never { http_response_code($status); echo json_encode($data); exit; }
if (!in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1','::1'], true)) out(['error'=>'This preview API is local only.'],403);
$configFile=__DIR__.'/local-config.php';
if(!is_file($configFile)) out(['error'=>'Local admin database is not configured.'],503);
$c=require $configFile;
$p=new PDO($c['db']['dsn'],$c['db']['username'],$c['db']['password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
session_name('bahaba_admin_preview'); session_set_cookie_params(['httponly'=>true,'samesite'=>'Strict']);session_start();
$_SESSION['csrf'] ??= bin2hex(random_bytes(24));
$p->exec("CREATE TABLE IF NOT EXISTS admin_access_requests (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,email VARCHAR(254) UNIQUE NOT NULL,password_hash VARCHAR(255) NOT NULL,name VARCHAR(150) NOT NULL,role VARCHAR(20) NOT NULL,city VARCHAR(150) NOT NULL,barangay VARCHAR(150) NULL,assigned_location VARCHAR(32) NULL,assigned_psgc_id CHAR(10) NULL,status VARCHAR(20) NOT NULL DEFAULT 'pending',reviewed_by BIGINT UNSIGNED NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,reviewed_at DATETIME NULL)");
$p->exec("CREATE TABLE IF NOT EXISTS admin_access_reviews (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,request_id BIGINT UNSIGNED NOT NULL,reviewer_id BIGINT UNSIGNED NOT NULL,decision VARCHAR(20) NOT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
$seed=$p->prepare('INSERT IGNORE INTO admin_access_requests(email,password_hash,name,role,city,barangay,assigned_location,assigned_psgc_id,status) VALUES(?,?,?,?,?,?,?,?,?)');
// Import only the explicitly seeded LGU test identities; never promote resident accounts by email pattern.
foreach(['navotas'=>'Navotas City','bulacan'=>'Bulacan','marikina'=>'Marikina City','pampanga'=>'Pampanga','malolos'=>'Malolos City'] as $scope=>$city){
$email='bahaba.lgu.'.$scope.'@example.com';$q=$p->prepare('SELECT username,password_hash FROM users WHERE email=?');$q->execute([$email]);$u=$q->fetch();
if($u) $seed->execute([$email,$u['password_hash'],$u['username'],'lgu',$city,null,$scope,['navotas'=>'1380900000','marikina'=>'1380700000','malolos'=>'0301410000'][$scope]??null,'active']);
}
foreach([['miguel.torres@bahaba.ph','Bahaba@2026','Miguel Torres','team','Metro Manila (All Cities)',null],['elena.villareal@malabon.gov.ph','Concepcion@2026','Elena Villareal','lgu','Malabon City','Concepcion'],['qc.admin@quezoncity.gov.ph','Batasan@2026','Marco Rivera','lgu','Quezon City','Batasan Hills']] as $a){
$q=$p->prepare('SELECT id FROM admin_access_requests WHERE email=?');$q->execute([$a[0]]);if(!$q->fetchColumn())$seed->execute([$a[0],password_hash($a[1],PASSWORD_DEFAULT),$a[2],$a[3],$a[4],$a[5],null,null,'active']);
}
function publicAccount(array $u): array {
$team=$u['role']==='team';return ['id'=>$u['id'],'email'=>$u['email'],'name'=>$u['name'],'initials'=>strtoupper(substr($u['name'],0,2)),'org'=>$team?'BAHABA Team':($u['barangay']?'Brgy. '.$u['barangay']:'LGU').' · '.$u['city'],'role'=>$u['role'],'city'=>$u['city'],'barangay'=>$u['barangay'],'assigned_location'=>$u['assigned_location'],'assigned_psgc_id'=>$u['assigned_psgc_id'],'status'=>$u['status'],'acls'=>['admin_overview'=>$team?'full':'view','announcements'=>$team?'full':'edit','products'=>$team?'full':'edit','approval_board'=>$team?'full':'edit','approval_board_hr'=>$team?'full':'no_access']];
}
$action=$_GET['action']??'session';$method=$_SERVER['REQUEST_METHOD'];
if($method==='POST' && !hash_equals($_SESSION['csrf'],$_SERVER['HTTP_X_CSRF_TOKEN']??''))out(['error'=>'Refresh the page and try again.'],403);
$d=json_decode(file_get_contents('php://input'),true)??[];
if($action==='login' && $method==='POST'){
$q=$p->prepare('SELECT * FROM admin_access_requests WHERE email=?');$q->execute([strtolower(trim($d['email']??''))]);$u=$q->fetch();
if(!$u||!password_verify($d['password']??'',$u['password_hash']))out(['error'=>'Incorrect email or password. Please try again.'],401);
if($u['status']!=='active')out(['error'=>$u['status']==='pending'?'Your registration is awaiting approval from the BAHABA team.':'Your registration request was rejected. Contact the BAHABA team.'],403);
session_regenerate_id(true);$_SESSION['admin_id']=$u['id'];out(['user'=>publicAccount($u),'csrf'=>$_SESSION['csrf']]);
}
if($action==='register' && $method==='POST'){
$email=strtolower(trim($d['email']??''));$name=trim($d['name']??'');$password=$d['password']??'';$role=($d['role']??'lgu')==='team'?'team':'lgu';
if(!filter_var($email,FILTER_VALIDATE_EMAIL)||strlen($name)<2||strlen($name)>150||strlen($password)<8||strlen($password)>72||preg_match('/[<>"\x00-\x1f]/',$name))out(['error'=>'Enter a valid email, name and password (8–72 characters).'],422);
$registry=json_decode(file_get_contents(__DIR__.'/psgc-registry.json'),true);$match=null;foreach($registry['locations'] as $l)if($l['id']===($d['psgc_id']??'')){$match=$l;break;}
$barangay=trim($d['barangay']??'');if($role==='lgu'&&(!$match||!$barangay||strlen($barangay)>150||preg_match('/[<>"\x00-\x1f]/',$barangay)))out(['error'=>'Select a PSGC location and enter your barangay.'],422);
try{$seed->execute([$email,password_hash($password,PASSWORD_DEFAULT),$name,$role,$role==='team'?'Metro Manila (All Cities)':$match['city'],$role==='team'?null:$barangay,null,$role==='team'?null:$match['id'],'pending']);if(!$seed->rowCount())out(['error'=>'An account or request with this email already exists.'],409);}catch(PDOException $e){out(['error'=>'Registration could not be saved.'],500);}
out(['status'=>'pending'],201);
}
if($action==='session'){
$u=null;if(isset($_SESSION['admin_id'])){$q=$p->prepare("SELECT * FROM admin_access_requests WHERE id=? AND status='active'");$q->execute([$_SESSION['admin_id']]);$u=$q->fetch();}out(['user'=>$u?publicAccount($u):null,'csrf'=>$_SESSION['csrf']]);
}
if($action==='logout'&&$method==='POST'){unset($_SESSION['admin_id']);session_regenerate_id(true);out(['ok'=>true]);}
$q=$p->prepare("SELECT * FROM admin_access_requests WHERE id=? AND status='active'");$q->execute([$_SESSION['admin_id']??0]);$admin=$q->fetch();
if(!$admin)out(['error'=>'Sign in first.'],401);
if($admin['role']!=='team')out(['error'=>'Only the BAHABA team can review registration requests.'],403);
if($action==='requests'&&$method==='GET'){out(['requests'=>$p->query("SELECT id,email,name,role,city,barangay,assigned_psgc_id,status,created_at FROM admin_access_requests WHERE status='pending' ORDER BY id")->fetchAll()]);}
if($action==='review'&&$method==='POST'){
$status=$d['status']??'';if(!in_array($status,['active','rejected'],true))out(['error'=>'Invalid decision.'],422);
$p->beginTransaction();$q=$p->prepare("UPDATE admin_access_requests SET status=?,reviewed_by=?,reviewed_at=NOW() WHERE id=? AND status='pending'");$q->execute([$status,$admin['id'],$d['id']??0]);if(!$q->rowCount()){$p->rollBack();out(['error'=>'Request has already been reviewed or does not exist.'],409);}
$p->prepare('INSERT INTO admin_access_reviews(request_id,reviewer_id,decision) VALUES(?,?,?)')->execute([$d['id'],$admin['id'],$status]);$p->commit();out(['ok'=>true]);
}
out(['error'=>'Unknown endpoint.'],404);
