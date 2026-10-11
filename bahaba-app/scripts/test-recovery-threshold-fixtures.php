<?php
$p=new PDO('mysql:host=127.0.0.1;port=33317;dbname=bahaba_report_actions_test;charset=utf8mb4','root','',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
require __DIR__.'/../api/password-recovery.php';bahaba_reset_schema($p);
$action=$argv[1]??'';
if($action==='tokens'){
 foreach(['resident'=>['users','pin-test@gmail.com'],'admin'=>['admin_users','miguel.torres@bahaba.ph']] as $scope=>[$table,$email]){
  $s=$p->prepare("SELECT id FROM `$table` WHERE email=?");$s->execute([$email]);$id=$s->fetchColumn();$token=str_repeat($scope==='admin'?'a':'b',64);
  $p->prepare('REPLACE INTO password_resets(scope,user_id,token_hash,expires_at) VALUES(?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 30 MINUTE))')->execute([$scope,$id,hash('sha256',$token)]);
 }
 echo 'Reset token fixtures ready';
}
if($action==='expire'){$p->exec("UPDATE password_resets SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 MINUTE)");echo 'Expired reset fixtures';}
if($action==='nlp-check'){
 $count=(int)$p->query("SELECT COUNT(*) FROM reports WHERE source='nlp'")->fetchColumn();if($count!==1)throw new Exception('Expected exactly one NLP report, got '.$count);
 $row=$p->query("SELECT * FROM reports WHERE source='nlp'")->fetch();if($row['status']!=='pending'||$row['psgc_id']!=='1380900000'||!$row['barangay_feature_id']||$row['latitude']!==null)throw new Exception('Unsafe location or verification state');
 if(count(json_decode($row['source_posts'],true))!==20 || !$row['original_post_url'] || $row['platform']!=='Test')throw new Exception('Missing NLP source links');
 echo 'PASS 20-post candidate preserves pending verification, PSGC and barangay precision';
}
if($action==='pending-account'){
 $p->prepare("INSERT INTO users(email,username,password_hash) VALUES('pending-reset@gmail.com','Pending reset',?)")->execute([password_hash('FloodTest!26',PASSWORD_DEFAULT)]);$id=$p->lastInsertId();
 $p->prepare('INSERT INTO password_resets(scope,user_id,token_hash,expires_at) VALUES(?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 30 MINUTE))')->execute(['resident',$id,hash('sha256',str_repeat('c',64))]);echo 'Created pending reset account';
}
if($action==='activate-pending'){$p->exec("UPDATE users SET email_verified_at=NOW() WHERE email='pending-reset@gmail.com'");echo 'Activated test account';}
