import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock

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


if __name__ == '__main__':
    unittest.main()
