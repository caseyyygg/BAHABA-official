<?php
declare(strict_types=1);
require_once __DIR__ . '/../api/flood-signals.php';

$posts = [
    [
        'city_id' => '1380900000',
        'city_name' => 'Navotas',
        'source' => 'X',
        'source_post_id' => 'post-1',
        'published_at' => '2026-11-06 07:30:00',
        'severity' => 'High',
        'locations_json' => json_encode([
            ['key' => 'barangay-a', 'label' => 'Daanghari', 'precision' => 'barangay'],
            ['key' => 'barangay-b', 'label' => 'Tangos North', 'precision' => 'barangay', 'feature_id' => 'navotas-tangos-north'],
        ], JSON_THROW_ON_ERROR),
        'post_text' => 'Private post text must not be returned.',
        'post_url' => 'https://example.invalid/private-post',
    ],
    [
        'city_id' => '1380900000',
        'city_name' => 'Navotas',
        'source' => 'X',
        'source_post_id' => 'post-2',
        'published_at' => '2026-11-06 07:25:00',
        'severity' => 'Mid',
        'locations_json' => '[]',
    ],
    [
        'city_id' => '1380900000',
        'city_name' => 'Navotas',
        'source' => 'X',
        'source_post_id' => 'post-3',
        'published_at' => '2026-11-06 07:20:00',
        'severity' => 'Low',
        'locations_json' => json_encode([
            ['key' => 'barangay-a', 'label' => 'Daanghari', 'precision' => 'barangay'],
        ], JSON_THROW_ON_ERROR),
    ],
    [
        'city_id' => '1380900000',
        'city_name' => 'Navotas',
        'source' => 'X',
        'source_post_id' => 'post-landmark',
        'published_at' => '2026-11-06 07:15:00',
        'severity' => 'High',
        'locations_json' => json_encode([
            ['key' => 'landmark-a', 'label' => 'Tangos North High School', 'precision' => 'landmark', 'feature_id' => 'navotas-tangos-north', 'latitude' => 14.6765, 'longitude' => 120.9337],
        ], JSON_THROW_ON_ERROR),
    ],
];

$reports = bahaba_resident_individual_reports($posts);
assert(count($reports) === 5);
assert($reports[0]['barangay'] === 'Daanghari');
assert($reports[0]['severity'] === 'High');
assert($reports[0]['source'] === 'X');
assert($reports[0]['published_at'] === '2026-11-06T07:30:00Z');
assert($reports[1]['barangay'] === 'Tangos North');
assert($reports[1]['barangay_feature_id'] === 'navotas-tangos-north');
assert($reports[1]['latitude'] === null && $reports[1]['longitude'] === null);
assert($reports[1]['severity'] === 'High');
assert($reports[0]['id'] !== $reports[1]['id']);
assert($reports[2]['label'] === 'Navotas');
assert($reports[2]['severity'] === 'Medium');
assert($reports[3]['barangay'] === 'Daanghari');
assert($reports[3]['severity'] === 'Low');
assert($reports[0]['id'] !== $reports[3]['id']);
assert($reports[4]['precision_level'] === 'landmark');
assert($reports[4]['latitude'] === 14.6765 && $reports[4]['longitude'] === 120.9337);
foreach ($reports as $report) {
    assert(!array_key_exists('post_text', $report));
    assert(!array_key_exists('post_url', $report));
}
echo "PASS individual resident NLP reports: one location-specific report per matched post, exact NLP severity, safe fields only.\n";
