<?php
// Private diagnostic: run from SSH or an AlwaysData scheduled task only.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
ini_set('display_errors', 'stderr');
ini_set('log_errors', '1');
ini_set('error_log', 'php://stderr');
$_SERVER['REQUEST_METHOD'] = 'CLI';
require __DIR__ . '/bootstrap.php';
echo "BANTALA push diagnostic\n";
try {
    bahaba_ensure_push_schema($pdo);
    $devices = (int) $pdo->query("SELECT COUNT(*) FROM resident_push_devices WHERE platform='android'")->fetchColumn();
    echo "Registered Android devices: $devices\n";
    echo 'Saved deliveries: ' . $pdo->query('SELECT COUNT(*) FROM resident_push_deliveries')->fetchColumn() . "\n";
    echo 'Recent alert events: ' . $pdo->query('SELECT COUNT(*) FROM resident_notification_events WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)')->fetchColumn() . "\n";
    $auth = bahaba_fcm_access_token();
    echo 'Firebase authentication: OK; project: ' . $auth['project'] . "\n";
    $keyPath = (string) (getenv('FCM_SERVICE_ACCOUNT_PATH') ?: ($config['fcm_service_account_path'] ?? ''));
    $service = json_decode((string) file_get_contents($keyPath), true);
    echo 'Actual service account: ' . ($service['client_email'] ?? 'unknown') . "\n";
    $deviceToken = $pdo->query("SELECT token_value FROM resident_push_devices WHERE platform='android' ORDER BY updated_at DESC LIMIT 1")->fetchColumn();
    if ($deviceToken) {
        // validate_only checks send authorization without delivering a message.
        $context = stream_context_create(['http' => [
            'method' => 'POST', 'timeout' => 15, 'ignore_errors' => true,
            'header' => "Authorization: Bearer {$auth['token']}\r\nContent-Type: application/json\r\n",
            'content' => json_encode(['validate_only' => true, 'message' => ['token' => $deviceToken, 'notification' => ['title' => 'Diagnostic', 'body' => 'Validation only']]], JSON_THROW_ON_ERROR),
        ]]);
        $response = @file_get_contents('https://fcm.googleapis.com/v1/projects/' . rawurlencode($auth['project']) . '/messages:send', false, $context);
        $result = is_string($response) ? json_decode($response, true) : null;
        echo 'Send validation: ' . ($http_response_header[0] ?? 'No HTTP response') . "\n";
        if (isset($result['error'])) {
            $message = (string) ($result['error']['message'] ?? 'No error description');
            echo 'Firebase explanation: ' . str_replace([$deviceToken, $auth['token']], '[REDACTED]', $message) . "\n";
            foreach (($result['error']['details'] ?? []) as $detail) {
                foreach (['permission', 'resource', 'service', 'consumer'] as $field) {
                    if (isset($detail['metadata'][$field])) echo "$field: " . $detail['metadata'][$field] . "\n";
                }
            }
        }
    }
    if (!$devices) echo "ACTION: No Android device is registered. Open the latest APK and sign in again.\n";
    echo "No test notifications were sent.\n";
} catch (Throwable $error) {
    fwrite(STDERR, 'Push diagnostic failed: ' . $error->getMessage() . "\n");
    exit(1);
}
