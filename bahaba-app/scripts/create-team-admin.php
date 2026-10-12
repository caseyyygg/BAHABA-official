<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$config = require __DIR__.'/../api/config.php';
$pdo = new PDO($config['db']['dsn'],$config['db']['username'],$config['db']['password'],[
    PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,
]);
$email = 'bahaba.team@example.com';
$check = $pdo->prepare('SELECT id FROM admin_users WHERE email=?');
$check->execute([$email]);
if ($check->fetch()) { fwrite(STDERR,"Team account already exists. No changes made.\n"); exit(1); }
$password = 'Ba!'.bin2hex(random_bytes(12));
$hash = password_hash($password,PASSWORD_DEFAULT);
$acls = json_encode(array_fill_keys(['admin_overview','announcements','products','approval_board','approval_board_hr'],'full'),JSON_THROW_ON_ERROR);
$sql = 'INSERT INTO admin_users (name,email,password_hash,role,city,org,barangay,status,acls) VALUES ('
    .implode(',',array_map(fn($value)=>$value===null?'NULL':$pdo->quote($value),[
        'BAHABA Team',$email,$hash,'platform-admin','Metro Manila (All Cities)','BAHABA Team',null,'active',$acls,
    ])).');';
$directory = __DIR__.'/../team-admin.local';
if (!is_dir($directory) && !mkdir($directory,0700,true)) throw new RuntimeException('Cannot create private credentials directory.');
$credentials = "BAHABA Team — super-admin\nEmail: $email\nPassword: $password\nLocal login: http://localhost:8001/\n\nThe email is a placeholder; set a real team email for password recovery.\nKeep this password private. Do not upload this file to your website.\n";
if (file_put_contents($directory.'/credentials.txt',$credentials,LOCK_EX)===false || file_put_contents($directory.'/alwaysdata-team-admin.sql',"-- Select your intended alwaysdata database before importing.\n-- Adds one account; does not update existing accounts or reports.\n$sql\n",LOCK_EX)===false) throw new RuntimeException('Cannot save account setup files.');
chmod($directory.'/credentials.txt',0600);
chmod($directory.'/alwaysdata-team-admin.sql',0600);
$pdo->exec($sql);
echo "Created BAHABA Team with platform-admin role and full module permissions.\n";
echo "Credentials and alwaysdata SQL saved under bahaba-app/team-admin.local/. Password not printed.\n";
