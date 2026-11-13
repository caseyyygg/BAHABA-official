import importlib.util
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
spec=importlib.util.spec_from_file_location('search_adapter',Path(__file__).with_name('x_agent_reach.py'))
adapter=importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)
class SearchInitTests(unittest.TestCase):
    def test_authenticated_homepage_initializes_search_without_sending_cookies_to_assets(self):
        backend=types.ModuleType('twitter_cli.client')
        package=types.ModuleType('twitter_cli');package.client=backend
        backend._gen_ct_headers=Mock(return_value={'User-Agent':'test'})
        session=Mock()
        session.get.side_effect=[Mock(status_code=200,content=b'<html></html>',text='<html></html>'),Mock(status_code=200,text='public-script')]
        backend._get_cffi_session=Mock(return_value=session)
        backend.get_ondemand_file_url=Mock(return_value='https://abs.twimg.com/script.js')
        backend.ClientTransaction=Mock(return_value='ready')
        backend._update_features_from_html=Mock()
        client=Mock(_client_transaction=None)
        with patch.dict('sys.modules',{'twitter_cli':package,'twitter_cli.client':backend}),patch.dict('os.environ',{'TWITTER_COOKIE_STRING':'auth_token=scoped; ct0=csrf'}):
            adapter.initialize_signed_in_search(client,'scoped','csrf')
        self.assertEqual(client._client_transaction,'ready')
        self.assertEqual(session.get.call_args_list[0].args[0],'https://x.com/home')
        self.assertEqual(session.get.call_args_list[0].kwargs['headers']['Cookie'],'auth_token=scoped; ct0=csrf')
        self.assertNotIn('Cookie',session.get.call_args_list[1].kwargs['headers'])
    def test_existing_initialization_is_preserved(self):
        client=Mock(_client_transaction='ready')
        adapter.initialize_signed_in_search(client,'scoped','csrf')
        self.assertEqual(client._client_transaction,'ready')
if __name__=='__main__':unittest.main()
