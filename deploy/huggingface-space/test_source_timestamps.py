"""Original post dates must survive collection without fallback dates."""
import ast
from datetime import datetime, timezone
import hashlib
import importlib.util
from pathlib import Path
from types import SimpleNamespace
from typing import Any
import time
import unittest


spec = importlib.util.spec_from_file_location('timestamp_browser', Path(__file__).with_name('social_browser.py'))
browser = importlib.util.module_from_spec(spec)
spec.loader.exec_module(browser)


class SourceTimestampTests(unittest.TestCase):
    def setUp(self):
        tree = ast.parse(Path(__file__).with_name('app.py').read_text(encoding='utf-8'))
        names = {'_normalize_feed_entry', '_normalize_x_post', '_apify_timestamp'}
        functions = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in names]
        self.scope = {
            'Any': Any, 'DetectionRequest': SimpleNamespace, 'MAX_TEXT_LENGTH': 60000,
            'hashlib': hashlib, 'time': time,
            'RSS_DEFAULT_CITY': None, 'RSS_DEFAULT_BARANGAY': None,
            '_feed_entry_string': lambda entry, key: str(entry.get(key) or ''),
            'original_timestamp': browser.original_timestamp, 'x_post_timestamp': browser.x_post_timestamp,
        }
        exec(compile(ast.Module(body=functions, type_ignores=[]), 'app.py', 'exec'), self.scope)

    def test_feed_update_is_not_relabelled_as_original_publication(self):
        post = self.scope['_normalize_feed_entry']({'title':'Baha Navotas','link':'https://example.org/post','updated':'2026-11-09T00:00:00Z'},'https://example.org/feed','Feed')
        self.assertIsNone(post.timestamp)

    def test_feed_preserves_original_publication_before_update(self):
        post = self.scope['_normalize_feed_entry']({'title':'Baha Navotas','published':'2026-10-24T08:00:00+08:00','updated':'2026-11-09T00:00:00Z'},'https://example.org/feed','Feed')
        self.assertEqual(post.timestamp,'2026-10-24T00:00:00+00:00')

    def test_x_original_id_wins_over_a_wrong_scraper_date(self):
        published = datetime(2026,10,24,6,tzinfo=timezone.utc)
        identity = str((int(published.timestamp()*1000)-1288834974657)<<22)
        post = self.scope['_normalize_x_post']({'id':identity,'text':'Baha Navotas','createdAt':'2026-11-09T00:00:00Z'})
        self.assertEqual(post.timestamp,published.isoformat())

    def test_invalid_scraper_timestamp_remains_unknown(self):
        for value in (None,'invalid','Nov 9',True):
            self.assertIsNone(self.scope['_apify_timestamp'](value))
        self.assertEqual(self.scope['_apify_timestamp'](1792800000000),browser.original_timestamp(1792800000))


if __name__ == '__main__':
    unittest.main()
