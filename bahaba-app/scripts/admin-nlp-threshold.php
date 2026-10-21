<?php
require_once __DIR__.'/nlp-flood-events.php';
require_once __DIR__.'/report-point.php';

/** Compatibility entry point: city alert lifecycle replaces per-barangay thresholds. */
function bahaba_nlp_threshold(PDO $pdo, ?string $locationId, string $barangay): array {
    global $input;
    return bahaba_process_city_flood_post($pdo,$locationId,$barangay,$input);
}
