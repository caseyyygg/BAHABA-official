<?php
/** Resolve unambiguous supported places without assigning another LGU's posts. */
function bahaba_nlp_location_id(string $text): ?string
{
    $matches = [];
    foreach (bahaba_supported_locations() as $location) {
        $aliases = $location['aliases'] ?? [];
        if (in_array((string) ($location['id'] ?? ''), ['navotas', '1380900000'], true)) $aliases[] = 'Navatos';
        $names = array_unique(array_merge([$location['id'], $location['name'], $location['city']], $aliases));
        foreach ($names as $name) {
            if (preg_match('/(?<![\pL\pN])' . preg_quote($name, '/') . '(?![\pL\pN])/iu', $text)) {
                $matches[$location['id']] = true;
                break;
            }
        }
    }
    // Malolos is a city in Bulacan; "Malolos, Bulacan" is one city location.
    if (isset($matches['malolos'], $matches['bulacan'])) unset($matches['bulacan']);
    return count($matches) === 1 ? array_key_first($matches) : null;
}

function bahaba_nlp_location_id_from_hint(string $locationHint, string $postText): ?string
{
    return bahaba_nlp_location_id($locationHint) ?? bahaba_nlp_location_id($postText);
}

function bahaba_nlp_location_filter_ids(string $locationId): array
{
    $ids = [$locationId];
    foreach (bahaba_supported_locations() as $location) {
        $legacyId = (string) ($location['id'] ?? '');
        if ($legacyId === '') continue;
        $psgcId = bahaba_legacy_psgc($legacyId);
        if ($locationId === $legacyId || ($psgcId !== null && $locationId === $psgcId)) {
            $ids[] = $legacyId;
            if ($psgcId !== null) $ids[] = $psgcId;
        }
    }
    return array_values(array_unique($ids));
}

function bahaba_nlp_barangay(string $locationId, string $text): ?string
{
    $location = bahaba_location_by_id($locationId);
    if (!$location) return null;
    static $geometry;
    $geometry ??= json_decode((string) file_get_contents(__DIR__ . '/map-data/barangays.json'), true);
    $matches = [];
    foreach ($geometry['features'] ?? [] as $feature) {
        $properties = $feature['properties'];
        if (($properties['city'] ?? '') !== ($location['map_city'] ?? '')) continue;
        if (!empty($location['map_municipality']) && ($properties['municipality'] ?? '') !== $location['map_municipality']) continue;
        $names = [];
        foreach ([$properties['name'] ?? '', $properties['sourceName'] ?? ''] as $name) {
            if ($name === '') continue;
            $names[] = $name;
            $shortName = trim((string) preg_replace('/\s*\([^)]*\)/u', '', $name));
            if ($shortName !== '') $names[] = $shortName;
        }
        $names = array_unique($names);
        // People commonly spell Navotas' Bangculasi as "Bangkulasi" in posts.
        if (in_array($locationId, ['navotas', '1380900000'], true)
            && strcasecmp((string) ($properties['name'] ?? ''), 'Bangculasi') === 0) {
            $names[] = 'Bangkulasi';
        }
        foreach ($names as $name) {
            if ($name !== '' && (
                preg_match('/\b(?:brgy\.?|barangay)\s+' . preg_quote($name, '/') . '(?![\pL\pN])/iu', $text)
                || preg_match('/\b(?:sa|in|near|at|along|around|beside|malapit\s+sa|bandang)\s+' . preg_quote($name, '/') . '(?![\pL\pN])/iu', $text)
            )) {
                $matches[(string) $feature['id']] = $properties['name'];
            }
        }
    }
    return count($matches) === 1 ? reset($matches) : null;
}
