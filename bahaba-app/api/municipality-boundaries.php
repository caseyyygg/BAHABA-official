<?php
// Municipality geometry is server-only; GPS never uses nearest-city or text guessing.
function bahaba_municipality_features(): array
{
    $path = __DIR__ . '/municipality-boundaries.json';
    if (!is_file($path)) return [];
    return json_decode(file_get_contents($path), true)['features'] ?? [];
}

function bahaba_ring_contains(array $ring, float $x, float $y): bool
{
    $inside = false;
    for ($i = 0, $j = count($ring) - 1; $i < count($ring); $j = $i++) {
        [$xi, $yi] = $ring[$i]; [$xj, $yj] = $ring[$j];
        if (($yi > $y) !== ($yj > $y) && $x < ($xj-$xi)*($y-$yi)/($yj-$yi)+$xi) $inside = !$inside;
    }
    return $inside;
}

function bahaba_geometry_contains(array $geometry, float $x, float $y): bool
{
    // Even-odd containment handles multipart shapefile rings and holes.
    $polygons = $geometry['type'] === 'Polygon' ? [$geometry['coordinates']] : $geometry['coordinates'];
    foreach ($polygons as $polygon) {
        $inside = false;
        foreach ($polygon as $ring) if (bahaba_ring_contains($ring, $x, $y)) $inside = !$inside;
        if ($inside) return true;
    }
    return false;
}

function bahaba_near_boundary(array $geometry, float $x, float $y, float $margin): bool
{
    $sx = 111000 * cos(deg2rad($y)); $sy = 111000;
    foreach ($geometry['coordinates'] as $ring) {
        for ($i = 1; $i < count($ring); $i++) {
            $ax = ($ring[$i-1][0]-$x)*$sx; $ay = ($ring[$i-1][1]-$y)*$sy;
            $dx = ($ring[$i][0]-$ring[$i-1][0])*$sx; $dy = ($ring[$i][1]-$ring[$i-1][1])*$sy;
            $denom = $dx*$dx+$dy*$dy;
            $t = $denom > 0 ? max(0, min(1, -($ax*$dx+$ay*$dy)/$denom)) : 0;
            if (($ax+$t*$dx)**2+($ay+$t*$dy)**2 <= $margin*$margin) return true;
        }
    }
    return false;
}
