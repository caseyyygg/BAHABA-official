<?php

function bahaba_psgc_locations(): array
{
    static $locations;
    if ($locations === null) {
        $data = json_decode(file_get_contents(dirname(__DIR__) . '/psgc-registry.json'), true);
        $locations = $data['locations'] ?? [];
    }
    return $locations;
}

function bahaba_psgc_by_id(string $id): ?array
{
    static $index;
    if ($index === null) $index = array_column(bahaba_psgc_locations(), null, 'id');
    return $index[$id] ?? null;
}

function bahaba_legacy_psgc(?string $id): ?string
{
    // Province IDs intentionally have no municipality mapping.
    return ['navotas' => '1380900000', 'marikina' => '1380700000', 'malolos' => '0301410000'][$id ?? ''] ?? null;
}

function bahaba_preferred_locations(array $user): array
{
    $saved = json_decode($user['preferred_locations'] ?? 'null', true);
    if (is_array($saved)) return array_values(array_unique(array_filter($saved, fn($id) => is_string($id) && bahaba_psgc_by_id($id))));
    $selected = $user['selected_location'] ?? '';
    $legacy = bahaba_psgc_by_id($selected) ? $selected : bahaba_legacy_psgc($selected);
    return $legacy ? [$legacy] : [];
}

function bahaba_ensure_psgc_schema(PDO $pdo): void
{
    $version = 'psgc_preferences_v2_' . substr(hash_file('sha256', dirname(__DIR__) . '/psgc-registry.json'), 0, 16);
    $check = $pdo->prepare('SELECT 1 FROM schema_migrations WHERE version = ?');
    $check->execute([$version]);
    if ($check->fetchColumn()) return;
    $lockName = 'bahaba_psgc_' . substr(hash('sha256', $pdo->query('SELECT DATABASE()')->fetchColumn()), 0, 16);
    $lock = $pdo->prepare('SELECT GET_LOCK(?, 30)');
    $lock->execute([$lockName]);
    if ((int) $lock->fetchColumn() !== 1) throw new RuntimeException('Location migration is busy; retry shortly.');
    try {
    $check->execute([$version]);
    if ($check->fetchColumn()) return;
    $pdo->exec("CREATE TABLE IF NOT EXISTS psgc_locations (
        id CHAR(10) PRIMARY KEY, city VARCHAR(150) NOT NULL, province VARCHAR(150) NOT NULL,
        region VARCHAR(150) NOT NULL, display_name VARCHAR(350) NOT NULL
    )");
    bahaba_ensure_column($pdo, 'psgc_locations', 'active', 'BOOLEAN NOT NULL DEFAULT TRUE');
    $pdo->exec('UPDATE psgc_locations SET active=FALSE');
    foreach (array_chunk(bahaba_psgc_locations(), 150) as $batch) {
        $psgcValues = [];
        $psgcPlaceholders = [];
        $legacyValues = [];
        $legacyPlaceholders = [];
        foreach ($batch as $location) {
            $psgcPlaceholders[] = '(?, ?, ?, ?, ?, TRUE)';
            array_push($psgcValues, $location['id'], $location['city'], $location['province'], $location['region'], $location['name']);
            $legacyPlaceholders[] = '(?, ?)';
            array_push($legacyValues, $location['id'], $location['city']);
        }
        $pdo->prepare('INSERT INTO psgc_locations (id, city, province, region, display_name, active) VALUES '
            . implode(', ', $psgcPlaceholders)
            . ' ON DUPLICATE KEY UPDATE city=VALUES(city), province=VALUES(province), region=VALUES(region), display_name=VALUES(display_name), active=TRUE')
            ->execute($psgcValues);
        $pdo->prepare('INSERT IGNORE INTO locations (id, display_name) VALUES ' . implode(', ', $legacyPlaceholders))
            ->execute($legacyValues);
    }
    bahaba_ensure_column($pdo, 'users', 'preferred_locations', 'JSON NULL');
    bahaba_ensure_column($pdo, 'users', 'preferences_updated_at', 'DATETIME(6) NULL');
    bahaba_ensure_column($pdo, 'users', 'notification_baseline_id', 'BIGINT UNSIGNED NOT NULL DEFAULT 0');
    bahaba_ensure_column($pdo, 'locations', 'psgc_id', 'CHAR(10) NULL');
    $pdo->exec('UPDATE locations l JOIN psgc_locations p ON BINARY p.id=BINARY l.id SET l.psgc_id=p.id');
    // Additive mapping: existing ACLs and province-wide assignments are never rewritten.
    foreach (['navotas', 'marikina', 'malolos'] as $id) {
        $pdo->prepare('UPDATE locations SET psgc_id = ? WHERE id = ?')->execute([bahaba_legacy_psgc($id), $id]);
    }
    $pdo->exec("UPDATE users u JOIN locations l ON BINARY l.id=BINARY u.selected_location SET u.preferred_locations=JSON_ARRAY(l.psgc_id) WHERE u.preferred_locations IS NULL AND l.psgc_id IS NOT NULL");
    $pdo->exec("CREATE TABLE IF NOT EXISTS location_mapping_review (
        entity_table VARCHAR(50) NOT NULL, entity_id VARCHAR(32) NOT NULL,
        original_value VARCHAR(255) NULL, reason VARCHAR(255) NOT NULL,
        reviewed_at DATETIME NULL, PRIMARY KEY(entity_table, entity_id)
    )");
    foreach (['reports', 'announcements', 'nlp_events', 'admin_users'] as $table) {
        if (!bahaba_table_exists($pdo, $table)) continue;
        bahaba_ensure_column($pdo, $table, 'psgc_id', 'CHAR(10) NULL');
        $column = $table === 'admin_users' ? 'assigned_location' : 'location_id';
        $pdo->exec("UPDATE `$table` t JOIN locations l ON BINARY l.id=BINARY t.`$column` SET t.psgc_id = l.psgc_id WHERE t.psgc_id IS NULL AND l.psgc_id IS NOT NULL");
        $pdo->exec("INSERT IGNORE INTO location_mapping_review (entity_table, entity_id, original_value, reason)
            SELECT '$table', id, city, 'Unmapped or retired location; verify province and municipality before assigning PSGC' FROM `$table` t WHERE psgc_id IS NULL OR NOT EXISTS (SELECT 1 FROM psgc_locations p WHERE BINARY p.id=BINARY t.psgc_id AND p.active=TRUE)");
    }
    $pdo->exec("INSERT IGNORE INTO location_mapping_review (entity_table, entity_id, original_value, reason)
        SELECT 'users', u.id, u.selected_location, 'Legacy scope is not an explicitly mapped municipality' FROM users u LEFT JOIN locations l ON BINARY l.id=BINARY u.selected_location WHERE u.selected_location IS NOT NULL AND l.psgc_id IS NULL");
    $reviewPreference = $pdo->prepare("INSERT IGNORE INTO location_mapping_review (entity_table,entity_id,original_value,reason) VALUES ('users', ?, ?, 'Retired or unknown preference codes; retain original values and review explicit PSGC crosswalk')");
    foreach ($pdo->query('SELECT id,preferred_locations FROM users WHERE preferred_locations IS NOT NULL') as $user) {
        $ids = json_decode($user['preferred_locations'], true);
        if (!is_array($ids)) continue;
        $unknown = array_filter($ids, fn($id) => !is_string($id) || !bahaba_psgc_by_id($id));
        if ($unknown) $reviewPreference->execute([$user['id'], substr(json_encode(array_values($unknown)), 0, 255)]);
    }
    $pdo->exec("CREATE TABLE IF NOT EXISTS resident_notification_events (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        kind VARCHAR(20) NOT NULL, record_id BIGINT UNSIGNED NOT NULL,
        psgc_id CHAR(10) NOT NULL, city VARCHAR(150) NOT NULL, province VARCHAR(150) NOT NULL,
        barangay VARCHAR(150) NULL, title VARCHAR(255) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY event_record(kind, record_id), INDEX event_location(psgc_id, id)
    ) ENGINE=InnoDB");
    $pdo->exec('CREATE TABLE IF NOT EXISTS resident_notification_clock (id TINYINT PRIMARY KEY, tick BIGINT UNSIGNED NOT NULL) ENGINE=InnoDB');
    $pdo->exec('INSERT IGNORE INTO resident_notification_clock (id,tick) VALUES (1,0)');
    // Notification capture may need privileges unavailable on managed MySQL.
    // Keep core account/map schema usable; the notification endpoint checks readiness.
    try { bahaba_ensure_notification_triggers($pdo); }
    catch (PDOException $error) {
        if (!in_array((int)($error->errorInfo[1] ?? 0), [1419,1227,1142], true)) throw $error;
        error_log('BAHABA notification triggers unavailable: database privileges required.');
    }
    bahaba_sync_notification_events($pdo);
    foreach (['reports' => ['idx_resident_report_map', '(status, longitude, latitude, id)'],
              'announcements' => ['idx_resident_advisory_status', '(status, id)']] as $table => [$index, $columns]) {
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=?');
        $stmt->execute([$table, $index]);
        if (!(int) $stmt->fetchColumn()) $pdo->exec("CREATE INDEX `$index` ON `$table` $columns");
    }
    $pdo->prepare('INSERT IGNORE INTO schema_migrations (version) VALUES (?)')->execute([$version]);
    } finally {
        $pdo->prepare('SELECT RELEASE_LOCK(?)')->execute([$lockName]);
    }
}

function bahaba_sync_notification_events(PDO $pdo): void
{
    foreach (['flood' => ['reports', "t.status = 'verified'", "CONCAT(UPPER(t.severity), ' flood report')"],
              'advisory' => ['announcements', "t.status = 'published'", 't.title']] as $kind => [$table, $where, $title]) {
        $pdo->exec("INSERT IGNORE INTO resident_notification_events (kind, record_id, psgc_id, city, province, barangay, title)
            SELECT '$kind', t.id, p.id, p.city, p.province, t.barangay, $title FROM `$table` t
            LEFT JOIN locations l ON BINARY l.id=BINARY t.location_id JOIN psgc_locations p ON BINARY p.id=BINARY COALESCE(t.psgc_id, l.psgc_id)
            LEFT JOIN resident_notification_events existing ON existing.kind='$kind' AND existing.record_id=t.id
            WHERE $where AND existing.id IS NULL");
    }
}

function bahaba_ensure_notification_triggers(PDO $pdo): void
{
    $ready = (int)$pdo->query("SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME IN ('bahaba_resident_reports_insert','bahaba_resident_reports_update','bahaba_resident_announcements_insert','bahaba_resident_announcements_update')")->fetchColumn();
    if ($ready === 4) return;
    $lockName = 'bahaba_notify_' . substr(hash('sha256', $pdo->query('SELECT DATABASE()')->fetchColumn()), 0, 16);
    $lock = $pdo->prepare('SELECT GET_LOCK(?, 5)');
    $lock->execute([$lockName]);
    if ((int)$lock->fetchColumn() !== 1) throw new RuntimeException('Notification setup is busy; retry shortly.');
    try {
    // Capture publication/verification at the database write, including writes from
    // connected admin APIs. This prevents discovery-time replay after scope changes.
    foreach (['reports' => ['flood', 'verified', "CONCAT(UPPER(NEW.severity), ' flood report')"],
              'announcements' => ['advisory', 'published', 'NEW.title']] as $table => [$kind, $status, $title]) {
        foreach (['INSERT', 'UPDATE'] as $operation) {
            $trigger = 'bahaba_resident_' . $table . '_' . strtolower($operation);
            $stmt = $pdo->prepare('SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME=?');
            $stmt->execute([$trigger]);
            if (!(int) $stmt->fetchColumn()) $pdo->exec("CREATE TRIGGER `$trigger` AFTER $operation ON `$table` FOR EACH ROW
                BEGIN IF NEW.status='$status' AND NOT EXISTS (SELECT 1 FROM resident_notification_events WHERE kind='$kind' AND record_id=NEW.id) THEN
                    UPDATE resident_notification_clock SET tick=tick+1 WHERE id=1;
                    INSERT IGNORE INTO resident_notification_events (kind, record_id, psgc_id, city, province, barangay, title)
                    SELECT '$kind', NEW.id, p.id, p.city, p.province, NEW.barangay, $title
                    FROM psgc_locations p LEFT JOIN locations l ON BINARY l.id=BINARY NEW.location_id
                    WHERE BINARY p.id=BINARY COALESCE(NEW.psgc_id,l.psgc_id);
                END IF; END");
        }
    }
    } finally {
        $pdo->prepare('SELECT RELEASE_LOCK(?)')->execute([$lockName]);
    }
}
