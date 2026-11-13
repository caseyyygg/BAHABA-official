<?php

require __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/password-recovery.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond(['error' => 'Method not allowed.'], 405);
$data = request_json();
$email = strtolower(trim((string) ($data['email'] ?? '')));
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) respond(['error' => 'Enter a valid email address.'], 422);

$generic = ['message' => 'If an account exists for this address, a confirmation link will be sent. Check your inbox.'];
$pdo->exec('DELETE FROM account_deletion_requests WHERE expires_at <= UTC_TIMESTAMP()');
foreach (['delete:email:' . $email, 'delete:ip:' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown')] as $key) {
    $bucket = hash('sha256', $key);
    $now = time();
    $statement = $pdo->prepare('INSERT INTO password_reset_limits(bucket,started_at,attempts) VALUES(?,?,1) ON DUPLICATE KEY UPDATE attempts=IF(started_at < VALUES(started_at)-900,1,attempts+1), started_at=IF(started_at < VALUES(started_at)-900,VALUES(started_at),started_at)');
    $statement->execute([$bucket, $now]);
    $statement = $pdo->prepare('SELECT attempts FROM password_reset_limits WHERE bucket = ?');
    $statement->execute([$bucket]);
    $limit = str_starts_with($key, 'delete:email:') ? 3 : 20;
    if ((int) $statement->fetchColumn() > $limit) respond($generic);
}

$mailer = __DIR__ . '/vendor/autoload.php';
$smtp = $config['smtp'] ?? [];
if (empty($smtp['host']) || empty($smtp['password']) || $smtp['password'] === 'your-google-app-password' || !is_file($mailer)) {
    respond(['error' => 'Account deletion email is temporarily unavailable. Please try again later.'], 503);
}

$statement = $pdo->prepare('SELECT id FROM users WHERE email = ? LIMIT 1');
$statement->execute([$email]);
$userId = $statement->fetchColumn();
if (!$userId) respond($generic);

$token = bin2hex(random_bytes(32));
$tokenHash = hash('sha256', $token);
$pdo->prepare('INSERT INTO account_deletion_requests(user_id,token_hash,expires_at) VALUES(?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 24 HOUR)) ON DUPLICATE KEY UPDATE token_hash=VALUES(token_hash),expires_at=VALUES(expires_at),created_at=CURRENT_TIMESTAMP')
    ->execute([(int) $userId, $tokenHash]);

$appUrl = rtrim((string) ($config['app_url'] ?? ''), '/');
if (!str_starts_with($appUrl, 'https://')) {
    $pdo->prepare('DELETE FROM account_deletion_requests WHERE user_id = ?')->execute([(int) $userId]);
    respond(['error' => 'Account deletion links are not configured for this website. Please try again later.'], 503);
}
$link = $appUrl . '/delete-account/?token=' . rawurlencode($token);

require_once $mailer;
try {
    $mail = new \PHPMailer\PHPMailer\PHPMailer(true);
    $mail->isSMTP();
    $mail->Host = $smtp['host'];
    $mail->SMTPAuth = true;
    $mail->Username = $smtp['username'];
    $mail->Password = $smtp['password'];
    $mail->Port = $smtp['port'] ?? 587;
    $mail->Timeout = 15;
    $mail->SMTPSecure = (int) $mail->Port === 465
        ? \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS
        : \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
    $mail->setFrom($config['mail_from'] ?? $smtp['username'], 'BANTALA');
    $mail->addAddress($email);
    $mail->Subject = 'Confirm your BANTALA account deletion';
    $mail->Body = "A request was made to permanently delete your BANTALA account and associated account data. Confirm within 24 hours: $link\n\nIf you did not make this request, ignore this email. Your account will not be deleted.";
    $mail->send();
} catch (Throwable $error) {
    $pdo->prepare('DELETE FROM account_deletion_requests WHERE user_id = ?')->execute([(int) $userId]);
    error_log('BANTALA account deletion email delivery failed.');
    respond(['error' => 'The confirmation email could not be sent. Please try again later.'], 503);
}

respond($generic);
