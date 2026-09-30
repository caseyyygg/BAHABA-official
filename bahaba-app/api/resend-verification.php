<?php

require __DIR__ . '/bootstrap.php';
require __DIR__ . '/vendor/autoload.php';

use PHPMailer\PHPMailer\Exception;
use PHPMailer\PHPMailer\PHPMailer;

$userId = (int) ($_SESSION['pending_user_id'] ?? 0);
if ($userId === 0) {
    respond(['error' => 'Return to log in and enter your account details before requesting a new activation link.'], 401);
}

$statement = $pdo->prepare('SELECT id, email, email_verified_at FROM users WHERE id = :id LIMIT 1');
$statement->execute(['id' => $userId]);
$user = $statement->fetch();
if (!$user) {
    unset($_SESSION['pending_user_id']);
    respond(['error' => 'Account not found. Return to log in and try again.'], 404);
}
if ($user['email_verified_at']) {
    respond(['message' => 'Your account is already activated. Return to log in.']);
}

$lastResend = (int) ($_SESSION['verification_resend_at'] ?? 0);
if (time() - $lastResend < 60) {
    respond(['error' => 'Please wait one minute before requesting another activation link.'], 429);
}

$token = bin2hex(random_bytes(32));
$tokenHash = hash('sha256', $token);
$expiresAt = (new DateTimeImmutable('+24 hours'))->format('Y-m-d H:i:s');
$update = $pdo->prepare('UPDATE users SET verification_token_hash = :token_hash, verification_expires_at = :expires_at WHERE id = :id');
$update->execute(['token_hash' => $tokenHash, 'expires_at' => $expiresAt, 'id' => $userId]);

$link = $config['api_url'] . '/verify.php?token=' . urlencode($token);
$mail = new PHPMailer(true);
try {
    $mail->isSMTP();
    $mail->Host = $config['smtp']['host'];
    $mail->SMTPAuth = true;
    $mail->Username = $config['smtp']['username'];
    $mail->Password = $config['smtp']['password'];
    $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
    $mail->Port = $config['smtp']['port'];
    $mail->setFrom($config['mail_from'], 'BAHABA');
    $mail->addAddress($user['email']);
    $mail->isHTML(true);
    $mail->Subject = 'Activate your BAHABA account';
    $mail->Body = '<p>Activate your BAHABA account using the link below.</p><p><a href="' . htmlspecialchars($link, ENT_QUOTES) . '">Activate account</a></p><p>This link expires in 24 hours.</p>';
    $mail->AltBody = "Activate your BAHABA account: $link";
    $mail->send();
} catch (Exception $exception) {
    respond(['error' => 'The activation email could not be sent. Check the mail server settings.'], 500);
}

$_SESSION['verification_resend_at'] = time();
respond(['message' => 'A new activation link has been sent to your Gmail. Use the newest email.']);