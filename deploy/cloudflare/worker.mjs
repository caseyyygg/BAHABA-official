const endpoints = new Set(['index.php', 'login.php', 'forgot-password.php', 'reset-password.php', 'logout.php', 'me.php', 'profile.php', 'delete-account.php', 'request-account-deletion.php', 'confirm-account-deletion.php', 'location-data.php', 'map-reports.php', 'flood-signals.php', 'notifications.php', 'resolve-location.php', 'report-location.php', 'resident-report.php', 'signup.php', 'resend-verification.php', 'verify.php', 'push-device.php'])
const nlpHealthActions = new Set(['health', 'all-reports', 'nlp-events', 'nlp-progress', 'nlp-posts'])

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const isResident = url.pathname.startsWith('/api/')
    const isAdmin = url.pathname === '/admin-api.php'
    if (!isResident && !isAdmin) return env.ASSETS.fetch(request)
    if (isResident && !endpoints.has(url.pathname.slice(5))) return new Response('Not found', { status: 404 })
    let backend
    try {
      backend = new URL(env.BACKEND_ORIGIN)
      if (backend.protocol !== 'https:' || backend.origin === url.origin) throw new Error('Invalid backend')
    } catch {
      return Response.json({ error: 'Hosting setup incomplete: configure BACKEND_ORIGIN in Cloudflare.' }, { status: 503 })
    }
    const target = new URL(isAdmin ? '/admin-api.php' : url.pathname, backend.origin)
    target.search = url.search
    const headers = new Headers(request.headers)
    headers.delete('host')
    headers.set('X-Forwarded-Proto', 'https')
    let upstream
    try {
      upstream = await fetch(target, {
        method: request.method, headers,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        redirect: 'manual',
      })
    } catch {
      return Response.json({ error: 'The PHP host is unavailable.' }, { status: 502 })
    }
    const responseHeaders = new Headers(upstream.headers)
    responseHeaders.set('Cache-Control', 'no-store')
    // The API's private config may still name the retired BahaBa Pages origin.
    // Serve credentialed API responses to the active production Pages origin.
    const requestOrigin = request.headers.get('Origin')
    if (requestOrigin === 'https://bantalafloodapp.pages.dev' && requestOrigin === url.origin) {
      responseHeaders.set('Access-Control-Allow-Origin', requestOrigin)
      responseHeaders.set('Access-Control-Allow-Credentials', 'true')
      responseHeaders.append('Vary', 'Origin')
    }
    // Cookies belong to the public Pages hostname, with HTTPS required.
    responseHeaders.delete('set-cookie')
    for (const cookie of upstream.headers.getSetCookie()) {
      responseHeaders.append('set-cookie', cookie.replace(/;\s*Domain=[^;]*/gi, '').replace(/;\s*Secure/gi, '') + '; Secure')
    }
    const location = responseHeaders.get('location')
    if (location) {
      const redirect = new URL(location, target)
      if (redirect.origin === backend.origin) responseHeaders.set('location', url.origin + redirect.pathname + redirect.search + redirect.hash)
    }
    // Older PHP uploads can still query a local NLP process. Refresh only
    // collector health from this deployment's public NLP health endpoint.
    if (isAdmin && request.method === 'GET' && nlpHealthActions.has(url.searchParams.get('action')) &&
        upstream.ok && upstream.headers.get('content-type')?.includes('application/json')) {
      let payload
      try { payload = await upstream.clone().json() } catch { /* Preserve non-JSON responses. */ }
      if (payload && (!payload.nlpService?.lgu_social_collectors || payload.nlpService?.service === 'unavailable')) {
        try {
          const healthUrl = 'https://bahababa-bantala-nlp.hf.space/health'
          const cache = caches.default
          let healthResponse
          try { healthResponse = await cache.match(healthUrl) } catch { /* Cache is optional. */ }
          if (!healthResponse) {
            const controller = new AbortController()
            const timer = setTimeout(() => controller.abort(), 5000)
            let live
            try {
              const healthHeaders = new Headers({ Accept: 'application/json' })
              if (env.NLP_HEALTH_TOKEN) healthHeaders.set('Authorization', `Bearer ${env.NLP_HEALTH_TOKEN}`)
              live = await fetch(healthUrl, { headers: healthHeaders, signal: controller.signal, redirect: 'manual' })
            } finally { clearTimeout(timer) }
            responseHeaders.set('X-NLP-Health', 'http-' + live.status)
            if (live.ok) {
              const health = await live.json()
              if (health && typeof health.lgu_social_collectors === 'object' && health.lgu_social_collectors !== null) {
                healthResponse = Response.json(health, { headers: { 'Cache-Control': 'public, max-age=15' } })
                try { await cache.put(healthUrl, healthResponse.clone()) } catch { /* Return fresh health when cache storage is unavailable. */ }
              }
            }
          }
          if (healthResponse) {
            payload.nlpService = await healthResponse.json()
            responseHeaders.delete('content-length')
            responseHeaders.delete('content-encoding')
            return new Response(JSON.stringify(payload), { status: upstream.status, headers: responseHeaders })
          }
        } catch (error) { responseHeaders.set('X-NLP-Health', error.name === 'AbortError' ? 'timeout' : 'unavailable-' + error.name) }
      }
    }
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders })
  },
}
