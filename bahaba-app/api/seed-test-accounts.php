<?php

declare(strict_types=1);

$configPath = __DIR__ . '/config.php';
if (!is_file($configPath)) {
    fwrite(STDERR, "Create api/config.php from api/config.example.php first.\n");
    exit(1);
}

$config = require $configPath;

try {
    $pdo = new PDO(
        $config['db']['dsn'],
        $config['db']['username'],
        $config['db']['password'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC],
    );

    $locationConfig = json_decode(
        (string) file_get_contents(dirname(__DIR__) . '/location-config.json'),
        true,
        512,
        JSON_THROW_ON_ERROR,
    );
    $locationsById = [];
    $saveLocation = $pdo->prepare(
        'INSERT INTO locations (id, display_name) VALUES (:id, :display_name)
         ON DUPLICATE KEY UPDATE display_name = VALUES(display_name)',
    );
    foreach ($locationConfig['locations'] ?? [] as $location) {
        $locationsById[$location['id']] = $location;
        $saveLocation->execute(['id' => $location['id'], 'display_name' => $location['name']]);
    }

    $accounts = [
        ['bahaba.user.navotas@example.com', 'navotas'],
        ['bahaba.user.bulacan@example.com', 'bulacan'],
        ['bahaba.user.marikina@example.com', 'marikina'],
        ['bahaba.user.pampanga@example.com', 'pampanga'],
        ['bahaba.user.malolos@example.com', 'malolos'],
        ['bahaba.lgu.navotas@example.com', 'navotas'],
        ['bahaba.lgu.bulacan@example.com', 'bulacan'],
        ['bahaba.lgu.marikina@example.com', 'marikina'],
        ['bahaba.lgu.pampanga@example.com', 'pampanga'],
        ['bahaba.lgu.malolos@example.com', 'malolos'],
    ];
    $passwordHash = password_hash('FloodTest!26', PASSWORD_DEFAULT);
    $saveUser = $pdo->prepare(
        'INSERT INTO users (email, username, password_hash, selected_location, region, city, barangays, email_verified_at)
         VALUES (:email, :username, :password_hash, :selected_location, :region, :city, :barangays, NOW())
         ON DUPLICATE KEY UPDATE
           username = VALUES(username),
           password_hash = VALUES(password_hash),
           selected_location = VALUES(selected_location),
           region = VALUES(region),
           city = VALUES(city),
           barangays = VALUES(barangays),
           email_verified_at = COALESCE(email_verified_at, NOW())',
    );

    $pdo->beginTransaction();
    foreach ($accounts as [$email, $locationId]) {
        if (!isset($locationsById[$locationId])) {
            throw new RuntimeException("Unknown configured location: {$locationId}");
        }
        $location = $locationsById[$locationId];
        $saveUser->execute([
            'email' => $email,
            'username' => strstr($email, '@', true),
            'password_hash' => $passwordHash,
            'selected_location' => $location['id'],
            'region' => $location['region'],
            'city' => $location['city'],
            'barangays' => json_encode([], JSON_THROW_ON_ERROR),
        ]);
    }
    $pdo->commit();

    fwrite(STDOUT, "Created or updated 10 verified BAHABA test accounts.\n");
} catch (Throwable $exception) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fwrite(STDERR, "Unable to seed test accounts: {$exception->getMessage()}\n");
    exit(1);
}
