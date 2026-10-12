---
title: BANTALA NLP
emoji: 🌊
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
---

# BANTALA NLP inference service

Docker Space package for the BANTALA four-model flood classifier. Keep this
Space private if the model weights or API should not be public. Do not commit
model archives, `.env` files, browser sessions, or API tokens to the Space repo.

## Private model archives

Create a private Hugging Face model repository containing these four files:
`flood.zip`, `severity.zip`, `urgency.zip`, and `location.zip`. Each archive
must contain the model and tokenizer files expected by `app.py`. Create a
read-only Hugging Face access token for that private repository and add it as
the Space secret `HF_TOKEN`.

Set these Space variables/secrets in Settings → Variables and secrets:

- `HF_MODEL_REPO_ID`: `account-name/private-model-repo`
- `HF_MODEL_REPO_TYPE`: `model`
- `HF_TOKEN`: read token for that private model repo (secret)
- `NLP_SERVICE_TOKEN`: a long random token shared with the Render API
- `BAHABA_INGEST_URL`: `https://YOUR-RENDER-API.onrender.com/admin-api.php?action=nlp-ingest`
- `BAHABA_INGEST_TIMEOUT_SECONDS`: `90` (allows Render Free time to wake)
- `BAHABA_INGEST_TOKEN`: the same value configured as Render `NLP_INGEST_TOKEN`
- `X_KEYWORDS`: `[]` (keeps the local X collector disabled in this demo)
- `RSS_FEED_URLS`: `[]`

Keep the model repository private. Set the Space itself to **Public** so Render
can read its health endpoint without a Hugging Face account token. The
`/detect` endpoint still requires the private `NLP_SERVICE_TOKEN` bearer secret;
the model ZIPs remain private and are not served by the Space.

The service downloads each archive on first classification and extracts the
needed model files into temporary Space storage. Free Space storage is not
persistent, so a restart may require downloading/extracting the models again.
The first classification after a restart will be slow while the four models
load. Free CPU Spaces may sleep after inactivity; this does not support reliable
continuous collection or emergency alert delivery.

The authenticated `/detect` endpoint requires `Authorization: Bearer
NLP_SERVICE_TOKEN`. The `/health` endpoint reports service status.
