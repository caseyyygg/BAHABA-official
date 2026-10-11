"""Build conservative municipality containment polygons from the existing PSA/NAMRIA source.

Usage: py scripts/build-municipal-boundaries.py municipal-boundaries.zip
Simplification tolerance 0.0002 degrees; resolver excludes a 50m + GPS accuracy
margin around every ring. IDs are read from source, never derived from names.
"""
import gzip
import json
from pathlib import Path
import struct
import sys
from zipfile import ZipFile

def simplify(points, tolerance=0.0002):
    if len(points) < 4: return points
    keep = {0, len(points)-1}
    stack = [(0, len(points)-1)]
    while stack:
        start, end = stack.pop()
        ax, ay = points[start]; bx, by = points[end]
        dx, dy = bx-ax, by-ay; denom = dx*dx+dy*dy
        largest, index = 0, None
        for i in range(start+1, end):
            px, py = points[i]
            t = max(0, min(1, ((px-ax)*dx+(py-ay)*dy)/denom)) if denom else 0
            distance = (px-ax-t*dx)**2+(py-ay-t*dy)**2
            if distance > largest: largest, index = distance, i
        if largest > tolerance*tolerance:
            keep.add(index); stack.extend([(start,index),(index,end)])
    result = [points[i] for i in sorted(keep)]
    return result if len(result) >= 4 else points

def build(path):
    root = Path(__file__).resolve().parents[1]
    registry = {l['id'] for l in json.loads((root/'psgc-registry.json').read_text())['locations']}
    output = root/'api/municipality-geometry'
    output.mkdir(exist_ok=True)
    index = []
    with ZipFile(path) as z:
        dbf = z.read('Municities.shp.dbf')
        count, header, length = struct.unpack_from('<IHH', dbf, 4)
        with z.open('Municities.shp.shp') as shp:
            shp.read(100)
            for i in range(count):
                rec = dbf[header+i*length:header+(i+1)*length]
                code = str(int(rec[1:19].strip())).zfill(10)
                size = struct.unpack('>II', shp.read(8))[1]*2
                data = shp.read(size)
                if code not in registry or struct.unpack_from('<I', data)[0] != 5: continue
                bbox = list(struct.unpack_from('<4d', data, 4))
                parts, total = struct.unpack_from('<II', data, 36)
                offsets = list(struct.unpack_from('<'+'I'*parts, data, 44))+[total]
                start = 44+parts*4
                points = list(struct.iter_unpack('<dd', data[start:start+total*16]))
                rings = [simplify(points[offsets[j]:offsets[j+1]]) for j in range(parts)]
                geometry = {'type': 'Polygon', 'coordinates': rings}
                (output/(code+'.json.gz')).write_bytes(gzip.compress(json.dumps(geometry, separators=(',',':')).encode(), mtime=0))
                index.append({'id': code, 'bbox': bbox})
    (root/'api/municipality-boundaries.json').write_text(json.dumps({'source': 'PSA/NAMRIA 2023-11-06 via altcoder/philippines-psgc-shapefiles', 'features': index}, separators=(',',':'))+'\n')
    print(f'{len(index)} matched municipalities; exact source IDs, conservative boundary margin required')

if __name__ == '__main__': build(sys.argv[1])
