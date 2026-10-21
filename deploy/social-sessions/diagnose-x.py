"""Temporary free browser diagnostic, isolated from saved user accounts."""
from pathlib import Path
import json
import secrets
import sys
import urllib.request
from huggingface_hub import HfApi

HERE = Path(__file__).resolve().parent
REPO = 'Bahababa/bantala-browser-check'
token = (Path.home() / '.cache/huggingface/token').read_text().strip()
api = HfApi(token=token)
secret_path = HERE / '.local/diagnostic-only-token.txt'
if '--deploy' in sys.argv:
    secret_path.write_text(secrets.token_hex(32))
    api.create_repo(REPO, repo_type='space', space_sdk='docker', exist_ok=True)
    api.add_space_secret(REPO, key='SOCIAL_BROWSER_TOKEN', value=secret_path.read_text().strip())
    api.upload_folder(repo_id=REPO, repo_type='space', folder_path=str(HERE / 'space-output'),
                      allow_patterns=['app.py', 'requirements.txt', 'Dockerfile', 'README.md', '.dockerignore'])
info = api.space_info(REPO)
print(json.dumps({'stage': info.runtime.stage, 'host': info.host}), flush=True)
if '--check' in sys.argv:
    auth = secret_path.read_text().strip()
    owner = secrets.token_hex(32)
    def action(operation):
        body = json.dumps({'scope': 'malolos', 'platform': 'X', 'operation': operation, 'owner': owner}).encode()
        req = urllib.request.Request(info.host.rstrip('/') + '/browser', data=body,
              headers={'Authorization': 'Bearer ' + auth, 'Content-Type': 'application/json'})
        return json.load(urllib.request.urlopen(req, timeout=45))
    try:
        result = action('start')
        print(json.dumps({k: result.get(k) for k in ['page_title','navigation_status','blocked_hosts','failed_hosts']}), flush=True)
    finally:
        action('cancel')
if '--delete' in sys.argv:
    api.delete_repo(REPO, repo_type='space')
    print('Temporary diagnostic Space deleted')
