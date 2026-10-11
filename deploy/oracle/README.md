# BAHABA on Oracle Always Free

Preparation notes; no Oracle resources have been created or deployed yet.

## 1. Create the account

Register at https://signup.cloud.oracle.com/. Oracle requires an accepted credit/debit card for identity verification and may place a temporary authorization hold. Keep card details, passwords, MFA codes, and private SSH keys out of chat and Git.

Choose the home region carefully: Always Free compute must be created there and capacity may be unavailable. Stay on the Free Tier account; the 30-day trial credit is different from Always Free resources.

## 2. Create one server after registration

Use Compute → Instances → Create instance. Review the current console eligibility before creating anything:

| Setting | Target |
| --- | --- |
| Name | bahaba-server |
| Image | Ubuntu 24.04 LTS ARM-compatible image |
| Shape | VM.Standard.A1.Flex, Always Free eligible |
| CPU and memory | 2 OCPUs and 12 GB total across the account's A1 instances |
| Boot volume | 50 GB; use included storage without paid performance upgrades |
| Network | Public subnet and public IP |
| SSH | Save the generated private key securely on your computer |

If the console does not show this configuration as free eligible, stop and inspect the estimate. If capacity is unavailable, try another availability domain in the home region or wait; do not substitute a paid shape to finish the setup.

Allow SSH only from your own public IP. Public HTTP/HTTPS ports are 80/443. Keep MySQL 3306 and the internal NLP service private; they do not need public ingress.

## 3. Deployment work after the server exists

1. Connect over SSH and verify ARM64, CPU, RAM, and disk.
2. Install the web server, PHP with PDO MySQL, MySQL, Python virtual environment tools, and ARM-compatible Chromium/Playwright dependencies.
3. Test the pinned Python requirements on Linux ARM before enabling collection. The existing Windows virtual environment cannot be copied to Linux.
4. Copy the resident PHP API and admin application to separate web roots. Do not expose the NLP folder, model files, private config, `.env`, `.state`, backups, or database exports through the web server.
5. Export the existing local MySQL database privately, import it on the server, and create a dedicated application database user. Keep the original database intact until end-to-end verification passes.
6. Generate server secrets privately and configure the PHP APIs, NLP ingestion, HTTPS URLs, and frontend origins. The two APIs must use the same database.
7. Copy the existing NLP model-cache directories (flood, severity, urgency, location), approximately 2.8 GB of weights. Configure a Linux absolute `MODEL_CACHE_DIR`. Existing Windows ZIP paths and `X_AGENT_REACH_PYTHON` values must be replaced.
8. Install the X backend and its existing compatibility patch; test a read-only search. Configure session credentials privately. Configure Facebook/Threads browser state privately, using manual verification when required; cloud hosting does not remove login challenges.
9. Start one NLP/collector service under systemd with automatic restart, bounded logs, a restricted user, and persistent state. Avoid running the local and cloud collectors simultaneously during migration.
10. Set up HTTPS and connect the frontend deployments through their API routes. Test resident/admin login, LGU scope restrictions, reports, contacts, boundary assets, and collector ingestion before switching users to the online service.
11. Keep an off-server database backup and a private backup of configuration; Oracle may reclaim idle free instances.

## Current project locations

- Resident app: `C:/Users/Jakes/BAHABA-official/bahaba-app`
- Admin app: `C:/Users/Jakes/Downloads/BAHABA-ADMIN`
- NLP and collectors: admin `nlp-service/`, started with `uvicorn app:app`
- API configuration: resident `api/config.php` and admin backend configuration; inspect actual deployment include paths before copying.
- Collector configuration: admin `nlp-service/.env` and `.state/` (private, not frontend assets).

## Official references

### Daily report retention job

After deploying the resident API and shared database configuration, schedule
`/usr/bin/php /absolute/path/to/bahaba-app/scripts/archive-reports.php` daily using
a systemd timer or cron under the application service user. For example, with the
server timezone set to Asia/Manila:

```cron
15 0 * * * /usr/bin/php /absolute/path/to/bahaba-app/scripts/archive-reports.php >> /var/log/bahaba-report-retention.log 2>&1
```

Replace paths, provision writable logs with rotation, and monitor failures. Deploy
`api/report-retention.php` alongside the shared API configuration and the updated
admin `api.php` and `App.js`. Run the CLI once and confirm the exit code before
enabling the schedule. The job preserves monthly summaries before deleting raw
reports older than 30 days. The local Windows task does not run on Oracle.

- Account verification and free/trial distinction: https://www.oracle.com/cloud/free/faq/
- Current Always Free limits, capacity, storage, and idle reclamation: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- Instance creation: https://docs.oracle.com/en-us/iaas/Content/Compute/Tasks/launchinginstance.htm

Limits checked on 2026-10-09. These notes do not establish that the model, Python dependencies, or browser collectors have been tested on an Oracle ARM server yet.
