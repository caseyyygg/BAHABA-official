"""Private browser login gateway. Only the authenticated PHP API calls this service.

One saved browser state per LGU/platform; no shared/local collector credentials
are imported. Deploy with one worker and a private persistent SESSION_DIRECTORY.
"""
import asyncio
import base64
import hmac
import hashlib
import json
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlparse

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from playwright.async_api import async_playwright

ROOT = Path(os.getenv('SESSION_DIRECTORY', '/data/social-sessions')).resolve()
TOKEN = os.getenv('SOCIAL_BROWSER_TOKEN', '')
PLATFORMS = {'Facebook': 'https://www.facebook.com/login/',
             'X': 'https://x.com/i/flow/login',
             'Threads': 'https://www.threads.com/login'}
SCOPES = {'navotas', 'bulacan', 'marikina', 'pampanga', 'malolos'}
sessions = {}
browser = None
guard = asyncio.Lock()


async def authorized(authorization: str = Header(default='')):
    if not TOKEN:
        raise HTTPException(503, 'Browser service is not configured')
    if not hmac.compare_digest(authorization, 'Bearer ' + TOKEN):
        raise HTTPException(401, 'Service authentication required')


def state_path(scope, platform):
    if scope not in SCOPES or platform not in PLATFORMS:
        raise HTTPException(422, 'Choose a supported LGU and platform')
    return ROOT / scope / (platform.lower() + '.json')


def saved_state(scope, platform):
    path = state_path(scope, platform)
    try:
        raw = path.read_bytes()
        state = json.loads(raw)
        if not authenticated(platform, state['cookies']):
            return None
        return {'storage': state, 'revision': hashlib.sha256(raw).hexdigest()}
    except (OSError, ValueError, KeyError, TypeError):
        return None


def authenticated(platform, cookies):
    domains = {'Facebook': ('facebook.com',), 'X': ('x.com', 'twitter.com'),
               'Threads': ('threads.com', 'threads.net', 'instagram.com')}[platform]
    names = {c['name'] for c in cookies if c.get('value') and
             any(c.get('domain', '').lstrip('.') == d or c.get('domain', '').endswith('.' + d) for d in domains)
             and (c.get('expires', -1) == -1 or c.get('expires', 0) > time.time())}
    required = {'Facebook': {'c_user', 'xs'}, 'X': {'auth_token', 'ct0'}, 'Threads': {'sessionid'}}
    return required[platform].issubset(names)


async def close(key):
    session = sessions.pop(key, None)
    if session:
        await session['context'].close()


async def expire():
    while True:
        await asyncio.sleep(30)
        async with guard:
            for key, session in list(sessions.items()):
                if time.monotonic() - session['touched'] > 600:
                    await close(key)


@asynccontextmanager
async def lifespan(app):
    global browser
    ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True, **({'channel': os.environ['BROWSER_CHANNEL']} if os.getenv('BROWSER_CHANNEL') else {}))
        task = asyncio.create_task(expire())
        yield
        task.cancel()
        await browser.close()


app = FastAPI(lifespan=lifespan, dependencies=[Depends(authorized)])


@app.get('/accounts/{scope}')
async def accounts(scope: str):
    result = []
    for platform in PLATFORMS:
        state = saved_state(scope, platform)
        result.append({'platform': platform, 'connected': bool(state), 'revision': state['revision'] if state else None})
    return {'accounts': result}


@app.get('/collector-state/{scope}/{platform}')
async def collector_state(scope: str, platform: str):
    # Server-to-server only. The PHP proxy never exposes this route to browsers.
    state = saved_state(scope, platform)
    if not state:
        raise HTTPException(404, 'No active account for this LGU and platform')
    return state


class Action(BaseModel):
    scope: str
    platform: str
    owner: str = Field(min_length=32, max_length=128, pattern=r'^[a-f0-9]+$')
    operation: str
    x: float = Field(default=0, ge=0, le=1000)
    y: float = Field(default=0, ge=0, le=720)
    text: str = Field(default='', max_length=2000)
    key: str = ''
    delta: int = Field(default=0, ge=-1000, le=1000)


@app.post('/browser')
async def operate(data: Action):
    path = state_path(data.scope, data.platform)
    key = (data.scope, data.platform)
    async with guard:
        session = sessions.get(key)
        if session and session['owner'] != data.owner:
            raise HTTPException(409, 'Another administrator is signing in for this LGU. Try again later.')
        if data.operation == 'disconnect':
            await close(key)
            path.unlink(missing_ok=True)
            return {'connected': False}
        if data.operation == 'cancel':
            await close(key)
            return {'cancelled': True}
        if data.operation == 'start':
            await close(key)
            if len(sessions) >= 5:
                raise HTTPException(429, 'All sign-in browsers are busy. Try again shortly.')
            context = await browser.new_context(viewport={'width': 1000, 'height': 720}, accept_downloads=False, service_workers='block')
            allowed = ('facebook.com', 'fbcdn.net', 'fbsbx.com', 'meta.com', 'x.com',
                       'twitter.com', 'twimg.com', 'threads.com', 'threads.net', 'instagram.com',
                       'cdninstagram.com', 'google.com', 'gstatic.com', 'hcaptcha.com', 'cloudflare.com')
            async def restrict_network(route):
                parsed = urlparse(route.request.url)
                host = parsed.hostname or ''
                if parsed.scheme == 'https' and any(host == domain or host.endswith('.' + domain) for domain in allowed):
                    await route.continue_()
                else:
                    await route.abort()
            await context.route('**/*', restrict_network)
            context.set_default_timeout(10000)
            page = await context.new_page()
            session = {'context': context, 'page': page, 'owner': data.owner, 'touched': time.monotonic()}
            sessions[key] = session
            try:
                await page.goto(PLATFORMS[data.platform], wait_until='domcontentloaded', timeout=20000)
            except Exception:
                await close(key)
                raise HTTPException(503, 'The platform login page could not be opened. Try again.') from None
        if not session:
            raise HTTPException(409, 'Your sign-in browser expired. Start sign-in again.')
        session['touched'] = time.monotonic()
        page = session['page']
        try:
            if session['context'].pages:
                page = session['context'].pages[-1]
                session['page'] = page
            if data.operation == 'click':
                await page.mouse.click(data.x, data.y)
            elif data.operation == 'type':
                await page.keyboard.insert_text(data.text)
            elif data.operation == 'key':
                if data.key not in {'Enter', 'Tab', 'Backspace', 'Escape', 'ControlOrMeta+A'}:
                    raise HTTPException(422, 'Unsupported key')
                await page.keyboard.press(data.key)
            elif data.operation == 'scroll':
                await page.mouse.wheel(0, data.delta)
            elif data.operation == 'save':
                if any(part in urlparse(page.url).path.lower() for part in ('checkpoint', 'challenge', 'two_factor', 'login')) or await page.locator('input[type="password"]:visible').count():
                    raise HTTPException(422, 'Finish platform sign-in and any verification before saving.')
                if not authenticated(data.platform, await session['context'].cookies()):
                    raise HTTPException(422, 'Complete platform sign-in and verification before saving.')
                path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                temporary = path.with_suffix('.tmp')
                await session['context'].storage_state(path=str(temporary))
                temporary.chmod(0o600)
                temporary.replace(path)
                await close(key)
                return {'connected': True}
            elif data.operation not in {'start', 'frame'}:
                raise HTTPException(422, 'Unsupported browser action')
            await page.wait_for_timeout(200)
            shot = await page.screenshot(type='jpeg', quality=65)
            return {'image': base64.b64encode(shot).decode(), 'width': 1000, 'height': 720}
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(503, 'Browser action failed. Refresh the sign-in view or start again.') from None
