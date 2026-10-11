"""Synthetic workbook tests; these do not certify the inaccessible current PSA file."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from xml.sax.saxutils import escape
from zipfile import ZipFile

spec = importlib.util.spec_from_file_location('psgc_import', Path(__file__).with_name('import-psgc.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ImportTests(unittest.TestCase):
    def workbook(self, path, rows):
        rows = [['10-digit PSGC','Name','Geographic Level','Correspondence Code']] + rows
        xml = '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
        for i, row in enumerate(rows,1):
            xml += f'<row r="{i}">'
            for j, value in enumerate(row):
                xml += f'<c r="{chr(65+j)}{i}" t="inlineStr"><is><t>{escape(value)}</t></is></c>'
            xml += '</row>'
        xml += '</sheetData></worksheet>'
        with ZipFile(path,'w') as z:
            z.writestr('xl/workbook.xml','<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="PSGC" r:id="rId1"/></sheets></workbook>')
            z.writestr('xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>')
            z.writestr('xl/worksheets/sheet1.xml',xml)

    def rows(self):
        rows = [['0100000000','Test Region','Reg','010000000']]
        for p in range(1,81):
            rows.append([f'01{p:03d}00000',f'Province {p}','Prov',''])
            for c in range(1,21): rows.append([f'01{p:03d}{c:02d}000','San Jose' if c==1 else f'Town {c}','Mun','012801000'])
        rows.append(['1380600000','Test Independent City','City','133900000'])
        return rows

    def test_codes_names_hierarchy_checksum(self):
        with tempfile.TemporaryDirectory() as directory:
            file=Path(directory)/'fixture.xlsx'
            self.workbook(file,self.rows())
            result=module.import_registry(file,'SYNTHETIC-TEST')
            self.assertEqual(len(result['locations']),1601)
            self.assertEqual(result['locations'][0]['id'],'0100101000')
            self.assertEqual(result['locations'][0]['province'],'Province 1')
            self.assertNotEqual(result['locations'][0]['name'],result['locations'][20]['name'])
            self.assertEqual(result['locations'][-1]['province'],'')
            self.assertEqual(len(result['sha256']),64)

    def test_incomplete_or_duplicate_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            file=Path(directory)/'fixture.xlsx'
            self.workbook(file,self.rows()[:4])
            with self.assertRaises(ValueError): module.import_registry(file,'SYNTHETIC-TEST')
            rows=self.rows(); rows.append(rows[2])
            self.workbook(file,rows)
            with self.assertRaises(ValueError): module.import_registry(file,'SYNTHETIC-TEST')

if __name__ == '__main__': unittest.main()
