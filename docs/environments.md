# Environments — what may touch what (lastplan v5 6.0b.10)

Single source of truth for every script, test asset, and cron job in this
repository, and the environment each one is allowed to touch. Production
migration and deployment are **separate, protected workflows** (7.1b/14.x) —
no test/seed/QA script has a production mode.

## Environments

| Env | Database | App | Notes |
|---|---|---|---|
| **dev** (this sandbox) | The single Aiven MySQL instance (`mysql-marketplace-sunsolar1`) via `.env` `DATABASE_URL` | `bun run dev` on :3000 | Development only. Not production. |
| **staging** (to be provisioned) | Separate Aiven service + **separate DB user** (H4) | Separate deployment, IP-restricted | Restores of production backups must pass `scripts/sanitize-restore.ts` before testers touch data. |
| **production** | The production Aiven service | The production deployment | Reached only by the app's own runtime and the protected deployment workflow. |

### Fail-closed script guard (B1 / 6.0b.8)

Every seed / cleanup / QA script imports `scripts/lib/assert-not-prod.ts` as
its **first** action. It aborts (exit 78) when:

- `NODE_ENV=production` — a deployed server never runs QA scripts at all; or
- the target `DATABASE_URL` / base URL matches a marker in
  `PROD_DB_MARKERS` / `PROD_APP_MARKERS` (environment-configured fingerprints).

**There is no `--allow-prod` flag.** Verified by test: a URL matching the
configured marker aborts with exit 78 (`PROD_DB_MARKERS=mysql-marketplace-prod
DATABASE_URL=mysql://…@mysql-marketplace-prod.f…` → refused).

> **Operator action (pending, tracked in worklog):** when the production
> Aiven service is provisioned, set `PROD_DB_MARKERS` and `PROD_APP_MARKERS`
> in the staging/dev environments' secret store. Until then the fingerprint
> check is inactive (warned loudly on every run) and only the
> `NODE_ENV=production` block is active.

### Credential-level DB isolation (H4 — pending operator action)

URL checks are not a boundary. When staging is provisioned: create a distinct
staging DB user whose grants and host rules cannot authenticate to the
production database at all. **Gate test:** an attempted connection to the
production DB with the staging credential must be rejected by the server
(evidence per the standing standard). This requires Aiven console action by
the owner — the procedure is documented here, the test is not yet executable.

## Script inventory (tracked by this document)

| Script | Env | Guarded |
|---|---|---|
| `scripts/seed-*.ts` (solar, b2b, financing, modules, rbac, settings, site-content, demo, product-images, program-rich-content) | dev/staging | ✅ assert-not-prod |
| `scripts/cleanup-b2b.ts`, `scripts/cleanup-uploads.ts` | dev/staging | ✅ assert-not-prod |
| `scripts/add-admin.ts`, `scripts/phone-backfill.ts`, `scripts/enrich-product-details.ts`, `scripts/generate-*.ts`, `scripts/migrate-static-images.ts`, `scripts/mirror-uploads-to-hosting.ts` | dev/staging | ✅ assert-not-prod |
| `scripts/qa-seed-digest.ts`, `scripts/fin2-smoke.ts`, `scripts/fin3-smoke.ts` | dev/staging | ✅ assert-not-prod |
| `scripts/bump-all-sessions.ts` | dev/staging | ✅ assert-not-prod |
| `scripts/negative-authz-suite.ts` | dev/staging (BASE_URL) | ✅ assert-not-prod (http) |
| `scripts/check-guards.ts`, `scripts/gen-route-matrix.ts`, `scripts/secret-sweep.ts` | repo-only (no DB writes / reads tracked files only) | n/a (read-only) |
| `scripts/sanitize-restore.ts` | staging restores | ✅ assert-not-prod |
| `scripts/db-status.ts`, `scripts/mysql-check.ts` | read-only status | n/a |
| `scripts/dev-watchdog.sh`, `scripts/whatsapp-watchdog.sh`, `scripts/warm-dev.sh` | dev process supervision | n/a (dev-only convenience) |
| `db:push` / `db:migrate` (package.json) | dev/staging | ⚠️ Prisma CLI bypasses the TS guard — **production schema changes must use reviewed versioned migrations via the 7.1b procedure, never `db push`** |
| cron `webDevReview` (15 min) | dev | n/a (dev sandbox agent) |

## QA evidence artifacts (`db/qa/**`)

Screenshots and logs captured by browser E2E in the dev environment.
Sensitivity pass (6.0.4, done): no pairing codes, live secrets, or customer
data present in tracked artifacts. `db/qa/whatsapp-pairing-fixed.png` shows
the WhatsApp **test line** pairing flow; the one-time pairing code shown at
capture time expired within minutes and is not a live secret. WhatsApp
session files (real Baileys credentials) were **removed from git tracking**
and gitignored — re-pairing regenerates them locally.

## Secrets (6.0)

- All real secrets live in `.env` (gitignored, verified) or the secret store.
- `AUTH_SECRET`, `MFA_ENCRYPTION_KEY` fail fast in production if missing/weak.
- MFA TOTP secrets are AES-256-GCM encrypted at rest (`MFA_ENCRYPTION_KEY`).
- Rotation procedure for `MFA_ENCRYPTION_KEY`: set the new key, keep the old as
  `MFA_ENCRYPTION_KEY_OLD` during a re-encrypt sweep, then remove the old key.
- `.env.example` contains placeholders only (secret-sweep clean).

## VAULT_SIGNING_KEY (6.6.4)

HMAC-SHA256 key binding one-time private-vault retrieval URLs to
{documentId, userId, nonce, expiry} (`/api/vault/<id>`). Missing/short key is
FATAL in production (same discipline as MFA_ENCRYPTION_KEY). Dev falls back to
a fixed development key. Rotation: set the new key and restart — issued URLs
simply stop validating (one-time URLs are minutes-TTL, so no migration needed).
