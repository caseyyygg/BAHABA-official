<?php
// Read-only export for importing into a NEW, empty hosting database.
// Credentials stay in the existing ignored local configuration.
$config = require dirname(__DIR__) . '/api/config.php';
$pdo = new PDO($config['db']['dsn'], $config['db']['username'], $config['db']['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$directory = dirname(__DIR__) . '/migration.local';
if (!is_dir($directory)) mkdir($directory, 0700, true);
$path = $directory . '/bahaba-hosting-' . date('Ymd-His') . '.sql';
$output = fopen($path, 'xb');
if (!$output) throw new RuntimeException('Cannot open private export.');
$identifier = static fn(string $name): string => '`' . str_replace('`', '``', $name) . '`';
fwrite($output, "-- Private BAHABA export. Import into a NEW EMPTY database. Never upload to a website.\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n");
$tables = $pdo->query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'")->fetchAll(PDO::FETCH_COLUMN);
$pdo->exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
$pdo->beginTransaction();
try {
    foreach ($tables as $table) {
        $quoted = $identifier($table);
        $definition = $pdo->query('SHOW CREATE TABLE ' . $quoted)->fetch(PDO::FETCH_NUM)[1];
        fwrite($output, $definition . ";\n");
        $rows = $pdo->query('SELECT * FROM ' . $quoted);
        $count = 0;
        while ($row = $rows->fetch(PDO::FETCH_ASSOC)) {
            $columns = implode(', ', array_map($identifier, array_keys($row)));
            $values = implode(', ', array_map(static fn($value): string => $value === null ? 'NULL' : $pdo->quote((string) $value), array_values($row)));
            fwrite($output, "INSERT INTO $quoted ($columns) VALUES ($values);\n");
            $count++;
        }
        echo $table . ': ' . $count . " rows\n";
    }
    $pdo->commit();
    fwrite($output, "SET FOREIGN_KEY_CHECKS=1;\n");
    fclose($output);
    echo "Private export saved: $path\n";
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fclose($output);
    unlink($path);
    throw $error;
}
