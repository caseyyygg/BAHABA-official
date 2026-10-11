<?php
// Fixed isolated test database only; never reads the main private API config.
$p=new PDO('mysql:host=127.0.0.1;port=33317;charset=utf8mb4','root','',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
$name='bahaba_report_actions_test';$action=$argv[1]??'setup';
if($action==='drop'){$p->exec('DROP DATABASE IF EXISTS `bahaba_report_actions_test`');echo "Dropped isolated report-action test database\n";exit;}
if($action==='check'){
$p->exec('USE `bahaba_report_actions_test`');
if($p->query('SELECT COUNT(*) FROM reports WHERE id=1')->fetchColumn()!=0)throw new RuntimeException('Deleted report retained');
if($p->query("SELECT COUNT(*) FROM report_management_audit WHERE report_id=1 AND action='delete'")->fetchColumn()!=1)throw new RuntimeException('Missing delete audit');
if($p->query('SELECT COUNT(*) FROM reports WHERE id=2')->fetchColumn()!=1)throw new RuntimeException('Outside-scope report modified');
echo "PASS audit preservation and outside-scope record preservation\n";exit;
}
$p->exec('CREATE DATABASE `bahaba_report_actions_test` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');$p->exec('USE `bahaba_report_actions_test`');$p->exec('SET FOREIGN_KEY_CHECKS=0');
foreach($p->query('SHOW FULL TABLES FROM `bahaba_local_preview` WHERE Table_type="BASE TABLE"')->fetchAll(PDO::FETCH_NUM) as $r){$q='`'.str_replace('`','``',$r[0]).'`';$p->exec($p->query('SHOW CREATE TABLE `bahaba_local_preview`.'.$q)->fetch(PDO::FETCH_NUM)[1]);}
foreach(['locations','psgc_locations','admin_users'] as $table)$p->exec("INSERT INTO `$table` SELECT * FROM `bahaba_local_preview`.`$table`");
$p->exec('SET FOREIGN_KEY_CHECKS=1');
$p->exec("DELETE FROM schema_migrations");
$p->exec("INSERT INTO reports(id,city,barangay,severity,reporter,source,description,status,location_id,psgc_id,latitude,longitude) VALUES (1,'Navotas City','San Jose','high','Test','lgu','Synthetic report pin fixture','verified','navotas','1380900000',14.659,120.947),(2,'Malolos City','Panasahan','medium','Test','lgu','Outside-scope fixture','verified','malolos','0301410000',14.843,120.807)");
$p->prepare("INSERT INTO users(email,username,password_hash,email_verified_at) VALUES('pin-test@gmail.com','Pin tester',?,NOW())")->execute([password_hash('FloodTest!26',PASSWORD_DEFAULT)]);
$q=$p->query("SELECT * FROM admin_users WHERE email='bahaba.lgu.navotas@example.com'")->fetch();unset($q['id']);$q['email']='read-only@example.com';$q['name']='Read only test';$q['acls']=json_encode(['approval_board'=>'view','admin_overview'=>'view']);$cols=array_keys($q);$p->prepare('INSERT INTO admin_users (`'.implode('`,`',$cols).'`) VALUES ('.implode(',',array_fill(0,count($cols),'?')).')')->execute(array_values($q));
echo "Created isolated report-action fixtures\n";
