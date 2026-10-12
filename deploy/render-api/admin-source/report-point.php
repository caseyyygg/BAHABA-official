<?php
function bahaba_report_point_inside(array $geometry, float $longitude, float $latitude): bool {
    $ringContains = static function (array $ring) use ($longitude, $latitude): bool {
        $inside = false;
        for ($i = 0, $j = count($ring)-1; $i<count($ring); $j=$i++) {
            [$x,$y] = $ring[$i]; [$a,$b] = $ring[$j];
            $cross = ($longitude-$x)*($b-$y)-($latitude-$y)*($a-$x);
            if (abs($cross)<1e-10 && $longitude>=min($x,$a) && $longitude<=max($x,$a) && $latitude>=min($y,$b) && $latitude<=max($y,$b)) return true;
            if (($y>$latitude)!==($b>$latitude) && $longitude<($a-$x)*($latitude-$y)/($b-$y)+$x) $inside = !$inside;
        }
        return $inside;
    };
    $polygons = ($geometry['type'] ?? '') === 'MultiPolygon' ? $geometry['coordinates'] : (($geometry['type'] ?? '') === 'Polygon' ? [$geometry['coordinates']] : []);
    foreach ($polygons as $rings) {
        if (!$ringContains($rings[0])) continue;
        $inHole = false;
        foreach (array_slice($rings,1) as $hole) if ($ringContains($hole)) $inHole = true;
        if (!$inHole) return true;
    }
    return false;
}
