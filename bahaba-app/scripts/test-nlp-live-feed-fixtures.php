<?php
/** Integration fixtures only. Never selects from or writes to the configured app database. */
declare(strict_types=1);

$action = $argv[1] ?? '';
$database = $argv[2] ?? '';
$directory = $argv[3] ?? '';
if (!preg_match('/^bahaba_nlp_live_test_[0-9]+_[a-f0-9]{6}$/D', $database)) {
    throw new RuntimeException('Refusing an unexpected integration database name.');
}
$testRoot = realpath(dirname(__DIR__) . '/nlp-live-feed-test.local');
$resolvedDirectory = realpath($directory);
if (!$testRoot || !$resolvedDirectory || !str_starts_with($resolvedDirectory . DIRECTORY_SEPARATOR, $testRoot . DIRECTORY_SEPARATOR)) {
    throw new RuntimeException('Fixture directory must remain inside nlp-live-feed-test.local.');
}
$testPort = getenv('BAHABA_NLP_TEST_MYSQL_PORT');
if ($testPort !== false && $testPort !== '') {
    if (!ctype_digit($testPort) || (int)$testPort < 10000 || (int)$testPort > 65535) throw new RuntimeException('Unexpected isolated MySQL port.');
    $connection = ['dsn' => 'mysql:host=127.0.0.1;port=' . $testPort . ';charset=utf8mb4', 'username' => 'root', 'password' => ''];
} else {
    $private = require dirname(__DIR__) . '/api/config.php';
    $connection = $private['db'];
}
$serverDsn = preg_replace('/;?dbname=[^;]*/i', '', $connection['dsn']);
$options = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC];
try {
    $pdo = new PDO($serverDsn, $connection['username'], $connection['password'], $options);
    $pdo->exec("SET time_zone = '+00:00'");
} catch (PDOException $error) {
    throw new RuntimeException('Integration database connection failed (SQLSTATE ' . $error->getCode() . ').');
}
if ($action === 'setup') {
    try {
        // No IF NOT EXISTS: a collision must never reuse somebody else's database.
        $pdo->exec("CREATE DATABASE `$database` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    } catch (PDOException $error) {
        throw new RuntimeException('Cannot create the isolated integration database (SQLSTATE ' . $error->getCode() . ').');
    }
    try {
        $pdo->exec("USE `$database`");
        $schema = file_get_contents(dirname(__DIR__) . '/api/schema.sql');
        $schema = preg_replace('/^CREATE DATABASE[^;]+;\s*USE[^;]+;/mi', '', $schema);
        // Let the actual generated admin endpoint create its complete admin table.
        $schema = preg_replace('/CREATE TABLE IF NOT EXISTS admin_users\s*\([\s\S]*?\);/i', '', $schema);
        $pdo->exec($schema);
        $config = [
            'db' => ['dsn' => $serverDsn . ';dbname=' . $database, 'username' => $connection['username'], 'password' => $connection['password']],
            'nlp_ingest_token' => 'isolated-live-feed-token',
            'trusted_social_publishers' => [],
            'frontend_origin' => 'http://127.0.0.1',
            'app_url' => 'http://127.0.0.1',
        ];
        file_put_contents($resolvedDirectory . '/api/config.php', "<?php return " . var_export($config, true) . ";\n");
        echo json_encode(['created' => $database]);
    } catch (Throwable $error) {
        $pdo->exec("DROP DATABASE `$database`");
        throw $error;
    }
    exit;
}
if ($action === 'drop') {
    $pdo->exec("DROP DATABASE `$database`");
    echo json_encode(['dropped' => $database]);
    exit;
}
$pdo->exec("USE `$database`");
if ($pdo->query('SELECT DATABASE()')->fetchColumn() !== $database) throw new RuntimeException('Isolated database check failed.');

if ($action === 'accounts') {
    $pdo->prepare('INSERT INTO admin_users(name,email,password_hash,role,city,assigned_location,org,barangay,status,acls) VALUES(?,?,?,?,?,?,?,?,?,?)')
        ->execute(['Integration admin', 'live-feed@example.com', password_hash('LiveFeedTest!26', PASSWORD_DEFAULT), 'platform-admin', 'Navotas City', 'navotas', 'Integration test', 'All barangays', 'active', json_encode(['admin_overview' => 'full', 'approval_board' => 'full'])]);
    $pdo->prepare('INSERT INTO users(email,username,password_hash,email_verified_at,selected_location,preferred_locations) VALUES(?,?,?,UTC_TIMESTAMP(),?,?)')
        ->execute(['live-resident@example.com', 'Live feed resident', password_hash('LiveFeedTest!26', PASSWORD_DEFAULT), 'navotas', '["1380900000"]']);
    echo json_encode(['accounts' => true]);
} elseif ($action === 'inspect') {
    echo json_encode($pdo->query('SELECT id,source_post_id,published_at,detected_at,received_at FROM nlp_events ORDER BY id')->fetchAll());
} elseif ($action === 'age-duplicate') {
    $pdo->exec("UPDATE nlp_events SET received_at=UTC_TIMESTAMP()-INTERVAL 2 HOUR WHERE source_post_id='live-fresh'");
    echo json_encode(['aged' => true]);
} elseif ($action === 'pages') {
    $query = $pdo->prepare("INSERT INTO nlp_events(source,source_post_id,post_text,city,location_id,barangay,classification,severity,urgency,confidence_percent,detected_at,published_at,received_at) VALUES('Test',?,'Synthetic flood in San Jose, Navotas','Navotas City','navotas','San Jose','Flood','High','Concerned',95,UTC_TIMESTAMP(),UTC_TIMESTAMP()-INTERVAL 2 MINUTE,UTC_TIMESTAMP())");
    for ($i = 0; $i < 105; $i++) $query->execute(['page-' . $i]);
    echo json_encode(['inserted' => 105]);
} elseif ($action === 'expire') {
    $pdo->exec("UPDATE nlp_events SET received_at=UTC_TIMESTAMP()-INTERVAL 25 HOUR WHERE source_post_id='live-fresh'");
    echo json_encode(['expired' => true]);
} else {
    throw new RuntimeException('Unknown fixture operation.');
}
