# 09 — Security Threat Model

> Audience: engineers and reviewers of the Vendora platform.
> Scope: current codebase (dev sandbox) **plus** the planned financier domain
> (marked PLANNED; from `team/FINANCIER_SCHEMA.md` v4.0 /
> `team/FINANCIER_PLAN.md` — not yet implemented).
> Rule of this document: **no invented mitigations.** Everything traces to
> the code as read, or is explicitly labeled a gap/recommendation.
> Companion doc: `team/docs/08-deployment-ops-runbook.md` (ops procedures,
> secrets rotation).

---

## 1. System boundaries & trust levels

```
  Internet/browser
       │ (untrusted)
  ┌───▼─────────────────┐   XTransformPort escape hatch
  │ Caddy :81 gateway   │──────────────────▶ localhost:<any port>
  │ (repo-root Caddyfile│   (mini-services pattern, e.g. socket.io :3003)
  └───┬─────────────────┘
  ┌───▼─────────────────┐     ┌────────────────────┐   ┌──────────────────┐
  │ Next.js app :3000   │────▶│ MariaDB (vendora)  │   │ local disk store │
  │ routes + modules    │     │ 127.0.0.1:3306     │   │ storage/uploads/ │
  │ + media pipeline    │     └────────────────────┘   └──────────────────┘
  └─────────────────────┘
```

Boundary observations:

- The only intended ingress is Caddy on `:81`. It preserves the browser
  `Host` header (`header_up Host {host}`), so Origin↔Host CSRF comparisons
  stay valid through the proxy (`src/lib/http.ts:13-14`).
- The `XTransformPort` query-param route (Caddyfile lines 2-13) forwards
  browser traffic to **any local port**. Any mini-service started on the box
  is instantly browser-reachable; treat every local listener as
  internet-adjacent.
- `:3000` and MySQL are localhost-only in this sandbox, but nothing in the
  app authenticates that requests arrived via Caddy. `clientIp()`
  (`src/lib/http.ts:62-66`) trusts `X-Forwarded-For`; through Caddy that
  header is **overwritten** with `{remote_host}`, but a direct hit on `:3000`
  can spoof it. Rate-limit keys derived from `clientIp()` therefore trust
  the network path.
- Storage is the local-disk adapter writing under `storage/uploads/`
  (content-derived keys), served back through `/api/media/[...key]`.

Trust levels (principal → what we grant):

| Level | Principal | Can do |
|---|---|---|
| T0 | Anonymous browser | Read catalog/products/media/storefront, `settings` storefront reads. No writes. |
| T1 | Authenticated user (BUYER) | Cart/orders, RFQs, quotes, favorites, reviews, approvals, disputes as buyer, notifications, own media library reads. |
| T2 | Org member | T1 + org-scoped RFQ/pricing/approval flows; org membership is enforced per-service query. |
| T3 | Seller (SELLER role, verified) | T1 + product create/update/delete (own products), media upload, RFQ inbox + quoting, own earnings. Suspended sellers are blocked from upload (`src/app/api/uploads/route.ts:23-25`). |
| T4 | Admin (ADMIN role) | Everything: orgs, vendors, payouts, payments capture, disputes resolve, settings, audit logs, all media. |
| T5 | Financier staff (**PLANNED**) | Sees financing requests routed to them and their KYC documents only; admin retains override. Not in code yet. |

## 2. Authentication & session security model

All in `src/lib/auth.ts`:

- **Passwords**: scrypt — 16-byte random hex salt, 64-byte derived hash,
  stored `salt:hash` (`hashPassword`, lines 26-30). `scryptSync` is called
  without an `options` object, i.e. Node's default cost parameters
  (N=16384, r=8, p=1). Verification compares with `timingSafeEqual` after a
  length check (`verifyPassword`, lines 32-42); malformed stored values
  fail closed (`return false`).
- **Session token**: `${userId}.${expMs}.${HMAC-SHA256(userId.expMs)}` —
  stateless, signed with `AUTH_SECRET`, 30-day expiry baked into the payload
  (`createSessionToken`, lines 48-51). Verification re-derives the HMAC and
  compares with `timingSafeEqual`, then checks expiry
  (`parseSessionToken`, lines 53-67). No server-side session store exists —
  there is nothing to revoke except the signing key.
- **Cookie**: `vendora_session`, `httpOnly`, `sameSite=lax`,
  `secure` only when `NODE_ENV=production`, `path=/`, `maxAge` 30 days
  (`setSessionCookie`, lines 103-112).
- **AUTH_SECRET handling**: missing/short (<32 chars) throws at module load
  in production (fail-fast, "SEC-01", lines 6-21); dev falls back to the
  constant `vendora-dev-secret` (line 9).
- **SUSPENDED users** stop resolving (`getSessionUser` returns null,
  lines 69-78) — a global, per-request kill switch that works precisely
  because every request re-reads the user row.
- **Login route** (`src/app/api/auth/login/route.ts`): zod-validated input,
  uniform `Invalid email or password` 401 (no user-enumeration oracle),
  explicit SUSPENDED message (403). **No rate limit and no `assertSameOrigin`
  call on this route** (see §4).

Trade-offs, stated honestly:

- **30-day MAX_AGE + stateless tokens**: convenient; but a leaked token is
  valid for up to 30 days, cannot be revoked individually, and logout only
  clears the client cookie. The only global invalidators are AUTH_SECRET
  rotation or SUSPENDED/row deletion. Acceptable for the current
  demo/track-only posture; revisit before real payments.
- **sameSite=lax**: blocks the cookie on cross-site POSTs in modern
  browsers (the main passive CSRF shield for the routes that lack
  `assertSameOrigin`), but it is not a complete CSRF defense (older
  browsers, same-site subdomains). See §4.
- scrypt default params are the floor of acceptable in 2026; raising memory
  cost is a cheap future win (would require a rehash-on-login strategy —
  not present today).

## 3. Authorization model

### 3.1 Route guard pattern

`src/server/guards.ts`: `requireUser()` → 401 JSON when no session;
`requireAdmin()` → 403 `Admin access required` when role ≠ ADMIN. Route
handlers call these first, then role-check inline (e.g. uploads require
SELLER or ADMIN, lines 18-25 of `src/app/api/uploads/route.ts`).

### 3.2 Role/endpoint access matrix (as wired today)

| Surface | Anonymous | Buyer | Seller | Admin |
|---|---|---|---|---|
| `api/catalog`, `api/products` GET, `api/home`, `api/settings`, `api/categories`, `api/sellers/[id]`, `api/media/*` GET | R | R | R | R |
| `api/auth/*` | register/login/logout/me | same | same | same |
| `api/orders`, `api/favorites`, `api/reviews`, `api/quotes/*` (buyer side), `api/rfqs` (buyer side), `api/approvals`, `api/disputes` (buyer create/cancel), `api/recurring-rfqs`, `api/organizations` | – | RW (own rows) | RW where applicable | oversight |
| `api/uploads` GET/POST, `api/uploads/[id]` DELETE, `api/products` POST/PUT/DELETE, `api/products/bulk` | – | – | RW (own) | RW (all) |
| `api/seller/*` (stats, earnings, orders, rfq inbox) | – | – | R | – |
| `api/admin/*` (orgs, vendors, orders, rfqs, quotes, disputes resolve, payouts, payments, coupons, price-lists, customer-groups, settings, rfq-settings, slides, audit-logs, stats) | – | – | – | RW |

### 3.3 Org-scope enforcement

Organization membership is enforced inside the service layer (D-005):
module queries in `src/server/modules/*` scope `organizationId` through the
requesting membership (e.g. RFQ inbox and approvals in
`src/server/modules/rfq/service.ts`, `…/approvals/service.ts`). There is no
tenantId anywhere (D-003, single operator) and no middleware-level
enforcement — an unguarded route handler is the failure mode to watch for
in review.

### 3.4 PLANNED financier authorization

From `team/FINANCIER_SCHEMA.md` v4.0: financier staff access is scoped to
the requests routed to them; KYC documents (`ApplicantDocument` →
`MediaAsset`) are visible only for those requests; admin has override.
Verification transitions (PENDING/VERIFIED/REJECTED) must record a reviewer.
**None of this is implemented yet** — it is a design requirement this
document holds the module to (see §12, P2).

## 4. STRIDE threat model

Legend for Risk: H/M/L. "Current mitigation" reflects verified code only.
CSRF coverage: `assertSameOrigin` is called on uploads (POST + DELETE),
`products/bulk`, disputes (create/respond/cancel + admin resolve),
recurring-rfqs, admin slides, admin settings, admin rfq-settings (+rollback),
quotes review. It is **absent** on `auth/login`, `auth/register`, `orders`,
`rfqs`, and the single-product write routes (`api/products` POST,
`api/products/[id]` PUT/DELETE — verified: those files do not reference
`assertSameOrigin`).

### 4.1 API routes (general)

| Threat | STRIDE | Attack vector | Current mitigation | Risk | Recommended action |
|---|---|---|---|---|---|
| Cross-site state change on unguarded POST routes | Spoofing/Tampering | Forged cross-site form/fetch to `orders`, `rfqs`, `products` single-write, `register` while victim's cookie rides along | `sameSite=lax` cookie blocks the cookie on cross-site POST in modern browsers; no `assertSameOrigin` on these routes | M | Wire `assertSameOrigin` on all unsafe-method routes (defense-in-depth; the helper exists in `src/lib/http.ts:26`) |
| Login CSRF | Spoofing | Attacker logs the victim into the attacker's account (no `assertSameOrigin` on `auth/login`) | `sameSite=lax`; no evidence of post-login sensitive GETs that would leak | M | Add `assertSameOrigin` to login/register |
| Missing edge-level policy enforcement | Elevation | No `middleware.ts` exists; every route must self-guard | Per-route guards are consistently applied in reviewed routes | M | Keep middleware as a hardening backlog item (central headers + cheap IP gates) |
| Unauthenticated object-ID guessing | Info disclosure | Cuid IDs are not secret; routes must scope reads to owner/org | Owner/org scoping present in service layer (D-005) | L | Keep review checklist item |

### 4.2 Authentication & session

| Threat | STRIDE | Attack vector | Current mitigation | Risk | Recommended action |
|---|---|---|---|---|---|
| Password brute force / credential stuffing | Spoofing/Elevation | Repeated POSTs to `auth/login` | Uniform 401 (no enumeration); scrypt hashing cost; **no rate limit wired** — `RATE_LIMITS.login` exists (`src/lib/rate-limit.ts:59`) but the login route never calls `enforceRateLimit` (verified, `src/app/api/auth/login/route.ts`) | **H** | Wire `enforceRateLimit(req, 'login', RATE_LIMITS.login)` (and `register`) — one-line fix per route |
| Forged session tokens | Spoofing | Crafting `userId.exp.sig` without the key | HMAC-SHA256 + `timingSafeEqual` (`src/lib/auth.ts:53-67`) | L | None needed |
| Session-key compromise | Elevation | `.env` is tracked in git with `AUTH_SECRET` inside | Fail-fast length check in prod; nothing else | **H** | Rotate AUTH_SECRET + untrack `.env` (runbook in ops doc §4.2) |
| Stolen-cookie replay over 30 days | Spoofing/Elevation | XSS-free exfiltration of the cookie, or log read | httpOnly blocks JS reads; `secure` in prod; **no per-token revocation** (stateless), no rotation | M | Revisit token lifetime/revocation before real-money phases |
| Timing side channel on signature compare | Info disclosure | Byte-at-a-time HMAC oracle | `timingSafeEqual` with length pre-check (`auth.ts:59-61`) | L | None |

### 4.3 Media pipeline (upload → process → serve)

| Threat | STRIDE | Attack vector | Current mitigation | Risk | Recommended action |
|---|---|---|---|---|---|
| Malicious file upload (polyglot/script disguised as image) | Tampering/Elevation | Upload non-image bytes with image Content-Type | Magic-byte sniffing, never trusting Content-Type (`sniffImageMime`, `src/lib/storage/image-pipeline.ts:26-41`) → 415; sharp re-encode to webp strips metadata/EXIF (incl. GPS) and any trailing payload (`image-pipeline.ts:83-87`) | L | None (keep renditions as the only servable bytes) |
| Decompression bomb | DoS | Small file, huge pixel count | 40 MP cap (`UPLOAD_LIMITS.maxPixels`), 8 MB byte cap, 6 files/request (`image-pipeline.ts:14-18`) | L | None |
| Stored XSS via served media | Tampering/Spoofing | Serve HTML/SVG from the media route | Extension→MIME allowlist else 404 (`src/app/api/media/[...key]/route.ts:14-20,38`); `X-Content-Type-Options: nosniff`; `Content-Disposition: inline`; CORP `cross-origin` (only because content carries no credentials; comment at lines 61-62) | L | None |
| Path traversal via crafted key | Info disclosure | `../../` segments in `/api/media/[...key]` | Keys are validated inside the storage adapter (route comment: "traversal-safe (keys validated inside)", line 41; `StorageError` code `INVALID_KEY` in `src/lib/storage/types.ts:41`). **Caveat:** `local-disk.ts` is currently missing from disk (see §6 P0), so the exact validation cannot be re-verified until restored | L (pending re-verify) | Restore the file from git and re-review |
| Media-route request flood | DoS | Anonymous GET flood | Per-IP limit 600/min (`mediaRead`, wired at route line 24) | L | None for now |
| Content-type confusion on upload responses | — | — | 413/415/422 semantics documented; errors returned per file (`src/app/api/uploads/route.ts:81-90`) | — | — |

### 4.4 Storage layer

| Threat | STRIDE | Attack vector | Current mitigation | Risk | Recommended action |
|---|---|---|---|---|---|
| Adapter file missing after host reset | DoS/Tampering | Environment wipes the adapter out from under `storage/index.ts` | `.gitignore` exception `!src/lib/storage/local-disk.ts` (line 45) keeps it tracked; **currently missing from disk anyway** — uploads/media serving broken (P0) | **H (operational)** | `git checkout -- src/lib/storage/local-disk.ts` + restart (ops doc P0-3) |
| Unbounded disk growth | DoS | Repeated uploads | Per-user upload rate limit 30/10min (`uploads/route.ts:27`); sha256 dedupe means identical bytes store once | L | Scheduled orphan cleanup (ops doc §7.3) |
| Orphaned/over-retained files | Info disclosure | Old KYC-style documents retained indefinitely | Delete is reference-checked (409 while in use); no retention policy exists | M (grows with financier plans) | Define retention/deletion before financier launch (§8) |

### 4.5 Database

| Threat | STRIDE | Attack vector | Current mitigation | Risk | Recommended action |
|---|---|---|---|---|---|
| SQL injection | Tampering | User input concatenated into SQL | **No raw SQL in `src/`** (grep for `queryRaw`: no matches); all access via Prisma client (parameterized) | L | Keep `queryRaw` ban in review |
| Wildcard abuse in search | Info disclosure | `%`/`_` in search terms widen `contains` matches | Prisma `contains` is parameterized (compiles to bound `LIKE`); wildcards in user input are **not escaped** — cosmetic over-matching, not injection (e.g. `src/app/api/products/route.ts:68-72`) | L | Optional: strip `%`/`_` from search terms |
| Destructive schema push | Tampering/DoS | `db:push` runs with `--accept-data-loss` by definition | Runbook warning (ops doc §5.1) | M | Prefer `db:migrate` for populated-table changes |

### 4.6 Settings / audit substrate

| Threat | STRIDE | Attack vector | Current mitigation | Risk | Recommended action |
|---|---|---|---|---|---|
| Unauthorized settings change | Elevation | Non-admin mutating RfqSetting/PlatformSetting | Admin-only routes guarded by `requireAdmin` + `assertSameOrigin` on admin settings routes (verified in route list) | L | None |
| Silent settings tampering | Repudiation | Admin edits without trace | Append-only `SettingChange` with `rollbackOfId` chains (`prisma/schema.prisma:727-745`); 120 s cache bounds stale-value windows | L | None |
| Audit log tampering | Repudiation | Actor edits/deletes AuditLog rows | AuditLog rows are written via `recordAudit`; **no immutability enforcement at DB level** (admin UI can read; writes are code-path only) | M | DB-level restrictions/hashing only if audit becomes compliance-critical |

### 4.7 Notifications

| Threat | STRIDE | Attack vector | Current mitigation | Risk | Recommended action |
|---|---|---|---|---|---|
| Cross-user notification reads | Info disclosure | Guessing ids on `/api/notifications` | Route scopes to the session user (notifications service keyed by userId) | L | Keep org-scoping review item when financier notifications land |

### 4.8 Payments (SIMULATED)

| Threat | STRIDE | Attack vector | Current mitigation | Risk | Recommended action |
|---|---|---|---|---|---|
| Real-money exposure from simulated gateway | — | CARD method runs a **simulated** gateway; `PAYMENT_DRIVER=manual` disables it (`src/server/modules/payments/service.ts:81`) | Documented as simulated everywhere; no gateway credentials exist | L (by design) | Keep the simulation explicit if the module is ever demoed externally |
| Payment state forgery | Tampering | Buyer marking own payment captured | Capture is admin-only (`Payment.capturedById` + admin route `/api/admin/payments/[id]/capture`); buyer `pay` creates PENDING records | L | None |

### 4.9 Payouts

| Threat | STRIDE | Attack vector | Current mitigation | Risk | Recommended action |
|---|---|---|---|---|---|
| Payout manipulation | Tampering/Elevation | Seller or non-admin generating/marking payouts | Admin routes only (`requireAdmin` on `generate`/`mark-paid`/`cancel`); generation runs in a transaction that stamps `OrderItem.payoutId` (`src/server/modules/payouts/service.ts:113+`); commission zod-clamped 0–90 | L | None |
| Double settlement | Tampering | Concurrent generate calls | Items re-selected inside the transaction; `payoutId IS NULL` filter | L | None (documented in code) |

### 4.10 PLANNED financing (from `team/FINANCIER_SCHEMA.md` v4.0)

| Threat | STRIDE | Attack vector | Current mitigation | Risk | Recommended action |
|---|---|---|---|---|---|
| KYC document exposure to wrong financier | Info disclosure | Financier staff browsing documents not routed to them | **Not implemented** — design requires routed-only visibility + admin override (schema doc) | **H if shipped without controls** | Enforce per-request document ACL at service layer; test with E2E before launch |
| Applicant PII over-collection | Info disclosure | Collecting identity/marital/DOB data without consent trail | `consentAt` field planned; single-entry doctrine in schema v4.0 | M | Capture consentAt at wizard submit; log consent event in AuditLog |
| Money custody drift | Tampering | Platform holding/lending funds | D-002 invariant: track-only `FinancingEvent` ledger reported by financiers; fees ACCRUED→INVOICED→PAID marked by admin | L (invariant) | Hold the line in review: no wallet code, ever |
| Identity-number harvesting | Info disclosure | DB dump of User applicant columns | None beyond DB-local exposure; columns nullable per design | M | Encryption-at-rest/field-level policy before launch; retention limits |

## 5. Input validation & injection

- **Pattern**: zod schema + `safeParse` at the route boundary; failures return
  400 with the first issue message (e.g. `src/app/api/auth/login/route.ts:6-20`).
  This is the house style across routes — keep it in review.
- **SQL**: all queries go through the Prisma client (`src/lib/db.ts`); no
  `$queryRaw`/`$executeRaw` anywhere in `src/` (verified by grep). Search
  uses Prisma `contains` filters (parameterized `LIKE`); `%`/`_` wildcards
  from user input are not escaped (over-broad matches only, no injection).
- **File uploads**: multipart parsed by `req.formData()`; per-file checks —
  empty (skipped), > 8 MB (413), magic-byte sniff failure (415); response is
  201/422/400 with per-file `errors[]` (`src/app/api/uploads/route.ts:46-95`).
  Filenames are sanitized before storage (`sanitizeName` strips CR/LF/NUL,
  255 cap, lines 122-124).
- **Path traversal**: storage keys are built server-side from sha256 + random
  suffix (`buildAssetKeyBase`, `src/lib/storage/index.ts:36-43`) — client
  input never selects paths on write. On read, `/api/media/[...key]` passes
  the joined key to the adapter whose `getOrNull` validates it (route comment
  line 41). Re-verify the exact containment once `local-disk.ts` is restored
  (§6).
- **Rendition allowlist**: only `.webp/.jpg/.jpeg/.png/.gif` map to a MIME;
  anything else 404s (`media/[...key]/route.ts:14-20`) — the pipeline only
  ever writes `.webp` renditions, so the extra extensions are legacy
  tolerance, not an upload channel.

## 6. File/media security deep-dive

Pipeline (one upload → four webp renditions, all metadata stripped):

1. Auth: signed-in SELLER/ADMIN; suspended sellers rejected 403; CSRF
   `assertSameOrigin`; per-user rate limit 30/10 min
   (`src/app/api/uploads/route.ts:15-28`).
2. Limits: ≤ 6 files/request, ≤ 8 MB/file, ≤ 40 MP, non-empty
   (`UPLOAD_LIMITS`, `src/lib/storage/image-pipeline.ts:14-18`).
3. Sniff: magic bytes only — JPEG `FF D8 FF`, PNG `89 50 4E 47`, GIF8*,
   RIFF…WEBP (`sniffImageMime`, lines 26-41). Content-Type is never trusted.
4. Process: `sharp` with EXIF-`rotate()` then `resize` (never upscales) then
   `.webp()` re-encode — this strips EXIF/GPS and any appended payload; four
   renditions (thumb 400 / medium 800 / large 1200 / full 2000; quality 78
   thumb / 82 rest; effort 4) (lines 79-92).
5. Track: sha256 content hash; exact duplicates return the existing
   `MediaAsset` instead of storing again (`uploads/route.ts:60-65`).
6. Serve: `/api/media/[...key]` — extension allowlist; strong ETag
   (sha1 of key, 20 hex) + 304; `Cache-Control: public, max-age=31536000,
   immutable` (keys are content-derived and never rewritten);
   `X-Content-Type-Options: nosniff`; `Content-Disposition: inline`;
   `Cross-Origin-Resource-Policy: cross-origin` (safe: media carries no
   credentials) (`src/app/api/media/[...key]/route.ts:44-64`).
7. Delete: owner-or-admin 403 gate; 409 while the asset key appears in any
   product images/variant image JSON or in past order-item image snapshots —
   historical URLs must keep resolving
   (`src/app/api/uploads/[id]/route.ts:23-47`).

**Open P0 (operational, security-relevant):** `src/lib/storage/local-disk.ts`
is currently missing from disk while `src/lib/storage/index.ts:2,7,15`
imports it. Uploads and media serving are broken until it is restored from
git (the `.gitignore` exception at line 45 keeps it tracked). Its internal
key validation (the actual path-traversal containment) must be re-reviewed
after restore.

## 7. Secrets management

Current state, honestly:

- `.env` sits in the repo root, **tracked in git** (`git ls-files` → `.env`)
  despite `.gitignore`'s `.env*` rule — it predates the ignore. It contains
  at least `DATABASE_URL` (mysql:// + password) and `AUTH_SECRET`
  (`scripts/recovery/README.md:48`).
- No secrets manager, no vault, no rotation schedule. Secrets rotate only by
  hand.
- `AUTH_SECRET` has a quality gate (≥ 32 chars or production refuses to
  boot, `src/lib/auth.ts:10-21`) — the gate is good, the exposure via git is
  the problem.
- `PAYMENT_DRIVER`/`STORAGE_DRIVER` are not secrets, but they are
  security-relevant config (§4.8, ops doc §4.1).

Rotation runbook (mirrored in ops doc §4.2):

1. `openssl rand -hex 32` → new `AUTH_SECRET` (invalidates all sessions —
   announce it).
2. `SET PASSWORD` for `vendora`@`127.0.0.1` and `…@localhost` via the
   mariadb root socket (commands in ops doc §4.2).
3. Rewrite `.env` by hand; never paste values into worklog/docs/commits.
4. `git rm --cached .env && git commit` — stop the bleeding; history rewrite
   is optional and disruptive.
5. Restart MySQL-dependent processes with the new inline `DATABASE_URL`.
6. Verify login works and old cookies are rejected.

Recommendations (not yet executed, deliberately):

- Untrack `.env` (step 4 as a standing task).
- Add a `.env.example` with variable names and safe placeholders only —
  noted as a recommendation; this document does not create it.
- If the financier module ships, treat KYC-document storage keys and any
  future signing keys with the same rotation discipline.

## 8. Data protection & privacy

Current PII inventory (verified against `prisma/schema.prisma` and route
usage):

| Data | Where | Exposure today |
|---|---|---|
| Email, name, image, storeName/storeBio | `User` | Own profile; admin consoles; seller names on storefront |
| Order address, phone, fullName, poNumber | `Order` | Buyer + sellers on the order + admin |
| Payment `reference`, `instructions` | `Payment` | Buyer (instructions snapshot) + admin |
| Uploaded images (+ original filename, sanitized) | `MediaAsset` | Public media URLs (immutable keys), owner + admin libraries |

PLANNED applicant PII (financier schema v4.0 — **not yet in the DB**):
date of birth, gender, marital status, nationality, identity type/number,
residence, plus KYC documents (`ApplicantDocument` → `MediaAsset`,
PENDING/VERIFIED/REJECTED with reviewer) and a consent timestamp
(`consentAt`). This is identity-grade PII, far beyond today's inventory.

Duties and proposals:

- **Minimization**: schema v4.0 already follows a single-entry doctrine
  (personal data once on `User`, per-application facts on the request).
  Enforce in review: no copies of identity data onto request rows.
- **Consent evidence**: `consentAt` must be captured at wizard submission
  and written to the audit trail — a checkbox without a timestamp is not
  evidence.
- **Access control**: financier staff see documents only for requests routed
  to them (§3.4); every verification/rejection records the reviewer. Audit
  the doc-verification path, not just the outcome.
- **Retention/deletion (proposal — nothing exists today)**: define a
  retention window for rejected/withdrawn applications and their documents;
  the 409 reference-check on media deletes already protects order-snapshot
  images, so KYC retention needs its own policy lever. Suspend + delete
  flows should cover identity columns and KYC renditions.
- **Market note**: the target market is Arabic-speaking (Yemen-region
  competitor analysis in the worklog), while the platform has **no i18n/RTL
  support** (known gap). Not a vulnerability, but a data-quality and
  consent-comprehension issue for the planned applicant flows: consent text
  should be understandable to the market's users.

## 9. Money-integrity rules (security invariants)

These are architecture decisions that double as security controls:

- **D-001** — third-party orchestrator: the platform never holds inventory,
  never is merchant of record (`team/DECISIONS.md:7-10`).
- **D-002** — settlement is external: the platform never collects
  buyer→vendor funds, never lends, never runs wallets; commission on
  success; payout = Σgross − commission (0–90%, zod-validated)
  (`team/DECISIONS.md:11-13`). Concretely in code:
  - `Payment` rows record method/status/reference; **capture** is an
    admin-only transition that stamps `capturedById`
    (`prisma/schema.prisma:602-622`, admin route
    `src/app/api/admin/payments/[id]/capture/route.ts`).
  - `Payout` rows are records of external settlement — `generate` is
    admin-only, transactional, stamps `OrderItem.payoutId`; `mark-paid` is
    admin-only (`prisma/schema.prisma:624-654`,
    `src/server/modules/payouts/service.ts`).
  - State guards return 409: duplicate open dispute per seller/order
    (`disputes.ts:185-191`), acting on closed disputes
    (`disputes.ts:269-273, 330-333`), deleting in-use media
    (`uploads/[id]/route.ts:32-47`).
- **CARD is simulated** and can be disabled wholesale with
  `PAYMENT_DRIVER=manual` (`src/server/modules/payments/service.ts:81`).
- **PLANNED (financier)**: the money rules extend as — FinancingEvent is a
  track-only ledger reported by financiers (no custody code paths), and
  fees move ACCRUED → INVOICED → PAID with mark-paid admin-only
  (`team/FINANCIER_SCHEMA.md` v4.0 / worklog D-002 ruling). Any PR that
  introduces wallet/escrow/lending semantics violates the invariant and
  must be rejected.

## 10. Abuse & availability

Rate-limit policies (single source of truth: `RATE_LIMITS`,
`src/lib/rate-limit.ts:58-66`; enforcement helper
`src/lib/http.ts:69-82`):

| Policy | Limit | Window | Key | Wired where |
|---|---|---|---|---|
| login | 10 | 10 min | per IP | **NOWHERE (gap — H)** |
| register | 5 | 30 min | per IP | **NOWHERE (gap — M/H)** |
| upload | 30 | 10 min | per user | `POST /api/uploads` (wired) |
| productWrite | 60 | 10 min | per user | `products/bulk` (wired) |
| review | 10 | 1 hr | per user | (defined; verify at wiring review) |
| order | 20 | 10 min | per user | **NOT wired on orders (gap)** |
| mediaRead | 600 | 1 min | per IP | `GET /api/media/[...key]` (wired) |

Limiter mechanics and limits of those mechanics:

- In-memory sliding window, `Map<key, timestamps[]>`; single-process by
  design; the header documents the Redis sorted-set migration path for
  horizontal scale (`src/lib/rate-limit.ts:1-8`).
- **Restart = amnesia**: any process restart clears all buckets — an
  attacker who can induce restarts (or simply waits for the sandbox's
  process reaping) resets their counters (M).
- Buckets are pruned lazily on access plus a 5-minute unref'd GC timer that
  drops buckets idle > 1 h (`rate-limit.ts:43-55`) — memory is bounded in
  practice, but a key-explosion flood (many distinct keys) between GC runs
  grows the map; with `clientIp()` spoofable on direct `:3000` access
  (§1), per-IP keys are attacker-chosen in that path (M, sandbox-conditional).
- Upload size caps (8 MB × 6 files, 40 MP) bound the worst per-request cost
  of the media pipeline (§4.3).
- No request-level timeouts, queues, or circuit breakers exist; availability
  is "the single Next.js process stays up" (ops doc §8).

## 11. Audit logging & incident detection

- **AuditLog** (`prisma/schema.prisma:660-674`): `actorId` (nullable —
  SYSTEM rows have no user), `actorType` USER|SELLER|ADMIN|SYSTEM, `action`
  (e.g. ORG_VERIFIED, RFQ_SUBMITTED), `entityType`/`entityId`, `summary`,
  `metadata Json` (legacy shape, kept for compatibility). Indexed on
  entity, createdAt, and actor+action.
- **What is logged today**: settings changes (via `SettingChange` +
  `recordAudit`), payout generation, vendor lifecycle, payments, RFQ
  transitions, disputes, price-lists, coupons, approvals, customer-group
  changes — every module importing `recordAudit`
  (`src/server/modules/audit/service.ts` consumers: payouts, vendors,
  payments, rfq, recurring, disputes, settings, price-lists, coupons,
  approvals, customer-groups).
- **What is NOT logged (gap)**: authentication events — logins, failed
  logins, logouts, password changes, SUSPENDED sign-in rejections produce
  no AuditLog rows. Until login rate limiting is wired (§10), an
  attacker's activity is invisible except in `dev.log`.
- **Detection**: there is no alerting; detection = a human reading the
  admin Audit tab or `dev.log` (ops doc §6). Admin can query audit logs via
  `api/admin/audit-logs`.

Recommendation (not implemented): emit `AUTH_LOGIN_SUCCESS`,
`AUTH_LOGIN_FAILURE`, `AUTH_LOGOUT`, `AUTH_PASSWORD_CHANGE` audit rows
with actor `SYSTEM`/user id and source IP (from `clientIp()`), rate-limited
to avoid log flooding.

## 12. Security roadmap (prioritized)

**P0 — do now**

1. Rotate `AUTH_SECRET` and the DB password; untrack `.env`
   (runbook: ops doc §4.2 / §7 here). The values are in git history — treat
   them as public.
2. Restore `src/lib/storage/local-disk.ts` from git (operational P0;
   uploads/media are down without it) and re-review its key validation.
3. Wire `enforceRateLimit` with `RATE_LIMITS.login` on `POST /api/auth/login`
   and `RATE_LIMITS.register` on register — the policies already exist.
4. Add `assertSameOrigin` to `POST /api/orders`, `/api/rfqs`, single-product
   writes (`/api/products`, `/api/products/[id]`), and `auth/register`.

**P1 — next**

5. Security headers + CSP: add a `headers()` block to `next.config.ts` or a
   minimal `middleware.ts` (none exist today). Start with
   `X-Content-Type-Options`, `Referrer-Policy`, `Frame-Options`/frame-ancestors,
   and a nonce-based CSP suited to Next.js.
6. Wire the remaining defined-but-unwired policies (order, review) and
   re-audit every new unsafe-method route for CSRF + rate limit.
7. Add `.env.example` (names only) once `.env` is untracked.
8. Auth-event audit logging (§11 recommendation).
9. Session hardening decision: shorter MAX_AGE or a revocation list —
   revisit when any real-money or financier flow approaches.

**P2 — before financier launch (hard gates)**

10. Document access control: financier staff see KYC documents only for
    requests routed to them; admin override; reviewer recorded on every
    verification transition; E2E test proving cross-financier reads fail.
11. Consent evidence: `consentAt` captured and audited at wizard submit.
12. PII controls for applicant columns: minimization review, retention/
    deletion policy for rejected applications and their documents, and a
    decision on field-level protection for identity numbers.
13. Arabic-market comprehension check for consent and privacy text (no
    i18n today — known gap).

---

*Document generated from the codebase as read on this date (DOC-6b). Every
mitigation above cites its file; gaps are labeled and routed to the roadmap.
Update this document in the same commit as any security-relevant change.*
