<?php
require __DIR__.'/bootstrap.php';
require_once __DIR__.'/password-recovery.php';
if ($_SERVER['REQUEST_METHOD']!=='POST') respond(['error'=>'Method not allowed.'],405);
bahaba_password_request($pdo,$config,'resident',request_json(),rtrim($config['api_url'],'/').'/reset-password.php',__DIR__.'/vendor');
