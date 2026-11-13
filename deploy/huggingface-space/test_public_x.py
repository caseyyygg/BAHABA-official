import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import types
import unittest
from datetime import datetime, timezone
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location('public_collectors', Path(__file__).with_name('scoped_collectors.py'))
collectors = importlib.util.module_from_spec(spec)
with patch.dict('sys.modules', {'x_agent_reach': types.ModuleType('x_agent_reach')}):
    spec.loader.exec_module(collectors)

class PublicXTests(unittest.TestCase):
    def setUp(self):
        self.identity = str((int(datetime.now(timezone.utc).timestamp() * 1000) - 1288834974657) << 22)
        self.saved = {'storage': {'cookies': [
            {'name': 'auth_token', 'value': 'scope-auth', 'domain': '.x.com'},
            {'name': 'ct0', 'value': 'scope-csrf', 'domain': '.x.com'},
            {'name': 'auth_token', 'value': 'wrong-domain', 'domain': 'other.example'},
        ]}}

    def test_public_author_reaches_nlp_with_original_identity_and_location(self):
        tweet = {'id': self.identity, 'text': 'baha na po sa navotas, daanghari. hanggang bewang po.', 'author': {'username': 'lauveyfan'}}
        with patch.object(collectors.x_agent_reach, 'fetch_posts', return_value={'tweets': [tweet]}, create=True) as fetch:
            posts = collectors.x_search_posts(self.saved, 'Navotas', 50)
        self.assertEqual(len(posts), 1)
        self.assertEqual(posts[0]['url'], f'https://x.com/lauveyfan/status/{self.identity}')
        self.assertEqual(collectors.post_scope(posts[0]), 'navotas')
        self.assertTrue(collectors.is_flood_candidate(posts[0]))
        self.assertEqual(fetch.call_args.kwargs['scoped_credentials'], {'TWITTER_AUTH_TOKEN': 'scope-auth', 'TWITTER_CT0': 'scope-csrf', 'TWITTER_COOKIE_STRING': 'auth_token=scope-auth; ct0=scope-csrf'})

    def test_missing_scoped_cookies_cannot_use_shared_credentials(self):
        with patch.object(collectors.x_agent_reach, 'fetch_posts', create=True) as fetch:
            with self.assertRaises(collectors.CollectionError):
                collectors.x_search_posts({'storage': {'cookies': []}}, 'Navotas', 50)
            fetch.assert_not_called()

    def test_city_search_recurs_while_barangays_rotate(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(collectors, 'BASE', Path(directory)):
            (Path(directory) / 'collector-locations.json').write_text(json.dumps({'navotas': ['Daanghari', 'Bangkulasi']}))
            collectors.states.clear()
            queries = [collectors.search_query('navotas', 'X') for _ in range(8)]
        self.assertTrue(all('"Navotas"' in query for query in queries))
        self.assertTrue(any('Daanghari' in query for query in queries))

    def test_watched_profile_is_checked_before_search(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(collectors, 'BASE', Path(directory)), patch.object(collectors, 'settings', return_value={'X_PROVIDER':'agent-reach'}), patch.object(collectors, 'monitored_x_profile', return_value=['https://x.com/BANTALA_APP']), patch.object(collectors, 'x_search_posts', return_value=[{'id':self.identity,'text':'baha navotas','created_at':datetime.now(timezone.utc).isoformat()}]) as search, patch.object(collectors.subprocess, 'run', return_value=Mock(returncode=0, stdout='{"posts":[]}')) as browser:
            collectors.fetch('navotas', 'X', self.saved)
            search.assert_called_once()
            browser.assert_called_once()

    def test_single_profile_mode_avoids_search_and_checks_only_target(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(collectors, 'BASE', Path(directory)), patch.object(collectors, 'settings', return_value={'X_PROVIDER':'agent-reach'}), patch.object(collectors, 'x_search_posts') as search, patch.object(collectors.subprocess, 'run', return_value=Mock(returncode=0, stdout='{"posts":[]}')) as browser:
            (Path(directory) / 'collector-profiles.json').write_text(json.dumps({'navotas':{'handles':['lauveyfan'],'profile_only':True}}))
            collectors.states.clear()
            posts = collectors.fetch('navotas', 'X', self.saved)
        self.assertEqual(posts, [])
        search.assert_not_called()
        self.assertIn('https://x.com/lauveyfan', browser.call_args.args[0])

    def test_poll_waits_only_remaining_interval_and_retries_after_slow_cycle(self):
        for duration, expected_wait in [(12, 168), (200, 1)]:
            stop = threading.Event()
            def wait(delay):
                stop.set()
            with tempfile.TemporaryDirectory() as directory, patch.object(collectors, 'BASE', Path(directory)), patch.object(collectors, 'SCOPES', {'navotas':'Navotas'}), patch.object(collectors, 'PLATFORMS', ('X',)), patch.object(collectors, 'gateway', return_value=None), patch.object(collectors, 'settings', return_value={}), patch.object(collectors.time, 'monotonic', side_effect=[100, 100 + duration]), patch.object(stop, 'wait', side_effect=wait) as pause:
                collectors.poll(stop, Mock(), Mock(), Mock(), accounts={('navotas','X')})
                pause.assert_called_once_with(expected_wait)

    def test_single_profile_poll_interval_is_sixty_seconds(self):
        stop = threading.Event()
        def wait(delay):
            stop.set()
        with tempfile.TemporaryDirectory() as directory, patch.object(collectors, 'BASE', Path(directory)), patch.object(collectors, 'SCOPES', {'navotas':'Navotas'}), patch.object(collectors, 'PLATFORMS', ('X',)), patch.object(collectors, 'gateway', return_value=None), patch.object(collectors, 'settings', return_value={}), patch.object(collectors.time, 'monotonic', side_effect=[100, 112]), patch.object(stop, 'wait', side_effect=wait) as pause:
            (Path(directory) / 'collector-profiles.json').write_text(json.dumps({'navotas':{'handles':['lauveyfan'],'profile_only':True}}))
            collectors.poll(stop, Mock(), Mock(), Mock(), accounts={('navotas','X')})
            pause.assert_called_once_with(48)

    def test_health_distinguishes_live_worker_from_between_poll_sleep(self):
        collectors.states['navotas:X'] = {'running':False,'connected':True}
        thread = Mock()
        thread.name = 'lgu-social-navotas-x'
        thread.is_alive.return_value = True
        with patch.object(collectors, 'workers', [thread]):
            self.assertTrue(collectors.health()['navotas:X']['polling_active'])
            self.assertFalse(collectors.health()['navotas:X']['running'])

if __name__ == '__main__':
    unittest.main()
