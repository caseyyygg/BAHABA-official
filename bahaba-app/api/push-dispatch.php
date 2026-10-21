<?php
// Run as an AlwaysData scheduled task (CLI only), once per minute.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/bootstrap.php';

// Materialize active preliminary NLP signals even while no resident is polling.
$floodModule = null;
foreach ([dirname(__DIR__).'/nlp-flood-events.php', dirname(__DIR__, 2).'/nlp-flood-events.php', dirname(__DIR__, 2).'/deploy/render-api/admin-source/nlp-flood-events.php'] as $path) {
    if (is_file($path)) { $floodModule = $path; break; }
}
if ($floodModule) {
    require_once $floodModule;
    $snapshot = bahaba_flood_snapshot($pdo);
    $insert = $pdo->prepare("INSERT IGNORE INTO resident_notification_events(kind,record_id,psgc_id,city,province,title) VALUES('flood_signal',?,?,?,?,?)");
    foreach ($snapshot['cities'] as $city) {
        if (($city['phase'] ?? '') !== 'ACTIVE' || empty($city['event_id'])) continue;
        $location = bahaba_psgc_by_id((string) ($city['city_id'] ?? ''));
        if (!$location || !bahaba_psgc_is_luzon($location['id'])) continue;
        $insert->execute([(int) $city['event_id'], $location['id'], $location['city'] ?? $city['city_name'], $location['province'] ?? '', 'Preliminary flood signal in ' . ($location['city'] ?? $city['city_name'])]);
    }
}

$events = $pdo->query("SELECT kind,record_id FROM resident_notification_events WHERE created_at>=DATE_SUB(NOW(),INTERVAL 24 HOUR) ORDER BY id ASC LIMIT 500")->fetchAll();
foreach ($events as $event) {
    bahaba_send_resident_push($pdo, (string) $event['kind'], (int) $event['record_id']);
}
