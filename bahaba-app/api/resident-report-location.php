<?php

require_once __DIR__ . '/municipality-boundaries.php';

function bahaba_resident_report_location(float $latitude, float $longitude, float $accuracy): array
{
    if (!is_finite($latitude) || !is_finite($longitude) || $latitude < -90 || $latitude > 90 || $longitude < -180 || $longitude > 180) {
        throw new InvalidArgumentException('GPS coordinates are invalid.');
    }
    if (!is_finite($accuracy) || $accuracy < 0 || $accuracy > 250) {
        throw new InvalidArgumentException('GPS accuracy is too low. Retry after your device gets a more precise location.');
    }

    $path = __DIR__ . '/targeted-barangay-geometry.json';
    if (!is_file($path)) {
        throw new RuntimeException('Barangay boundary data is not installed on the API host.');
    }
    $data = json_decode((string) file_get_contents($path), true);
    if (!is_array($data['features'] ?? null)) {
        throw new RuntimeException('Barangay boundary data is invalid.');
    }

    $nearBoundary = false;
    $matches = [];
    foreach ($data['features'] as $feature) {
        $geometry = $feature['geometry'] ?? null;
        $properties = $feature['properties'] ?? [];
        if (!is_array($geometry) || !is_array($properties) || !isset($geometry['type'], $geometry['coordinates'])) {
            continue;
        }

        $city = mb_strtolower(trim((string) ($properties['city'] ?? '')));
        $municipality = mb_strtolower(trim((string) ($properties['municipality'] ?? '')));
        $candidates = [];
        foreach (bahaba_supported_locations() as $location) {
            if (mb_strtolower(trim((string) ($location['map_city'] ?? ''))) !== $city) {
                continue;
            }
            $mapMunicipality = mb_strtolower(trim((string) ($location['map_municipality'] ?? '')));
            if ($mapMunicipality !== '' && $mapMunicipality !== $municipality) {
                continue;
            }
            $candidates[] = ['location' => $location, 'specificity' => $mapMunicipality === '' ? 0 : 1];
        }
        if (!$candidates || !bahaba_geometry_contains($geometry, $longitude, $latitude)) {
            continue;
        }
        if (bahaba_resident_geometry_near_boundary($geometry, $longitude, $latitude, max(75, $accuracy + 50))) {
            $nearBoundary = true;
            continue;
        }

        $highestSpecificity = max(array_column($candidates, 'specificity'));
        $specific = array_values(array_filter($candidates, static fn(array $candidate): bool => $candidate['specificity'] === $highestSpecificity));
        if (count($specific) !== 1) {
            continue;
        }
        $matches[] = [
            'feature_id' => (string) ($feature['id'] ?? ''),
            'barangay' => trim((string) ($properties['name'] ?? '')),
            'location' => $specific[0]['location'],
        ];
    }

    if (count($matches) !== 1) {
        if ($nearBoundary) {
            throw new InvalidArgumentException('GPS accuracy cannot distinguish this location from a barangay boundary. Retry from a clearer location.');
        }
        throw new InvalidArgumentException('A supported barangay could not be identified from this GPS location. Check your GPS and retry.');
    }
    if ($matches[0]['feature_id'] === '' || $matches[0]['barangay'] === '') {
        throw new RuntimeException('The matched barangay boundary is missing required details.');
    }

    return [
        'barangay_feature_id' => $matches[0]['feature_id'],
        'barangay' => $matches[0]['barangay'],
        'city' => (string) $matches[0]['location']['city'],
        'location_id' => (string) $matches[0]['location']['id'],
    ];
}

function bahaba_resident_geometry_near_boundary(array $geometry, float $longitude, float $latitude, float $margin): bool
{
    $polygons = $geometry['type'] === 'Polygon' ? [$geometry['coordinates']] : ($geometry['coordinates'] ?? []);
    $scaleX = 111000 * cos(deg2rad($latitude));
    $scaleY = 111000;
    foreach ($polygons as $polygon) {
        foreach ($polygon as $ring) {
            for ($i = 1, $count = count($ring); $i < $count; $i++) {
                $ax = ((float) $ring[$i - 1][0] - $longitude) * $scaleX;
                $ay = ((float) $ring[$i - 1][1] - $latitude) * $scaleY;
                $dx = ((float) $ring[$i][0] - (float) $ring[$i - 1][0]) * $scaleX;
                $dy = ((float) $ring[$i][1] - (float) $ring[$i - 1][1]) * $scaleY;
                $denominator = $dx * $dx + $dy * $dy;
                $position = $denominator > 0 ? max(0, min(1, -($ax * $dx + $ay * $dy) / $denominator)) : 0;
                if (($ax + $position * $dx) ** 2 + ($ay + $position * $dy) ** 2 <= $margin * $margin) {
                    return true;
                }
            }
        }
    }
    return false;
}
