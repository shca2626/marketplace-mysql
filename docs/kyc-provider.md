# KYC Provider Subsystem — Architecture, Security & Retention

> Phase 12.4 (lastplan v5 §12) · the artifact for the §14.5 legal/compliance review.
> Status: **DEMO MODE — sign-off rows PENDING** (see §7).

## 1. Transaction & architecture summary

Per-document-type verification routing, admin-customizable at runtime
(`/api/admin/kyc/provider-configs`, console → Admin → KYC Provider → Routing):

| Mode | Behavior |
|---|---|
| `MANUAL` | **No provider case is created.** The document waits in the classic admin verify queue. Seeded default for all 15 doc types — zero behavior change. Also the fail-safe when the config row is absent or `enabled=false`. |
| `PROVIDER` | A `KycCase` is created, the **minimized payload** (below) is submitted to the adapter under the configured `timeoutMs`, and the decision arrives asynchronously through the signed webhook. Provider rejection → document REJECTED. |
| `PROVIDER_THEN_MANUAL` | Like `PROVIDER`, but a provider **rejection routes to `MANUAL_QUEUE`** — a human takes the second look. The document stays PENDING until that human decides. |

Case state machine:

```
PENDING → SUBMITTED → APPROVED | REJECTED                    (happy path)
PENDING → SUBMITTED → PROVIDER_ERROR                          (failure semantics)
PENDING → SUBMITTED → MANUAL_QUEUE  → APPROVED | REJECTED     (PROVIDER_THEN_MANUAL reject)
PENDING → PROVIDER_ERROR                                     (submit threw / timed out)
PROVIDER_ERROR | MANUAL_QUEUE → PENDING                       (admin requeue)
```

### Payload minimization (data minimization evidence)

Only the fields the document type requires are transmitted — **never the file
bytes, never a public URL**. The EXACT JSON is snapshotted on
`KycCase.transmittedFields` as per-case evidence.

Base fields (always): `docType`, `mediaSha256` (content integrity hash), and
`reference` — an **opaque vault pointer** (`vault:<mediaId>`), not a
resolvable URL. Per-type additions:

| Doc type | Additional transmitted fields |
|---|---|
| NATIONAL_ID, PASSPORT, RESIDENCE_PERMIT, PROOF_OF_ADDRESS, COMMERCIAL_REG, BUSINESS_LICENSE, TAX_CARD | `issuedAt`, `expiresAt`, `title` |
| FINANCIAL_STATEMENT, BANK_STATEMENT, GUARANTEE_DOC, INVOICE, PURCHASE_ORDER | `issuedAt`, `title` |
| FEASIBILITY_STUDY, PROJECT_FILE, OTHER | `title` |

Absent values are omitted (not nulled). `title` is the uploader's own label.

### Vault semantics (§6.6 — private storage)

Provider-processed documents stay in the **private vault namespace**: retrieval
is proxy-only (`/api/documents/[id]/file` style authorized access), never a
public media URL. A production provider that needs the image would call back
through an authorized, audited retrieval channel to be specified per provider
DPA — the minimized payload alone never grants access.

## 2. Webhook security

Endpoint: `POST /api/kyc/webhook/[providerKey]` — **public route; the HMAC
signature is the authentication.**

- **Signature**: `HMAC_SHA256(secret, `${X-Vendora-Timestamp}.${X-Vendora-Nonce}.${rawBody}`)`
  delivered as `X-Vendora-Signature` (hex), `X-Vendora-Timestamp` (ms epoch),
  `X-Vendora-Nonce`. Verified with `crypto.timingSafeEqual` (constant time).
- **Replay protection**: timestamp must be within **±5 minutes**; the nonce is
  unique per provider (DB unique constraint `[providerKey, nonce]` — a replayed
  nonce fails the insert → `400`).
- **Event-id idempotency**: `eventId` unique per provider. Duplicate delivery →
  `200 {duplicate:true}`, the original event row is flagged `replayed=true`,
  and the decision is **never applied twice** (a second belt: the case row's
  `lastEventId`).
- **Unauthenticated calls** (missing/invalid signature) → `401` + a
  `KycWebhookEvent` receive-log row (`signatureValid=false`) + an audit row
  `KYC_WEBHOOK_UNAUTHENTICATED` recording providerKey + IP.
- Every delivery — valid or not — writes an immutable receive-log row before
  any decision logic.
- Secrets live in `PlatformSetting` `kyc-provider-secrets` (JSON map,
  providerKey → 32-byte hex). Rotatable from the console (audited as
  `KYC_PROVIDER_SECRET_ROTATED`).

## 3. Failure semantics (never auto-approve)

A provider error or timeout — adapter throws, HTTP 5xx, or the dispatch
`Promise.race` timeout fires — resolves the case to `PROVIDER_ERROR` with the
evidence in `errorDetail`, and **the document stays PENDING**. `PROVIDER_ERROR`
*is* the manual-queue entry: the console's open queue lists `SUBMITTED` +
`PROVIDER_ERROR` + `MANUAL_QUEUE` together, and a human decides
(approve → VERIFIED, reject → REJECTED, requeue → back to PENDING). A provider
outage can never auto-approve **or** auto-reject anything.

## 4. Retention schedule

| Data | Retention | Notes |
|---|---|---|
| `KycWebhookEvent` (receive log) | **180 days** | Pruned by the job below. |
| Closed `KycCase` (APPROVED / REJECTED / CANCELLED) | **365 days** | Includes the `transmittedFields` payload — retained exactly as long as the case. |
| Open cases + PENDING documents | until decided | Never touched by the job. |
| The documents themselves (vault media + `AccountDocument`) | existing platform vault retention | Soft-delete (`isActive=false`) by owner/admin; this subsystem never deletes document bytes. |

## 5. Deletion job usage

```bash
bash scripts/with-env.sh bun scripts/kyc-retention.ts             # dry-run (default) — counts only
bash scripts/with-env.sh bun scripts/kyc-retention.ts --execute   # prune + audit KYC_RETENTION_PRUNED
```

(`with-env.sh` enforces the Aiven MySQL URL — Law 1. The job never touches
vault media or open cases.)

## 6. Processing location / cross-border note (§14.5)

- **Current implementation (demo mode)**: the only provider is the platform's
  own **mock adapter** — it runs in-process and POSTs its signed decision to
  the platform's own endpoint (`http://127.0.0.1:3000/api/kyc/webhook/mock` by
  default, override via `KYC_WEBHOOK_BASE_URL` or the config's
  `settings.webhookUrl`). **No personal data leaves the platform's hosting
  boundary; there is no cross-border transfer.**
- **Production providers** (real identity-verification vendors) must be
  assessed per provider before activation: hosting region(s), sub-processor
  list, transfer mechanism (SCCs/adequacy), DPA coverage for the minimized
  payload fields (§1), and the authorized-retrieval channel for document
  images. The assessment artifact is a **precondition** for switching any doc
  type off `MANUAL` routing.

## 7. Sign-off rows (demo mode)

| Reviewer | Scope | Status |
|---|---|---|
| Data protection officer | Minimization matrix + retention schedule (§1, §4) | ⏳ PENDING — demo mode |
| Security | Webhook HMAC/replay/idempotency design (§2) + failure semantics (§3) | ⏳ PENDING — demo mode |
| Legal / compliance | Cross-border assessment framework (§6) | ⏳ PENDING — demo mode |

Signing is intentionally deferred: the subsystem ships in demo mode (all doc
types seeded `MANUAL`; only the in-platform mock provider exists).
