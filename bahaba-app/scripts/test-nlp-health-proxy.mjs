import assert from 'node:assert/strict';
import worker from '../../deploy/cloudflare/worker.mjs';
const cache=new Map();globalThis.caches={default:{match:async key=>cache.get(key)?.clone(),put:async(key,value)=>cache.set(key,value)}};
let healthCalls=0;
globalThis.fetch=async url=>{
 if(String(url)==='https://bahababa-bantala-nlp.hf.space/health') {healthCalls++;return Response.json({lgu_social_collectors:{'navotas:X':{connected:true}}});}
 return Response.json({events:[{id:42}],nlpService:{service:'unavailable'}},{headers:{'Set-Cookie':'PHPSESSID=test; Domain=backend.example; HttpOnly'}});
};
const request=new Request('https://bantalafloodapp.pages.dev/admin-api.php?action=nlp-events');
const env={BACKEND_ORIGIN:'https://backend.example'};
const response=await worker.fetch(request,env);const data=await response.json();
assert.equal(data.events[0].id,42);assert.equal(data.nlpService.lgu_social_collectors['navotas:X'].connected,true);
assert.match(response.headers.get('set-cookie'),/HttpOnly; Secure/);assert.doesNotMatch(response.headers.get('set-cookie'),/Domain=/i);
assert.equal(response.headers.get('cache-control'),'no-store');
await worker.fetch(request,env);assert.equal(healthCalls,1);
cache.clear();let reportHealthCalls=0;
globalThis.fetch=async url=>{
 if(String(url)==='https://bahababa-bantala-nlp.hf.space/health') {reportHealthCalls++;return Response.json({lgu_social_collectors:{'navotas:X':{connected:true}}});}
 return Response.json({reports:[]});
};
const reportsRequest=new Request('https://bantalafloodapp.pages.dev/admin-api.php?action=all-reports');
const reportsResponse=await worker.fetch(reportsRequest,env);const reportsData=await reportsResponse.json();
assert.equal(reportsData.nlpService.lgu_social_collectors['navotas:X'].connected,true,'Legacy all-reports responses without nlpService must still include live collector health');
assert.equal(reportHealthCalls,1);
cache.clear();
let authenticatedHealth = false;
globalThis.fetch=async (url, options)=>{
 if(String(url).includes('hf.space')) {
  authenticatedHealth = options.headers.get('Authorization') === 'Bearer private-space-test-token';
  return authenticatedHealth ? Response.json({lgu_social_collectors:{'navotas:X':{connected:true,running:true}}}) : new Response('Not found',{status:404});
 }
 return Response.json({nlpService:{service:'unavailable'}});
};
const privateResponse=await worker.fetch(request,{...env,NLP_HEALTH_TOKEN:'private-space-test-token'});
assert.equal((await privateResponse.json()).nlpService.lgu_social_collectors['navotas:X'].running,true);
assert.equal(authenticatedHealth,true,'Private Space health must use the server-side Hugging Face token');
assert.equal(privateResponse.headers.has('Authorization'),false,'The health token must never be returned to the browser');
cache.clear();globalThis.fetch=async url=>{if(String(url).includes('hf.space'))throw Error('Unavailable');return Response.json({nlpService:{service:'unavailable'}});};
assert.equal((await (await worker.fetch(request,env)).json()).nlpService.service,'unavailable');
console.log('NLP health proxy checks passed: collector status, legacy reports, event preservation, session cookies, caching, and service failure.');
