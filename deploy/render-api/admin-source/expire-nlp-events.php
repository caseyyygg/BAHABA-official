<?php
if (PHP_SAPI!=='cli') { http_response_code(403); exit; }
$config=require __DIR__.'/api/config.php';
require_once __DIR__.'/nlp-flood-events.php';
$pdo=new PDO($config['db']['dsn'],$config['db']['username'],$config['db']['password'],[
    PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
bahaba_flood_snapshot($pdo);
echo "Expired inactive city flood signals; history retained.\n";
