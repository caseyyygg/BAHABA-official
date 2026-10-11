<?php
$p=new PDO('mysql:host=127.0.0.1;port=33317;dbname=bahaba_report_actions_test;charset=utf8mb4','root','',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$p->exec("UPDATE admin_users SET assigned_location='0301410000',city='City of Malolos',barangay=NULL WHERE email='bahaba.lgu.malolos@example.com'");
$s=$p->prepare("INSERT INTO reports(city,location_id,psgc_id,barangay,severity,reporter,source,description,status) VALUES('Navotas City','navotas','1380900000','San Jose','low','Isolated test','lgu',?,'pending')");for($i=0;$i<55;$i++)$s->execute(['Pagination test '.$i]);
echo 'Created isolated PSGC assignment and pagination fixtures';
$s=$p->query("SELECT * FROM admin_users WHERE email='bahaba.lgu.navotas@example.com'")->fetch(PDO::FETCH_ASSOC);unset($s['id']);$s['email']='barangay-only@example.com';$s['name']='Barangay-only test';$s['barangay']='San Jose';$columns=array_keys($s);$p->prepare('INSERT INTO admin_users (`'.implode('`,`',$columns).'`) VALUES ('.implode(',',array_fill(0,count($columns),'?')).')')->execute(array_values($s));
$p->exec("INSERT INTO reports(id,city,location_id,psgc_id,barangay,severity,reporter,source,description,status) VALUES(9000,'Navotas City','navotas','1380900000','Tanza 1','low','Scope test','lgu','Outside assigned barangay','pending')");
if(!$p->query("SHOW COLUMNS FROM reports LIKE 'source_posts'")->fetch())$p->exec('ALTER TABLE reports ADD source_posts JSON NULL');
$p->exec("UPDATE reports SET source='nlp',platform='Facebook',original_post_url='https://www.facebook.com/example/posts/123' WHERE id=1");
$p->exec("UPDATE reports SET source='lgu' WHERE id=2");
$p->exec("UPDATE reports SET source='nlp',platform='X',original_post_url='javascript:alert(1)' WHERE id=9000");
