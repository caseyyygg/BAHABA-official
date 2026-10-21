"""Check model readiness and run inference without inserting production reports."""
from pathlib import Path
import json
import sys
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent
host = 'https://bahababa-bantala-nlp.hf.space'
token = (Path.home() / '.cache/huggingface/token').read_text().strip()
req = urllib.request.Request('https://huggingface.co/api/spaces/Bahababa/bantala-nlp',
                             headers={'Authorization': 'Bearer ' + token})
info = json.load(urllib.request.urlopen(req, timeout=20))
print(json.dumps({'runtime': info.get('runtime')}), flush=True)
if '--receiver' in sys.argv:
    ingest = (ROOT / '.local/nlp-ingest-token.txt').read_text().strip()
    # Empty text fails validation before any database insert, after authentication.
    req = urllib.request.Request('https://bahabafloodapp.alwaysdata.net/admin-api.php?action=nlp-ingest',
          data=b'{}', headers={'Authorization': 'Bearer ' + ingest, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            print(json.dumps({'receiver_status': response.status}), flush=True)
    except urllib.error.HTTPError as exc:
        print(json.dumps({'receiver_status': exc.code, 'response': exc.read(500).decode(errors='replace')}), flush=True)
if '--classify' in sys.argv:
    auth = (ROOT / '.local/nlp-service-token.txt').read_text().strip()
    text = 'Malalim na baha sa Navotas. Lubog ang mga bahay at kailangan namin ng tulong.'
    body = json.dumps({'source': 'Test', 'post_text': text}).encode()
    req = urllib.request.Request(host + '/classify', data=body,
          headers={'Authorization': 'Bearer ' + auth, 'Content-Type': 'application/json'})
    started = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=600) as response:
            result = json.load(response)
        if result.get('stored') is not None:
            raise RuntimeError('Inference-only test unexpectedly reported storage')
        print(json.dumps({'seconds': round(time.monotonic()-started, 2), 'result': result}), flush=True)
    except urllib.error.HTTPError as exc:
        print(json.dumps({'status': exc.code, 'response': exc.read(1000).decode(errors='replace')}), flush=True)
        sys.exit(1)
with urllib.request.urlopen(host + '/health', timeout=20) as response:
    health = json.load(response)
print(json.dumps({key: health.get(key) for key in ['models_loaded', 'model_archives_configured',
      'bahaba_ingest_configured', 'collector_auth_configured', 'lgu_social_collectors']}), flush=True)
