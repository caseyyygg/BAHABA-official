<?php
require __DIR__.'/bootstrap.php';
require_once __DIR__.'/password-recovery.php';
if ($_SERVER['REQUEST_METHOD']==='GET') bahaba_password_form();
if ($_SERVER['REQUEST_METHOD']!=='POST') respond(['error'=>'Method not allowed.'],405);
bahaba_password_complete($pdo,'resident',request_json());
