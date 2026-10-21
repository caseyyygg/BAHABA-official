"""Deploy only the prepared allowlisted files; never print authentication secrets."""
import base64
import json
import os
import secrets
from pathlib import Path
import sys
import time
import urllib.error
import urllib.request

HERE = Path(__file__).resolve().parent
REPO = 'Bahababa/bantala-social-browser'
token = os.getenv('HF_TOKEN') or (Path.home() / '.cache/huggingface/token').read_text().strip()


def request(path, method='GET', payload=None, content_type='application/json'):
    raw = None if payload is None else (json.dumps(payload).encode() if isinstance(payload, dict) else payload)
    req = urllib.request.Request('https://huggingface.co' + path, data=raw, method=method,
                                 headers={'Authorization': 'Bearer ' + token, 'Content-Type': content_type})
    with urllib.request.urlopen(req, timeout=45) as response:
        return json.load(response)


try:
    identity = request('/api/whoami-v2')
    if identity.get('name') != 'Bahababa':
        raise RuntimeError('Cached login does not belong to the intended account')
    if '--deploy' in sys.argv:
        try:
            request('/api/spaces/' + REPO)
        except urllib.error.HTTPError as exc:
            if exc.code != 404:
                raise
            request('/api/repos/create', 'POST', {'type': 'space', 'name': 'bantala-social-browser',
                    'organization': 'Bahababa', 'private': False, 'sdk': 'docker'})
        # Reuse the existing gateway token to preserve compatibility with its API host.
        secret = (HERE / '.local/social-browser-token.txt').read_text().strip()
        if len(secret) < 32:
            raise RuntimeError('Existing gateway token is missing or too short')
        request('/api/spaces/' + REPO + '/secrets', 'POST', {'key': 'SOCIAL_BROWSER_TOKEN', 'value': secret})
        lines = [json.dumps({'key': 'header', 'value': {'summary': 'Deploy token-protected BANTALA browser gateway'}})]
        for name in ['README.md', 'Dockerfile', 'app.py', 'requirements.txt', '.dockerignore']:
            content = (HERE / 'space-output' / name).read_bytes()
            lines.append(json.dumps({'key': 'file', 'value': {'path': name, 'encoding': 'base64',
                                      'content': base64.b64encode(content).decode()}}))
        result = request('/api/spaces/' + REPO + '/commit/main', 'POST',
                         ('\n'.join(lines) + '\n').encode(), 'application/x-ndjson')
        print(json.dumps({'commit': result.get('commitOid'), 'space': 'https://huggingface.co/spaces/' + REPO}))
    info = request('/api/spaces/' + REPO)
    print(json.dumps({'id': info.get('id'), 'host': info.get('host'), 'runtime': info.get('runtime')}))
    if '--smoke' in sys.argv:
        host = info['host'].rstrip('/')
        secret = (HERE / '.local/social-browser-token.txt').read_text().strip()
        for endpoint, authenticated in [('/', False), ('/accounts/navotas', False), ('/accounts/navotas', True)]:
            headers = {'Authorization': 'Bearer ' + secret} if authenticated else {}
            started = time.monotonic()
            try:
                with urllib.request.urlopen(urllib.request.Request(host + endpoint, headers=headers), timeout=45) as response:
                    data = json.load(response)
                    code = response.status
            except urllib.error.HTTPError as exc:
                code, data = exc.code, {}
            expected = 401 if endpoint != '/' and not authenticated else 200
            print(json.dumps({'endpoint': endpoint, 'authenticated': authenticated, 'status': code,
                              'seconds': round(time.monotonic() - started, 2)}))
            if code != expected:
                raise RuntimeError('Live smoke check failed')
    if '--browser-check' in sys.argv:
        host = info['host'].rstrip('/')
        secret = (HERE / '.local/social-browser-token.txt').read_text().strip()
        owner = secrets.token_hex(32)
        for platform in (['X'] if '--x-only' in sys.argv else ['Facebook', 'X', 'Threads']):
            def action(operation):
                body = json.dumps({'scope': 'malolos' if '--x-only' in sys.argv else 'navotas', 'platform': platform, 'owner': owner,
                                   'operation': operation}).encode()
                req = urllib.request.Request(host + '/browser', data=body,
                    headers={'Authorization': 'Bearer ' + secret, 'Content-Type': 'application/json'})
                with urllib.request.urlopen(req, timeout=45) as response:
                    return json.load(response)
            started = time.monotonic()
            try:
                result = action('start')
                if platform == 'X':
                    time.sleep(3)
                    result = action('frame')
                if result.get('image'):
                    (HERE / '.local' / (platform.lower() + '-hosting-check.jpg')).write_bytes(base64.b64decode(result['image']))
                print(json.dumps({'platform': platform, 'seconds': round(time.monotonic()-started, 2),
                                  'screenshot_received': bool(result.get('image')),
                                  'diagnostics': {k: result.get(k) for k in ['page_title', 'navigation_status', 'blocked_hosts', 'failed_hosts']}}), flush=True)
            except urllib.error.HTTPError as exc:
                print(json.dumps({'platform': platform, 'status': exc.code}), flush=True)
            finally:
                try:
                    action('cancel')
                except urllib.error.HTTPError:
                    pass
except urllib.error.HTTPError as exc:
    print(f'Hugging Face request failed: HTTP {exc.code}. No credentials were printed.', file=sys.stderr)
    sys.exit(1)
