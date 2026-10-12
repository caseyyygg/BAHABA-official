"""Optional per-LGU collectors. Never fall back to shared account credentials."""
import json
import os
import subprocess
import sys
import threading
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

import x_agent_reach

BASE = Path(__file__).resolve().parent
SCOPES = {'navotas':'Navotas', 'bulacan':'Bulacan', 'marikina':'Marikina', 'pampanga':'Pampanga', 'malolos':'Malolos'}
PLATFORMS = ('Facebook', 'X', 'Threads')
states = {}
worker = None


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


def fetch(scope, platform, saved):
    words = ['baha', 'flood', 'lubog']
    if platform == 'X':
        cookies = {c['name']:c['value'] for c in saved['storage']['cookies'] if c.get('domain','').lstrip('.') in {'x.com','twitter.com'}}
        result = x_agent_reach.fetch_posts(words,20,scoped_credentials={'TWITTER_AUTH_TOKEN':cookies.get('auth_token',''), 'TWITTER_CT0':cookies.get('ct0','')}, scoped_location=SCOPES[scope])
        return [{'id':item['id'], 'text':item['text'], 'url':item['url'], 'created_at':item.get('createdAt')} for item in result['tweets']]
    directory = BASE / '.state' / 'lgu-accounts' / scope
    directory.mkdir(parents=True,exist_ok=True,mode=0o700)
    path = directory / (platform.lower() + '.json')
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(saved['storage']),encoding='utf-8')
    temporary.chmod(0o600)
    temporary.replace(path)
    query = quote('(baha OR flood OR lubog) ' + SCOPES[scope],safe='')
    target = 'https://www.facebook.com/search/posts/?q='+query if platform == 'Facebook' else 'https://www.threads.com/search?q='+query
    environment = dict(os.environ, BAHABA_SCOPED_BROWSER_STATE=str(path))
    try:
        result = subprocess.run([sys.executable,str(BASE / 'social_browser.py'),platform,target,'20'],env=environment,capture_output=True,encoding='utf-8',timeout=70,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
        payload = json.loads(result.stdout)
        if result.returncode or payload.get('error'):
            raise RuntimeError('Account needs verification or platform search is unavailable')
        return payload['posts']
    finally:
        path.unlink(missing_ok=True)


def poll(stop, forward, load, save):
    while not stop.is_set():
        for scope in SCOPES:
            for platform in PLATFORMS:
                if stop.is_set():
                    return
                key = scope + ':' + platform
                state = states.setdefault(key, {'connected':False,'running':False,'last_error':None,'posts_processed':0})
                try:
                    saved = gateway(scope,platform)
                    state.update(connected=bool(saved),running=False,last_error=None)
                    if not saved:
                        continue
                    state['running'] = True
                    path = BASE / '.state' / 'lgu-accounts' / scope / (platform.lower()+'-seen.json')
                    path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
                    seen = load(path)
                    for post in fetch(scope,platform,saved):
                        text = str(post.get('text') or '').strip()
                        identity = str(post.get('id') or '')
                        if not identity or identity in seen or not text or not any(word in text.casefold() for word in ['baha','flood','lubog']):
                            continue
                        # A disconnect/switch invalidates in-flight results before delivery.
                        current = gateway(scope,platform)
                        if not current or current['revision'] != saved['revision'] or stop.is_set():
                            break
                        forward({'source':platform,'post_id':identity,'post_text':text[:60000], 'post_url':post.get('url'), 'timestamp':post.get('created_at')})
                        seen.add(identity); save(seen,path)
                        state['posts_processed'] += 1
                except Exception:
                    state['last_error'] = 'Collection unavailable. Verify this LGU account and browser service configuration.'
                finally:
                    state['running'] = False
        stop.wait(300)


def start(stop, forward, load, save):
    global worker
    if settings().get('LGU_SOCIAL_COLLECTORS_ENABLED','').lower() not in {'true','1','yes'}:
        return
    worker = threading.Thread(target=poll,args=(stop,forward,load,save),daemon=True,name='lgu-social-collectors')
    worker.start()


def health():
    return {key:dict(value) for key,value in states.items()}
