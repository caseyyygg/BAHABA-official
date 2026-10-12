import importlib.util
import threading
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch, Mock

path = Path(__file__).resolve().parents[2] / 'bahaba-app/scripts/admin-scoped-collectors.py'
spec = importlib.util.spec_from_file_location('scoped_collectors', path)
collectors = importlib.util.module_from_spec(spec)
with patch.dict('sys.modules', {'x_agent_reach':types.ModuleType('x_agent_reach')}):
    spec.loader.exec_module(collectors)


class ScopedCollectorTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.original_base = collectors.BASE
        collectors.BASE = Path(self.temporary.name)

    def tearDown(self):
        collectors.BASE = self.original_base
        self.temporary.cleanup()

    def run_poll(self, saved, current=None):
        stop = threading.Event()
        forward = Mock()
        calls = 0
        def gateway(scope, platform):
            nonlocal calls
            calls += 1
            return saved if calls == 1 else current
        def wait(seconds):
            stop.set()
        post = {'id':'123','text':'baha in Bulacan','url':'https://www.facebook.com/example/posts/123'}
        collectors.states.clear()
        with patch.object(collectors,'SCOPES',{'bulacan':'Bulacan'}), patch.object(collectors,'PLATFORMS',('Facebook',)), patch.object(collectors,'gateway',side_effect=gateway), patch.object(collectors,'fetch',return_value=[post]) as fetch, patch.object(stop,'wait',side_effect=wait):
            collectors.poll(stop,forward,lambda path:set(),lambda seen,path:None)
        return forward, fetch

    def test_disconnected_account_never_fetches_shared_credentials(self):
        forward, fetch = self.run_poll(None)
        fetch.assert_not_called()
        forward.assert_not_called()

    def test_disconnect_discards_in_flight_results(self):
        forward, fetch = self.run_poll({'revision':'old'})
        fetch.assert_called_once()
        forward.assert_not_called()

    def test_switch_discards_previous_account_results(self):
        forward, fetch = self.run_poll({'revision':'old'},{'revision':'new'})
        forward.assert_not_called()

    def test_matching_account_revision_forwards_result(self):
        forward, fetch = self.run_poll({'revision':'same'},{'revision':'same'})
        forward.assert_called_once()
        self.assertEqual(forward.call_args.args[0]['post_id'],'123')


if __name__ == '__main__':
    unittest.main()
