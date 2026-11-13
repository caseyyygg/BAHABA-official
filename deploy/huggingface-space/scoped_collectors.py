"""Optional per-LGU collectors. Never fall back to shared account credentials."""
import json
import os
import re
import subprocess
import sys
import threading
import tempfile
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote, unquote
from urllib.request import Request, urlopen

import x_agent_reach

BASE = Path(__file__).resolve().parent
SCOPES = {'navotas':'Navotas', 'bulacan':'Bulacan', 'marikina':'Marikina', 'pampanga':'Pampanga', 'malolos':'Malolos'}
PLATFORMS = ('Facebook', 'X', 'Threads')
# The Navotas account used for the reported Threads post is not appearing in
# Threads city search. Poll its public profile as well as the normal search.
THREADS_PROFILE_URLS = {'navotas':'https://www.threads.com/@bantalafloodapp'}
FLOOD_WORDS = ('baha', 'binaha', 'flood', 'flooding', 'lubog', 'tubig', 'passable', 'tumitirik', 'apaw', 'inundat', 'waterlogged', 'water level', 'knee-deep', 'waist-deep', 'ankle-deep', 'hindi madaanan', 'stranded', 'lumikas', 'evacuat', 'rescue')
SEARCH_WORDS = ('baha', 'flood', 'tubig', 'lubog', 'apaw')
MAX_PENDING = 2000
states = {}
worker = None
workers = []
# Account workers are independent, with a small browser budget for the hosted
# CPU service. An inaccessible account must not block every other LGU's polls.
browser_slots = threading.BoundedSemaphore(2)
delivery_lock = threading.Lock()
alias_cache = {}


class CollectionError(RuntimeError):
    pass


ERROR_MESSAGES = {
    'login_required': 'Facebook/Threads requires sign-in or verification before search can run.',
    'rate_limit': 'X rate limit reached. Collection is cooling down before retrying.',
    'cooldown': 'X collection is paused for its scheduled rate-limit cooldown.',
    'no_posts_visible': 'Search loaded, but no readable posts were found. Platform markup or search access may have changed.',
    'navigation_timeout': 'The platform search page timed out from the hosted collector.',
    'browser_missing': 'The collector browser executable is unavailable.',
    'unavailable': 'The hosted browser could not complete the platform search.',
}


def settings():
    from dotenv import dotenv_values
    values = dict(os.environ)
    values.update({k:v for k,v in dotenv_values(BASE / '.env').items() if v is not None})
    return values


def gateway(scope, platform):
    values = settings()
    base = values.get('SOCIAL_BROWSER_URL', '').rstrip('/')
    token = values.get('SOCIAL_BROWSER_TOKEN', '')
    if not base or not token:
        return None
    from urllib.parse import urlparse
    address = urlparse(base)
    if address.scheme != 'https' and not (address.scheme == 'http' and address.hostname in {'127.0.0.1', 'localhost'}):
        raise RuntimeError('Browser service requires HTTPS')
    request = Request(base + '/collector-state/' + scope + '/' + quote(platform), headers={'Authorization':'Bearer '+token})
    try:
        with urlopen(request, timeout=20) as response:
            return json.load(response)
    except HTTPError as error:
        if error.code == 404:
            return None
        raise RuntimeError('Browser service is unavailable') from None


def search_query(scope, platform):
    state = states.setdefault(scope + ':' + platform, {})
    cursor = state.get('query_cursor', 0)
    city_queries = [SCOPES[scope], *(word + ' ' + SCOPES[scope] for word in SEARCH_WORDS)]
    try:
        aliases = json.loads((BASE / 'collector-locations.json').read_text(encoding='utf-8')).get(scope, [])
    except (OSError, ValueError):
        aliases = []
    aliases = list(dict.fromkeys(name for name in aliases if isinstance(name, str) and name.strip() and name.casefold() != SCOPES[scope].casefold()))
    if platform == 'X':
        flood_terms = ('baha', 'binaha', 'flood', 'flooding', 'lubog', 'tubig', 'apaw', 'inundat', 'waterlogged', 'water level', 'knee-deep', 'waist-deep', 'ankle-deep', 'hindi madaanan', 'stranded', 'lumikas', 'evacuat', 'rescue')
        since = (datetime.now(timezone.utc) - timedelta(hours=24)).date().isoformat()
        locations = ['"' + SCOPES[scope].replace('"', '') + '"']
        if cursor % 2 and aliases:
            locations.append('"' + aliases[(cursor // 2) % len(aliases)].replace('"', '') + '"')
        flood_query = '(' + ' OR '.join('"' + term + '"' if ' ' in term else term for term in flood_terms) + ')'
        location_query = '(' + ' OR '.join(locations) + ')'
        query = flood_query + ' ' + location_query + ' -filter:retweets since:' + since
        state.update(query_cursor=cursor + 1, last_query=query)
        return query
    # Keep city searches frequent while also covering posts naming only a barangay.
    if cursor % 2 and aliases:
        index = cursor // 2
        query = SEARCH_WORDS[(index // len(aliases)) % len(SEARCH_WORDS)] + ' ' + aliases[index % len(aliases)]
    else:
        query = city_queries[(cursor // 2) % len(city_queries)]
    state.update(query_cursor=cursor + 1, last_query=query)
    return query


def pending_path(scope, platform):
    return BASE / '.state' / 'lgu-accounts' / scope / (platform.lower() + '-pending.json')


def ingestion_payload(scope, platform, post):
    resolved_scope = post_scope(post)
    return {
        'source': platform,
        # A saved account/search does not establish the post's actual location.
        'location_id': resolved_scope,
        'city': SCOPES.get(resolved_scope),
        'post_id': str(post.get('id') or ''),
        'post_text': str(post.get('text') or '')[:60000],
        'post_url': post.get('url'),
        'timestamp': post.get('created_at'),
        'is_repost': bool(post.get('is_repost')),
        'original_post_id': post.get('original_post_id'),
        'publisher_id': post.get('publisher_id'),
    }


def post_scope(post):
    """Resolve only explicit city names or unambiguous barangay mentions."""
    text = str(post.get('text') or '').casefold()
    def mentions(name):
        return bool(re.search(r'(?<!\w)' + re.escape(name.casefold()) + r'(?!\w)', text))
    cities = {scope for scope, name in SCOPES.items() if mentions(name)}
    if 'malolos' in cities:
        cities.discard('bulacan')
    if cities:
        return next(iter(cities)) if len(cities) == 1 else None
    path = BASE / 'collector-locations.json'
    try:
        version = (str(path), path.stat().st_mtime_ns)
        if alias_cache.get('version') != version:
            aliases = {}
            for scope, names in json.loads(path.read_text(encoding='utf-8')).items():
                for name in names:
                    if not isinstance(name, str):
                        continue
                    for part in [name, *re.split(r'\s[?·–—]\s', name)]:
                        cleaned = re.sub(r'\s*\([^)]*\)', '', part).strip().casefold()
                        if cleaned:
                            aliases.setdefault(cleaned, set()).add(scope)
            aliases.setdefault('bangkulasi', set()).add('navotas')
            alias_cache.update(version=version, aliases=aliases)
        matching = [(len(name), owners) for name, owners in alias_cache['aliases'].items() if mentions(name)]
        if not matching:
            return None
        longest = max(length for length, owners in matching)
        owners = set().union(*(owners for length, owners in matching if length == longest))
        return next(iter(owners)) if len(owners) == 1 else None
    except (OSError, ValueError, TypeError, AttributeError):
        return None


def is_flood_candidate(post):
    text = str(post.get('text') or '').casefold()
    return any(word in text for word in FLOOD_WORDS)


def x_profile_target(saved):
    # twid is the signed-in user's ID, not an arbitrary username supplied by
    # a search result. Never send its cookie value to the dashboard/log.
    for cookie in saved.get('storage', {}).get('cookies', []):
        if cookie.get('name') != 'twid' or cookie.get('domain', '').lstrip('.') not in {'x.com', 'twitter.com'}:
            continue
        matched = re.fullmatch(r'u=(\d{1,25})', unquote(str(cookie.get('value') or '')))
        if matched:
            return 'https://x.com/i/user/' + matched[1]
    return None


def monitored_x_profile(scope):
    try:
        profiles = json.loads((BASE / 'collector-profiles.json').read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return []
    configured = profiles.get(scope) if isinstance(profiles, dict) else None
    if isinstance(configured, dict):
        configured = configured.get('handles')
    handles = [configured] if isinstance(configured, str) else configured
    if not isinstance(handles, list):
        return []
    return list(dict.fromkeys(
        'https://x.com/' + handle for handle in handles
        if isinstance(handle, str) and re.fullmatch(r'[A-Za-z0-9_]{1,15}', handle)
    ))


def x_profile_only(scope):
    try:
        profiles = json.loads((BASE / 'collector-profiles.json').read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return False
    configured = profiles.get(scope) if isinstance(profiles, dict) else None
    return bool(configured.get('profile_only')) if isinstance(configured, dict) else False


def recent_post(post, now=None):
    """Unknown, future and expired source dates are never live flood reports."""
    now = datetime.now(timezone.utc) if now is None else now
    try:
        published = datetime.fromisoformat(str(post.get('created_at') or '').replace('Z', '+00:00'))
        if published.tzinfo is None:
            return False
        return now - timedelta(hours=24) <= published <= now
    except (TypeError, ValueError):
        return False


def write_pending(path, revision, posts):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps({'revision': revision, 'posts': posts}), encoding='utf-8')
    temporary.chmod(0o600)
    temporary.replace(path)


def read_pending(path, revision):
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding='utf-8'))
    if data.get('revision') != revision:
        return []
    posts = data.get('posts')
    if not isinstance(posts, list):
        raise ValueError('Invalid pending queue')
    return posts


def safe_error(exc):
    error = str(exc).lower()
    if 'invalid ingestion token' in error or ('ingest' in error and '401' in error):
        return 'Delivery blocked: the NLP and AlwaysData ingestion tokens do not match. Collected posts remain queued for retry.'
    if 'expired or access denied' in error or 'waiting for x login' in error:
        return 'X rejected the saved session on this host. Submit fresh X cookies for this LGU.'
    if 'rate limit' in error:
        return 'Platform rate limit reached. Collection will retry after a pause.'
    if 'environment is missing' in error:
        return 'The hosted X collector environment is not configured.'
    if 'x search interface could not be resolved' in error:
        return 'X search interface could not be resolved; the hosted X client needs an update.'
    if 'hosted x client could not reach x' in error:
        return 'The hosted X client could not reach X. Collection will retry.'
    if 'hosted x client failed before' in error:
        if '(' in error and error.endswith(').'):
            kind = error.rsplit('(', 1)[-1][:-2]
            if kind.isidentifier():
                return f'The X collector client raised {kind}; its hosted client runtime needs an update.'
        return 'The hosted X client failed before reading search results.'
    if 'same cookie' in error:
        return 'X auth_token and ct0 must be different cookie values.'
    if 'timed out' in error:
        return 'Platform search timed out. Collection will retry.'
    if 'browser service is unavailable' in error:
        return 'The collector cannot access the saved-session service.'
    return 'Collection or delivery unavailable. Check the saved account and service configuration.'


def x_search_posts(saved, query, limit):
    """Read public search using only this LGU's saved X session."""
    from social_browser import x_post_timestamp
    cookies = {
        cookie.get('name'): cookie.get('value')
        for cookie in saved.get('storage', {}).get('cookies', [])
        if cookie.get('domain', '').lstrip('.') in {'x.com', 'twitter.com'}
        and cookie.get('name') in {'auth_token', 'ct0'} and cookie.get('value')
    }
    if not {'auth_token', 'ct0'}.issubset(cookies):
        raise CollectionError('login_required')
    payload = x_agent_reach.fetch_posts([], limit, scoped_credentials={
        'TWITTER_AUTH_TOKEN': cookies['auth_token'], 'TWITTER_CT0': cookies['ct0'],
        'TWITTER_COOKIE_STRING': '; '.join(
            str(cookie['name']) + '=' + str(cookie['value'])
            for cookie in saved.get('storage', {}).get('cookies', [])
            if cookie.get('domain', '').lstrip('.') in {'x.com', 'twitter.com'}
            and cookie.get('name') and cookie.get('value')
        ),
    }, scoped_query=query)
    posts = []
    for tweet in payload.get('tweets', []):
        identity = str(tweet.get('id') or '')
        author = tweet.get('author') or {}
        username = author.get('username') if isinstance(author, dict) else None
        if not identity.isdigit() or not username or not re.fullmatch(r'[A-Za-z0-9_]{1,15}', username):
            continue
        post = {'id': identity, 'text': str(tweet.get('text') or ''),
                'url': f'https://x.com/{username}/status/{identity}',
                'created_at': x_post_timestamp(identity)}
        if recent_post(post):
            posts.append(post)
    return posts


def x_cooldown_remaining(state, now=None):
    now = time.time() if now is None else now
    until = float(state.get('cooldown_until_epoch', 0))
    configured = settings().get('LGU_X_NOT_BEFORE', '')
    if configured:
        try:
            until = max(until, datetime.fromisoformat(configured.replace('Z', '+00:00')).timestamp())
        except (ValueError, TypeError):
            pass
    remaining = max(0, until - now)
    if remaining:
        state['cooldown_until'] = datetime.fromtimestamp(until, timezone.utc).isoformat()
    return remaining


def x_rate_limit_cooldown(state, now=None):
    now = time.time() if now is None else now
    strikes = int(state.get('rate_limit_strikes', 0)) + 1
    delay = min(3600, 900 * 2 ** min(strikes - 1, 2))
    state.update(rate_limit_strikes=strikes, cooldown_until_epoch=now + delay,
                 cooldown_until=datetime.fromtimestamp(now + delay, timezone.utc).isoformat())
    return delay


def fetch(scope, platform, saved):
    if platform == 'X' and x_cooldown_remaining(states.setdefault(scope + ':' + platform, {})):
        raise CollectionError('cooldown')
    words = list(FLOOD_WORDS)
    query_text = search_query(scope, platform)
    directory = BASE / '.state' / 'lgu-accounts' / scope
    directory.mkdir(parents=True,exist_ok=True,mode=0o700)
    # Diagnostic checks can overlap a scheduled poll. Each call owns its
    # snapshot so one request cannot remove another browser's saved session.
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', suffix='.json', prefix=platform.lower()+'-', dir=directory, delete=False) as snapshot:
        json.dump(saved['storage'], snapshot)
        path = Path(snapshot.name)
    path.chmod(0o600)
    # Search the city broadly; NLP classifies the flood language.
    query = quote(query_text,safe='')
    if platform == 'Facebook':
        search_target = 'https://www.facebook.com/search/posts/?q=' + query
    elif platform == 'Threads':
        search_target = 'https://www.threads.com/search?q=' + query
    else:
        search_target = 'https://x.com/search?q=' + query + '&f=live'
    own_profile = x_profile_target(saved) if platform == 'X' else None
    monitored_profiles = monitored_x_profile(scope) if platform == 'X' else []
    profile_only = platform == 'X' and x_profile_only(scope)
    if profile_only:
        if not monitored_profiles:
            raise CollectionError('unavailable')
        targets = monitored_profiles
        profile_targets = set(monitored_profiles)
    else:
        targets = [search_target]
        profile_targets = set()
        if own_profile:
            targets.append(own_profile)
            profile_targets.add(own_profile)
        if monitored_profiles:
            targets[0:0] = monitored_profiles
            profile_targets.update(monitored_profiles)
        targets = list(dict.fromkeys(targets))
    if platform == 'Threads' and scope in THREADS_PROFILE_URLS:
        targets.insert(0, THREADS_PROFILE_URLS[scope])
    environment = dict(os.environ, BAHABA_SCOPED_BROWSER_STATE=str(path))
    try:
        combined = {}
        errors = []
        platform_state = states.setdefault(scope + ':' + platform, {})
        limit = 100 if not platform_state.get('initial_collection_complete') else 50
        skipped_timestamp = 0
        for target in targets:
            try:
                search_posts = None
                if platform == 'X' and target == search_target and settings().get('X_PROVIDER', 'agent-reach') == 'agent-reach':
                    try:
                        search_posts = x_search_posts(saved, query_text, limit)
                        platform_state['search_provider'] = 'agent-reach'
                        platform_state['search_error'] = None
                        platform_state['rate_limit_strikes'] = 0
                    except Exception as search_error:
                        platform_state['search_error'] = safe_error(search_error)
                        if 'rate limit' in str(search_error).lower():
                            raise CollectionError('rate_limit') from None
                        # Browser fallback preserves manual sign-in/verification handling.
                        platform_state['search_provider'] = 'browser-fallback'
                if search_posts is not None:
                    payload = {'posts': search_posts}
                else:
                    with browser_slots:
                        result = subprocess.run([sys.executable,str(BASE / 'social_browser.py'),platform,target,str(limit)],env=environment,capture_output=True,encoding='utf-8',timeout=70,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
                    payload = json.loads(result.stdout)
                    if result.returncode or payload.get('error'):
                        raise CollectionError(payload.get('error') if payload.get('error') in ERROR_MESSAGES else 'unavailable')
                for post in payload['posts']:
                    if not recent_post(post):
                        skipped_timestamp += 1
                        continue
                    if target in profile_targets:
                        post = {**post, 'collection_origin': 'own_profile'}
                    combined.setdefault(str(post.get('id') or post.get('url')), post)
                if platform == 'X':
                    try:
                        delivered = json.loads((directory / 'x-seen.json').read_text(encoding='utf-8'))
                        delivered = set(delivered) if isinstance(delivered, list) else set()
                    except (OSError, ValueError, TypeError):
                        delivered = set()
                    if any(str(post.get('id')) not in delivered and is_flood_candidate(post) for post in combined.values()):
                        # Forward fresh public search results before slower profile scans.
                        # A post from any author is eligible, not just a watched account.
                        platform_state['posts_skipped_timestamp'] = skipped_timestamp
                        platform_state['initial_collection_complete'] = True
                        return list(combined.values())
            except subprocess.TimeoutExpired:
                errors.append('navigation_timeout')
            except CollectionError as error:
                if str(error) == 'rate_limit':
                    raise
                errors.append(str(error))
            except (ValueError, KeyError):
                errors.append('unavailable')
        if errors:
            # Keep useful profile results flowing even when city search breaks.
            states.setdefault(scope + ':' + platform, {})['last_error'] = ERROR_MESSAGES.get(errors[-1], ERROR_MESSAGES['unavailable'])
        if not combined and errors:
            raise CollectionError(errors[-1])
        platform_state['posts_skipped_timestamp'] = skipped_timestamp
        if not errors:
            platform_state['initial_collection_complete'] = True
        return list(combined.values())
    finally:
        path.unlink(missing_ok=True)


def poll(stop, forward, load, save, accounts=None):
    while not stop.is_set():
        cycle_started = time.monotonic()
        for scope in SCOPES:
            for platform in PLATFORMS:
                if accounts is not None and (scope, platform) not in accounts:
                    continue
                if stop.is_set():
                    return
                key = scope + ':' + platform
                state = states.setdefault(key, {'connected':False,'running':False,'last_error':None,'posts_processed':0})
                try:
                    saved = gateway(scope,platform)
                    state.update(connected=bool(saved),running=False,last_error=None)
                    if not saved:
                        pending_path(scope, platform).unlink(missing_ok=True)
                        state['pending_posts'] = 0
                        continue
                    state['running'] = True
                    state['last_poll'] = datetime.now(timezone.utc).isoformat()
                    path = BASE / '.state' / 'lgu-accounts' / scope / (platform.lower()+'-seen.json')
                    path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
                    seen = load(path)
                    queue_path = pending_path(scope, platform)
                    pending = read_pending(queue_path, saved['revision'])
                    state['pending_posts'] = len(pending)
                    try:
                        posts = fetch(scope,platform,saved)
                        state['posts_found'] = len(posts)
                    except Exception as exc:
                        posts = []
                        if platform == 'X' and str(exc) == 'rate_limit':
                            x_rate_limit_cooldown(state)
                        state['last_error'] = ERROR_MESSAGES.get(str(exc), safe_error(exc))
                    queued = {str(item.get('id')) for item in pending}
                    for post in posts:
                        text = str(post.get('text') or '').strip()
                        identity = str(post.get('id') or '')
                        if not identity or identity in seen or identity in queued or not text or not recent_post(post) or not is_flood_candidate(post):
                            continue
                        if len(pending) >= MAX_PENDING:
                            state['last_error'] = 'The pending delivery queue is full. New results are not marked delivered; resolve ingestion before collecting more.'
                            break
                        pending.append({**post, 'text': text[:60000]})
                        queued.add(identity)
                    write_pending(queue_path, saved['revision'], pending)
                    state['pending_posts'] = len(pending)
                    while pending:
                        # Delivery retries retain the post's original date. A
                        # queue stalled overnight must not revive old reports.
                        if not recent_post(pending[0]):
                            pending.pop(0)
                            write_pending(queue_path, saved['revision'], pending)
                            state['pending_posts'] = len(pending)
                            continue
                        if stop.is_set():
                            break
                        post = pending[0]
                        identity = str(post['id'])
                        try:
                            if identity not in seen:
                                with delivery_lock:
                                    current = gateway(scope,platform)
                                    if not current or current['revision'] != saved['revision'] or stop.is_set():
                                        break
                                    forward(ingestion_payload(scope, platform, post))
                                seen.add(identity); save(seen,path)
                                state['posts_processed'] = state.get('posts_processed', 0) + 1
                                state['last_post_at'] = datetime.now(timezone.utc).isoformat()
                            pending.pop(0)
                            write_pending(queue_path, saved['revision'], pending)
                            state['pending_posts'] = len(pending)
                        except Exception as exc:
                            state['last_error'] = safe_error(exc)
                            break
                except CollectionError as error:
                    state['last_error'] = ERROR_MESSAGES[str(error)]
                except subprocess.TimeoutExpired:
                    state['last_error'] = 'Platform collection exceeded its 70-second time limit.'
                except Exception as exc:
                    state['last_error'] = safe_error(exc)
                finally:
                    state['running'] = False
                    state['last_completed_at'] = datetime.now(timezone.utc).isoformat()
        x_only = accounts and all(platform == 'X' for _, platform in accounts)
        profile_only_x = x_only and all(x_profile_only(scope) and monitored_x_profile(scope) for scope, _ in accounts)
        try:
            interval = max(60, int(settings().get('LGU_X_PROFILE_POLL_SECONDS', '60'))) if profile_only_x else max(120, int(settings().get('LGU_X_POLL_SECONDS', '180'))) if x_only else max(30, int(settings().get('LGU_SOCIAL_POLL_SECONDS', '30')))
        except (TypeError, ValueError):
            interval = 60 if profile_only_x else 180 if x_only else 30
        # Target a start-to-start interval; never overlap polls or spin on failures.
        delay = max(1, interval - (time.monotonic() - cycle_started))
        for scope, platform in accounts or []:
            if platform == 'X':
                delay = max(delay, x_cooldown_remaining(states.setdefault(scope + ':' + platform, {})))
        next_poll = (datetime.now(timezone.utc) + timedelta(seconds=delay)).isoformat()
        for scope, platform in accounts or []:
            state = states.setdefault(scope + ':' + platform, {})
            state.update(poll_seconds=interval, next_poll_at=next_poll)
        stop.wait(delay)


def start(stop, forward, load, save):
    global worker
    if settings().get('LGU_SOCIAL_COLLECTORS_ENABLED','').lower() not in {'true','1','yes'}:
        return
    for scope in SCOPES:
        for platform in PLATFORMS:
            account_worker = threading.Thread(target=poll,args=(stop,forward,load,save),kwargs={'accounts': {(scope, platform)}},daemon=True,name='lgu-social-'+scope+'-'+platform.lower())
            account_worker.start()
            workers.append(account_worker)
    worker = workers[0] if workers else None


def health():
    active_workers = {thread.name: thread.is_alive() for thread in workers}
    return {key: {**value, 'polling_active': active_workers.get('lgu-social-' + key.split(':', 1)[0] + '-' + key.split(':', 1)[1].lower(), False)} for key, value in states.items()}
