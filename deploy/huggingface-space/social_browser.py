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
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import parse_qs, urljoin, urlparse, urlunparse

BASE = Path(__file__).resolve().parent
HOSTS = {'Facebook': {'facebook.com', 'www.facebook.com', 'm.facebook.com'},
         'X': {'x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'},
         'Threads': {'threads.net', 'www.threads.net', 'threads.com', 'www.threads.com', 'instagram.com', 'www.instagram.com'}}


def original_timestamp(value):
    """Normalize a source date, never substitute the collector's current time."""
    if value is None or isinstance(value, bool) or value == '':
        return None
    try:
        if isinstance(value, (int, float)) or str(value).replace('.', '', 1).isdigit():
            seconds = float(value)
            if seconds > 100_000_000_000:
                seconds /= 1000
            published = datetime.fromtimestamp(seconds, timezone.utc)
        else:
            try:
                published = datetime.fromisoformat(str(value).strip().replace('Z', '+00:00'))
            except ValueError:
                published = parsedate_to_datetime(str(value))
        if published.tzinfo is None:
            return None
        return published.astimezone(timezone.utc).isoformat()
    except (ValueError, TypeError, OverflowError, OSError):
        return None


def x_post_timestamp(identity):
    # X snowflake IDs encode the original creation time, independent of browser
    # locale and the date of a quoted post shown inside the same article.
    try:
        number = int(identity)
        if number < (1 << 22) or number >= (1 << 64):
            return None
        return original_timestamp(((number >> 22) + 1288834974657) / 1000)
    except (TypeError, ValueError):
        return None


def facebook_session_ready(cookies):
    names = {cookie.get('name') for cookie in cookies
             if (cookie.get('domain','').lstrip('.') == 'facebook.com' or cookie.get('domain','').endswith('.facebook.com'))
             and cookie.get('value') and (cookie.get('expires',-1) == -1 or cookie.get('expires',0) > time.time())}
    return {'c_user','xs'}.issubset(names)


def checked_url(source, value):
    parsed = urlparse(str(value))
    if source not in HOSTS or parsed.scheme != 'https' or parsed.hostname not in HOSTS[source] or parsed.username or parsed.password or parsed.port:
        raise ValueError('Use an HTTPS Facebook page or Threads profile URL.')
    if not parsed.path.strip('/') and parsed.hostname not in {'instagram.com','www.instagram.com'}:
        raise ValueError('Enter a specific public page or profile URL.')
    return urlunparse((parsed.scheme, parsed.netloc, parsed.path, '', parsed.query, ''))


def post_url(source, value, base):
    try:
        value = checked_url(source, urljoin(base, value))
    except (ValueError, TypeError):
        return None
    parsed = urlparse(value)
    if source == 'X':
        match = re.search(r'/([^/]+)/status/(\d+)', parsed.path)
        if not match:
            return None
        return f'https://x.com/{match[1]}/status/{match[2]}', match[2]
    if source == 'Threads':
        match = re.search(r'/@[^/]+/post/([^/?]+)', parsed.path)
        return (urlunparse(('https', 'www.threads.com', parsed.path, '', '', '')), match[1]) if match else None
    share = re.search(r'^/share/p/([^/?#]+)', parsed.path)
    if share:
        identity = share[1]
        return f'https://www.facebook.com/share/p/{identity}/', 'share_' + identity
    query = parse_qs(parsed.query)
    match = re.search(r'/(?:posts|permalink)/(\w+)', parsed.path)
    identity = match[1] if match else (query.get('story_fbid') or [None])[0]
    if not identity:
        return None
    if match:
        return urlunparse(('https', 'www.facebook.com', parsed.path, '', '', '')), identity
    owner = (query.get('id') or [''])[0]
    return f'https://www.facebook.com/permalink.php?story_fbid={identity}&id={owner}', f'{owner}_{identity}'


def linked_post_containers(soup, source, target):
    # Search pages do not always mark posts as articles. Bind text to an
    # actual permalink and stop climbing when another post enters the group.
    found = {}
    for anchor in soup.select('a[href]'):
        link = post_url(source, anchor.get('href'), target)
        if not link:
            continue
        candidate = None
        node = anchor.parent
        for _ in range(8):
            if node is None or node.name in {'body', 'html'}:
                break
            identities = {item[1] for a in node.select('a[href]') if (item := post_url(source, a.get('href'), target))}
            if identities - {link[1]}:
                break
            if node.select('[dir="auto"], [data-ad-preview="message"], [data-testid="post-text"]'):
                candidate = node
            node = node.parent
        if candidate is not None:
            found[link[1]] = candidate
    return list(found.values())


def metadata_post(soup, source, target):
    # Only a permalink's own metadata is a post. Search/profile descriptions
    # and metadata for a different post must never become detections.
    requested = post_url(source, target, target)
    share = source == 'Facebook' and urlparse(target).path.startswith('/share/p/')
    if not requested and not share:
        return None
    canonical = soup.select_one('meta[property="og:url"]')
    description = soup.select_one('meta[property="og:description"]')
    link = post_url(source, canonical.get('content'), target) if canonical else None
    if not link or (requested and requested[1] != link[1]):
        return None
    text = description.get('content', '').strip() if description else ''
    if not text:
        return None
    stamp = soup.select_one('meta[property="article:published_time"]')
    return {'id': link[1], 'url': link[0], 'text': text, 'created_at': original_timestamp(stamp.get('content')) if stamp else None}


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
    for article in soup.select('[role="article"], .userContentWrapper, [data-ad-rendering-role="story"], [data-pagelet^="FeedUnit_"]') + linked_post_containers(soup, 'Facebook', target):
        text = helpers['_extract_post_text'](article)
        if not text:
            messages = article.select('[data-ad-preview="message"], [data-ad-comet-preview="message"], [data-testid="post_message"], [dir="auto"]')
            text = ' '.join(item.get_text(' ', strip=True) for item in messages)
        link = next((result for a in article.select('a[href]') if (result := post_url('Facebook', a.get('href'), target))), None)
        if not link or not text.strip():
            continue
        stamp = article.select_one('time[datetime]')
        output.append({'id':link[1], 'text':text.strip(), 'url':link[0], 'created_at':original_timestamp(stamp.get('datetime')) if stamp else None})
    # Accept embedded feed stories only when they contain a real post permalink.
    def walk(value):
        if isinstance(value, dict):
            message = value.get('message')
            text = message.get('text') if isinstance(message, dict) else None
            link = post_url('Facebook', value.get('url') or value.get('story_url'), target)
            if isinstance(text, str) and text.strip() and link:
                stamp = value.get('creation_time')
                created = original_timestamp(stamp)
                output.append({'id': link[1], 'text': text.strip(), 'url': link[0], 'created_at': created})
            for child in value.values():
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)
    for script in soup.select('script[type="application/json"]'):
        try:
            walk(json.loads(script.string or script.get_text()))
        except (ValueError, RecursionError, OverflowError):
            continue
    metadata = metadata_post(soup, 'Facebook', target)
    if metadata and not any(item['id'] == metadata['id'] for item in output):
        output.append(metadata)
    return list({item['id']: item for item in output}.values())


def x_posts(markup, target):
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(markup, 'html.parser')
    output = {}
    for article in soup.select('article[data-testid="tweet"], article'):
        text_node = article.select_one('[data-testid="tweetText"]')
        if not text_node:
            continue
        # Bind the main post to its own time/permalink. A quote can contain a
        # different status link before the outer author's timestamp.
        stamp = article.select_one('time[datetime]')
        anchor = stamp.find_parent('a', href=True) if stamp else None
        link = post_url('X', anchor.get('href'), target) if anchor else None
        if not link:
            continue
        context = article.select_one('[data-testid="socialContext"]')
        context_text = (context.get_text(' ', strip=True) + ' ' + str(context.get('aria-label') or '')) if context else ''
        output.setdefault(link[1], {'id': link[1], 'url': link[0],
                                     'text': text_node.get_text(' ', strip=True),
                                     'created_at': x_post_timestamp(link[1]),
                                     'is_repost': bool(re.search(r'\b(reposted|retweeted)\b', context_text, re.I))})
    return list(output.values())


def threads_parser():
    sys.path.insert(0, str(BASE / 'vendor/threads-scraper/src'))
    return importlib.import_module('scraper.parser').ThreadsParser()


def threads_posts(markup, target):
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(markup, 'html.parser')
    parser = threads_parser()
    parsed_target = urlparse(target)
    target_profile = None
    if parsed_target.path.count('/') == 1 and parsed_target.path.startswith('/@'):
        target_profile = parsed_target.path[2:].casefold()
    output = []
    # Only actual post objects with a permalink code are accepted, never bundled
    # profile metadata, samples, or fabricated fallback data.
    def walk(value):
        if isinstance(value, dict):
            caption, code, user = value.get('caption'), value.get('code'), value.get('user')
            if (isinstance(caption, dict) and caption.get('text') and code
                    and isinstance(user, dict) and user.get('username')
                    and (target_profile is None or str(user['username']).casefold() == target_profile)):
                raw = dict(value, url=f"https://www.threads.com/@{user['username']}/post/{code}")
                parsed = parser.parse_item(raw)
                if parsed and post_url('Threads', parsed['url'], target):
                    # The vendor parser fabricates now() for missing/invalid
                    # dates. Only the raw post's actual date is authoritative.
                    parsed['created_at'] = original_timestamp(value.get('taken_at') or value.get('timestamp') or value.get('created_at'))
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
    for article in soup.select('[role="article"], [data-pressable-container="true"]') + linked_post_containers(soup, 'Threads', target):
        link = next((result for a in article.select('a[href]') if (result := post_url('Threads', a.get('href'), target))), None)
        if not link:
            continue
        if target_profile and urlparse(link[0]).path.split('/')[1].removeprefix('@').casefold() != target_profile:
            continue
        text_nodes = article.select('[data-testid="post-text"], [data-plain-text], [dir="auto"]')
        text = ' '.join(dict.fromkeys(node.get_text(' ', strip=True) for node in text_nodes if node.get_text(strip=True)))
        if text:
            stamp = article.select_one('time[datetime]')
            output.append({'id':link[1], 'url':link[0], 'text':text, 'created_at':original_timestamp(stamp.get('datetime')) if stamp else None})
    metadata = metadata_post(soup, 'Threads', target)
    if metadata:
        output.append(metadata)
    normalized = {}
    for item in output:
        link = post_url('Threads', item.get('url'), target)
        if link:
            item['id'] = link[1]
            if link[1] not in normalized or (not normalized[link[1]].get('created_at') and item.get('created_at')):
                normalized[link[1]] = item
    return list(normalized.values())


def select_recent_search(page, source, target):
    if source != 'Threads' or '/search' not in urlparse(target).path:
        return
    # Use the platform's rendered controls instead of assuming an undocumented URL filter.
    for role in ('tab', 'link', 'button'):
        control = page.get_by_role(role, name=re.compile(r'^(Recent|Latest)$', re.I))
        if control.count() and control.first.is_visible():
            control.first.click(timeout=5000)
            page.wait_for_timeout(1500)
            return


def collect(source, target, limit=20):
    from playwright.sync_api import sync_playwright, TimeoutError as BrowserTimeout
    target = checked_url(source, target)
    state = Path(__import__('os').environ['BAHABA_SCOPED_BROWSER_STATE']) if __import__('os').environ.get('BAHABA_SCOPED_BROWSER_STATE') else BASE / '.state' / f'{source.lower()}-browser.json'
    if source == 'Facebook':
        try:
            authenticated = facebook_session_ready(json.loads(state.read_text(encoding='utf-8')).get('cookies',[]))
        except (OSError, ValueError, AttributeError):
            authenticated = False
        if not authenticated:
            raise RuntimeError('login_required')
    if source == 'X':
        try:
            cookies = json.loads(state.read_text(encoding='utf-8')).get('cookies', [])
            names = {cookie.get('name') for cookie in cookies
                     if cookie.get('domain', '').lstrip('.') in {'x.com', 'twitter.com'} and cookie.get('value')}
            authenticated = {'auth_token', 'ct0'}.issubset(names)
        except (OSError, ValueError, AttributeError):
            authenticated = False
        if not authenticated:
            raise RuntimeError('login_required')
    with sync_playwright() as playwright:
        # Use Playwright's pinned Chromium build installed by the Docker image.
        # Depending on a separately installed Google Chrome channel can report
        # an executable-missing error when the container cache/runtime differs.
        browser = playwright.chromium.launch(headless=True)
        try:
            context = browser.new_context(storage_state=str(state) if state.is_file() else None, locale='en-US')
            page = context.new_page()
            response = page.goto(target, wait_until='commit', timeout=20000)
            # Share links redirect to the canonical post URL. Parse that final
            # URL so permalink metadata and post IDs are matched correctly.
            resolved_target = checked_url(source, page.url)
            if response and response.status in {401,403,429}:
                raise RuntimeError('rate_limit' if response.status == 429 else 'login_required')
            # Slow background resources must not prevent inspection of rendered posts.
            try:
                if source == 'Facebook':
                    page.locator('[role="article"], .userContentWrapper, input[type="password"]:visible').first.wait_for(state='visible', timeout=12000)
                else:
                    page.wait_for_load_state('domcontentloaded', timeout=12000)
            except BrowserTimeout:
                pass
            page.wait_for_timeout(1500)
            if any(part in urlparse(page.url).path for part in ['/login', '/checkpoint', '/challenge']):
                raise RuntimeError('login_required')
            # Threads retains sign-up/footer copy even on readable search pages.
            # Only an actual visible login form or auth redirect blocks parsing.
            if page.locator('input[type="password"]:visible').count():
                raise RuntimeError('login_required')
            select_recent_search(page, source, target)
            found = {}
            # Keep a live poll bounded instead of scrolling historical results
            # for minutes before another account gets a chance to collect.
            max_scrolls = 20 if source == 'X' else 12
            unchanged_scrolls = 0
            for _ in range(max_scrolls):
                markup = page.content()
                items = (facebook_posts(markup, resolved_target) if source == 'Facebook' else
                         x_posts(markup, resolved_target) if source == 'X' else
                         threads_posts(markup, resolved_target))
                previous_count = len(found)
                for item in items:
                    found.setdefault(str(item['id']), item)
                if len(found) >= limit:
                    break
                unchanged_scrolls = unchanged_scrolls + 1 if len(found) == previous_count else 0
                if unchanged_scrolls >= 4:
                    break
                page.evaluate('window.scrollBy(0, window.innerHeight)')
                page.wait_for_timeout(1200 if source == 'X' else 1500)
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
        browser = playwright.chromium.launch(headless=False)
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
            if type(exc).__name__ == 'TimeoutError':
                code = 'navigation_timeout'
            elif "Executable doesn't exist" in str(exc) or 'BrowserType.launch' in str(exc):
                code = 'browser_missing'
            print(json.dumps({'error':code, 'error_type':type(exc).__name__}))
            sys.exit(1)
