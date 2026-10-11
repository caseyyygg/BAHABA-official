<?php
// Isolated test database only; never reads api/config.php.
require dirname(__DIR__) . '/api/location_helpers.php';
require dirname(__DIR__) . '/api/psgc.php';
$pdo = new PDO('mysql:host=127.0.0.1;port=33317;charset=utf8mb4', 'root', '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$action = $argv[1] ?? 'setup';
$database = 'bahaba_psgc_integration_test';
if ($action === 'setup') {
    $pdo->exec("DROP DATABASE IF EXISTS $database");
    $pdo->exec("CREATE DATABASE $database CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
}
$pdo->exec("USE $database");
if ($action === 'setup') {
    $schema = file_get_contents(dirname(__DIR__) . '/api/schema.sql');
    $schema = preg_replace('/CREATE DATABASE[^;]+;|USE bahaba;/i', '', $schema);
    $pdo->exec($schema);
    bahaba_ensure_location_schema($pdo);
    $stmt = $pdo->prepare('INSERT INTO users (email,username,password_hash,selected_location,city,barangays,email_verified_at) VALUES (?,?,?,?,?,?,NOW())');
    $stmt->execute(['resident@gmail.com','Resident',password_hash('TestPassword123!',PASSWORD_DEFAULT),'navotas','Navotas City','[]']);
    $stmt->execute(['legacy@gmail.com','Legacy',password_hash('TestPassword123!',PASSWORD_DEFAULT),'pampanga','Pampanga','[]']);
    $pdo->exec("INSERT INTO admin_users (email,username,password_hash,assigned_location,city) VALUES ('admin@example.com','Admin','unused','pampanga','Pampanga')");
    $pdo->exec("INSERT INTO reports (city,barangay,severity,reporter,description,status,location_id,latitude,longitude) VALUES
        ('Navotas City','San Jose','high','PRIVATE REPORTER','Existing baseline report','verified','navotas',14.65,120.95),
        ('Pampanga','Unknown','medium','PRIVATE REPORTER','Ambiguous legacy province report','verified','pampanga',15.0,120.7)");
    $pdo->exec("CREATE TABLE nlp_events (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, city VARCHAR(100), location_id VARCHAR(32), classification VARCHAR(20), post_text TEXT, detected_at DATETIME, received_at DATETIME)");
    $pdo->exec("INSERT INTO nlp_events (city,classification,post_text) VALUES ('San Jose','Flood','Private unreviewed NLP text')");
    bahaba_ensure_psgc_schema($pdo);
    bahaba_ensure_psgc_schema($pdo); // idempotence
    $user = $pdo->query('SELECT * FROM users WHERE id=1')->fetch();
    if (bahaba_preferred_locations($user) !== ['1380900000']) throw new Exception('Legacy preference mapping failed');
    if ($pdo->query('SELECT assigned_location FROM admin_users WHERE id=1')->fetchColumn() !== 'pampanga') throw new Exception('Admin scope changed');
    if ($pdo->query('SELECT psgc_id FROM reports WHERE id=2')->fetchColumn() !== null) throw new Exception('Province guessed');
    if ($pdo->query('SELECT psgc_id FROM nlp_events WHERE id=1')->fetchColumn() !== null) throw new Exception('NLP guessed');
    if ((int)$pdo->query('SELECT COUNT(*) FROM location_mapping_review')->fetchColumn() < 4) throw new Exception('Missing migration review flags');
    echo "PASS legacy account, report and assignment preservation, explicit PSGC mapping, review flags, idempotence\n";
} elseif ($action === 'records') {
    $pdo->exec("INSERT INTO reports (city,barangay,severity,reporter,description,status,location_id,latitude,longitude) VALUES
        ('Navotas City','San Jose','high','PRIVATE REPORTER','New preferred flood','verified','navotas',14.65,120.95),
        ('Marikina City','Unknown','low','PRIVATE REPORTER','New preferred flood two','verified','marikina',14.65,121.10),
        ('Manila','Unknown','medium','PRIVATE REPORTER','Outside preference flood','verified','1380600000',14.60,120.98),
        ('Navotas City','Unknown','high','PRIVATE REPORTER','Private pending report','pending','navotas',14.65,120.95)");
    $pdo->exec("INSERT INTO announcements (city,barangay,title,body,status,location_id) VALUES
        ('Navotas City','San Jose','Published LGU advisory','Public advisory','published','navotas'),
        ('Marikina City','Unknown','Draft becoming published','Private draft body','draft','marikina'),
        ('Manila','Unknown','Unrelated published advisory','Other city advisory','published','1380600000')");
} elseif ($action === 'publish') {
    $pdo->exec("UPDATE announcements SET status='published' WHERE title='Draft becoming published'");
} elseif ($action === 'burst') {
    $pdo->beginTransaction();
    $stmt = $pdo->prepare("INSERT INTO reports (city,barangay,severity,reporter,description,status,location_id,latitude,longitude) VALUES ('Navotas City','San Jose','low','PRIVATE','Burst report','verified','navotas',14.65,120.95)");
    for ($i=0;$i<520;$i++) $stmt->execute();
    $pdo->commit();
} elseif ($action === 'drop') {
    $pdo->exec("DROP DATABASE $database");
}
