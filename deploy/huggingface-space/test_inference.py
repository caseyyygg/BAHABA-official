"""Check test inference cannot write synthetic reports, without loading weights."""
import ast
from pathlib import Path
import unittest
from types import SimpleNamespace
from typing import Any
from unittest.mock import Mock


class InferenceRoutingTests(unittest.TestCase):
    def setUp(self):
        tree = ast.parse(Path(__file__).with_name('app.py').read_text(encoding='utf-8'))
        function = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == '_detect_and_forward')
        self.ingest = Mock(return_value={'ok': True})
        scope = {'DetectionRequest': SimpleNamespace, 'Any': Any, 'load_models': Mock(),
                 '_classify': lambda name, text: {'flood': ('Flood', .9), 'severity': ('High', .8),
                                                'urgency': ('Distressed', .8)}[name],
                 '_extract_location': lambda text: 'Navotas', '_ingest': self.ingest}
        exec(compile(ast.Module(body=[function], type_ignores=[]), 'app.py', 'exec'), scope)
        self.detect = scope['_detect_and_forward']
        self.post = SimpleNamespace(source='Test', post_id='test', post_text='Baha sa Navotas',
                                    post_url=None, location=None, city=None, barangay=None, timestamp=None, publisher_id=None, original_post_id=None, is_repost=False)

    def test_inference_only_does_not_ingest(self):
        result = self.detect(self.post, persist=False)
        self.ingest.assert_not_called()
        self.assertIsNone(result['stored'])
        self.assertEqual(result['detection']['classification'], 'Flood')
        self.assertEqual(result['detection']['location'], 'Navotas')

    def test_collector_still_forwards_results(self):
        result = self.detect(self.post)
        self.ingest.assert_called_once_with(result['detection'])
        self.assertEqual(result['stored'], {'ok': True})


if __name__ == '__main__':
    unittest.main()
