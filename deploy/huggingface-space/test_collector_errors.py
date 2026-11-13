import importlib.util
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location('online_scoped_collectors', Path(__file__).with_name('scoped_collectors.py'))
collectors = importlib.util.module_from_spec(spec)
with patch.dict('sys.modules', {'x_agent_reach': types.ModuleType('x_agent_reach')}):
    spec.loader.exec_module(collectors)


class CollectorErrorTests(unittest.TestCase):
    def check_error(self, payload, expected):
        collectors.states.clear()
        with tempfile.TemporaryDirectory() as directory, patch.object(collectors, 'BASE', Path(directory)), \
                patch.object(collectors.subprocess, 'run', return_value=Mock(returncode=1, stdout=payload)) as run:
            with self.assertRaises(collectors.CollectionError) as caught:
                collectors.fetch('navotas', 'Facebook', {'storage': {'cookies': []}})
            self.assertEqual(str(caught.exception), expected)
            self.assertIn('q=Navotas', run.call_args.args[0][3])
            self.assertFalse((Path(directory) / '.state/lgu-accounts/navotas/facebook.json').exists())

    def test_platform_verification_error_is_preserved(self):
        self.check_error('{"error":"login_required"}', 'login_required')

    def test_unknown_error_cannot_expose_private_details(self):
        self.check_error('{"error":"private credentials"}', 'unavailable')

if __name__ == '__main__':
    unittest.main()
