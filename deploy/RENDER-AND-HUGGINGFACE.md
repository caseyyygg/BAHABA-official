# BANTALA: Render API + Hugging Face NLP

This is a free-tier demo setup, not an always-on emergency alert system.

## 1. Deploy the API to Render

1. Push the reviewed repository to a private GitHub repository. Do not add the
   database export, credentials, `.env` files, model archives, or model cache.
2. In Render, choose **New -> Blueprint**, connect the repository, and use its
   root `render.yaml`. It creates the `bantala-api` PHP service.
3. In Alwaysdata, create a new MariaDB database and user. Keep your current
   database untouched. In Render's service environment, privately set:
   `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `PUBLIC_APP_URL`, and a newly
   generated random `NLP_INGEST_TOKEN`. `PUBLIC_APP_URL` will be the Cloudflare
   Pages URL after Pages is published.
4. Wait for the first Render deploy and copy its HTTPS URL. The health endpoint
   is `<render-url>/healthz.php`.

Render Free sleeps after 15 minutes without inbound traffic; its filesystem is
cleared when it sleeps. This can log users out because PHP sessions are stored
on that filesystem. Keep app records in Alwaysdata, never local SQLite/files.

## 2. Create a private Hugging Face model repository

1. On Hugging Face, create a **private Model repository** for the four BANTALA
   model archives. Keep it private unless you have permission to publish the
   weights.
2. Upload four files named exactly `flood.zip`, `severity.zip`, `urgency.zip`,
   and `location.zip`. Each ZIP must contain the model/tokenizer files the
   current NLP service expects. The four extracted model weight files on the
   development machine total about 2.64 GB; check the ZIPs fit your account.
3. Create a Hugging Face read token limited to that private model repo. Add the
   token as a **Space secret** named `HF_TOKEN`, never as a committed file or
   plain repository variable.

Upload from the machine holding the ZIPs with Hugging Face's CLI. First install
and authenticate the CLI locally; do not paste its token into chat or Git:

```powershell
py -m pip install --upgrade huggingface_hub
hf auth login
hf upload YOUR_ACCOUNT/YOUR_PRIVATE_MODEL_REPO "C:/path/to/flood.zip" flood.zip --repo-type model
hf upload YOUR_ACCOUNT/YOUR_PRIVATE_MODEL_REPO "C:/path/to/severity.zip" severity.zip --repo-type model
hf upload YOUR_ACCOUNT/YOUR_PRIVATE_MODEL_REPO "C:/path/to/urgency.zip" urgency.zip --repo-type model
hf upload YOUR_ACCOUNT/YOUR_PRIVATE_MODEL_REPO "C:/path/to/location.zip" location.zip --repo-type model
```

Replace each path with the corresponding local archive path from your private
NLP configuration. Do not share that config file.

## 3. Create the Hugging Face Space

1. Create a Space using **Docker** and set its visibility to **Public**. The
   model repo remains private. `/detect` is protected by its bearer secret; the
   public `/health` endpoint lets Render report service status. Copy the contents of
   `deploy/huggingface-space/` into the Space repository root, then push them.
   This folder includes the Dockerfile, app source and dependency list, but no
   model archives or secrets.
2. In Space **Settings -> Variables and secrets**, set these variables:

   | Name | Value |
   | --- | --- |
   | `HF_MODEL_REPO_ID` | `YOUR_ACCOUNT/YOUR_PRIVATE_MODEL_REPO` |
   | `HF_MODEL_REPO_TYPE` | `model` |
   | `BAHABA_INGEST_URL` | `<render-url>/admin-api.php?action=nlp-ingest` |
   | `BAHABA_INGEST_TIMEOUT_SECONDS` | `90` (gives Render Free time to wake) |
   | `X_KEYWORDS` | `[]` |
   | `RSS_FEED_URLS` | `[]` |

   Add these as **secrets**:

   | Secret | Value |
   | --- | --- |
   | `HF_TOKEN` | Read token for the private model repository |
   | `NLP_SERVICE_TOKEN` | New long random token for Render-to-NLP health access |
   | `BAHABA_INGEST_TOKEN` | Same value as Render `NLP_INGEST_TOKEN` |

3. Wait for the Space to build. Copy its `https://YOUR-SPACE.hf.space` URL from the Space
   page.
4. Add `NLP_SERVICE_URL=<space-url>` and the same `NLP_SERVICE_TOKEN` to the
   Render service environment, then redeploy the API.
5. In Cloudflare Pages Worker settings, set `BACKEND_ORIGIN` to the Render
   service origin (no path). Set Render `PUBLIC_APP_URL` to the Pages site URL.

The first NLP classification downloads and loads the four models, so allow a
long cold start. Hugging Face Free CPU Spaces provide 2 vCPU and 16 GB RAM, but
sleep after 48 hours without use and their free disk is not persistent. Models
will need to be downloaded again after a restart. Keep social collection off
for this demo; browser sessions and collector state are not durable there.

## Keep the bill and data safe

- Render Free and Hugging Face Free do not charge for the described demo tiers,
  but neither provides dependable always-on processing.
- Do not enter Alwaysdata passwords, database exports, model files, or API
  tokens into this repository or send them through chat. Enter secrets only in
  the provider dashboards.
- Before importing data, make a fresh database export and import it into the
  new Alwaysdata database. The local transfer copy is dated October 12 and may
  not contain later changes. Never overwrite the existing source database.
- Verify a test account, report, and evacuation-center record on the hosted
  copy before changing the public app URL.


