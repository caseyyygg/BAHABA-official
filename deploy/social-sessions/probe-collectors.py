"""Read-only, token-protected collector diagnostics; never inserts detections."""
from pathlib import Path
import json, sys, urllib.request, urllib.error
import base64
HERE=Path(__file__).resolve().parent
repo='Bahababa/bantala-nlp'
token=(Path.home()/'.cache/huggingface/token').read_text().strip()
endpoint='''

class CollectorCheckRequest(BaseModel):
    scope: str
    platform: str


@app.post('/collector-check', dependencies=[Depends(require_collector_token)])
def collector_check(data: CollectorCheckRequest):
    if data.scope not in scoped_collectors.SCOPES or data.platform not in scoped_collectors.PLATFORMS:
        raise HTTPException(422, 'Unsupported collector scope or platform')
    saved = scoped_collectors.gateway(data.scope, data.platform)
    if not saved:
        return {'connected': False, 'posts_found': 0}
    try:
        posts = scoped_collectors.fetch(data.scope, data.platform, saved)
        return {'connected': True, 'posts_found': len(posts), 'posts': [{'id': p.get('id'), 'url': p.get('url'), 'has_flood_keyword': any(w in str(p.get('text', '')).casefold() for w in ['baha','flood','lubog'])} for p in posts[:20]]}
    except Exception as exc:
        known = {key: value for key, value in scoped_collectors.ERROR_MESSAGES.items()}
        safe = known.get(str(exc))
        if not safe:
            safe = {
                'Agent-Reach X environment is missing; set X_AGENT_REACH_PYTHON locally.': 'X runtime missing',
                'X session expired or access denied; update the local X cookies.': 'X access denied',
                'Agent-Reach X search failed; check connection or refresh the local X session.': 'X search failed',
            }.get(str(exc), 'Collector failed')
        return {'connected': True, 'posts_found': 0, 'error_type': type(exc).__name__, 'error': safe}


@app.post('/collector-page-status', dependencies=[Depends(require_collector_token)])
def collector_page_status(data: CollectorCheckRequest):
    if data.scope not in scoped_collectors.SCOPES or data.platform not in ('Facebook', 'Threads'):
        raise HTTPException(422, 'Unsupported collector')
    saved = scoped_collectors.gateway(data.scope, data.platform)
    if not saved:
        return {'connected': False}
    from playwright.sync_api import sync_playwright
    from urllib.parse import quote, urlparse
    query = quote(scoped_collectors.SCOPES[data.scope])
    url = ('https://www.facebook.com/search/posts/?q=' if data.platform == 'Facebook' else 'https://www.threads.com/search?q=') + query
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        try:
            context = browser.new_context(storage_state=saved['storage'], locale='en-US')
            page = context.new_page()
            response = page.goto(url, wait_until='domcontentloaded', timeout=25000)
            page.wait_for_timeout(5000)
            body = page.locator('body').inner_text().casefold()
            return {'connected': True, 'http_status': response.status if response else None,
                    'auth_redirect': any(part in urlparse(page.url).path for part in ('login','checkpoint','challenge')),
                    'has_city_text': scoped_collectors.SCOPES[data.scope].casefold() in body,
                    'has_flood_text': 'baha' in body,
                    'visible_password_fields': page.locator('input[type="password"]:visible').count(),
                    'articles': page.locator('[role="article"]').count(),
                    'visible_post_links': page.locator('a[href*="/post/"], a[href*="/posts/"], a[href*="story_fbid"]').count(),
                    'no_results_message': 'no results' in body or 'no posts found' in body}
        finally:
            browser.close()


@app.post('/collector-post-check', dependencies=[Depends(require_collector_token)])
def collector_post_check(data: CollectorCheckRequest):
    if data.scope != 'navotas' or data.platform not in ('Facebook', 'Threads'):
        raise HTTPException(422, 'Only the identified public test posts can be checked')
    targets = {'Facebook': 'https://www.facebook.com/share/p/19mGNvafM2/',
               'Threads': 'https://www.threads.com/@bantalafloodapp/post/DezN8lKFCiu'}
    saved = scoped_collectors.gateway(data.scope, data.platform)
    if not saved:
        return {'connected': False}
    import os, tempfile, subprocess, sys, json
    from pathlib import Path
    root = Path(scoped_collectors.BASE) / '.state'
    root.mkdir(exist_ok=True, mode=0o700)
    with tempfile.TemporaryDirectory(dir=root) as temporary:
        state = Path(temporary) / 'state.json'
        state.write_text(json.dumps(saved['storage']))
        state.chmod(0o600)
        result = subprocess.run([sys.executable, str(Path(scoped_collectors.BASE) / 'social_browser.py'), data.platform, targets[data.platform], '40'], env=dict(os.environ, BAHABA_SCOPED_BROWSER_STATE=str(state)), capture_output=True, text=True, timeout=80)
        try:
            payload = json.loads(result.stdout)
        except ValueError:
            return {'connected': True, 'error': 'No readable collector response'}
        if payload.get('error'):
            return {'connected': True, 'error': scoped_collectors.ERROR_MESSAGES.get(payload['error'], 'Post unavailable')}
        posts = payload.get('posts', [])
        if data.platform == 'Threads':
            posts = [p for p in posts if '/post/DezN8lKFCiu' in str(p.get('url'))]
        return {'connected': True, 'posts_found': len(posts), 'posts': posts}
'''
if '--deploy' in sys.argv:
 req=urllib.request.Request('https://huggingface.co/spaces/'+repo+'/resolve/main/app.py',headers={'Authorization':'Bearer '+token})
 with urllib.request.urlopen(req,timeout=25) as r: source=r.read().decode()
 if "@app.post('/collector-post-check'" not in source:
  source+=endpoint[endpoint.index("\n@app.post('/collector-post-check'"):] if "@app.post('/collector-check'" in source else endpoint
  compile(source,'app.py','exec')
  lines=[{'key':'header','value':{'summary':'Add authenticated read-only collector diagnostics'}},{'key':'file','value':{'path':'app.py','encoding':'base64','content':base64.b64encode(source.encode()).decode()}}]
  req=urllib.request.Request('https://huggingface.co/api/spaces/'+repo+'/commit/main',data=('\n'.join(json.dumps(line) for line in lines)+'\n').encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/x-ndjson'})
  with urllib.request.urlopen(req,timeout=30) as r: result=json.load(r)
  print(json.dumps({'commit':result.get('commitOid')}),flush=True)
else:
 secret=(HERE/'.local/nlp-service-token.txt').read_text().strip()
 platform=sys.argv[1]
 req=urllib.request.Request('https://bahababa-bantala-nlp.hf.space'+('/collector-post-check' if '--post' in sys.argv else '/collector-page-status' if '--status' in sys.argv else '/collector-check'),data=json.dumps({'scope':'navotas','platform':platform}).encode(),headers={'Authorization':'Bearer '+secret,'Content-Type':'application/json'})
 with urllib.request.urlopen(req,timeout=100) as r: print(json.dumps(json.load(r)),flush=True)
