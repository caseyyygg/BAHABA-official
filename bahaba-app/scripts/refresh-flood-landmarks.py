"""Refresh the local OSM landmark index for BAHABA's five supported areas.

No post content or credentials are sent to OSM. Resolution is offline at runtime.
Run with Python 3: python scripts/refresh-flood-landmarks.py
"""
import json
import time
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
AREAS = [('navotas', 379812), ('marikina', 146949), ('malolos', 16685975),
         ('bulacan', 1504656), ('pampanga', 1504669)]


def administrative_rings(relation_id):
    cache = ROOT / 'recovery.local/osm-boundaries'
    cache.mkdir(parents=True, exist_ok=True)
    target = cache / f'{relation_id}.json'
    if not target.exists():
        request = Request(f'https://www.openstreetmap.org/api/0.6/relation/{relation_id}/full.json',
                          headers={'User-Agent': 'BAHABA-thesis-landmark-setup/1.0'})
        with urlopen(request, timeout=40) as response:
            data = json.load(response)
        target.write_text(json.dumps(data), encoding='utf-8')
    data = json.loads(target.read_text(encoding='utf-8'))
    nodes = {item['id']: [item['lon'], item['lat']] for item in data['elements'] if item['type'] == 'node'}
    ways = {item['id']: item['nodes'] for item in data['elements'] if item['type'] == 'way'}
    relation = next(item for item in data['elements'] if item['type'] == 'relation' and item['id'] == relation_id)
    result = {'outer': [], 'inner': []}
    for role in result:
        pending = [ways[member['ref']][:] for member in relation['members'] if member['type'] == 'way'
                   and (member.get('role') or 'outer') == role and member['ref'] in ways]
        while pending:
            ring = pending.pop()
            while ring[-1] != ring[0]:
                for index, way in enumerate(pending):
                    if way[0] == ring[-1]: ring.extend(way[1:])
                    elif way[-1] == ring[-1]: ring.extend(way[-2::-1])
                    else: continue
                    pending.pop(index)
                    break
                else:
                    raise RuntimeError('Incomplete OSM city boundary; existing index was preserved')
            result[role].append([nodes[node] for node in ring])
    if not result['outer']:
        raise RuntimeError('OSM city boundary has no outer ring')
    return result


def inside_ring(point, ring):
    x, y = point
    inside = False
    for a, b in zip(ring, ring[1:]):
        if (a[1] > y) != (b[1] > y) and x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]:
            inside = not inside
    return inside


def refresh():
    config = json.loads((ROOT / 'location-config.json').read_text(encoding='utf-8'))
    locations = {value['id']: value for value in config['locations']}
    overrides = json.loads((ROOT / 'src/assets/flood-landmark-overrides.json').read_text(encoding='utf-8'))
    output = []
    for location_id, relation_id in AREAS:
        location = locations[location_id]
        boundary = administrative_rings(relation_id)
        points = [point for ring in boundary['outer'] for point in ring]
        bbox = f"{min(p[1] for p in points)},{min(p[0] for p in points)},{max(p[1] for p in points)},{max(p[0] for p in points)}"
        query = f'''[out:json][timeout:40];
        (nwr["name"]["amenity"]({bbox});nwr["name"]["shop"]({bbox});
         nwr["name"]["tourism"]({bbox});way["name"]["highway"]({bbox}););
        out center tags;'''
        failure = None
        for endpoint in ('https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'):
            url = endpoint + '?' + urlencode({'data': query})
            request = Request(url, headers={'User-Agent': 'BAHABA-thesis-landmark-setup/1.0'})
            try:
                with urlopen(request, timeout=55) as response:
                    data = json.load(response)
                failure = None
                break
            except Exception as exc:
                failure = exc
                print(f'{location_id}: map service unavailable, trying mirror', flush=True)
        if failure:
            raise RuntimeError('OSM download unavailable; existing index was preserved') from failure
        if data.get('remark'):
            raise RuntimeError('OSM returned an incomplete area response; existing index was preserved')
        count = 0
        for element in data['elements']:
            tags = element.get('tags', {})
            name = tags.get('name', '').strip()
            center = element.get('center') or element
            if len(name.split()) < 2 or 'lat' not in center or 'lon' not in center:
                continue
            coordinate = [center['lon'], center['lat']]
            if not any(inside_ring(coordinate, ring) for ring in boundary['outer']) or any(inside_ring(coordinate, ring) for ring in boundary['inner']):
                continue
            names = [name] + [tags[key] for key in ('alt_name', 'official_name', 'short_name') if tags.get(key)]
            aliases = sorted({alias.strip().lower() for value in names for alias in value.split(';') if len(alias.strip().split()) >= 2})
            output.append({'id': f"osm-{element['type']}-{element['id']}-{location_id}",
                'name': name, 'city': locations[location_id]['city'],
                'barangay': '', 'aliases': aliases, 'contextAliases': [],
                'coordinates': [center['lon'], center['lat']],
                'precision': 'street' if tags.get('highway') else 'landmark',
                'source': f"https://www.openstreetmap.org/{element['type']}/{element['id']}"})
            count += 1
        print(f'{location_id}: {count} named mapped places', flush=True)
        time.sleep(2)
    # Curated aliases/verified coordinates take precedence over downloaded records.
    for override in overrides:
        output = [row for row in output if not (row['source'] == override['source'] and row['city'] == override['city'])]
        output.append(override)
    target = ROOT / 'src/assets/flood-landmarks.json'
    temporary = target.with_suffix('.tmp')
    temporary.write_text(json.dumps(output, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    temporary.replace(target)
    print(f'Saved {len(output)} records. Data © OpenStreetMap contributors, ODbL.', flush=True)


if __name__ == '__main__':
    refresh()
