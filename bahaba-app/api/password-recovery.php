<?php
/* Shared password recovery: no login or approval state is changed by a reset. */
function bahaba_reset_schema(PDO $pdo): void {
    foreach (['users','admin_users'] as $table) {
        if (!$pdo->query("SHOW COLUMNS FROM `$table` LIKE 'password_reset_version'")->fetch())
            $pdo->exec("ALTER TABLE `$table` ADD password_reset_version INT UNSIGNED NOT NULL DEFAULT 0");
    }
    $pdo->exec('CREATE TABLE IF NOT EXISTS password_resets (scope VARCHAR(16) NOT NULL, user_id BIGINT UNSIGNED NOT NULL, token_hash CHAR(64) NOT NULL UNIQUE, expires_at DATETIME NOT NULL, PRIMARY KEY(scope,user_id))');
    $pdo->exec('CREATE TABLE IF NOT EXISTS password_reset_limits (bucket CHAR(64) PRIMARY KEY, started_at BIGINT NOT NULL, attempts INT NOT NULL)');
}
function bahaba_reset_reply(array $body, int $status=200): never {
    http_response_code($status); header('Content-Type: application/json'); header('Cache-Control: no-store');
    echo json_encode($body); exit;
}
function bahaba_password_request(PDO $pdo, array $config, string $scope, array $data, string $baseUrl, string $vendor): never {
    bahaba_reset_schema($pdo);
    $email=strtolower(trim((string)($data['email']??'')));
    if (!filter_var($email,FILTER_VALIDATE_EMAIL)) bahaba_reset_reply(['error'=>'Enter a valid email address.'],422);
    $message=['message'=>'If this address is registered, check your email for a reset link valid for 30 minutes. If it does not arrive, try again later or contact the BAHABA team.'];
    // Database limits apply to existing and unknown accounts alike.
    foreach ([$scope.':email:'.$email, $scope.':ip:'.($_SERVER['REMOTE_ADDR']??'unknown')] as $key) {
        $bucket=hash('sha256',$key);$now=time();
        $stmt=$pdo->prepare('INSERT INTO password_reset_limits(bucket,started_at,attempts) VALUES(?,?,1) ON DUPLICATE KEY UPDATE attempts=IF(started_at < VALUES(started_at)-900,1,attempts+1), started_at=IF(started_at < VALUES(started_at)-900,VALUES(started_at),started_at)');$stmt->execute([$bucket,$now]);
        $stmt=$pdo->prepare('SELECT attempts FROM password_reset_limits WHERE bucket=?');$stmt->execute([$bucket]);
        if ((int)$stmt->fetchColumn()>($key===$scope.':email:'.$email?3:20)) bahaba_reset_reply($message);
    }
    $smtp=$config['smtp']??[];
    if (empty($smtp['host']) || empty($smtp['password']) || ($smtp['password']??'')==='your-google-app-password' || !is_file($vendor.'/autoload.php'))
        bahaba_reset_reply(['error'=>'Password recovery email is not configured. Please contact the BAHABA team.'],503);
    $table=$scope==='admin'?'admin_users':'users';
    $stmt=$pdo->prepare("SELECT id,email FROM `$table` WHERE email=? LIMIT 1");$stmt->execute([$email]);$user=$stmt->fetch(PDO::FETCH_ASSOC);
    if (!$user) bahaba_reset_reply($message);
    $token=bin2hex(random_bytes(32));$hash=hash('sha256',$token);
    $stmt=$pdo->prepare('INSERT INTO password_resets(scope,user_id,token_hash,expires_at) VALUES(?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 30 MINUTE)) ON DUPLICATE KEY UPDATE token_hash=VALUES(token_hash),expires_at=VALUES(expires_at)');$stmt->execute([$scope,$user['id'],$hash]);
    $link=$baseUrl.(str_contains($baseUrl,'?')?'&':'?').'token='.rawurlencode($token);
    require_once $vendor.'/autoload.php';
    try {
        $mail=new \PHPMailer\PHPMailer\PHPMailer(true);$mail->isSMTP();$mail->Host=$smtp['host'];$mail->SMTPAuth=true;$mail->Username=$smtp['username'];$mail->Password=$smtp['password'];$mail->Port=$smtp['port']??587;$mail->Timeout=15;
        $mail->SMTPSecure=($smtp['port']??587)==465?\PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS:\PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
        $mail->setFrom($config['mail_from']??$smtp['username'],'BAHABA');$mail->addAddress($email);
        $mail->Subject='Reset your BAHABA '.($scope==='admin'?'admin ':'').'password';
        $mail->Body="Reset your password: $link\n\nThis link expires in 30 minutes and can be used once. If you did not request this, ignore this email.";$mail->send();
    } catch (Throwable $error) {
        $pdo->prepare('DELETE FROM password_resets WHERE token_hash=?')->execute([$hash]);
        error_log('BAHABA password reset email delivery failed.');
        bahaba_reset_reply($message);
    }
    bahaba_reset_reply($message);
}
function bahaba_password_complete(PDO $pdo,string $scope,array $data): never {
    bahaba_reset_schema($pdo);$token=(string)($data['token']??'');$password=(string)($data['password']??'');
    if (!preg_match('/^[a-f0-9]{64}$/D',$token)) bahaba_reset_reply(['error'=>'This reset link is invalid or expired. Request a new link.'],422);
    if (strlen($password)<8 || strlen($password)>128) bahaba_reset_reply(['error'=>'Use a password between 8 and 128 characters.'],422);
    $table=$scope==='admin'?'admin_users':'users';$pdo->beginTransaction();
    try {
        $stmt=$pdo->prepare('SELECT user_id FROM password_resets WHERE scope=? AND token_hash=? AND expires_at>UTC_TIMESTAMP() FOR UPDATE');$stmt->execute([$scope,hash('sha256',$token)]);$id=$stmt->fetchColumn();
        if (!$id){$pdo->rollBack();bahaba_reset_reply(['error'=>'This reset link is invalid or expired. Request a new link.'],422);}
        $pdo->prepare("UPDATE `$table` SET password_hash=?,password_reset_version=password_reset_version+1 WHERE id=?")->execute([password_hash($password,PASSWORD_DEFAULT),$id]);
        $pdo->prepare('DELETE FROM password_resets WHERE scope=? AND user_id=?')->execute([$scope,$id]);$pdo->commit();
    } catch(Throwable $error){if($pdo->inTransaction())$pdo->rollBack();throw $error;}
    unset($_SESSION[$scope==='admin'?'admin_id':'user_id']);
    bahaba_reset_reply(['message'=>'Your password has been changed. Log in with your new password.']);
}
function bahaba_password_form(): never {
    header('Content-Type: text/html; charset=utf-8');header('Cache-Control: no-store');header('Referrer-Policy: no-referrer');
    echo <<<'HTML'
<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BAHABA · Reset password</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#edf4fb;color:#152b48;font:16px system-ui;padding:20px}main{max-width:430px;width:100%;padding:32px;background:white;border-radius:24px;box-shadow:0 12px 40px #132d481a}small{color:#2375ce;font-weight:700;letter-spacing:2px}h1{font-size:26px}label{display:block;margin:18px 0 8px;font-size:14px;font-weight:600}input{width:100%;padding:14px;border:1px solid #cbd8e9;border-radius:12px;font:inherit}.password{display:flex;gap:6px}.password button{width:auto;padding:10px;background:#e9f2fc;color:#164a7b}button{width:100%;padding:14px;margin-top:12px;border:0;border-radius:12px;background:#176ac6;color:white;font:600 15px system-ui;cursor:pointer}#status{line-height:1.5}button:disabled{opacity:.6}</style><main><small>BAHABA</small><h1>Reset your password</h1><p>Choose a new password for your account.</p><form id="reset"><label for="password">New password</label><div class="password"><input id="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required><button type="button" id="peek" aria-label="Show password">Show</button></div><label for="confirm">Confirm password</label><input id="confirm" type="password" autocomplete="new-password" minlength="8" maxlength="128" required><button id="submit">Save new password</button></form><p id="status" role="status"></p></main><script>const token=new URLSearchParams(location.search).get('token');history.replaceState(null,'',location.pathname+location.search.replace(/([?&])token=[^&]*/, '$1').replace(/[?&]$/,''));document.getElementById('peek').onclick=()=>{const p=document.getElementById('password');p.type=p.type==='password'?'text':'password';document.getElementById('peek').textContent=p.type==='password'?'Show':'Hide';document.getElementById('peek').setAttribute('aria-label',p.type==='password'?'Show password':'Hide password')};document.getElementById('reset').onsubmit=async e=>{e.preventDefault();const status=document.getElementById('status'),button=document.getElementById('submit'),password=document.getElementById('password').value;if(password!==document.getElementById('confirm').value){status.textContent='Passwords do not match.';return}button.disabled=true;try{const response=await fetch(location.pathname+location.search,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,password})});const data=await response.json();status.textContent=data.error||data.message;if(response.ok)document.getElementById('reset').hidden=true}catch{status.textContent='Could not reach BAHABA. Please try again.'}finally{button.disabled=false}};</script></html>
HTML;
    exit;
}
