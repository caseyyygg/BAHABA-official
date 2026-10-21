import unittest
from unittest.mock import AsyncMock, Mock
from fastapi import HTTPException
from app import fill_login_field

class LoginFieldTests(unittest.IsolatedAsyncioTestCase):
    async def test_identifier_selects_visible_platform_field(self):
        for platform in ('X', 'Threads'):
            field = Mock(first=Mock(fill=AsyncMock()), count=AsyncMock(return_value=1))
            page = Mock(locator=Mock(return_value=field))
            await fill_login_field(page, platform, 'fill-identifier', 'fixture-user')
            self.assertIn(':visible', page.locator.call_args.args[0])
            self.assertIn('username', page.locator.call_args.args[0])
            field.first.fill.assert_awaited_once_with('fixture-user')

    async def test_password_never_types_into_username(self):
        field = Mock(first=Mock(fill=AsyncMock()), count=AsyncMock(return_value=1))
        page = Mock(locator=Mock(return_value=field))
        await fill_login_field(page, 'Threads', 'fill-password', 'fixture-password')
        page.locator.assert_called_once_with('input[type="password"]:visible')
        field.first.fill.assert_awaited_once_with('fixture-password')

    async def test_missing_field_requires_next_step(self):
        page = Mock(locator=Mock(return_value=Mock(count=AsyncMock(return_value=0))))
        with self.assertRaises(HTTPException) as caught:
            await fill_login_field(page, 'X', 'fill-password', 'fixture-password')
        self.assertEqual(caught.exception.status_code, 422)

if __name__ == '__main__':
    unittest.main()
