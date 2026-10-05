<?php

function bahaba_supported_locations(): array
{
    static $locations;
    if (isset($locations)) {
        return $locations;
    }

    $config = json_decode((string) file_get_contents(dirname(__DIR__) . '/location-config.json'), true);
    $locations = is_array($config['locations'] ?? null) ? $config['locations'] : [];
    return $locations;
}

function bahaba_location_by_id(string $locationId): ?array
{
    foreach (bahaba_supported_locations() as $location) {
        if ($location['id'] === strtolower(trim($locationId))) {
            return $location;
        }
    }
    return null;
}

function bahaba_normalize_location_id(?string $value): ?string
{
    $value = strtolower(trim((string) $value));
    if ($value === '') {
        return null;
    }

    foreach (bahaba_supported_locations() as $location) {
        $values = array_merge([$location['id'], $location['name'], $location['city']], $location['aliases'] ?? []);
        foreach ($values as $candidate) {
            if ($value === strtolower(trim((string) $candidate))) {
                return $location['id'];
            }
        }
    }
    return null;
}

function bahaba_location_display_name(?string $locationId): ?string
{
    $location = bahaba_location_by_id((string) $locationId);
    return $location['name'] ?? null;
}

function bahaba_authenticated_app_user(PDO $pdo): ?array
{
    if (empty($_SESSION['user_id'])) {
        return null;
    }

    $statement = $pdo->prepare('SELECT * FROM users WHERE id = :id LIMIT 1');
    $statement->execute(['id' => (int) $_SESSION['user_id']]);
    return $statement->fetch() ?: null;
}

function bahaba_table_exists(PDO $pdo, string $table): bool
{
    $statement = $pdo->prepare('SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table');
    $statement->execute(['table' => $table]);
    return (int) $statement->fetchColumn() > 0;
}

function bahaba_ensure_column(PDO $pdo, string $table, string $column, string $definition): bool
{
    $statement = $pdo->prepare('SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = :column');
    $statement->execute(['table' => $table, 'column' => $column]);
    if ((int) $statement->fetchColumn() === 0) {
        $pdo->exec("ALTER TABLE `{$table}` ADD COLUMN `{$column}` {$definition}");
        return true;
    }
    return false;
}

function bahaba_ensure_location_foreign_key(PDO $pdo, string $table, string $column, string $onDelete = 'SET NULL'): void
{
    $constraint = "fk_{$table}_{$column}";
    $statement = $pdo->prepare('SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = :column AND REFERENCED_TABLE_NAME = :referenced_table');
    $statement->execute(['table' => $table, 'column' => $column, 'referenced_table' => 'locations']);
    if ((int) $statement->fetchColumn() === 0) {
        $pdo->exec("ALTER TABLE `{$table}` ADD CONSTRAINT `{$constraint}` FOREIGN KEY (`{$column}`) REFERENCES locations (id) ON UPDATE CASCADE ON DELETE {$onDelete}");
    }
}

function bahaba_backfill_location_ids(PDO $pdo, string $table, string $cityColumn, string $locationColumn): void
{
    if (!bahaba_table_exists($pdo, $table)) {
        return;
    }

    foreach (bahaba_supported_locations() as $location) {
        $aliases = array_values(array_unique(array_map('strtolower', array_merge(
            [$location['name'], $location['city']],
            $location['aliases'] ?? []
        ))));
        $placeholders = implode(', ', array_fill(0, count($aliases), '?'));
        $statement = $pdo->prepare("UPDATE `{$table}` SET `{$locationColumn}` = ? WHERE `{$locationColumn}` IS NULL AND LOWER(TRIM(`{$cityColumn}`)) IN ({$placeholders})");
        $statement->execute(array_merge([$location['id']], $aliases));
    }
}

function bahaba_ensure_location_schema(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(100) PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $migrationCheck = $pdo->prepare('SELECT 1 FROM schema_migrations WHERE version = :version LIMIT 1');
    $hasMigration = static function (string $version) use ($migrationCheck): bool {
        $migrationCheck->execute(['version' => $version]);
        return (bool) $migrationCheck->fetchColumn();
    };
    $markMigration = $pdo->prepare('INSERT IGNORE INTO schema_migrations (version) VALUES (:version)');

    $pdo->exec("CREATE TABLE IF NOT EXISTS locations (
        id VARCHAR(32) PRIMARY KEY,
        display_name VARCHAR(100) NOT NULL
    )");
    if (!$hasMigration('location_registry_v1')) {
        $saveLocation = $pdo->prepare('INSERT INTO locations (id, display_name) VALUES (:id, :display_name) ON DUPLICATE KEY UPDATE display_name = VALUES(display_name)');
        foreach (bahaba_supported_locations() as $location) {
            $saveLocation->execute(['id' => $location['id'], 'display_name' => $location['name']]);
        }
        $markMigration->execute(['version' => 'location_registry_v1']);
    }

    $tableMigrations = ['users' => ['city', 'selected_location']];
    foreach ([
        'admin_users' => ['city', 'assigned_location'],
        'reports' => ['city', 'location_id'],
        'announcements' => ['city', 'location_id'],
        'nlp_events' => ['city', 'location_id'],
    ] as $table => $columns) {
        $tableMigrations[$table] = $columns;
    }

    foreach ($tableMigrations as $table => [$cityColumn, $locationColumn]) {
        $version = 'location_access_' . $table . '_v1';
        if ($hasMigration($version) || !bahaba_table_exists($pdo, $table)) {
            continue;
        }
        bahaba_ensure_column($pdo, $table, $locationColumn, 'VARCHAR(32) NULL');
        bahaba_backfill_location_ids($pdo, $table, $cityColumn, $locationColumn);
        bahaba_ensure_location_foreign_key($pdo, $table, $locationColumn);
        $markMigration->execute(['version' => $version]);
    }

    $pdo->exec("CREATE TABLE IF NOT EXISTS command_centers (
        location_id VARCHAR(32) PRIMARY KEY,
        name VARCHAR(255) NOT NULL DEFAULT '',
        hotline VARCHAR(100) NOT NULL DEFAULT '',
        telephone VARCHAR(100) NOT NULL DEFAULT '',
        mobile_number VARCHAR(100) NOT NULL DEFAULT '',
        address VARCHAR(500) NOT NULL DEFAULT '',
        email VARCHAR(254) NOT NULL DEFAULT '',
        facebook_page VARCHAR(500) NOT NULL DEFAULT '',
        emergency_contact TEXT NOT NULL,
        other_information TEXT NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS evacuation_centers (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        location_id VARCHAR(32) NOT NULL,
        city VARCHAR(150) NOT NULL,
        barangay VARCHAR(150) NOT NULL,
        name VARCHAR(255) NOT NULL,
        address VARCHAR(500) NOT NULL DEFAULT '',
        capacity INT UNSIGNED NOT NULL,
        evacuees INT UNSIGNED NOT NULL DEFAULT 0,
        created_by VARCHAR(255) NOT NULL,
        created_by_admin_id BIGINT UNSIGNED NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_evacuation_centers_location_barangay (location_id, barangay),
        CONSTRAINT fk_evacuation_centers_location FOREIGN KEY (location_id) REFERENCES locations (id) ON UPDATE CASCADE ON DELETE CASCADE
    )");
    bahaba_ensure_column($pdo, 'evacuation_centers', 'created_by_admin_id', 'BIGINT UNSIGNED NULL');

    if (!$hasMigration('location_access_command_centers_v1')) {
        bahaba_ensure_location_foreign_key($pdo, 'command_centers', 'location_id', 'CASCADE');
        $markMigration->execute(['version' => 'location_access_command_centers_v1']);
    }
}
