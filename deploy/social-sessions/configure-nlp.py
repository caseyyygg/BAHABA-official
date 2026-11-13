"""Connect the existing NLP Space without changing hardware or exposing secrets."""
from pathlib import Path
import json
import secrets
import urllib.request
from huggingface_hub import HfApi, CommitOperationAdd

HERE = Path(__file__).resolve().parent
PRIVATE = HERE / '.local'
token = (Path.home() / '.cache/huggingface/token').read_text().strip()
api = HfApi(token=token)
repo = 'Bahababa/bantala-nlp'
model_repo = 'Bahababa/bantala-models'
files = set(api.list_repo_files(model_repo))
if not {'flood.zip', 'severity.zip', 'urgency.zip', 'location.zip'}.issubset(files):
    raise RuntimeError('Finish all four model uploads before configuring NLP')


def local_secret(name):
    path = PRIVATE / name
    if not path.exists():
        path.write_text(secrets.token_hex(32), encoding='utf-8')
    return path.read_text().strip()


ingest = local_secret('nlp-ingest-token.txt')
service = local_secret('nlp-service-token.txt')
browser = (PRIVATE / 'social-browser-token.txt').read_text().strip()
variables = {'HF_MODEL_REPO_ID': model_repo, 'HF_MODEL_REPO_TYPE': 'model',
             'BAHABA_INGEST_URL': 'https://bahabafloodapp.alwaysdata.net/admin-api.php?action=nlp-ingest',
             'SOCIAL_BROWSER_URL': 'https://bahababa-bantala-social-browser.hf.space',
             'LGU_SOCIAL_COLLECTORS_ENABLED': 'true', 'SOCIAL_SCRAPER_SEARCH_ENABLED': 'false',
             'X_PROVIDER': 'agent-reach', 'X_OFFICIAL_POLLING_ENABLED': 'false',
             'FACEBOOK_SCRAPER_URLS': '[]', 'THREADS_SCRAPER_URLS': '[]'}
for key, value in variables.items():
    api.add_space_variable(repo_id=repo, key=key, value=value)
for key, value in {'HF_TOKEN': token, 'BAHABA_INGEST_TOKEN': ingest,
                   'NLP_SERVICE_TOKEN': service, 'SOCIAL_BROWSER_TOKEN': browser}.items():
    api.add_space_secret(repo_id=repo, key=key, value=value)

# Patch only the intended changes into the latest remote source.
def remote_file(name):
    req = urllib.request.Request('https://huggingface.co/spaces/' + repo + '/resolve/main/' + name,
                                 headers={'Authorization': 'Bearer ' + token})
    return urllib.request.urlopen(req, timeout=30).read().decode()


docker = remote_file('Dockerfile')
if ('playwright install --with-deps chrome' not in docker
        and 'playwright install --with-deps chromium' not in docker):
    old = '    && python -m pip install --no-cache-dir -r requirements.txt'
    if old not in docker:
        raise RuntimeError('Unexpected remote Dockerfile; inspect before patching')
    docker = docker.replace(old, old + ' \\\n    && playwright install --with-deps chromium', 1)
source = remote_file('app.py')
if 'def classify_only(' not in source:
    old = 'def _detect_and_forward(post: DetectionRequest) -> dict[str, Any]:'
    returned = 'return {"detection": result, "stored": _ingest(result)}'
    if old not in source or returned not in source:
        raise RuntimeError('Unexpected remote inference code; inspect before patching')
    source = source.replace(old, 'def _detect_and_forward(post: DetectionRequest, *, persist: bool = True) -> dict[str, Any]:', 1)
    source = source.replace(returned, 'return {"detection": result, "stored": _ingest(result) if persist else None}', 1)
    source += '''

@app.post("/classify", dependencies=[Depends(require_collector_token)])
def classify_only(post: DetectionRequest) -> dict[str, Any]:
    """Inference-only test that never writes synthetic reports to the PHP API."""
    try:
        return _detect_and_forward(post, persist=False)
    except Exception:
        logger.exception("NLP classification failed")
        raise HTTPException(status_code=503, detail="Model initialization or inference failed") from None
'''
compile(source, 'app.py', 'exec')
api.create_commit(repo_id=repo, repo_type='space', commit_message='Enable model testing and install collector browser',
                  operations=[CommitOperationAdd(path_in_repo='Dockerfile', path_or_fileobj=docker.encode()),
                              CommitOperationAdd(path_in_repo='app.py', path_or_fileobj=source.encode())])
# Copy these lines into the existing AlwaysData site environment; preserve its other settings.
settings = ('BAHABA_INGEST_TOKEN=' + ingest + '\n'
            'NLP_SERVICE_URL=https://bahababa-bantala-nlp.hf.space\n'
            'NLP_SERVICE_TOKEN=' + service + '\n')
(PRIVATE / 'alwaysdata-nlp-settings.txt').write_text(settings, encoding='utf-8')
print('Configured NLP Space. Hardware unchanged. AlwaysData settings saved privately to .local/alwaysdata-nlp-settings.txt', flush=True)
