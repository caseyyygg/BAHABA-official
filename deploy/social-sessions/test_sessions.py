import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch

from fastapi import HTTPException
import app


class SessionIsolationTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.previous_root = app.ROOT
        app.ROOT = Path(self.temporary.name)
        app.sessions.clear()

    def tearDown(self):
        app.ROOT = self.previous_root
        self.temporary.cleanup()

    def action(self, **changes):
        return app.Action(**dict({'scope': 'bulacan', 'platform': 'Facebook', 'owner': 'a'*64, 'operation': 'disconnect'}, **changes))

    async def test_cookie_import_without_login_browser(self):
        for platform, raw in [('Facebook', 'c_user=test; xs=test=value'), ('X', 'auth_token=test; ct0=test'), ('Threads', 'sessionid=test')]:
            result = await app.operate(self.action(platform=platform, operation='import-session', text=json.dumps(raw)))
            self.assertTrue(result['connected'])
            self.assertIsNotNone(app.saved_state('bulacan', platform))
        self.assertFalse(app.sessions)

    async def test_invalid_import_preserves_existing_session(self):
        await app.operate(self.action(operation='import-session', text='c_user=test; xs=valid'))
        path = app.state_path('bulacan', 'Facebook')
        previous = path.read_bytes()
        with self.assertRaises(HTTPException):
            await app.operate(self.action(operation='import-session', text='c_user=test'))
        self.assertEqual(path.read_bytes(), previous)

    async def test_import_preserves_threads_cookie_domain(self):
        raw = json.dumps([{'name': 'sessionid', 'value': 'test', 'domain': '.instagram.com'}])
        await app.operate(self.action(platform='Threads', operation='import-session', text=raw))
        state = app.saved_state('bulacan', 'Threads')['storage']
        self.assertEqual(state['cookies'][0]['domain'], '.instagram.com')

    async def test_scope_path_traversal_rejected(self):
        with self.assertRaises(HTTPException) as caught:
            app.state_path('../../malolos', 'Facebook')
        self.assertEqual(caught.exception.status_code, 422)

    async def test_disconnect_only_selected_lgu_platform(self):
        for scope, platform in [('bulacan', 'Facebook'), ('malolos', 'Facebook'), ('bulacan', 'X')]:
            path = app.state_path(scope, platform)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('{}')
        await app.operate(self.action())
        self.assertFalse(app.state_path('bulacan', 'Facebook').exists())
        self.assertTrue(app.state_path('malolos', 'Facebook').exists())
        self.assertTrue(app.state_path('bulacan', 'X').exists())

    async def test_another_login_owner_cannot_operate_browser(self):
        app.sessions[('bulacan', 'Facebook')] = {'owner': 'b'*64}
        with self.assertRaises(HTTPException) as caught:
            await app.operate(self.action())
        self.assertEqual(caught.exception.status_code, 409)

    async def test_failed_login_does_not_replace_saved_session(self):
        path = app.state_path('bulacan', 'Facebook')
        path.parent.mkdir()
        path.write_text('existing session')
        context = AsyncMock()
        context.cookies.return_value = []
        context.pages = []
        page = AsyncMock()
        page.url = 'https://www.facebook.com/'
        page.locator = lambda selector: type('Locator', (), {'count': AsyncMock(return_value=0)})()
        app.sessions[('bulacan', 'Facebook')] = {'owner': 'a'*64, 'context': context, 'page': page}
        with self.assertRaises(HTTPException) as caught:
            await app.operate(self.action(operation='save'))
        self.assertEqual(caught.exception.status_code, 422)
        self.assertEqual(path.read_text(), 'existing session')

    async def test_authentication_rejects_other_platform_domains_and_expiry(self):
        self.assertFalse(app.authenticated('Facebook', [{'name': n, 'value': 'x', 'domain': 'evilfacebook.com'} for n in ['c_user','xs']]))
        self.assertFalse(app.authenticated('X', [{'name': n, 'value': 'x', 'domain': '.x.com', 'expires': 1} for n in ['auth_token','ct0']]))
        self.assertTrue(app.authenticated('Facebook', [{'name': n, 'value': 'x', 'domain': '.facebook.com'} for n in ['c_user','xs']]))

    async def test_cancel_preserves_saved_session(self):
        path = app.state_path('bulacan', 'Facebook')
        path.parent.mkdir()
        path.write_text('{}')
        await app.operate(self.action(operation='cancel'))
        self.assertTrue(path.exists())

    async def test_gateway_requires_service_token(self):
        previous = app.TOKEN
        app.TOKEN = 'private-test-token'
        try:
            with self.assertRaises(HTTPException) as caught:
                await app.authorized('Bearer wrong-token')
            self.assertEqual(caught.exception.status_code, 401)
            await app.authorized('Bearer private-test-token')
        finally:
            app.TOKEN = previous

    async def test_start_waits_for_visible_controls_before_screenshot(self):
        context, page = AsyncMock(), AsyncMock()
        context.set_default_timeout = Mock()
        page.on = Mock()
        context.new_page.return_value = page
        context.pages = [page]
        page.locator = Mock(return_value=Mock(first=Mock(wait_for=AsyncMock())))
        page.screenshot.return_value = b'jpeg'
        fake_browser = Mock(new_context=AsyncMock(return_value=context))
        with patch.object(app, 'browser', fake_browser):
            result = await app.operate(self.action(operation='start'))
        page.goto.assert_awaited_once_with(app.PLATFORMS['Facebook'], wait_until='commit', timeout=15000)
        page.locator.return_value.first.wait_for.assert_awaited_once_with(timeout=10000)
        self.assertTrue(result['image'])

    async def test_control_timeout_still_shows_platform_challenge(self):
        context, page = AsyncMock(), AsyncMock()
        context.set_default_timeout = Mock()
        page.on = Mock()
        context.new_page.return_value = page
        context.pages = [page]
        page.locator = Mock(return_value=Mock(first=Mock(wait_for=AsyncMock(side_effect=app.BrowserTimeout('slow page')))))
        page.screenshot.return_value = b'challenge'
        with patch.object(app, 'browser', Mock(new_context=AsyncMock(return_value=context))):
            result = await app.operate(self.action(operation='start'))
        self.assertTrue(result['image'])
        context.close.assert_not_awaited()


if __name__ == '__main__':
    unittest.main()
