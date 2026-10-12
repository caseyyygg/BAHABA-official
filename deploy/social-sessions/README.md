# Per-LGU social sign-in gateway

Implemented locally; not deployed or verified with real platform logins.

The admin PHP API authorizes the selected LGU using `requested_location`, checks
NLP permissions and CSRF, and calls this private service using a server token.
Each LGU/platform gets an independent browser state. Switching starts a fresh
browser; saving replaces only that LGU/platform after login cookies are present.
Closing an unfinished login preserves the previous state. Disconnect deletes the
saved BAHABA session; it does not revoke the account's other platform sessions.

## Deployment

1. Deploy this directory as a Docker service with **one** worker. Mount a private
   persistent disk at `/data`. The service needs enough RAM for up to five Chromium
   login contexts. Do not use ephemeral storage for saved accounts.
2. Set a randomly generated `SOCIAL_BROWSER_TOKEN` secret on the browser service.
3. In the admin API host's private environment set `SOCIAL_BROWSER_URL` to the
   browser service's HTTPS URL and `SOCIAL_BROWSER_TOKEN` to the same secret.
   Alternatively set `social_browser_url` and `social_browser_token` in the existing
   private PHP configuration. Never set either secret in frontend build variables.
4. Run `node bahaba-app/scripts/update-social-accounts.mjs /path/to/admin` to install
   the PHP proxy and account controls. Keep PHP configuration and this service's
   state directory outside public static hosting.
5. Verify two different LGUs cannot access or disconnect each other's sessions.
   Verify login, manual verification, cancel, switch, expired login, and disconnect
   against each real platform before enabling online use. Some platforms can block
   cloud browsers or require additional verification; the UI must not claim success.

The login browser uses screenshot controls through the authenticated PHP proxy.
Enter text into the private input and send it to the selected platform field.
No platform cookie or password is returned as account metadata. Screenshots and
proxy responses are private and uncached. Abandoned browsers expire in ten minutes.

## Scoped collector integration

The installer adds `scoped_collectors.py` to the NLP service and registers its
startup hook. Set `LGU_SOCIAL_COLLECTORS_ENABLED=true`, `SOCIAL_BROWSER_URL`, and
`SOCIAL_BROWSER_TOKEN` privately in the NLP `.env`, then restart the NLP service.
The gateway, PHP host, and NLP host must share the same gateway secret.

Scoped workers obtain only that LGU/platform's saved state, search flood keywords
for that LGU, and forward results through the existing NLP classification and
ingestion pipeline. Facebook/Threads use a short-lived private state file; X uses
explicit cookies from that LGU's saved state with the existing Agent-Reach backend.
X still requires the installed Agent-Reach environment and its compatibility patch.
Workers never fall back to shared `.env` account cookies. Before forwarding each
post they check the account revision so switching or disconnecting invalidates
in-flight results. Polling occurs every five minutes plus collection time.

The existing shared collectors remain separately configured. Disable them when
migrating to LGU-only monitoring; do not mistake their health for per-LGU status.
The new monitoring panel shows the selected LGU's scoped health, reported under
`lgu_social_collectors` by the NLP service's health response.
End-to-end online login and collection are not verified until hosting is configured.

## Checks

With the requirements installed: `python -m unittest test_sessions.py test_collectors.py`.
These test scope isolation, invalid scope rejection, session ownership, expired
cookies, failed-save preservation, cancellation, and service-token enforcement.
They do not log in to social platforms or prove collection works online.
