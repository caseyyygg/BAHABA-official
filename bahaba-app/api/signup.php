<?php

require __DIR__ . '/bootstrap.php';
require __DIR__ . '/vendor/autoload.php';

use PHPMailer\PHPMailer\Exception;
use PHPMailer\PHPMailer\PHPMailer;

$data = request_json();
$email = strtolower(trim((string) ($data['email'] ?? '')));
$username = trim((string) ($data['username'] ?? ''));
$password = (string) ($data['password'] ?? '');
$selectedLocation = bahaba_location_by_id((string) ($data['selected_location'] ?? ''));

if (!preg_match('/^[A-Za-z0-9._%+-]+@gmail\.com$/i', $email)) {
    respond(['error' => 'Please use a valid Gmail address ending in @gmail.com.'], 422);
}
$adminCheck = $pdo->prepare('SELECT id FROM admin_users WHERE email = :email LIMIT 1');
$adminCheck->execute(['email' => $email]);
if ($adminCheck->fetch()) {
    respond(['error' => 'This email is reserved for admin access and cannot be used for the app.'], 409);
}
if (strlen($username) < 3 || strlen($username) > 50) {
    respond(['error' => 'Username must be between 3 and 50 characters.'], 422);
}
if (strlen($password) < 8) {
    respond(['error' => 'Password must be at least 8 characters.'], 422);
}
if (!$selectedLocation) {
    respond(['error' => 'Choose one of the supported locations before creating your account.'], 422);
}

$token = bin2hex(random_bytes(32));
$tokenHash = hash('sha256', $token);
$expiresAt = (new DateTimeImmutable('+24 hours'))->format('Y-m-d H:i:s');

try {
    $statement = $pdo->prepare(
        'INSERT INTO users (email, username, password_hash, location, selected_location, region, city, barangays, verification_token_hash, verification_expires_at)
         VALUES (:email, :username, :password_hash, :location, :selected_location, :region, :city, :barangays, :token_hash, :expires_at)',
    );
    $statement->execute([
        'email' => $email,
        'username' => $username,
        'password_hash' => password_hash($password, PASSWORD_DEFAULT),
        'location' => trim((string) ($data['location'] ?? '')),
        'selected_location' => $selectedLocation['id'],
        'region' => $selectedLocation['region'],
        'city' => $selectedLocation['city'],
        'barangays' => json_encode([]),
        'token_hash' => $tokenHash,
        'expires_at' => $expiresAt,
    ]);
    $userId = (int) $pdo->lastInsertId();
} catch (PDOException $exception) {
    if ($exception->getCode() === '23000') {
        respond(['error' => 'That Gmail address or username is already registered.'], 409);
    }
    respond(['error' => 'Unable to create the account right now.'], 500);
}

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
    $mail->addAddress($email);
    $mail->isHTML(true);
    $mail->Subject = 'Activate your BAHABA account';
    $mail->Body = '<p>Welcome to BAHABA.</p><p><a href="' . htmlspecialchars($link, ENT_QUOTES) . '">Activate your account</a></p><p>This link expires in 24 hours.</p>';
    $mail->AltBody = "Activate your BAHABA account: $link";
    $mail->send();
} catch (Exception $exception) {
    $pdo->prepare('DELETE FROM users WHERE id = :id')->execute(['id' => $userId]);
    respond(['error' => 'The activation email could not be sent. Check your Gmail SMTP settings.'], 500);
}

$_SESSION['pending_user_id'] = $userId;
respond(['message' => 'Check your Gmail inbox for the activation link.']);
