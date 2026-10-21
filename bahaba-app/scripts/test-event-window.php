<?php
require __DIR__ . '/../../deploy/render-api/admin-source/nlp-flood-events.php';

function assert_window(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$now = 1_800_000_000;
$state = ['phase' => 'INACTIVE', 'last_post_at' => null, 'cycle_floor' => null];
assert_window(BAHABA_FLOOD_POSTS === 20 && BAHABA_FLOOD_WINDOW === 900, 'Threshold must be 20 posts per rolling 15 minutes.');
$nineteen = bahaba_flood_transition($state, $now - 1, $now, 19);
$twenty = bahaba_flood_transition($state, $now - 1, $now, 20);
assert_window(!$nineteen['activate'], '19 eligible distinct posts must not activate an event.');
assert_window($twenty['activate'], '20 eligible distinct posts must activate an event.');
$outsideWindow = bahaba_flood_transition($state, $now - BAHABA_FLOOD_WINDOW - 1, $now, 20);
assert_window(!$outsideWindow['activate'], 'A post older than the rolling window must not activate an event.');
echo "PASS event threshold constants and 19/20 rolling-window activation boundary.\n";
