<?php
require_once __DIR__.'/../../deploy/render-api/admin-source/nlp-timestamps.php';

$now = new DateTimeImmutable('2026-10-24T12:00:00Z');
$valid = [
    '2026-10-24T11:59:00Z' => '2026-10-24 11:59:00',
    '2026-10-24T19:59:00+08:00' => '2026-10-24 11:59:00',
    '2026-10-24T11:59:00.123456Z' => '2026-10-24 11:59:00',
    '2026-10-23T12:00:00Z' => '2026-10-23 12:00:00',
    '2026-10-23T23:59:00+08:00' => '2026-10-23 15:59:00',
];
foreach ($valid as $input => $expected) {
    $actual = bahaba_nlp_publication_time($input, $now)?->format('Y-m-d H:i:s');
    if ($actual !== $expected) throw new RuntimeException("Unexpected UTC publication for $input");
}
foreach ([null, ''] as $input) {
    if (bahaba_nlp_publication_time($input, $now) !== null) throw new RuntimeException('Unknown time must remain unknown.');
}
foreach (['2026-11-09T11:29:00Z', '2026-10-24T12:00:01Z', '2026-10-23T11:59:59Z',
    'Nov 9', 'now', '2026-10-24T11:59:00', '2026-10-24', '2026-09-31T11:59:00Z',
    '2026-10-24T25:00:00Z', '2026-10-24T11:59:00Z trailing', 1792836000] as $input) {
    try { bahaba_nlp_publication_time($input, $now); }
    catch (InvalidArgumentException $expected) { continue; }
    throw new RuntimeException('Accepted an invalid, future, historical, or ambiguous publication time.');
}
echo "PASS: original source dates, UTC conversion, rolling 24 hours, unknown dates, and future/invalid rejection.\n";
