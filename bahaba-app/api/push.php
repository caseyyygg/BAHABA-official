<?php

/** Additive storage for authenticated native push registrations. */
function bahaba_ensure_push_schema(PDO $pdo): void
{
    bahaba_ensure_column($pdo, 'users', 'push_notifications_enabled', 'BOOLEAN NOT NULL DEFAULT TRUE');
    bahaba_ensure_column($pdo, 'users', 'flood_notifications_enabled', 'BOOLEAN NOT NULL DEFAULT TRUE');
    $pdo->exec("CREATE TABLE IF NOT EXISTS resident_push_devices (
        token_hash CHAR(64) PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL,
        platform ENUM('android','web') NOT NULL DEFAULT 'android',
        token_value TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX push_device_user (user_id),
        CONSTRAINT fk_push_device_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB");
    $pdo->exec("CREATE TABLE IF NOT EXISTS resident_push_deliveries (
        event_id BIGINT UNSIGNED NOT NULL,
        token_hash CHAR(64) NOT NULL,
        delivered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (event_id, token_hash)
    ) ENGINE=InnoDB");
}

function bahaba_push_b64url(string $value): string
{
    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}

/** Exchange a server-only service-account key for a short-lived FCM OAuth token. */
function bahaba_fcm_access_token(): array
{
    static $cached;
    if ($cached && $cached['expires'] > time() + 30) return $cached;
    global $config;
    $keyPath = (string) (getenv('FCM_SERVICE_ACCOUNT_PATH') ?: ($config['fcm_service_account_path'] ?? ''));
    if ($keyPath === '' || !is_readable($keyPath)) throw new RuntimeException('FCM credentials are not configured.');
    $service = json_decode((string) file_get_contents($keyPath), true);
    if (!is_array($service) || empty($service['client_email']) || empty($service['private_key']) || empty($service['project_id'])) {
        throw new RuntimeException('FCM credentials are invalid.');
    }
    $now = time();
    $header = bahaba_push_b64url(json_encode(['alg' => 'RS256', 'typ' => 'JWT'], JSON_THROW_ON_ERROR));
    $claim = bahaba_push_b64url(json_encode([
        'iss' => $service['client_email'],
        'scope' => 'https://www.googleapis.com/auth/firebase.messaging',
        'aud' => 'https://oauth2.googleapis.com/token',
        'iat' => $now,
        'exp' => $now + 3600,
    ], JSON_THROW_ON_ERROR));
    $unsigned = $header . '.' . $claim;
    $privateKey = openssl_pkey_get_private($service['private_key']);
    if (!$privateKey || !openssl_sign($unsigned, $signature, $privateKey, OPENSSL_ALGO_SHA256)) {
        throw new RuntimeException('FCM credentials could not be used.');
    }
    $assertion = $unsigned . '.' . bahaba_push_b64url($signature);
    $context = stream_context_create(['http' => [
        'method' => 'POST', 'timeout' => 12, 'ignore_errors' => true,
        'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
        'content' => http_build_query([
            'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion' => $assertion,
        ]),
    ]]);
    $response = @file_get_contents('https://oauth2.googleapis.com/token', false, $context);
    $payload = is_string($response) ? json_decode($response, true) : null;
    if (!is_array($payload) || empty($payload['access_token'])) throw new RuntimeException('FCM authentication failed.');
    $cached = ['token' => (string) $payload['access_token'], 'project' => (string) $service['project_id'], 'expires' => $now + (int) ($payload['expires_in'] ?? 3600)];
    return $cached;
}

/** Send one notification through FCM HTTP v1. No service credentials leave PHP. */
function bahaba_fcm_send(string $deviceToken, array $notification, array $data): array
{
    $auth = bahaba_fcm_access_token();
    $message = [
        'message' => [
            'token' => $deviceToken,
            'notification' => ['title' => $notification['title'], 'body' => $notification['body']],
            'data' => array_map(static fn($value) => (string) $value, $data),
            'android' => [
                'priority' => 'HIGH',
                'notification' => ['channel_id' => 'flood-alerts', 'sound' => 'default', 'tag' => $data['tag'] ?? 'bantala-alert'],
            ],
        ],
    ];
    $context = stream_context_create(['http' => [
        'method' => 'POST', 'timeout' => 12, 'ignore_errors' => true,
        'header' => "Authorization: Bearer {$auth['token']}\r\nContent-Type: application/json; charset=utf-8\r\n",
        'content' => json_encode($message, JSON_THROW_ON_ERROR),
    ]]);
    $response = @file_get_contents('https://fcm.googleapis.com/v1/projects/' . rawurlencode($auth['project']) . '/messages:send', false, $context);
    $statusLine = $http_response_header[0] ?? '';
    preg_match('/\s(\d{3})\s/', $statusLine, $matches);
    $status = (int) ($matches[1] ?? 0);
    $result = is_string($response) ? json_decode($response, true) : null;
    if ($status >= 200 && $status < 300 && is_array($result)) return ['ok' => true];
    $body = is_array($result) ? $result : [];
    $reason = (string) ($body['error']['details'][0]['errorCode'] ?? $body['error']['status'] ?? '');
    foreach (($body['error']['details'] ?? []) as $detail) {
        if (!empty($detail['errorCode']) || !empty($detail['reason'])) {
            $reason = (string) ($detail['errorCode'] ?? $detail['reason']);
            break;
        }
    }
    // Log only the machine-readable error, never credentials or device tokens.
    $reason = preg_replace('/[^A-Z0-9_]/', '', strtoupper($reason));
    return ['ok' => false, 'invalid_token' => $reason === 'UNREGISTERED', 'status' => $status, 'reason' => $reason];
}

/** Dispatch an event already recorded in resident_notification_events. */
function bahaba_send_resident_push(PDO $pdo, string $kind, int $recordId): void
{
    if (!in_array($kind, ['flood', 'advisory', 'flood_signal'], true) || $recordId <= 0) return;
    $eventQuery = $pdo->prepare('SELECT * FROM resident_notification_events WHERE kind=? AND record_id=? LIMIT 1');
    $eventQuery->execute([$kind, $recordId]);
    $event = $eventQuery->fetch();
    if (!$event) return;
    if ($kind === 'flood') {
        $check = $pdo->prepare("SELECT 1 FROM reports WHERE id=? AND status='verified'");
        $check->execute([$recordId]);
        if (!$check->fetchColumn()) return;
    } elseif ($kind === 'advisory') {
        $check = $pdo->prepare("SELECT 1 FROM announcements WHERE id=? AND status='published' AND (expires_at IS NULL OR expires_at>NOW())");
        $check->execute([$recordId]);
        if (!$check->fetchColumn()) return;
    } else {
        $check = $pdo->prepare("SELECT 1 FROM nlp_city_flood_events WHERE id=? AND status='ACTIVE' AND last_post_at>=DATE_SUB(UTC_TIMESTAMP(), INTERVAL 60 MINUTE)");
        $check->execute([$recordId]);
        if (!$check->fetchColumn()) return;
    }
    if (!bahaba_psgc_is_luzon((string) $event['psgc_id'])) return;
    $users = $pdo->query('SELECT id, preferred_locations, selected_location, push_notifications_enabled, flood_notifications_enabled, email_verified_at FROM users WHERE push_notifications_enabled=1 AND email_verified_at IS NOT NULL')->fetchAll();
    $devices = $pdo->prepare('SELECT d.token_hash,d.token_value FROM resident_push_devices d WHERE d.user_id=? AND d.platform=\'android\'');
    $delivered = $pdo->prepare('SELECT 1 FROM resident_push_deliveries WHERE event_id=? AND token_hash=?');
    $markDelivered = $pdo->prepare('INSERT IGNORE INTO resident_push_deliveries(event_id,token_hash) VALUES(?,?)');
    $title = (string) $event['title'];
    if ($kind === 'flood_signal') $title = 'Preliminary flood signal: ' . (string) $event['city'];
    $body = implode(' · ', array_filter([(string) $event['city'], (string) $event['province'], (string) ($event['barangay'] ?? '')]));
    $payload = ['kind' => $kind, 'record_id' => $recordId, 'event_id' => (int) $event['id'], 'psgc_id' => (string) $event['psgc_id'], 'city' => (string) $event['city'], 'route' => '/?alert=' . rawurlencode($kind . ':' . $recordId), 'tag' => 'bantala-' . $kind . '-' . $recordId];
    foreach ($users as $user) {
        if (in_array($kind, ['flood', 'flood_signal'], true) && !(bool) $user['flood_notifications_enabled']) continue;
        $preferences = bahaba_preferred_locations($user);
        if (!$preferences && !empty($user['selected_location'])) {
            $selected = (string) $user['selected_location'];
            $preferences = bahaba_psgc_by_id($selected) ? [$selected] : [];
        }
        if (!in_array((string) $event['psgc_id'], $preferences, true)) continue;
        $devices->execute([(int) $user['id']]);
        foreach ($devices->fetchAll() as $device) {
            $delivered->execute([(int) $event['id'], $device['token_hash']]);
            if ($delivered->fetchColumn()) continue;
            try {
                $sent = bahaba_fcm_send($device['token_value'], ['title' => 'BANTALA: ' . $title, 'body' => $body ?: 'A flood-related update is available.'], $payload);
                if ($sent['ok']) $markDelivered->execute([(int) $event['id'], $device['token_hash']]);
                elseif ($sent['invalid_token']) $pdo->prepare('DELETE FROM resident_push_devices WHERE token_hash=?')->execute([$device['token_hash']]);
                else error_log('BANTALA FCM delivery failed for event ' . (int) $event['id'] . ' (HTTP ' . (int) $sent['status'] . '; reason ' . ($sent['reason'] ?: 'UNKNOWN') . ').');
            } catch (Throwable $error) {
                error_log('BANTALA FCM delivery unavailable for event ' . (int) $event['id'] . ': ' . $error->getMessage());
            }
        }
    }
}

/** Create a resident feed event and push once for a newly activated NLP event. */
function bahaba_publish_flood_signal_push(PDO $pdo, int $eventId): void
{
    $query = $pdo->prepare('SELECT city_id, city_name FROM nlp_city_flood_events WHERE id=? AND status=\'ACTIVE\'');
    $query->execute([$eventId]);
    $city = $query->fetch();
    if (!$city) return;
    $psgc = bahaba_psgc_by_id((string) $city['city_id']);
    if (!$psgc || !bahaba_psgc_is_luzon($psgc['id'])) return;
    $insert = $pdo->prepare("INSERT IGNORE INTO resident_notification_events(kind,record_id,psgc_id,city,province,title) VALUES('flood_signal',?,?,?,?,?)");
    $insert->execute([$eventId, $psgc['id'], $psgc['city'] ?? $city['city_name'], $psgc['province'] ?? '', 'Preliminary flood signal in ' . ($psgc['city'] ?? $city['city_name'])]);
    bahaba_send_resident_push($pdo, 'flood_signal', $eventId);
}
