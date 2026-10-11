"""Import the official PSA workbook without third-party dependencies.

Usage: py scripts/import-psgc.py path/to/PSGC-2Q-2026-Publication-Datafile.xlsx 2026-Q2
The workbook is obtained from https://psa.gov.ph/classification/psgc .
This replaces the provisional mirror registry; no geographic IDs are inferred.
"""
import hashlib
import json
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET
from zipfile import ZipFile

NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}

def workbook_rows(path):
    with ZipFile(path) as z:
        strings = []
        if 'xl/sharedStrings.xml' in z.namelist():
            strings = [''.join(si.itertext()) for si in ET.fromstring(z.read('xl/sharedStrings.xml'))]
        sheets = ET.fromstring(z.read('xl/workbook.xml')).find('s:sheets', NS)
        rels = {r.attrib['Id']: r.attrib['Target'] for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
        sheet = next(s for s in sheets if s.attrib['name'].strip().upper() == 'PSGC')
        target = rels[sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]
        name = target.lstrip('/') if target.startswith('/') else 'xl/' + target
        for row in ET.fromstring(z.read(name)).findall('.//s:sheetData/s:row', NS):
            values = {}
            for c in row:
                col = re.sub(r'\d+', '', c.attrib['r'])
                v = c.find('s:v', NS)
                value = v.text if v is not None else ''
                if c.attrib.get('t') == 's': value = strings[int(value)]
                elif c.attrib.get('t') == 'inlineStr': value = ''.join(c.find('s:is', NS).itertext())
                values[col] = value or ''
            yield values

def import_registry(path, version):
    rows = list(workbook_rows(path))
    header = next(r for r in rows if any('Geographic Level' in v for v in r.values()))
    def column(fragment):
        return next(k for k, v in header.items() if fragment.lower() in v.lower())
    code_col = column('10-digit')
    name_col = column('name')
    level_col = column('Geographic Level')
    correspondence_col = column('Correspondence')
    locations = []
    region = province = None
    for row in rows[rows.index(header) + 1:]:
        code = row.get(code_col, '').strip()
        if not code.isdigit(): continue
        code = code.zfill(10)
        name = row.get(name_col, '').strip()
        level = row.get(level_col, '').strip()
        if level == 'Reg': region = (code, name); province = None
        elif level == 'Prov': province = (code, name)
        elif level in ('City', 'Mun'):
            if not region: raise ValueError('Municipality without region')
            # HUC entries can follow a province in PSA order. Use code hierarchy,
            # not the preceding province, to avoid assigning a false province.
            parent = province if province and province[0][:5] == code[:5] else None
            locations.append({'id': code, 'city': name, 'province': parent[1] if parent else '',
                'province_id': parent[0] if parent else None, 'region': region[1], 'region_id': region[0],
                'correspondence_code': row.get(correspondence_col, '').zfill(9),
                'type': 'city' if level == 'City' else 'municipality',
                'name': name + ', ' + (parent[1] if parent else region[1])})
    if len(locations) < 1600 or len({l['id'] for l in locations}) != len(locations):
        raise ValueError('Incomplete or duplicate municipality registry')
    return {'source': 'https://psa.gov.ph/classification/psgc', 'status': 'official-workbook',
            'version': version, 'sha256': hashlib.sha256(Path(path).read_bytes()).hexdigest(), 'locations': locations}

if __name__ == '__main__':
    output = Path(__file__).resolve().parents[1] / 'psgc-registry.json'
    output.write_text(json.dumps(import_registry(sys.argv[1], sys.argv[2]), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
