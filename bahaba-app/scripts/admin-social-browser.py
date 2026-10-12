"""Read-only public-post browser adapter for the two user-selected repositories.

Facebook's original parsing helpers are loaded without executing its credential
reader, login routine or HTML dumps. Threads' missing browser module is replaced
here; its supplied ThreadsParser remains the normalization implementation.
"""
from __future__ import annotations

import ast
import importlib
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import parse_qs, urljoin, urlparse, urlunparse

BASE = Path(__file__).resolve().parent
HOSTS = {'Facebook': {'facebook.com', 'www.facebook.com', 'm.facebook.com'},
         'Threads': {'threads.net', 'www.threads.net', 'threads.com', 'www.threads.com'}}


def facebook_session_ready(cookies):
    names = {cookie.get('name') for cookie in cookies
             if (cookie.get('domain','').lstrip('.') == 'facebook.com' or cookie.get('domain','').endswith('.facebook.com'))
             and cookie.get('value') and (cookie.get('expires',-1) == -1 or cookie.get('expires',0) > time.time())}
    return {'c_user','xs'}.issubset(names)


def checked_url(source, value):
    parsed = urlparse(str(value))
    if source not in HOSTS or parsed.scheme != 'https' or parsed.hostname not in HOSTS[source] or parsed.username or parsed.password or parsed.port:
        raise ValueError('Use an HTTPS Facebook page or Threads profile URL.')
    if not parsed.path.strip('/'):
        raise ValueError('Enter a specific public page or profile URL.')
    return urlunparse((parsed.scheme, parsed.netloc, parsed.path, '', parsed.query, ''))


def post_url(source, value, base):
    try:
        value = checked_url(source, urljoin(base, value))
    except (ValueError, TypeError):
        return None
    parsed = urlparse(value)
    if source == 'Threads':
        match = re.search(r'/@[^/]+/post/([^/?]+)', parsed.path)
        return (urlunparse(('https', 'www.threads.com', parsed.path, '', '', '')), match[1]) if match else None
    query = parse_qs(parsed.query)
    match = re.search(r'/(?:posts|permalink)/(\w+)', parsed.path)
    identity = match[1] if match else (query.get('story_fbid') or [None])[0]
    if not identity:
        return None
    if match:
        return urlunparse(('https', 'www.facebook.com', parsed.path, '', '', '')), identity
    owner = (query.get('id') or [''])[0]
    return f'https://www.facebook.com/permalink.php?story_fbid={identity}&id={owner}', f'{owner}_{identity}'


def facebook_helpers():
    path = BASE / 'vendor/facebook-post-scraper/scraper.py'
    tree = ast.parse(path.read_text(encoding='utf-8'))
    functions = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in {'_extract_post_text', '_extract_post_id'}]
    scope = {}
    exec(compile(ast.Module(body=functions, type_ignores=[]), str(path), 'exec'), scope)
    return scope


def facebook_posts(markup, target):
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(markup, 'html.parser')
    helpers = facebook_helpers()
    output = []
    for article in soup.select('[role="article"], .userContentWrapper'):
        text = helpers['_extract_post_text'](article)
        if not text:
            messages = article.select('[data-ad-preview="message"], [data-ad-comet-preview="message"], [data-testid="post_message"]')
            text = ' '.join(item.get_text(' ', strip=True) for item in messages)
        link = next((result for a in article.select('a[href]') if (result := post_url('Facebook', a.get('href'), target))), None)
        if not link or not text.strip():
            continue
        stamp = article.select_one('time[datetime]')
        output.append({'id':link[1], 'text':text.strip(), 'url':link[0], 'created_at':stamp.get('datetime') if stamp else None})
    return output


def threads_parser():
    sys.path.insert(0, str(BASE / 'vendor/threads-scraper/src'))
    return importlib.import_module('scraper.parser').ThreadsParser()


def threads_posts(markup, target):
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(markup, 'html.parser')
    parser = threads_parser()
    output = []
    # Only actual post objects with a permalink code are accepted, never bundled
    # profile metadata, samples, or fabricated fallback data.
    def walk(value):
        if isinstance(value, dict):
            caption, code, user = value.get('caption'), value.get('code'), value.get('user')
            if isinstance(caption, dict) and caption.get('text') and code and isinstance(user, dict) and user.get('username'):
                raw = dict(value, url=f"https://www.threads.com/@{user['username']}/post/{code}")
                parsed = parser.parse_item(raw)
                if parsed and post_url('Threads', parsed['url'], target):
                    if not (value.get('taken_at') or value.get('timestamp') or value.get('created_at')):
                        parsed['created_at'] = None
                    output.append(parsed)
            for child in value.values():
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)
    for script in soup.select('script[type="application/json"]'):
        try:
            walk(json.loads(script.string or script.get_text()))
        except (ValueError, RecursionError):
            continue
    for article in soup.select('[role="article"], [data-pressable-container="true"]'):
        link = next((result for a in article.select('a[href]') if (result := post_url('Threads', a.get('href'), target))), None)
        if not link:
            continue
        text_nodes = article.select('[data-testid="post-text"], [data-plain-text], [dir="auto"]')
        text = ' '.join(dict.fromkeys(node.get_text(' ', strip=True) for node in text_nodes if node.get_text(strip=True)))
        if text:
            stamp = article.select_one('time[datetime]')
            output.append({'id':link[1], 'url':link[0], 'text':text, 'created_at':stamp.get('datetime') if stamp else None})
    return output


def collect(source, target, limit=20):
    from playwright.sync_api import sync_playwright
    target = checked_url(source, target)
    state = Path(__import__('os').environ['BAHABA_SCOPED_BROWSER_STATE']) if __import__('os').environ.get('BAHABA_SCOPED_BROWSER_STATE') else BASE / '.state' / f'{source.lower()}-browser.json'
    if source == 'Facebook':
        try:
            authenticated = facebook_session_ready(json.loads(state.read_text(encoding='utf-8')).get('cookies',[]))
        except (OSError, ValueError, AttributeError):
            authenticated = False
        if not authenticated:
            raise RuntimeError('login_required')
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel='chrome', headless=True)
        try:
            context = browser.new_context(storage_state=str(state) if state.is_file() else None, locale='en-US')
            page = context.new_page()
            response = page.goto(target, wait_until='domcontentloaded', timeout=30000)
            if response and response.status in {401,403,429}:
                raise RuntimeError('rate_limit' if response.status == 429 else 'login_required')
            page.wait_for_timeout(3500)
            if any(part in urlparse(page.url).path for part in ['/login', '/checkpoint', '/challenge']):
                raise RuntimeError('login_required')
            # Threads retains sign-up/footer copy even on readable search pages.
            # Only an actual visible login form or auth redirect blocks parsing.
            if page.locator('input[type="password"]:visible').count():
                raise RuntimeError('login_required')
            found = {}
            for _ in range(3):
                markup = page.content()
                items = facebook_posts(markup, target) if source == 'Facebook' else threads_posts(markup, target)
                for item in items:
                    found.setdefault(str(item['id']), item)
                if len(found) >= limit:
                    break
                page.evaluate('window.scrollBy(0, window.innerHeight)')
                page.wait_for_timeout(1500)
            if not found:
                if source == 'Threads' and 'no results' in page.locator('body').inner_text().casefold():
                    return []
                raise RuntimeError('no_posts_visible')
            return list(found.values())[:limit]
        finally:
            browser.close()


def login(source):
    from playwright.sync_api import sync_playwright
    if source not in HOSTS:
        raise ValueError('Choose Facebook or Threads.')
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel='chrome', headless=False)
        context = browser.new_context()
        page = context.new_page()
        page.goto('https://www.facebook.com/' if source == 'Facebook' else 'https://www.threads.com/')
        while True:
            input('Finish signing in in this browser window, then press Enter here to save the collector session: ')
            if source != 'Facebook' or facebook_session_ready(context.cookies()):
                break
            print('Facebook is not signed in in this collector window yet. Complete sign-in there, including any Facebook verification, then press Enter again. Nothing has been saved.')
        state = BASE / '.state' / f'{source.lower()}-browser.json'
        state.parent.mkdir(exist_ok=True)
        context.storage_state(path=str(state))
        browser.close()
        print('Session saved locally. The collector will verify search access on its next poll. Do not share the session file.')


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--login':
        login(sys.argv[2])
    else:
        try:
            print(json.dumps({'posts':collect(sys.argv[1], sys.argv[2], int(sys.argv[3]))}, ensure_ascii=False))
        except Exception as exc:
            code = str(exc) if str(exc) in {'login_required','rate_limit','no_posts_visible'} else 'unavailable'
            print(json.dumps({'error':code}))
            sys.exit(1)
