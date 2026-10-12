<?php
/** Resolve unambiguous supported places without assigning another LGU's posts. */
function bahaba_nlp_location_id(string $text): ?string
{
    $matches = [];
    foreach (bahaba_supported_locations() as $location) {
        $names = array_unique(array_merge([$location['id'], $location['name'], $location['city']], $location['aliases'] ?? []));
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
        foreach (array_unique([$properties['name'] ?? '', $properties['sourceName'] ?? '']) as $name) {
            if ($name !== '' && preg_match('/\b(?:brgy\.?|barangay)\s+' . preg_quote($name, '/') . '(?![\pL\pN])/iu', $text)) {
                $matches[(string) $feature['id']] = $properties['name'];
            }
        }
    }
    return count($matches) === 1 ? reset($matches) : null;
}
