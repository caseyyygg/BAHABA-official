"""Agent-Reach X backend adapter. Explicit credentials only; no browser extraction."""
from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path


def credentials():
    from dotenv import dotenv_values
    values = dotenv_values(Path(__file__).with_name('.env'))
    return {name: (values.get(name) if name in values else os.getenv(name)) or ''
            for name in ('TWITTER_AUTH_TOKEN', 'TWITTER_CT0')}


def configured():
    return all(credentials().values())


def build_query(keywords):
    terms = ' OR '.join('"' + str(word).replace('"', '').replace('\\', '') + '"' for word in keywords)
    since = (datetime.now(timezone.utc) - timedelta(hours=24)).strftime('%Y-%m-%d')
    return f'({terms}) (Navotas OR Bulacan OR Marikina OR Pampanga OR Malolos) -filter:retweets since:{since}'


def fetch_posts(keywords, count, scoped_credentials=None, scoped_location=None, scoped_query=None):
    creds = credentials() if scoped_credentials is None else scoped_credentials
    if not all(creds.values()):
        raise RuntimeError('Waiting for X login: add TWITTER_AUTH_TOKEN and TWITTER_CT0 locally in nlp-service/.env.')
    if creds['TWITTER_AUTH_TOKEN'] == creds['TWITTER_CT0']:
        raise RuntimeError('The same cookie was entered twice. Re-run configure-x.ps1 and copy the separate ct0 row value.')
    from dotenv import dotenv_values
    settings = dotenv_values(Path(__file__).with_name('.env'))
    python = os.getenv('X_AGENT_REACH_PYTHON') or settings.get('X_AGENT_REACH_PYTHON')
    if not python or not Path(python).is_file():
        raise RuntimeError('Agent-Reach X environment is missing; set X_AGENT_REACH_PYTHON locally.')
    env = dict(os.environ, **creds, PYTHONIOENCODING='utf-8')
    try:
        query = build_query(keywords) if scoped_location is None else '(' + ' OR '.join('"' + str(word).replace('"', '').replace('\\', '') + '"' for word in keywords) + ') "' + scoped_location.replace('"', '') + '" -filter:retweets since:' + (datetime.now(timezone.utc) - timedelta(hours=24)).strftime('%Y-%m-%d')
        if scoped_query is not None:
            query = scoped_query[:500] + ' -filter:retweets since:' + (datetime.now(timezone.utc) - timedelta(hours=24)).strftime('%Y-%m-%d')
        result = subprocess.run([python, str(Path(__file__).resolve()), '--search', query, str(count)],
                                env=env, capture_output=True, text=True, encoding='utf-8', timeout=90,
                                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    except subprocess.TimeoutExpired:
        raise RuntimeError('X search timed out; the collector will retry automatically.') from None
    if result.returncode:
        # Never forward raw upstream stderr (may contain session or request details).
        try:
            payload = json.loads(result.stdout)
            code = payload.get('error')
            exception_type = payload.get('exception_type')
        except (ValueError, AttributeError):
            code = None
            exception_type = None
        message = {'auth': 'X session expired or access denied; update the local X cookies.',
                   'rate_limit': 'X rate limit reached; collection will retry after a pause.',
                   'query_id': 'X search interface could not be resolved; the hosted X client needs an update.',
                   'not_found': 'X search endpoint is unavailable; the hosted client needs an update.',
                   'network': 'The hosted X client could not reach X.',
                   'client': 'The hosted X client failed before reading search results.'}.get(code,
                   'Agent-Reach X search failed; check connection or refresh the local X session.')
        if code == 'client' and isinstance(exception_type, str) and exception_type.isidentifier():
            message = f'The hosted X client failed before reading search results ({exception_type}).'
        raise RuntimeError(message)
    payload = json.loads(result.stdout)
    if not isinstance(payload, dict) or not isinstance(payload.get('tweets'), list):
        raise RuntimeError('Agent-Reach returned an unexpected X search response.')
    return payload


def initialize_signed_in_search(client, token, ct0):
    """Use the authenticated homepage when the public landing page cannot initialize search."""
    if client._client_transaction is not None:
        return
    import bs4
    import twitter_cli.client as backend
    headers = backend._gen_ct_headers()
    cookie_string = os.getenv('TWITTER_COOKIE_STRING') or f'auth_token={token}; ct0={ct0}'
    session = backend._get_cffi_session()
    home = session.get('https://x.com/home', headers={**headers, 'Cookie': cookie_string}, timeout=15)
    if home.status_code != 200:
        raise RuntimeError('Signed-in X search initialization failed')
    document = bs4.BeautifulSoup(home.content, 'html.parser')
    script_url = backend.get_ondemand_file_url(response=document)
    # Public assets do not receive account cookies.
    script = session.get(script_url, headers=headers, timeout=15)
    if script.status_code != 200:
        raise RuntimeError('X search initialization asset unavailable')
    client._client_transaction = backend.ClientTransaction(
        home_page_response=document, ondemand_file_response=script.text)
    backend._update_features_from_html(home.text)


def run_search(query, count):
    # Use the backend client directly. CLI get_cookies() falls back to browser
    # extraction on invalid sessions; this integration deliberately never calls it.
    from twitter_cli.client import TwitterClient
    from social_browser import x_post_timestamp
    token, ct0 = os.getenv('TWITTER_AUTH_TOKEN', ''), os.getenv('TWITTER_CT0', '')
    if not token or not ct0:
        raise RuntimeError('Explicit X session required')
    client = TwitterClient(token, ct0, rate_limit_config={'maxRetries': 0, 'maxCount': count}, cookie_string=os.getenv('TWITTER_COOKIE_STRING') or None)
    initialize_signed_in_search(client, token, ct0)
    tweets = client.fetch_search(query, count=count, product='Latest')
    output = []
    for tweet in tweets:
        if tweet.is_retweet:
            continue
        timestamp = x_post_timestamp(tweet.id)
        output.append({'id': tweet.id, 'text': tweet.text,
                       'author': {'username': tweet.author.screen_name},
                       'url': f'https://x.com/{tweet.author.screen_name}/status/{tweet.id}',
                       'createdAt': timestamp})
    return {'tweets': output}


if __name__ == '__main__':
    try:
        print(json.dumps(run_search(sys.argv[2], max(1, min(100, int(sys.argv[3])))), ensure_ascii=False))
    except Exception as exc:
        from twitter_cli.exceptions import AuthenticationError, RateLimitError, TwitterAPIError
        message = str(exc).lower()
        category = getattr(exc, 'error_code', '')
        status = getattr(exc, 'status_code', None)
        code = ('rate_limit' if isinstance(exc, RateLimitError) or category == 'rate_limited' or status == 429 or '429' in message
                else 'auth' if isinstance(exc, AuthenticationError) or category == 'not_authenticated' or status in {401, 403} or '401' in message or '403' in message
                else 'network' if category == 'network_error' or (isinstance(exc, TwitterAPIError) and status == 0)
                else 'query_id' if category == 'query_id_error'
                else 'not_found' if status == 404
                else 'network' if category == 'network_error' else 'client')
        print(json.dumps({'error': code, 'exception_type': type(exc).__name__}))
        sys.exit(1)
