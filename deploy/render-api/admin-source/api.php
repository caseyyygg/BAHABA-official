<?php
// Extend session timeout to 30 days
session_set_cookie_params([
    'httponly' => true,
    'samesite' => 'Lax',
    'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https'),
    'lifetime' => 30 * 24 * 60 * 60, // 30 days
]);
ini_set('session.gc_maxlifetime', 30 * 24 * 60 * 60); // 30 days
ini_set('session.cookie_lifetime', 30 * 24 * 60 * 60); // 30 days
session_start();

header('Content-Type: application/json');
$allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5175',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5175',
    'http://localhost:8001',
    'https://bahaba-app.vercel.app',
    'https://bahaba-admin.vercel.app',
];
$configuredOrigin = rtrim((string) (getenv('PUBLIC_APP_URL') ?: ''), '/');
if ($configuredOrigin !== '') $allowedOrigins[] = $configuredOrigin;
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
} elseif ($origin === '') {
    header('Access-Control-Allow-Origin: http://localhost:8001');
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-CSRF-Token');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$sharedApiDirectory = __DIR__ . '/api';
if (!is_dir($sharedApiDirectory)) {
    $sharedApiDirectory = __DIR__ . '/../BAHABA-official/bahaba-app/api';
}
if (!is_file($sharedApiDirectory . '/config.php')) {
    $sharedApiDirectory = dirname(__DIR__, 2) . '/BAHABA-official/bahaba-app/api';
}
if (!is_file($sharedApiDirectory . '/config.php')) {
    http_response_code(500);
    echo json_encode(['error' => 'Shared API configuration is missing.']);
    exit;
}
$config = require $sharedApiDirectory . '/config.php';
require_once $sharedApiDirectory . '/location_helpers.php';
require_once $sharedApiDirectory . '/psgc.php';
require_once __DIR__ . '/nlp-location.php';
require_once __DIR__ . '/report-point.php';
$nlpIngestToken = (string) ($config['nlp_ingest_token'] ?? '');
if ($nlpIngestToken === '' || $nlpIngestToken === 'replace-with-a-long-random-secret') {
    $nlpIngestToken = (string) (getenv('BAHABA_INGEST_TOKEN') ?: '');
}
$nlpIngestionConfigured = $nlpIngestToken !== '' && $nlpIngestToken !== 'replace-with-a-long-random-secret';

function nlp_service_status(): array
{
    $baseUrl = rtrim((string) (getenv('NLP_SERVICE_URL') ?: ''), '/');
    if ($baseUrl === '') return ['service' => 'unavailable'];
    $headers = "Accept: application/json\r\n";
    $token = (string) (getenv('NLP_SERVICE_TOKEN') ?: '');
    if ($token !== '') $headers .= 'Authorization: Bearer ' . $token . "\r\n";
    $context = stream_context_create(['http' => ['timeout' => 3, 'ignore_errors' => true, 'header' => $headers]]);
    $response = @file_get_contents($baseUrl . '/health', false, $context);
    $status = is_string($response) ? json_decode($response, true) : null;
    return is_array($status) ? $status : ['service' => 'unavailable'];
}

try {
    $pdo = new PDO(
        $config['db']['dsn'],
        $config['db']['username'],
        $config['db']['password'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
    );
} catch (PDOException $exception) {
    http_response_code(500);
    echo json_encode(['error' => 'Database connection failed.']);
    exit;
}

$pdo->exec("CREATE TABLE IF NOT EXISTS admin_users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(254) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('platform-admin','lgu-admin') NOT NULL DEFAULT 'lgu-admin',
    city VARCHAR(150) NULL,
    org VARCHAR(255) NULL,
    barangay VARCHAR(150) NULL,
    status ENUM('active','disabled','pending') NOT NULL DEFAULT 'active',
    acls JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
)");

bahaba_ensure_location_schema($pdo);
bahaba_ensure_column($pdo, 'evacuation_centers', 'created_by_admin_id', 'BIGINT UNSIGNED NULL');
bahaba_ensure_column($pdo, 'evacuation_centers', 'map_link', "VARCHAR(1000) NOT NULL DEFAULT ''");
$pdo->exec("CREATE TABLE IF NOT EXISTS barangay_affected_residents (
    location_id VARCHAR(32) NOT NULL,
    barangay VARCHAR(150) NOT NULL,
    affected_residents INT UNSIGNED NOT NULL DEFAULT 0,
    updated_by_admin_id BIGINT UNSIGNED NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (location_id, barangay)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");


function current_admin(PDO $pdo): ?array
{
    if (empty($_SESSION['admin_id'])) {
        return null;
    }
    $statement = $pdo->prepare('SELECT * FROM admin_users WHERE id = :id LIMIT 1');
    $statement->execute(['id' => (int) $_SESSION['admin_id']]);
    $admin = $statement->fetch();
    if (!$admin) {
        return null;
    }
    $admin['acls'] = json_decode($admin['acls'] ?? '{}', true) ?: [];
    return $admin;
}

function is_platform_admin(array $admin): bool
{
    return ($admin['role'] ?? '') === 'platform-admin'
        && strtolower((string) ($admin['acls']['admin_overview'] ?? '')) === 'full';
}

function requested_location(array $admin, mixed $value): array
{
    if (($admin['status'] ?? '') !== 'active') {
        http_response_code(403);
        echo json_encode(['error' => 'This admin account is not active.']);
        exit;
    }

    $locationId = bahaba_normalize_location_id(is_string($value) ? $value : null);
    if (!$locationId) {
        http_response_code(422);
        echo json_encode(['error' => 'Choose one of the supported locations.']);
        exit;
    }

    if (!is_platform_admin($admin)) {
        $assignedLocation = bahaba_normalize_location_id($admin['assigned_location'] ?? null)
            ?? bahaba_normalize_location_id($admin['city'] ?? null);
        if (($admin['role'] ?? '') !== 'lgu-admin' || !$assignedLocation || $locationId !== $assignedLocation) {
            http_response_code(403);
            echo json_encode(['error' => 'You may only access data for your assigned location.']);
            exit;
        }
    }

    return bahaba_location_by_id($locationId);
}

$pdo->exec("CREATE TABLE IF NOT EXISTS reports (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    city VARCHAR(100) NOT NULL,
    barangay VARCHAR(100) NOT NULL,
    severity ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
    reporter VARCHAR(150) NOT NULL,
    source VARCHAR(50) NOT NULL DEFAULT 'citizen',
    platform VARCHAR(50) NULL,
    original_post_url VARCHAR(2048) NULL,
    description TEXT NOT NULL,
    status ENUM('pending', 'verified', 'rejected') NOT NULL DEFAULT 'pending',
    photo BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
)");

if (!$pdo->query("SHOW COLUMNS FROM reports LIKE 'original_post_url'")->fetch()) {
    $pdo->exec('ALTER TABLE reports ADD COLUMN original_post_url VARCHAR(2048) NULL AFTER platform');
}

$pdo->exec("CREATE TABLE IF NOT EXISTS announcements (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    city VARCHAR(100) NOT NULL,
    barangay VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    status ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
)");

$pdo->exec("CREATE TABLE IF NOT EXISTS nlp_events (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    source VARCHAR(32) NOT NULL DEFAULT 'Unknown',
    source_post_id VARCHAR(191) NULL,
    post_text TEXT NOT NULL,
    location VARCHAR(255) NULL,
    city VARCHAR(150) NULL,
    barangay VARCHAR(150) NULL,
    classification ENUM('Flood','Non-Flood') NOT NULL,
    severity ENUM('Low','Mid','High') NOT NULL,
    urgency ENUM('Neutral','Concerned','Distress') NOT NULL,
    confidence_percent DECIMAL(5,2) NOT NULL,
    post_url VARCHAR(2048) NULL,
    detected_at DATETIME NOT NULL,
    received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_nlp_detected_at (detected_at),
    INDEX idx_nlp_city_barangay (city, barangay),
    UNIQUE KEY uq_nlp_source_post (source, source_post_id)
)");

if (!$pdo->query("SHOW COLUMNS FROM nlp_events LIKE 'post_url'")->fetch()) {
    $pdo->exec('ALTER TABLE nlp_events ADD COLUMN post_url VARCHAR(2048) NULL AFTER confidence_percent');
}

require_once $sharedApiDirectory . '/report-retention.php';

$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$input = json_decode(file_get_contents('php://input'), true) ?? [];
$action = $_GET['action'] ?? ($input['action'] ?? null);
require_once $sharedApiDirectory . '/password-recovery.php';
bahaba_reset_schema($pdo);
if (!empty($_SESSION['admin_id'])) {
    $resetCheck=$pdo->prepare('SELECT password_reset_version FROM admin_users WHERE id=?');
    $resetCheck->execute([$_SESSION['admin_id']]);
    if ((int)$resetCheck->fetchColumn() !== (int)($_SESSION['admin_reset_version']??0)) unset($_SESSION['admin_id']);
}
require_once __DIR__ . '/report-management.php';
require_once __DIR__ . '/team-deployments.php';
require_once __DIR__ . '/social-accounts.php';
require_once __DIR__ . '/collected-history.php';
if ($action === 'forgot-password' && $method === 'POST') {
    bahaba_password_request($pdo,$config,'admin',$input,($config['admin_api_url']??rtrim($config['admin_url']??'http://localhost:8001','/').'/api.php').'?action=reset-password',$sharedApiDirectory.'/vendor');
}
if ($action === 'reset-password') {
    if ($method === 'GET') bahaba_password_form();
    if ($method === 'POST') bahaba_password_complete($pdo,'admin',$input);
    bahaba_reset_reply(['error'=>'Method not allowed.'],405);
}
$parseUnsignedInteger = static function (mixed $value): ?int {
    if (is_int($value)) {
        return $value >= 0 ? $value : null;
    }
    if (!is_string($value) || !preg_match('/^\d+$/D', $value)) {
        return null;
    }
    $normalized = ltrim($value, '0');
    $normalized = $normalized === '' ? '0' : $normalized;
    if (strlen($normalized) > 18) {
        return null;
    }
    return (int) $normalized;
};

if ($method === 'GET' && $action === 'health') {
    echo json_encode([
        'service' => 'bahaba-admin-api',
        'databaseConnected' => true,
        'ingestionConfigured' => $nlpIngestionConfigured,
        'nlpService' => nlp_service_status(),
        'serverTime' => date(DATE_ATOM),
    ]);
    exit;
}

if ($method === 'GET' && $action === 'locations') {
    $nationwide = array_map(fn($l) => array_merge($l, ['aliases'=>[], 'map_city'=>$l['city'], 'map_municipality'=>'']), bahaba_psgc_locations());
    echo json_encode(['locations' => array_merge(bahaba_supported_locations(), $nationwide)]);
    exit;
}

if ($method === 'GET' && $action === 'session') {
    $admin = current_admin($pdo);
    if (!$admin || ($admin['status'] ?? '') !== 'active') {
        unset($_SESSION['admin_id']);
        http_response_code(401);
        echo json_encode(['error' => 'Admin session required.']);
        exit;
    }
    echo json_encode(['user' => [
        'id' => (int) $admin['id'],
        'name' => $admin['name'],
        'email' => $admin['email'],
        'role' => $admin['role'],
        'org' => $admin['org'],
        'city' => $admin['city'],
        'assigned_location' => $admin['assigned_location'] ?? null,
        'barangay' => $admin['barangay'],
        'status' => $admin['status'],
        'acls' => $admin['acls'],
    ]]);
    exit;
}

if ($method === 'GET' && $action === 'evacuation-centers') {
    $admin = current_admin($pdo);
    if (!$admin) {
        http_response_code(401);
        echo json_encode(['error' => 'Admin session required.']);
        exit;
    }
    if (!in_array(strtolower((string) ($admin['acls']['products'] ?? '')), ['full', 'edit', 'view'], true)) {
        http_response_code(403);
        echo json_encode(['error' => 'You do not have permission to view evacuation centers.']);
        exit;
    }
    $location = requested_location($admin, $_GET['location'] ?? $admin['assigned_location'] ?? $admin['city'] ?? null);
    $barangay = trim((string) ($_GET['barangay'] ?? ''));
    $statement = $pdo->prepare(
        'SELECT id, location_id, city, barangay, name, address, map_link, capacity, evacuees, created_by, created_at,
                CASE WHEN created_by_admin_id = :admin_id
                          OR (created_by_admin_id IS NULL AND LOWER(TRIM(created_by)) = LOWER(TRIM(:admin_org)))
                     THEN 1 ELSE 0 END AS can_delete
         FROM evacuation_centers
         WHERE location_id = :location_id AND (:barangay_filter = \'\' OR barangay = :barangay_match)
         ORDER BY barangay, name, id'
    );
    $statement->execute([
        'admin_id' => (int) $admin['id'],
        'admin_org' => trim((string) ($admin['org'] ?? '')) ?: $admin['name'],
        'location_id' => $location['id'],
        'barangay_filter' => $barangay,
        'barangay_match' => $barangay,
    ]);
    echo json_encode(['location' => $location, 'centers' => $statement->fetchAll()]);
    exit;
}

if ($method === 'GET' && $action === 'affected-residents') {
    $admin = current_admin($pdo);
    if (!$admin) { http_response_code(401); echo json_encode(['error' => 'Admin session required.']); exit; }
    if (!in_array(strtolower((string) ($admin['acls']['products'] ?? '')), ['full', 'edit', 'view'], true)) { http_response_code(403); echo json_encode(['error' => 'You do not have permission to view evacuation data.']); exit; }
    $location = requested_location($admin, $_GET['location'] ?? $admin['assigned_location'] ?? $admin['city'] ?? null);
    $barangay = trim((string) ($_GET['barangay'] ?? ''));
    if ($barangay === '' || $barangay === 'All barangays') { http_response_code(422); echo json_encode(['error' => 'Choose a barangay.']); exit; }
    $statement = $pdo->prepare('SELECT affected_residents FROM barangay_affected_residents WHERE location_id = :location_id AND barangay = :barangay');
    $statement->execute(['location_id' => $location['id'], 'barangay' => $barangay]);
    echo json_encode(['affected_residents' => (int) ($statement->fetchColumn() ?: 0)]); exit;
}

if ($method === 'GET' && $action === 'report-trends') {
    $admin = current_admin($pdo);
    if (!$admin) { http_response_code(401); echo json_encode(['error' => 'Admin session required.']); exit; }
    $location = requested_location($admin, $_GET['location'] ?? $admin['assigned_location'] ?? null);
    try {
        bahaba_archive_expired_reports($pdo);
        
        require_once $sharedApiDirectory.'/collected-summary.php';
        $nlpRows=bahaba_collected_rows($pdo,$location['id'], !is_platform_admin($admin) && !empty($admin['barangay']) && $admin['barangay']!=='All barangays' ? $admin['barangay'] : '');
        echo json_encode(['location' => $location, 'rows' => bahaba_report_trends($pdo, $location['id']),
            'nlpRows' => $nlpRows, 'retentionDays' => 30]);
    } catch (Throwable $error) {
        error_log('Report trends failed: ' . $error->getMessage());
        http_response_code(503); echo json_encode(['error' => 'Flood history is temporarily unavailable.']);
    }
    exit;
}

if ($method === 'GET' && $action === 'command-center') {
    $admin = current_admin($pdo);
    if (!$admin) {
        http_response_code(401);
        echo json_encode(['error' => 'Admin session required.']);
        exit;
    }
    $location = requested_location($admin, $_GET['location'] ?? $admin['assigned_location'] ?? $admin['city'] ?? null);
    $statement = $pdo->prepare('SELECT * FROM command_centers WHERE location_id = :location_id LIMIT 1');
    $statement->execute(['location_id' => $location['id']]);
    $barangay = !is_platform_admin($admin) && !empty($admin['barangay']) && strcasecmp(trim((string) $admin['barangay']), 'All barangays') !== 0
        ? trim((string) $admin['barangay']) : '';
    $evacueeSummary = $pdo->prepare(
        'SELECT COALESCE(SUM(evacuees), 0) AS current_evacuees, COUNT(*) AS evacuation_centers
         FROM evacuation_centers
         WHERE location_id = :location_id AND (:barangay_filter = \'\' OR barangay = :barangay_match)'
    );
    $evacueeSummary->execute(['location_id' => $location['id'], 'barangay_filter' => $barangay, 'barangay_match' => $barangay]);
    $affectedSummary = $pdo->prepare("SELECT COALESCE(SUM(affected_residents), 0) FROM barangay_affected_residents WHERE location_id = :location_id AND (:barangay_filter = '' OR barangay = :barangay_match)");
    $affectedSummary->execute(['location_id' => $location['id'], 'barangay_filter' => $barangay, 'barangay_match' => $barangay]);
    echo json_encode([
        'location' => $location,
        'commandCenter' => $statement->fetch() ?: null,
        'evacueeSummary' => ($evacueeSummary->fetch() ?: ['current_evacuees' => 0, 'evacuation_centers' => 0]) + ['affected_residents' => (int) $affectedSummary->fetchColumn()],
    ]);
    exit;
}

if ($method === 'GET' && $action === 'announcements') {
    $admin = current_admin($pdo);
    if (!$admin) {
        http_response_code(401);
        echo json_encode(['error' => 'Admin session required.']);
        exit;
    }
    $location = requested_location($admin, $_GET['location'] ?? $admin['assigned_location'] ?? $admin['city'] ?? null);
    $statement = $pdo->prepare('SELECT * FROM announcements WHERE location_id = :location_id ORDER BY created_at DESC LIMIT 100');
    $statement->execute(['location_id' => $location['id']]);
    echo json_encode(['announcements' => $statement->fetchAll(), 'location' => $location]);
    exit;
}

if ($method === 'GET' && $action === 'reports') {
    $admin = current_admin($pdo);
    if (!$admin) {
        http_response_code(401);
        echo json_encode(['error' => 'Admin session required.']);
        exit;
    }
    if (!in_array(strtolower((string) ($admin['acls']['approval_board'] ?? '')), ['full', 'edit', 'view'], true)) {
        http_response_code(403);
        echo json_encode(['error' => 'You do not have permission to view reports.']);
        exit;
    }
    $location = requested_location($admin, $_GET['location'] ?? $admin['assigned_location'] ?? $admin['city'] ?? null);
    $statement = $pdo->prepare('SELECT * FROM reports WHERE location_id = :location_id ORDER BY created_at DESC LIMIT 200');
    $statement->execute(['location_id' => $location['id']]);
    echo json_encode(['reports' => $statement->fetchAll(), 'location' => $location]);
    exit;
}

if ($method === 'GET' && $action === 'all-reports') {
    if (empty($_SESSION['admin_id'])) {
        http_response_code(401);
        echo json_encode(['error' => 'Admin session required.']);
        exit;
    }

    $admin = current_admin($pdo);
    if (!$admin) {
        http_response_code(403);
        echo json_encode(['error' => 'Admin account is unavailable.']);
        exit;
    }
    $isPlatformAdmin = is_platform_admin($admin);
    $canViewReports = in_array(strtolower((string) ($admin['acls']['approval_board'] ?? '')), ['full', 'edit', 'view'], true);
    if (($admin['status'] ?? '') !== 'active' || !$isPlatformAdmin || !$canViewReports) {
        http_response_code(403);
        echo json_encode(['error' => 'All Reports is restricted to the BANTALA platform admin.']);
        exit;
    }

    $reports = $pdo->query(
        'SELECT id, city, barangay, severity, reporter, source, platform, original_post_url, description, status, photo, created_at
         FROM reports ORDER BY created_at DESC, id DESC LIMIT 500'
    )->fetchAll();
    $nlpEvents = $pdo->query(
        'SELECT id, source, source_post_id, post_text, post_url, location, city, barangay, classification,
                severity, urgency, confidence_percent, detected_at, received_at
         FROM nlp_events WHERE received_at >= UTC_TIMESTAMP() - INTERVAL 24 HOUR ORDER BY detected_at DESC, id DESC'
    )->fetchAll();

    $nlpStats = $pdo->query(
        "SELECT COUNT(*) AS total,
                SUM(classification = 'Flood') AS flood,
                SUM(classification = 'Non-Flood') AS non_flood,
                SUM(severity = 'High') AS high_severity,
                AVG(confidence_percent) AS avg_confidence
         FROM nlp_events WHERE received_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)"
    )->fetch() ?: [];

    echo json_encode([
        'reports' => $reports,
        'nlpEvents' => $nlpEvents,
        'ingestionConfigured' => $nlpIngestionConfigured,
        'nlpService' => nlp_service_status(),
        'nlpStats' => [
            'total' => (int) ($nlpStats['total'] ?? 0),
            'flood' => (int) ($nlpStats['flood'] ?? 0),
            'nonFlood' => (int) ($nlpStats['non_flood'] ?? 0),
            'highSeverity' => (int) ($nlpStats['high_severity'] ?? 0),
            'avgConfidence' => round((float) ($nlpStats['avg_confidence'] ?? 0), 1),
        ],
        'serverTime' => date(DATE_ATOM),
    ]);
    exit;
}

if ($method === 'GET' && $action === 'nlp-events') {
    if (empty($_SESSION['admin_id'])) {
        http_response_code(401);
        echo json_encode(['error' => 'Admin session required.']);
        exit;
    }

    $admin = current_admin($pdo);
    if (!$admin) {
        http_response_code(403);
        echo json_encode(['error' => 'Admin account is unavailable.']);
        exit;
    }
    $permission = strtolower((string) ($admin['acls']['approval_board'] ?? 'no_access'));
    if (($admin['status'] ?? '') !== 'active' || !in_array($permission, ['full', 'edit', 'view'], true)) {
        http_response_code(403);
        echo json_encode(['error' => 'You do not have permission to view NLP events.']);
        exit;
    }

    $where = 'WHERE received_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)';
    $params = [];
    if (!is_platform_admin($admin) || $permission !== 'full') {
        $location = requested_location($admin, $admin['assigned_location'] ?? $admin['city'] ?? null);
        $where .= ' AND location_id = :location_id';
        $params['location_id'] = $location['id'];
        if (!empty($admin['barangay'])) {
            $where .= ' AND barangay = :barangay';
            $params['barangay'] = $admin['barangay'];
        }
    } else {
        $requestedLocation = trim((string) ($_GET['location'] ?? ''));
        if ($requestedLocation !== '') {
            $location = requested_location($admin, $requestedLocation);
            $where .= ' AND location_id = :location_id';
            $params['location_id'] = $location['id'];
        }
        $requestedCity = trim((string) ($_GET['city'] ?? ''));
        $requestedBarangay = trim((string) ($_GET['barangay'] ?? ''));
        if ($requestedCity !== '') {
            $where .= ' AND city = :city';
            $params['city'] = $requestedCity;
        }
        if ($requestedBarangay !== '') {
            $where .= ' AND barangay = :barangay';
            $params['barangay'] = $requestedBarangay;
        }
    }

    $limit = min(100, max(1, (int) ($_GET['limit'] ?? 50)));
    $eventsStmt = $pdo->prepare(
        'SELECT id, source, source_post_id, post_text, post_url, location, city, barangay, classification,
                severity, urgency, confidence_percent, detected_at, received_at
         FROM nlp_events ' . $where . ' ORDER BY detected_at DESC, id DESC LIMIT :limit'
    );
    foreach ($params as $key => $value) $eventsStmt->bindValue($key, $value);
    $eventsStmt->bindValue('limit', $limit, PDO::PARAM_INT);
    $eventsStmt->execute();

    $statsStmt = $pdo->prepare(
        "SELECT COUNT(*) AS total,
                SUM(classification = 'Flood') AS flood,
                SUM(classification = 'Non-Flood') AS non_flood,
                SUM(severity = 'High') AS high_severity,
                AVG(confidence_percent) AS avg_confidence
         FROM nlp_events " . $where
    );
    foreach ($params as $key => $value) $statsStmt->bindValue($key, $value);
    $statsStmt->execute();
    $stats = $statsStmt->fetch() ?: [];

    echo json_encode([
        'events' => $eventsStmt->fetchAll(),
        'nlpService' => nlp_service_status(),
        'stats' => [
            'total' => (int) ($stats['total'] ?? 0),
            'flood' => (int) ($stats['flood'] ?? 0),
            'nonFlood' => (int) ($stats['non_flood'] ?? 0),
            'highSeverity' => (int) ($stats['high_severity'] ?? 0),
            'avgConfidence' => round((float) ($stats['avg_confidence'] ?? 0), 1),
        ],
        'ingestionConfigured' => $nlpIngestionConfigured,
        'serverTime' => date(DATE_ATOM),
    ]);
    exit;
}

if ($method === 'GET' && $action === 'users') {
    $admin = current_admin($pdo);
    if (!$admin || !is_platform_admin($admin)) {
        http_response_code($admin ? 403 : 401);
        echo json_encode(['error' => 'Platform admin access required.']);
        exit;
    }
    $rows = $pdo->query('SELECT * FROM admin_users ORDER BY created_at DESC')->fetchAll();
    foreach ($rows as &$row) {
        $row['acls'] = json_decode($row['acls'] ?? '{}', true);
    }
    echo json_encode(['users' => $rows]);
    exit;
}

if ($method === 'GET' && $action === 'app-users') {
    $admin = current_admin($pdo);
    if (!$admin || !is_platform_admin($admin)) {
        http_response_code($admin ? 403 : 401);
        echo json_encode(['error' => 'Platform admin access required.']);
        exit;
    }
    $rows = $pdo->query('SELECT id, email, username, city, location, selected_location, region, email_verified_at, created_at FROM users ORDER BY created_at DESC LIMIT 200')->fetchAll();
    foreach ($rows as &$row) {
        $row['status'] = !empty($row['email_verified_at']) ? 'verified' : 'pending';
    }
    echo json_encode(['users' => $rows]);
    exit;
}

if ($method === 'GET') {
    http_response_code(404);
    echo json_encode(['error' => 'Not found']);
    exit;
}

if ($method === 'POST') {
    if ($action === 'logout') {
        unset($_SESSION['admin_id']);
        echo json_encode(['success' => true]);
        exit;
    }

    if ($action === 'register') {
        $name = trim((string) ($input['name'] ?? ''));
        $email = strtolower(trim((string) ($input['email'] ?? '')));
        $password = (string) ($input['password'] ?? '');
        $locationId = bahaba_normalize_location_id((string) ($input['assigned_location'] ?? ''));
        $location = $locationId ? bahaba_location_by_id($locationId) : null;
        if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 8 || !$location) {
            http_response_code(422);
            echo json_encode(['error' => 'Provide a valid name, email, password, and supported LGU location.']);
            exit;
        }
        $acls = [
            'admin_overview' => 'view',
            'announcements' => 'edit',
            'products' => 'edit',
            'approval_board' => 'edit',
            'approval_board_hr' => 'no_access',
        ];
        try {
            $statement = $pdo->prepare(
                "INSERT INTO admin_users (name, email, password_hash, role, city, assigned_location, org, status, acls)
                 VALUES (:name, :email, :password_hash, 'lgu-admin', :city, :assigned_location, :org, 'pending', :acls)"
            );
            $statement->execute([
                'name' => $name,
                'email' => $email,
                'password_hash' => password_hash($password, PASSWORD_DEFAULT),
                'city' => $location['city'],
                'assigned_location' => $location['id'],
                'org' => $location['name'] . ' LGU',
                'acls' => json_encode($acls),
            ]);
        } catch (PDOException $exception) {
            if ($exception->getCode() === '23000') {
                http_response_code(409);
                echo json_encode(['error' => 'An admin account already uses this email address.']);
                exit;
            }
            http_response_code(500);
            echo json_encode(['error' => 'Unable to submit the admin registration.']);
            exit;
        }
        http_response_code(201);
        echo json_encode(['success' => true, 'location' => $location['name']]);
        exit;
    }

    if ($action === 'command-center-save') {
        $admin = current_admin($pdo);
        if (!$admin) {
            http_response_code(401);
            echo json_encode(['error' => 'Admin session required.']);
            exit;
        }
        if (!in_array(strtolower((string) ($admin['acls']['admin_overview'] ?? '')), ['full', 'edit', 'view'], true)) {
            http_response_code(403);
            echo json_encode(['error' => 'You do not have permission to manage Command Center information.']);
            exit;
        }
        $location = requested_location($admin, $input['location_id'] ?? null);
        $fields = [
            'name' => 255,
            'hotline' => 100,
            'telephone' => 100,
            'mobile_number' => 100,
            'address' => 500,
            'email' => 254,
            'facebook_page' => 500,
            'emergency_contact' => 20000,
            'other_information' => 20000,
        ];
        $values = [];
        foreach ($fields as $field => $maxLength) {
            $value = trim((string) ($input[$field] ?? ''));
            if (strlen($value) > $maxLength) {
                http_response_code(422);
                echo json_encode(['error' => "{$field} is too long."]);
                exit;
            }
            $values[$field] = $value;
        }
        $statement = $pdo->prepare(
            'INSERT INTO command_centers (location_id, name, hotline, telephone, mobile_number, address, email, facebook_page, emergency_contact, other_information)
             VALUES (:location_id, :name, :hotline, :telephone, :mobile_number, :address, :email, :facebook_page, :emergency_contact, :other_information)
             ON DUPLICATE KEY UPDATE name = VALUES(name), hotline = VALUES(hotline), telephone = VALUES(telephone),
                mobile_number = VALUES(mobile_number), address = VALUES(address), email = VALUES(email),
                facebook_page = VALUES(facebook_page), emergency_contact = VALUES(emergency_contact), other_information = VALUES(other_information)'
        );
        $statement->execute(['location_id' => $location['id']] + $values);
        echo json_encode(['success' => true, 'location_id' => $location['id']]);
        exit;
    }

    if ($action === 'affected-residents-save') {
        $admin = current_admin($pdo);
        if (!$admin) { http_response_code(401); echo json_encode(['error' => 'Admin session required.']); exit; }
        if (!in_array(strtolower((string) ($admin['acls']['products'] ?? '')), ['full', 'edit'], true)) { http_response_code(403); echo json_encode(['error' => 'You do not have permission to update evacuation data.']); exit; }
        $location = requested_location($admin, $input['location_id'] ?? $admin['assigned_location'] ?? $admin['city'] ?? null);
        $barangay = trim((string) ($input['barangay'] ?? ''));
        $affected = $parseUnsignedInteger($input['affected_residents'] ?? null);
        if ($barangay === '' || $barangay === 'All barangays' || strlen($barangay) > 150 || $affected === null || $affected > 1000000000) { http_response_code(422); echo json_encode(['error' => 'Choose a barangay and enter a valid affected resident count.']); exit; }
        $save = $pdo->prepare('INSERT INTO barangay_affected_residents (location_id,barangay,affected_residents,updated_by_admin_id) VALUES (:location_id,:barangay,:affected,:admin_id) ON DUPLICATE KEY UPDATE affected_residents=VALUES(affected_residents),updated_by_admin_id=VALUES(updated_by_admin_id)');
        $save->execute(['location_id'=>$location['id'],'barangay'=>$barangay,'affected'=>$affected,'admin_id'=>(int)$admin['id']]);
        echo json_encode(['success'=>true,'affected_residents'=>$affected]); exit;
    }

        if ($action === 'evacuation-center-create') {
        $admin = current_admin($pdo);
        if (!$admin) {
            http_response_code(401);
            echo json_encode(['error' => 'Admin session required.']);
            exit;
        }
        if (!in_array(strtolower((string) ($admin['acls']['products'] ?? '')), ['full', 'edit'], true)) {
            http_response_code(403);
            echo json_encode(['error' => 'You do not have permission to add evacuation centers.']);
            exit;
        }
        $location = requested_location($admin, $input['location_id'] ?? $admin['assigned_location'] ?? $admin['city'] ?? null);
        $name = trim((string) ($input['name'] ?? ''));
        $barangay = trim((string) ($input['barangay'] ?? ''));
        $address = trim((string) ($input['address'] ?? ''));
        $mapLink = trim((string) ($input['map_link'] ?? ''));
        $capacity = $parseUnsignedInteger($input['capacity'] ?? null);
        $evacuees = $parseUnsignedInteger($input['evacuees'] ?? 0);
        if ($name === '' || strlen($name) > 255) {
            http_response_code(422);
            echo json_encode(['error' => 'Enter a center name no longer than 255 characters.']);
            exit;
        }
        if ($barangay === '' || $barangay === 'undefined' || $barangay === 'All barangays' || strlen($barangay) > 150) {
            http_response_code(422);
            echo json_encode(['error' => 'Choose a barangay before adding this evacuation center.']);
            exit;
        }
        if (strlen($address) > 500) {
            http_response_code(422);
            echo json_encode(['error' => 'Address must be 500 characters or fewer.']);
            exit;
        }
        if (strlen($mapLink) > 1000 || ($mapLink !== '' && (!filter_var($mapLink, FILTER_VALIDATE_URL) || !preg_match('~^https?://((www\.)?google\.[a-z.]+/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl/maps)(/|$|\?)~i', $mapLink)))) {
            http_response_code(422);
            echo json_encode(['error' => 'Enter a valid Google Maps link.']);
            exit;
        }
        if ($capacity === null || $capacity < 1 || $capacity > 1000000) {
            http_response_code(422);
            echo json_encode(['error' => 'Capacity must be a whole number between 1 and 1,000,000.']);
            exit;
        }
        if ($evacuees === null || $evacuees > $capacity) {
            http_response_code(422);
            echo json_encode(['error' => 'Current evacuees must be a whole number from 0 up to the center capacity.']);
            exit;
        }
        $statement = $pdo->prepare(
            'INSERT INTO evacuation_centers (location_id, city, barangay, name, address, map_link, capacity, evacuees, created_by, created_by_admin_id)
             VALUES (:location_id, :city, :barangay, :name, :address, :map_link, :capacity, :evacuees, :created_by, :created_by_admin_id)'
        );
        $statement->execute([
            'location_id' => $location['id'],
            'city' => $location['city'],
            'barangay' => $barangay,
            'name' => $name,
            'address' => $address,
            'map_link' => $mapLink,
            'capacity' => $capacity,
            'evacuees' => $evacuees,
            'created_by' => trim((string) ($admin['org'] ?? '')) ?: $admin['name'],
            'created_by_admin_id' => (int) $admin['id'],
        ]);
        http_response_code(201);
        echo json_encode(['success' => true, 'id' => (int) $pdo->lastInsertId()]);
        exit;
    }

    if ($action === 'evacuation-center-count') {
        $admin = current_admin($pdo);
        if (!$admin) {
            http_response_code(401);
            echo json_encode(['error' => 'Admin session required.']);
            exit;
        }
        if (!in_array(strtolower((string) ($admin['acls']['products'] ?? '')), ['full', 'edit'], true)) {
            http_response_code(403);
            echo json_encode(['error' => 'You do not have permission to update evacuation counts.']);
            exit;
        }
        $location = requested_location($admin, $input['location_id'] ?? $admin['assigned_location'] ?? $admin['city'] ?? null);
        $centerId = $parseUnsignedInteger($input['id'] ?? null);
        $evacuees = $parseUnsignedInteger($input['evacuees'] ?? null);
        if ($centerId === null || $centerId < 1 || $evacuees === null) {
            http_response_code(422);
            echo json_encode(['error' => 'Provide a valid center ID and non-negative evacuee count.']);
            exit;
        }
        $statement = $pdo->prepare(
            'UPDATE evacuation_centers SET evacuees = :evacuees
             WHERE id = :id AND location_id = :location_id AND evacuees <= capacity'
        );
        $statement->execute(['evacuees' => $evacuees, 'id' => $centerId, 'location_id' => $location['id']]);
        if ($statement->rowCount() === 0) {
            $check = $pdo->prepare('SELECT capacity FROM evacuation_centers WHERE id = :id AND location_id = :location_id');
            $check->execute(['id' => $centerId, 'location_id' => $location['id']]);
            $center = $check->fetch();
            if (!$center) {
                http_response_code(404);
                echo json_encode(['error' => 'Evacuation center not found for this location.']);
                exit;
            }
            if ($evacuees > (int) $center['capacity']) {
                http_response_code(422);
                echo json_encode(['error' => 'Evacuee count cannot exceed the center capacity.']);
                exit;
            }
        }
        echo json_encode(['success' => true]);
        exit;
    }

    if ($action === 'evacuation-center-delete') {
        $admin = current_admin($pdo);
        if (!$admin) {
            http_response_code(401);
            echo json_encode(['error' => 'Admin session required.']);
            exit;
        }
        if (!in_array(strtolower((string) ($admin['acls']['products'] ?? '')), ['full', 'edit'], true)) {
            http_response_code(403);
            echo json_encode(['error' => 'You do not have permission to delete evacuation centers.']);
            exit;
        }
        $location = requested_location($admin, $input['location_id'] ?? $admin['assigned_location'] ?? $admin['city'] ?? null);
        $centerId = $parseUnsignedInteger($input['id'] ?? null);
        if ($centerId === null || $centerId < 1) {
            http_response_code(422);
            echo json_encode(['error' => 'Provide a valid evacuation center ID.']);
            exit;
        }
        $statement = $pdo->prepare(
            'DELETE FROM evacuation_centers
             WHERE id = :id AND location_id = :location_id
               AND (created_by_admin_id = :admin_id
                    OR (created_by_admin_id IS NULL AND LOWER(TRIM(created_by)) = LOWER(TRIM(:admin_org))))'
        );
        $statement->execute([
            'id' => $centerId,
            'location_id' => $location['id'],
            'admin_id' => (int) $admin['id'],
            'admin_org' => trim((string) ($admin['org'] ?? '')) ?: $admin['name'],
        ]);
        if ($statement->rowCount() === 0) {
            $check = $pdo->prepare('SELECT id FROM evacuation_centers WHERE id = :id AND location_id = :location_id');
            $check->execute(['id' => $centerId, 'location_id' => $location['id']]);
            if (!$check->fetch()) {
                http_response_code(404);
                echo json_encode(['error' => 'Evacuation center not found for this location.']);
            } else {
                http_response_code(403);
                echo json_encode(['error' => 'You can only delete evacuation centers created by your account.']);
            }
            exit;
        }
        echo json_encode(['success' => true]);
        exit;
    }

    if ($action === 'report-status') {
        $admin = current_admin($pdo);
        if (!$admin) {
            http_response_code(401);
            echo json_encode(['error' => 'Admin session required.']);
            exit;
        }
        if (!in_array(strtolower((string) ($admin['acls']['approval_board'] ?? '')), ['full', 'edit'], true)) {
            http_response_code(403);
            echo json_encode(['error' => 'You do not have permission to update report status.']);
            exit;
        }
        $reportId = (int) ($input['id'] ?? 0);
        $status = (string) ($input['status'] ?? '');
        if ($reportId <= 0 || !in_array($status, ['pending', 'verified', 'rejected'], true)) {
            http_response_code(422);
            echo json_encode(['error' => 'Provide a report ID and valid status.']);
            exit;
        }
        $reportStatement = $pdo->prepare('SELECT id, city, location_id FROM reports WHERE id = :id LIMIT 1');
        $reportStatement->execute(['id' => $reportId]);
        $report = $reportStatement->fetch();
        if (!$report) {
            http_response_code(404);
            echo json_encode(['error' => 'Report not found.']);
            exit;
        }
        $reportLocation = $report['location_id'] ?: bahaba_normalize_location_id($report['city']);
        requested_location($admin, $reportLocation);
        $statement = $pdo->prepare('UPDATE reports SET status = :status WHERE id = :id');
        $statement->execute(['status' => $status, 'id' => $reportId]);
        echo json_encode(['success' => true]);
        exit;
    }

    if ($action === 'announcement-status') {
        $admin = current_admin($pdo);
        if (!$admin) {
            http_response_code(401);
            echo json_encode(['error' => 'Admin session required.']);
            exit;
        }
        if (!in_array(strtolower((string) ($admin['acls']['announcements'] ?? '')), ['full', 'edit'], true)) {
            http_response_code(403);
            echo json_encode(['error' => 'You do not have permission to publish announcements.']);
            exit;
        }
        $announcementId = (int) ($input['id'] ?? 0);
        $announcementStatus = (string) ($input['status'] ?? '');
        if ($announcementId <= 0 || !in_array($announcementStatus, ['draft', 'published'], true)) {
            http_response_code(422);
            echo json_encode(['error' => 'Provide an announcement ID and valid status.']);
            exit;
        }
        $announcementStatement = $pdo->prepare('SELECT id, city, location_id FROM announcements WHERE id = :id LIMIT 1');
        $announcementStatement->execute(['id' => $announcementId]);
        $announcement = $announcementStatement->fetch();
        if (!$announcement) {
            http_response_code(404);
            echo json_encode(['error' => 'Announcement not found.']);
            exit;
        }
        $announcementLocation = $announcement['location_id'] ?: bahaba_normalize_location_id($announcement['city']);
        requested_location($admin, $announcementLocation);
        $statement = $pdo->prepare('UPDATE announcements SET status = :status WHERE id = :id');
        $statement->execute(['status' => $announcementStatus, 'id' => $announcementId]);
        echo json_encode(['success' => true]);
        exit;
    }

    if ($action === 'announcement' || ($input['type'] ?? null) === 'announcement') {
        $admin = current_admin($pdo);
        if (!$admin) {
            http_response_code(401);
            echo json_encode(['error' => 'Admin session required.']);
            exit;
        }
        if (!in_array(strtolower((string) ($admin['acls']['announcements'] ?? '')), ['full', 'edit'], true)) {
            http_response_code(403);
            echo json_encode(['error' => 'You do not have permission to publish announcements.']);
            exit;
        }
        $location = requested_location($admin, $input['location_id'] ?? $input['city'] ?? null);
        $status = (string) ($input['status'] ?? 'draft');
        $title = trim((string) ($input['title'] ?? ''));
        $body = trim((string) ($input['body'] ?? ''));
        $barangay = trim((string) ($input['barangay'] ?? ''));
        if (!in_array($status, ['draft', 'published'], true) || $title === '' || $body === '') {
            http_response_code(422);
            echo json_encode(['error' => 'Provide a title, message, and valid status.']);
            exit;
        }
        $statement = $pdo->prepare('INSERT INTO announcements (city, barangay, location_id, title, body, status) VALUES (:city, :barangay, :location_id, :title, :body, :status)');
        $statement->execute([
            'city' => $location['city'],
            'barangay' => $barangay,
            'location_id' => $location['id'],
            'title' => $title,
            'body' => $body,
            'status' => $status,
        ]);
        http_response_code(201);
        echo json_encode(['success' => true, 'id' => (int) $pdo->lastInsertId()]);
        exit;
    }

    if ($action === 'nlp-ingest') {
        $expectedToken = $nlpIngestToken;
        $authorization = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        if ($expectedToken === '' || $expectedToken === 'replace-with-a-long-random-secret') {
            http_response_code(503);
            echo json_encode(['error' => 'NLP ingestion is not configured.']);
            exit;
        }
        if (!preg_match('/^Bearer\\s+(.+)$/i', $authorization, $matches) || !hash_equals($expectedToken, trim($matches[1]))) {
            http_response_code(401);
            echo json_encode(['error' => 'Invalid ingestion token.']);
            exit;
        }

        $postText = trim((string) ($input['post_text'] ?? $input['text'] ?? ''));
        $classification = strtolower(trim((string) ($input['classification'] ?? '')));
        $severity = strtolower(trim((string) ($input['severity'] ?? '')));
        $urgency = strtolower(trim((string) ($input['urgency'] ?? '')));
        $confidence = filter_var($input['confidence'] ?? null, FILTER_VALIDATE_FLOAT);

        if ($postText === '' || strlen($postText) > 60000 || !in_array($classification, ['flood', 'non-flood'], true)) {
            http_response_code(422);
            echo json_encode(['error' => 'Provide post_text and a classification of Flood or Non-Flood.']);
            exit;
        }
        if ($severity === 'medium') $severity = 'mid';
        if (!in_array($severity, ['low', 'mid', 'high'], true) || !in_array($urgency, ['neutral', 'concerned', 'distress'], true)) {
            http_response_code(422);
            echo json_encode(['error' => 'Invalid severity or urgency.']);
            exit;
        }
        if ($confidence === false || $confidence < 0 || $confidence > 100) {
            http_response_code(422);
            echo json_encode(['error' => 'Confidence must be a number from 0 to 1, or 0 to 100.']);
            exit;
        }
        if ($confidence <= 1) $confidence *= 100;

        try {
            $detectedAt = empty($input['timestamp']) ? new DateTimeImmutable('now') : new DateTimeImmutable((string) $input['timestamp']);
        } catch (Exception $exception) {
            http_response_code(422);
            echo json_encode(['error' => 'timestamp must be a valid date/time.']);
            exit;
        }
        $source = trim((string) ($input['source'] ?? 'Unknown'));
        $source = $source !== '' ? substr($source, 0, 32) : 'Unknown';
        $sourcePostId = trim((string) ($input['post_id'] ?? ''));
        $sourcePostId = $sourcePostId !== '' ? substr($sourcePostId, 0, 191) : 'text:'.hash('sha256',strtolower(trim($postText)));
        $postUrl = trim((string) ($input['post_url'] ?? $input['original_post_url'] ?? $input['permalink_url'] ?? $input['source_url'] ?? $input['post_link'] ?? $input['url'] ?? ''));
        if ($postUrl !== '' && (strlen($postUrl) > 2048 || !filter_var($postUrl, FILTER_VALIDATE_URL) || !in_array(strtolower((string) parse_url($postUrl, PHP_URL_SCHEME)), ['http', 'https'], true))) {
            http_response_code(422);
            echo json_encode(['error' => 'post_url must be a valid http or https URL.']);
            exit;
        }
        $location = trim((string) ($input['location'] ?? ''));
        $city = trim((string) ($input['city'] ?? ''));
        $barangay = trim((string) ($input['barangay'] ?? ''));
        $requestedLocationId = trim((string) ($input['location_id'] ?? ''));
        $locationId = $requestedLocationId !== ''
            ? bahaba_normalize_location_id($requestedLocationId)
            : bahaba_normalize_location_id($city);
        if ($requestedLocationId === '' && !$locationId) {
            $locationId = bahaba_nlp_location_id($location !== '' ? $location : $postText);
        }
        if ($city === '' && $locationId) {
            $city = (string) (bahaba_location_by_id($locationId)['city'] ?? '');
        }
        if ($barangay === '' && $locationId) {
            $barangay = bahaba_nlp_barangay($locationId, $postText) ?? '';
        }
        if ($requestedLocationId !== '' && !$locationId) {
            http_response_code(422);
            echo json_encode(['error' => 'location_id must be one of the supported locations.']);
            exit;
        }
        $statement = $pdo->prepare(
                        'INSERT INTO nlp_events (source, source_post_id, post_text, post_url, location, city, location_id, barangay, classification, severity, urgency, confidence_percent, detected_at)
                         VALUES (:source, :post_id, :post_text, :post_url, :location, :city, :location_id, :barangay, :classification, :severity, :urgency, :confidence, :detected_at)
             ON DUPLICATE KEY UPDATE post_text = VALUES(post_text), location = VALUES(location), city = VALUES(city),
                             post_url = VALUES(post_url), location_id = VALUES(location_id), barangay = VALUES(barangay), classification = VALUES(classification), severity = VALUES(severity),
               urgency = VALUES(urgency), confidence_percent = VALUES(confidence_percent), detected_at = LEAST(detected_at, VALUES(detected_at))'
        );
        $statement->execute([
            'source' => $source,
            'post_id' => $sourcePostId,
            'post_text' => $postText,
            'post_url' => $postUrl !== '' ? $postUrl : null,
            'location' => $location !== '' ? substr($location, 0, 255) : null,
            'city' => $city !== '' ? substr($city, 0, 150) : null,
            'location_id' => $locationId,
            'barangay' => $barangay !== '' ? substr($barangay, 0, 150) : null,
            'classification' => $classification === 'flood' ? 'Flood' : 'Non-Flood',
            'severity' => ucfirst($severity),
            'urgency' => ucfirst($urgency),
            'confidence' => round($confidence, 2),
            'detected_at' => $detectedAt->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s'),
        ]);
        $eventId=(int)$pdo->lastInsertId();
        require_once __DIR__.'/nlp-threshold.php';
        $threshold=$classification==='flood'?bahaba_nlp_threshold($pdo,$locationId,$barangay):['required_posts'=>20,'window_minutes'=>15,'eligible_posts'=>0,'report_id'=>null];
        http_response_code(201);
        echo json_encode(['success'=>true,'id'=>$eventId,'pin_threshold'=>$threshold]);
        exit;
    }

    if (($action ?? $input['type'] ?? null) === 'login') {
        $email = strtolower(trim((string) ($input['email'] ?? '')));
        $password = (string) ($input['password'] ?? '');

        if (!$email || !$password) {
            http_response_code(422);
            echo json_encode(['error' => 'Email and password are required.']);
            exit;
        }

        $stmt = $pdo->prepare('SELECT * FROM admin_users WHERE email = :email LIMIT 1');
        $stmt->execute(['email' => $email]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($password, $user['password_hash'])) {
            http_response_code(401);
            echo json_encode(['error' => 'Incorrect email or password.']);
            exit;
        }

        if (($user['status'] ?? 'active') === 'disabled') {
            http_response_code(403);
            echo json_encode(['error' => 'This account has been disabled by an administrator.']);
            exit;
        }

        $payload = [
            'id' => (int) $user['id'],
            'name' => $user['name'],
            'email' => $user['email'],
            'role' => $user['role'],
            'org' => $user['org'],
            'city' => $user['city'],
            'assigned_location' => $user['assigned_location'] ?? null,
            'barangay' => $user['barangay'],
            'status' => $user['status'],
            'acls' => json_decode($user['acls'] ?? '{}', true) ?: [],
        ];

        if (($user['status'] ?? 'active') === 'active') {
            session_regenerate_id(true);
            $_SESSION['admin_id'] = (int) $user['id'];
            $_SESSION['admin_reset_version'] = (int)($user['password_reset_version']??0);
        }

        echo json_encode(['success' => true, 'user' => $payload]);
        exit;
    }

    if (($action ?? $input['type'] ?? null) === 'users' || ($input['type'] ?? null) === 'admin-user') {
        $admin = current_admin($pdo);
        if (!$admin || !is_platform_admin($admin)) {
            http_response_code($admin ? 403 : 401);
            echo json_encode(['error' => 'Platform admin access required.']);
            exit;
        }
        $mode = $input['mode'] ?? 'add';

        if ($mode === 'add') {
            $email = strtolower(trim((string) ($input['email'] ?? '')));
            $name = trim((string) ($input['name'] ?? ''));
            $password = (string) ($input['password'] ?? '');

            if (!$email || !$name || !$password) {
                http_response_code(422);
                echo json_encode(['error' => 'Name, email, and password are required.']);
                exit;
            }

            $count = $pdo->prepare('SELECT COUNT(*) FROM admin_users WHERE email = :email');
            $count->execute(['email' => $email]);
            if ((int) $count->fetchColumn() > 0) {
                http_response_code(409);
                echo json_encode(['error' => 'This admin email already exists.']);
                exit;
            }

            $role = $input['role'] ?? 'lgu-admin';
            if (!in_array($role, ['platform-admin', 'lgu-admin'], true)) {
                http_response_code(422);
                echo json_encode(['error' => 'Choose a valid admin role.']);
                exit;
            }
            $assignedLocation = null;
            $locationChangeRequested = isset($input['role']) || isset($input['assigned_location']) || isset($input['city']);
            if ($locationChangeRequested && $role === 'lgu-admin') {
                $assignedLocation = bahaba_normalize_location_id((string) ($input['assigned_location'] ?? $input['city'] ?? ''));
                if (!$assignedLocation) {
                    http_response_code(422);
                    echo json_encode(['error' => 'Choose a supported assigned location for this LGU account.']);
                    exit;
                }
            }
            $location = $assignedLocation ? bahaba_location_by_id($assignedLocation) : null;
            $acls = [
                'admin_overview' => $role === 'platform-admin' ? 'full' : 'view',
                'announcements' => $role === 'platform-admin' ? 'full' : 'edit',
                'products' => $role === 'platform-admin' ? 'full' : 'edit',
                'approval_board' => $role === 'platform-admin' ? 'full' : 'edit',
                'approval_board_hr' => $role === 'platform-admin' ? 'full' : 'no_access',
            ];

            $stmt = $pdo->prepare('INSERT INTO admin_users (name, email, password_hash, role, city, assigned_location, org, barangay, status, acls) VALUES (:name, :email, :password_hash, :role, :city, :assigned_location, :org, :barangay, :status, :acls)');
            $stmt->execute([
                'name' => $name,
                'email' => $email,
                'password_hash' => password_hash($password, PASSWORD_DEFAULT),
                'role' => $role,
                'city' => $location['city'] ?? 'Metro Manila (All Cities)',
                'assigned_location' => $assignedLocation,
                'org' => trim((string) ($input['org'] ?? '')) ?: ($role === 'platform-admin' ? 'BANTALA Platform Admin' : $location['name'] . ' LGU'),
                'barangay' => trim((string) ($input['barangay'] ?? '')),
                'status' => 'active',
                'acls' => json_encode($acls),
            ]);

            echo json_encode(['success' => true, 'id' => $pdo->lastInsertId()]);
            exit;
        }

        if ($mode === 'update') {
            $email = strtolower(trim((string) ($input['email'] ?? '')));
            $existingStatement = $pdo->prepare('SELECT role, city, assigned_location FROM admin_users WHERE email = :email LIMIT 1');
            $existingStatement->execute(['email' => $email]);
            $existing = $existingStatement->fetch();
            if (!$existing) {
                http_response_code(404);
                echo json_encode(['error' => 'Admin account not found.']);
                exit;
            }
            $update = [];
            $params = ['email' => $email];

            if (isset($input['status']) && in_array($input['status'], ['active', 'disabled', 'pending'], true)) {
                $update[] = 'status = :status';
                $params['status'] = $input['status'];
            }

            if (isset($input['role'])) {
                $role = $input['role'];
                if (!in_array($role, ['platform-admin', 'lgu-admin'], true)) {
                    http_response_code(422);
                    echo json_encode(['error' => 'Choose a valid admin role.']);
                    exit;
                }
                $update[] = 'role = :role';
                $params['role'] = $role;
            } else {
                $role = $existing['role'];
            }

            if (isset($input['name'])) {
                $update[] = 'name = :name';
                $params['name'] = trim((string) $input['name']);
            }

            if ($role === 'lgu-admin') {
                $locationId = bahaba_normalize_location_id((string) ($input['assigned_location'] ?? $input['city'] ?? $existing['assigned_location'] ?? $existing['city']));
                if (!$locationId) {
                    http_response_code(422);
                    echo json_encode(['error' => 'Choose a supported assigned location for this LGU account.']);
                    exit;
                }
                $location = bahaba_location_by_id($locationId);
                $update[] = 'city = :city';
                $update[] = 'assigned_location = :assigned_location';
                $params['city'] = $location['city'];
                $params['assigned_location'] = $locationId;
            } elseif ($locationChangeRequested && $role === 'platform-admin') {
                $update[] = 'assigned_location = NULL';
                $update[] = 'city = :city';
                $params['city'] = 'Metro Manila (All Cities)';
            }

            if ($update) {
                $stmt = $pdo->prepare('UPDATE admin_users SET ' . implode(', ', $update) . ' WHERE email = :email');
                $stmt->execute($params);
            }

            echo json_encode(['success' => true]);
            exit;
        }

        if ($mode === 'delete') {
            $email = strtolower(trim((string) ($input['email'] ?? '')));
            if (!$email) {
                http_response_code(422);
                echo json_encode(['error' => 'Email is required to delete a user.']);
                exit;
            }
            $stmt = $pdo->prepare('DELETE FROM admin_users WHERE email = :email');
            $stmt->execute(['email' => $email]);
            echo json_encode(['success' => true, 'deleted' => $stmt->rowCount() > 0]);
            exit;
        }
    }

    if (($action ?? $input['type'] ?? null) === 'app-user-delete') {
        $admin = current_admin($pdo);
        if (!$admin || !is_platform_admin($admin)) {
            http_response_code($admin ? 403 : 401);
            echo json_encode(['error' => 'Platform admin access required.']);
            exit;
        }
        $userId = (int) ($input['user_id'] ?? 0);
        $userEmail = strtolower(trim((string) ($input['email'] ?? '')));
        
        if (!$userId && !$userEmail) {
            http_response_code(422);
            echo json_encode(['error' => 'User ID or email is required to delete an app user.']);
            exit;
        }
        
        if ($userEmail) {
            $stmt = $pdo->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
            $stmt->execute(['email' => $userEmail]);
            $user = $stmt->fetch();
            if ($user) {
                $userId = $user['id'];
            }
        }
        
        if (!$userId) {
            http_response_code(404);
            echo json_encode(['error' => 'App user not found.']);
            exit;
        }
        
        $stmt = $pdo->prepare('DELETE FROM users WHERE id = :id');
        $stmt->execute(['id' => $userId]);
        echo json_encode(['success' => true, 'deleted' => $stmt->rowCount() > 0]);
        exit;
    }

    if ($action === 'report' || ($input['type'] ?? null) === 'report') {
        $admin = current_admin($pdo);
        if (!$admin) {
            http_response_code(401);
            echo json_encode(['error' => 'Admin session required.']);
            exit;
        }
        if (!in_array(strtolower((string) ($admin['acls']['approval_board'] ?? '')), ['full', 'edit'], true)) {
            http_response_code(403);
            echo json_encode(['error' => 'You do not have permission to create reports.']);
            exit;
        }
        $location = requested_location($admin, $input['location_id'] ?? $input['city'] ?? null);
        $barangayFeatureId = trim((string) ($input['barangay_feature_id'] ?? ''));
        $barangayName = trim((string) ($input['barangay'] ?? ''));
        if ($barangayFeatureId !== '' || $barangayName !== '') {
            $geometryPath = __DIR__ . '/map-data/barangays.json';
            if (!is_file($geometryPath)) {
                http_response_code(503);
                echo json_encode(['error' => 'Barangay map data is unavailable.']);
                exit;
            }
            $geometry = json_decode(file_get_contents($geometryPath), true);
            $matchedFeature = null;
            foreach ($geometry['features'] ?? [] as $feature) {
                $properties = $feature['properties'] ?? [];
                if (($barangayFeatureId !== '' ? (string) ($feature['id'] ?? '') === $barangayFeatureId : ($properties['name'] ?? '') === $barangayName)
                    && ($properties['city'] ?? '') === ($location['map_city'] ?? '')
                    && (empty($location['map_municipality']) || ($properties['municipality'] ?? '') === $location['map_municipality'])) {
                    $matchedFeature = $feature;
                    break;
                }
            }
            if (!$matchedFeature) {
                http_response_code(422);
                echo json_encode(['error' => 'Choose a barangay within your assigned location.']);
                exit;
            }
            $barangayName = $matchedFeature['properties']['name'];
            $barangayFeatureId = (string) $matchedFeature['id'];
        }
        if ($barangayName === '' || strlen($barangayName) > 100) {
            http_response_code(422);
            echo json_encode(['error' => 'Choose an affected barangay.']);
            exit;
        }

        $latitude = $input['latitude'] ?? null;
        $longitude = $input['longitude'] ?? null;
        $streetName = trim((string) ($input['street_name'] ?? ''));
        if (strlen($streetName)>150 || (($latitude === null) !== ($longitude === null)) || ($streetName !== '' && $latitude === null)) {
            http_response_code(422); echo json_encode(['error'=>'Choose a map point for the street report and provide a street name under 150 characters.']); exit;
        }
        if ($latitude !== null) {
            if (!is_numeric($latitude) || !is_numeric($longitude) || !is_finite((float)$latitude) || !is_finite((float)$longitude)
                || abs((float)$latitude)>90 || abs((float)$longitude)>180 || empty($matchedFeature)
                ) {
                http_response_code(422); echo json_encode(['error'=>'The report point must be inside the selected barangay in your assigned location.']); exit;
            }
        }
        if ($latitude !== null) {
            if (!is_file(__DIR__ . '/map-data/lgu-boundaries.json')) {
                http_response_code(503); echo json_encode(['error'=>'LGU boundary data is unavailable.']); exit;
            }
            $boundaries = json_decode(file_get_contents(__DIR__ . '/map-data/lgu-boundaries.json'), true);
            $scopeBoundary = null;
            foreach ($boundaries['features'] ?? [] as $boundary) {
                if (($boundary['id'] ?? '') === $location['id']) { $scopeBoundary = $boundary; break; }
            }
            if (!$scopeBoundary || !bahaba_report_point_inside($scopeBoundary['geometry'], (float)$longitude, (float)$latitude)) {
                http_response_code(422); echo json_encode(['error'=>'The report point must be inside your assigned city or province boundary.']); exit;
            }
            // Use a containing barangay when available. Never move a point to its centre or infer the nearest barangay.
            $containingIds = [];
            foreach ($geometry['features'] ?? [] as $candidate) {
                $properties = $candidate['properties'] ?? [];
                if (($properties['city'] ?? '') !== ($location['map_city'] ?? '')
                    || (!empty($location['map_municipality']) && ($properties['municipality'] ?? '') !== $location['map_municipality'])) continue;
                if (bahaba_report_point_inside($candidate['geometry'], (float)$longitude, (float)$latitude)) $containingIds[] = (string)$candidate['id'];
            }
            if ($containingIds && !in_array($barangayFeatureId, $containingIds, true)) {
                http_response_code(422); echo json_encode(['error'=>'Select the barangay containing this report point.']); exit;
            }
        }
        $severity = strtolower(trim((string) ($input['severity'] ?? 'medium')));
        $description = trim((string) ($input['description'] ?? ''));
        if (!in_array($severity, ['low', 'medium', 'high'], true) || $description === '') {
            http_response_code(422);
            echo json_encode(['error' => 'Provide a report description and valid severity.']);
            exit;
        }
        $originalPostUrl = trim((string) ($input['original_post_url'] ?? $input['post_url'] ?? $input['permalink_url'] ?? $input['source_url'] ?? $input['post_link'] ?? $input['url'] ?? ''));
        if ($originalPostUrl !== '' && (strlen($originalPostUrl) > 2048 || !filter_var($originalPostUrl, FILTER_VALIDATE_URL) || !in_array(strtolower((string) parse_url($originalPostUrl, PHP_URL_SCHEME)), ['http', 'https'], true))) {
            http_response_code(422);
            echo json_encode(['error' => 'original_post_url must be a valid http or https URL.']);
            exit;
        }
        $stmt = $pdo->prepare('INSERT INTO reports (city, barangay, barangay_feature_id, location_id, latitude, longitude, street_name, severity, reporter, source, platform, original_post_url, description, status, photo) VALUES (:city, :barangay, :barangay_feature_id, :location_id, :latitude, :longitude, :street_name, :severity, :reporter, :source, :platform, :original_post_url, :description, :status, :photo)');
        $stmt->execute([
            'city' => $location['city'],
            'barangay' => $barangayName,
            'barangay_feature_id' => $barangayFeatureId !== '' ? $barangayFeatureId : null,
            'latitude' => $latitude, 'longitude' => $longitude, 'street_name' => $streetName !== '' ? $streetName : null,
            'location_id' => $location['id'],
            'severity' => $severity,
            'reporter' => $admin['name'],
            'source' => 'lgu',
            'platform' => $input['platform'] ?? null,
            'original_post_url' => $originalPostUrl !== '' ? $originalPostUrl : null,
            'description' => $description,
            'status' => 'pending',
            'photo' => !empty($input['photo']) ? 1 : 0,
        ]);

        echo json_encode(['success' => true, 'id' => $pdo->lastInsertId()]);
        exit;
    }

    if (isset($input['type']) && $input['type'] === 'announcement') {
        $stmt = $pdo->prepare('INSERT INTO announcements (city, barangay, title, body, status) VALUES (:city, :barangay, :title, :body, :status)');
        $stmt->execute([
            'city' => $input['city'] ?? '',
            'barangay' => $input['barangay'] ?? '',
            'title' => $input['title'] ?? '',
            'body' => $input['body'] ?? '',
            'status' => $input['status'] ?? 'draft',
        ]);

        echo json_encode(['success' => true, 'id' => $pdo->lastInsertId()]);
        exit;
    }
}

http_response_code(404);
echo json_encode(['error' => 'Not found']);
