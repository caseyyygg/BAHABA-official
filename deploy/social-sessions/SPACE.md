---
title: BANTALA Social Browser
emoji: 🌐
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
---

# BANTALA Social Browser

Token-protected browser gateway for the BANTALA admin console. This is a separate
service from the NLP classifier. It does not provide official platform API access.

Use CPU Basic for the initial test. Set `SOCIAL_BROWSER_TOKEN` as a Space secret
to a randomly generated value shared with the PHP API. All account and browser
routes require `Authorization: Bearer <token>`; the public root shows only status.
Do not put secrets, passwords, cookies, or saved sessions in this repository.

On the PHP API host, set `SOCIAL_BROWSER_URL` to this Space's direct HTTPS app
origin (`https://YOUR-SPACE.hf.space`), and set the same `SOCIAL_BROWSER_TOKEN`.
Use a publicly reachable Space with application-level token authentication for
this test. A private Space additionally needs Hugging Face authentication, which
the current PHP proxy does not implement. Public source contains no secrets.

Sessions use ephemeral storage for testing and can be lost on restart or sleep.
A paid account does not automatically provide persistent storage to this Space.
Do not claim durable account connections until private persistent storage has
been configured and verified across a restart. Do not upload cookies to a dataset.

Start login from BANTALA's admin Social accounts controls. Complete CAPTCHA and
verification yourself. Platform acceptance of a cloud browser is not guaranteed.
The separate NLP collectors must also be configured before monitoring can work.

For session-based X collection set these NLP Space variables, replacing any
existing values: `X_PROVIDER=agent-reach`, `X_OFFICIAL_POLLING_ENABLED=false`,
and `LGU_SOCIAL_COLLECTORS_ENABLED=true`. Keep the matching browser URL and
token configured on both PHP and NLP services. Existing Space variables override
Docker defaults. X uses the selected LGU's saved session with Agent-Reach;
Threads uses its saved browser session. Neither requires official X API credits.

For X, fill the username, press Next/Enter, then fill the password and complete
verification. For Threads, choose its login option (including Instagram if
shown), fill the visible fields, and return to Threads before Save account.
An ordinary platform tab does not transfer its session into the hosted collector.
Platforms can refuse cloud-hosted browsers; report that failure rather than
marking the account connected. CAPTCHA and verification stay manual.

