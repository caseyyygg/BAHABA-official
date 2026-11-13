import assert from 'node:assert/strict'
import worker from '../../deploy/cloudflare/worker.mjs'

const originalFetch = globalThis.fetch
let upstreamUrl
let upstreamCookie
globalThis.fetch = async (input, options) => {
  upstreamUrl = String(input)
  upstreamCookie = new Headers(options.headers).get('cookie')
  return Response.json({ cities: [], pins: [] })
}

try {
  const request = new Request('https://bantalafloodapp.pages.dev/api/flood-signals.php?location=1380900000', {
    headers: { Cookie: 'bahaba_session=test-session' },
  })
  const response = await worker.fetch(request, {
    BACKEND_ORIGIN: 'https://bahaba-api.alwaysdata.net',
    ASSETS: { fetch: () => new Response('asset') },
  })
  assert.equal(response.status, 200)
  assert.equal(new URL(upstreamUrl).pathname, '/api/flood-signals.php')
  assert.equal(new URL(upstreamUrl).search, '?location=1380900000')
  assert.equal(upstreamCookie, 'bahaba_session=test-session')

  const denied = await worker.fetch(new Request('https://bantalafloodapp.pages.dev/api/not-allowed.php'), {
    BACKEND_ORIGIN: 'https://bahaba-api.alwaysdata.net',
    ASSETS: { fetch: () => new Response('asset') },
  })
  assert.equal(denied.status, 404)
  console.log('PASS Cloudflare forwards authenticated flood-signal requests to AlwaysData.')
} finally {
  globalThis.fetch = originalFetch
}
