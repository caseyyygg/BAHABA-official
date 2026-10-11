const endpoints = new Set(['index.php', 'login.php', 'forgot-password.php', 'reset-password.php', 'logout.php', 'me.php', 'profile.php', 'location-data.php', 'map-reports.php', 'notifications.php', 'resolve-location.php', 'signup.php', 'resend-verification.php', 'verify.php'])

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
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders })
  },
}
