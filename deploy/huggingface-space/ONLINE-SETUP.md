# Online model and collector wiring

The trained archives were found in `C:/Users/Jakes/Downloads`:

| Inference role | Original archive | Private repository filename |
| --- | --- | --- |
| Flood / Non Flood | drive-download-20260928T025654Z-1-001.zip | flood.zip |
| Low / Medium / High severity | drive-download-20260928T025742Z-1-001.zip | severity.zip |
| Neutral / Concerned / Distressed | drive-download-20260928T025751Z-1-001.zip | urgency.zip |
| Location BIO tagging | checkpoint-286-20260928T025733Z-1-001.zip | location.zip |

`deploy/social-sessions/upload-models.py` validates the private repository and
uploads inference files only, excluding optimizer state and pickled training
arguments. The destination is `Bahababa/bantala-models`. Model archives and
credentials remain outside Git in the ignored `.local` directory.

After all four uploads, `deploy/social-sessions/configure-nlp.py` sets the model
repository and gateway variables/secrets on `Bahababa/bantala-nlp`, installs Chrome
in its Docker image, and enables scoped LGU collection. It disables shared browser
search collection so saved LGU accounts are the source of authentication.
Hardware remains CPU Basic; no paid hardware or storage is requested.

The script writes `deploy/social-sessions/.local/alwaysdata-nlp-settings.txt`.
Append those lines to the AlwaysData PHP site's environment variables. Preserve
existing `SOCIAL_BROWSER_URL`, `SOCIAL_BROWSER_TOKEN`, database, and mail settings.
Never paste the contents into chat or a screenshot. The ingest token must match
`BAHABA_INGEST_TOKEN` on both hosts; the service token must match `NLP_SERVICE_TOKEN`.
An existing nonempty `nlp_ingest_token` in PHP config can override the environment
fallback and must also match. Cloudflare `BACKEND_ORIGIN` remains the AlwaysData
origin, not either Hugging Face Space.

Authenticated `POST /classify` tests inference without ingestion. `POST /detect`
classifies and forwards to the production PHP receiver. Use `/classify` for
synthetic samples. Health reports loaded models only after the first inference.

A saved Facebook account alone does not prove search succeeds. Check
`/health` → `lgu_social_collectors` for each LGU and platform after a polling cycle.
X separately requires the Agent-Reach backend and its compatibility configuration.
Browser sessions and dedup state remain ephemeral on the testing hardware.
