"""Deploy the matching live-feed collector sources without changing Space secrets."""
from pathlib import Path
import base64,json,urllib.request
root=Path(__file__).resolve().parents[2]
token=(Path.home()/'.cache/huggingface/token').read_text().strip()
lines=[{'key':'header','value':{'summary':'Use original post dates, scoped locations, and watched public profiles'}}]
for name in ['app.py','scoped_collectors.py','social_browser.py','social_collectors.py','x_agent_reach.py','official_x.py','collector-locations.json','collector-profiles.json','requirements.txt','Dockerfile']:
 source=(root/'deploy/huggingface-space'/name).read_bytes()
 if name.endswith('.py'):compile(source,name,'exec')
 lines.append({'key':'file','value':{'path':name,'encoding':'base64','content':base64.b64encode(source).decode()}})
req=urllib.request.Request('https://huggingface.co/api/spaces/Bahababa/bantala-nlp/commit/main',data=('\n'.join(json.dumps(line) for line in lines)+'\n').encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/x-ndjson'})
with urllib.request.urlopen(req,timeout=30) as r: result=json.load(r)
print(json.dumps({'commit':result.get('commitOid')}))
