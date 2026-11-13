## Cookie input

The admin NLP page accepts cookies separately for Facebook, X, and Threads.
Sign in using your own browser, then paste a cookie header or exported cookie JSON.
Facebook needs `c_user` and `xs`; X needs `auth_token` and `ct0`; Threads needs
`sessionid`. Exported JSON preserves Threads or Instagram cookie domains.
Cookie imports use the authenticated PHP proxy and CSRF protection. Only the
platform admin can import. Values are cleared from the input on submission and
never returned in account metadata. Invalid imports preserve the saved session.
No hosted login browser is opened for cookie import. The collector uses the saved
session; successful import does not prove the social platform will accept it.

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
ingestion pipeline. Each platform uses a short-lived private state file with that
LGU's saved browser session. X searches use the Latest results view.
Workers never fall back to shared `.env` account cookies. Before forwarding each
post they check the account revision so switching or disconnecting invalidates
in-flight results. Each account polls independently with a target start interval of 30 seconds.
Collection time counts toward the interval; slow cycles retry after one second
without overlapping. `LGU_SOCIAL_POLL_SECONDS` sets the interval (minimum 30
seconds). Browser and platform latency can make the actual interval longer.
Fresh public X search candidates are delivered before profile scans. Health
reports `polling_active` for worker liveness separately from `running` for a
currently executing cycle, and `next_poll_at` for the scheduled retry. At most two browsers collect simultaneously. A slow or inaccessible
account does not stop every other account's worker. Facebook and Threads rotate
city, flood-keyword, and supported barangay searches. Flood-related wording is
filtered before NLP classification, including water and road-passability terms.
Facebook search parsing accepts both direct post permalinks and the newer
`/share/p/` post links used in current search results.

For X, the worker checks configured public profiles from
`collector-profiles.json` as well as the signed-in account's public profile
when the saved session contains its `twid` user ID. Navotas' demo is configured
for `lauveyfan` only and uses profile-only collection at a 60-second target
start interval; it does not issue broad city searches. Other scopes retain
their normal search/profile behavior. X rate limits override the normal
interval with a cooldown that starts at 15 minutes and increases after
repeated limits. Public posts are eligible only when their text contains
flood-related wording. A location recognized in the post text is preserved;
otherwise the post remains unlocated. The saved account's LGU is never
substituted for a post's actual location.

Only posts with a verified original publication time within the rolling past
24 hours are delivered. Unknown dates and future dates are skipped rather than
replaced with the current time. X dates come from the original status ID; Threads
dates come from the original post data. Pending delivery retries expire at the
same 24-hour boundary. Collection depends on public visibility, saved-session
access and the platform's search indexing, so publication does not guarantee
instant discovery. A sleeping or stopped NLP host cannot collect new posts.
Unique supported barangay names are recognized even without a `Brgy.` prefix;
ambiguous names do not receive an inferred location.

The admin Reports feed is restricted to the administrator's assigned city and
defaults to all barangays in that city. Its barangay selector can narrow the
view without changing the barangay scope used by other admin pages.

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

## Coverage and failed delivery

Facebook, X, and Threads are the supported platforms. Collection is best effort:
platform search indexing, ranking, rate limits, and access checks can omit public
posts. Cookies do not provide a complete firehose. Images, video, and audio are
not analyzed by the text collectors.

Facebook and Threads collectors rotate city and flood-keyword queries with
registered city/barangay aliases in `collector-locations.json`. X checks the
signed-in public profile when its user ID is available, followed by recent
flood-keyword search. Browser reads are bounded to 100 candidates initially and
50 on subsequent successful polls; each search has a 70-second timeout. Recent
Threads results are selected when the platform exposes that control. The model, not keyword
presence alone, classifies each candidate. A barangay name shared by different
cities is not automatically assigned to the account's LGU.

Matching posts are saved to a private pending queue before delivery, deduplicated
by platform post ID, and removed only after successful ingestion. Delivery
failures retry in later collection cycles even when the post drops out of search.
A queue is capped at 2,000 posts per LGU/platform; a full queue is reported and
unaccepted results are not marked delivered. Switching or disconnecting an
account invalidates that session's pending queue. Seen IDs keep existing
successfully delivered posts from being sent twice.

The files live under the NLP service's `.state/lgu-accounts` directory. Hosting
must preserve that directory across restarts to retain queues and seen IDs;
ephemeral container storage alone does not preserve them across redeployment.
The NLP and PHP ingestion tokens must match before any queued result can reach
the dashboard. Diagnostics are token-protected and never return cookie values.
