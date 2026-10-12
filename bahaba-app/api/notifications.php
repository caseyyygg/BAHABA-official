<?php
require __DIR__ . '/bootstrap.php';
header('Cache-Control: no-store, private');
if ($_SERVER['REQUEST_METHOD'] !== 'GET') respond(['error' => 'Method not allowed.'], 405);
$user = bahaba_authenticated_app_user($pdo);
if (!$user) respond(['error' => 'Sign in first.'], 401);
try {
    bahaba_ensure_notification_triggers($pdo);
} catch (PDOException $error) {
    if (!in_array((int)($error->errorInfo[1] ?? 0), [1419,1227,1142], true)) throw $error;
    respond(['error' => 'Live notifications are unavailable until the database administrator enables notification triggers. You can still browse reports and advisories.'], 503);
}
$latest = (string) $pdo->query('SELECT COALESCE(MAX(id), 0) FROM resident_notification_events')->fetchColumn();
if (!isset($_GET['after'])) respond(['events' => [], 'cursor' => $latest]);
$after = (string) $_GET['after'];
if (!ctype_digit($after)) respond(['error' => 'Invalid cursor.'], 422);
$after = (string) max((int) $after, (int) ($user['notification_baseline_id'] ?? 0));
$ids = bahaba_preferred_locations($user);
$current = (string) ($_GET['current'] ?? '');
if ($current !== '' && bahaba_psgc_by_id($current)) $ids[] = $current;
$ids = array_values(array_unique($ids));
if (!$ids) respond(['events' => [], 'cursor' => $latest]);
$placeholders = implode(',', array_fill(0, count($ids), '?'));
$stmt = $pdo->prepare("SELECT e.* FROM resident_notification_events e
    LEFT JOIN reports r ON e.kind='flood' AND r.id=e.record_id
    LEFT JOIN announcements a ON e.kind='advisory' AND a.id=e.record_id
    WHERE e.id > ? AND e.id <= ? AND e.psgc_id IN ($placeholders)
      AND ((e.kind='flood' AND r.status='verified') OR (e.kind='advisory' AND a.status='published' AND a.expires_at > NOW()))
    ORDER BY e.id LIMIT 200");
$stmt->execute(array_merge([$after, $latest], $ids));
$events = $stmt->fetchAll();
respond(['events' => $events, 'cursor' => count($events) === 200 ? (string) end($events)['id'] : $latest]);
