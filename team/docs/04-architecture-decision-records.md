# Vendora — Architecture Decision Records

| | |
|---|---|
| **Version** | 1.0 |
| **Date** | September 2026 |
| **Format** | Compact ADR log (Nygard-style: Context / Decision / Consequences), one section per record. |
| **Status vocabulary** | `Accepted` (in force) · `Owner-set` (owner ruling, non-negotiable) · `Planned` (gated on owner approval) |
| **Cross-references** | `team/DECISIONS.md` (D-001…D-014 invariants), `team/PLATFORM_PLAN.md` (DP-1…DP-21 open/approved points), `team/FINANCIER_SCHEMA.md` v4.0 |

---

## ADR-0001 — Single-page application on a single route
**Status:** Accepted (D-004) · **Date:** project inception

**Context.** Vendora is operated inside constrained sandbox previews where only one externally
reachable origin exists. Multi-route Next.js navigation complicates the Caddy gateway model and
the agent-browser verification protocol. All product surfaces (storefront + 4 consoles) must
share one document.

**Decision.** The only user-facing route is `/`. View switching is URL-addressable state in the
query string (`?view=`, `&id=`, `&tab=`, …) parsed by `src/lib/routing.ts`. The registry of views:
home, catalog, product, store, cart, checkout, orders, favorites, seller, account, admin, rfqs,
business. Framer-motion `AnimatePresence mode="wait"` animates view swaps; deep links work via
plain URLs; `?view=financier` is reserved for the planned financier console.

**Consequences.** (+) zero routing/table architecture, trivial deep-linking, one gateway rule.
(−) every new surface must extend `routing.ts` + nav config deliberately; browser history
semantics are custom; no per-route code splitting.

## ADR-0002 — Unified commerce core: one buyer graph, one pricing pipeline, one negotiation primitive
**Status:** Accepted · **Date:** inception (foundational comment in `prisma/schema.prisma`)

**Context.** B2C and B2B historically fork into parallel code paths (retail vs corporate stores),
doubling maintenance and making "sell to a company AND a consumer" impossible in one order graph.

**Decision.** The difference between B2C and B2B is DATA, not code paths. One buyer graph
(`User` + `Organization` + `OrganizationMember` roles + `CustomerGroup`), one pricing resolution
pipeline (`PriceList` scope precedence: organization contract > customer-group list > retail
`Product.price`, with quantity-break ladders in `PriceListEntry`), one negotiation primitive
(`Rfq`/`Quote` with validity windows, sibling auto-decline, convert-to-order via
`Order.sourceQuoteId`), one order pipeline with optional B2B extensions (poNumber, costCenter,
paymentTerms, approval thresholds) — all additive/nullable so the B2C fast path is unchanged.

**Consequences.** (+) single mental model; B2B features are opt-in data on the same tables.
(−) order/quote models carry mixed-concern fields; every new field must stay nullable-or-defaulted
to protect the B2C path.

## ADR-0003 — Third-party orchestrator business model; external settlement
**Status:** Owner-set (D-001, D-002) · **Date:** inception

**Context.** Platform liability, licensing and cash-flow risk in Yemen/regional B2B commerce.
Acting as merchant of record or holding funds creates regulatory exposure the operator will not
accept.

**Decision.** Vendora registers/verifies parties, curates the catalog, receives RFQs, matches
suppliers, governs quotes/approvals/awards, connects financiers, records commission, handles
disputes and audit. It NEVER holds inventory, NEVER acts as merchant of record, NEVER collects
buyer→vendor funds, NEVER lends, NEVER runs wallets. Settlement is external: `Payment` rows
exist only to record expectations (simulated card, manual bank transfer with admin capture,
NET-terms invoice); `Payout` is a record of gross−commission settlement marked PAID by an admin.
Financing money (planned) moves directly buyer⇄financier; the platform keeps a track-only
ledger (`FinancingEvent`) and invoices fees externally (`FinancingFee`: ACCRUED→INVOICED→PAID,
marked by admin).

**Consequences.** (+) minimal money-transmission exposure; revenue = commission/fees as
bookkeeping. (−) no escrow-backed guarantees for buyers; payment UX for manual methods requires
admin capture; all "paid" states are attestations, not proof of transfer.

## ADR-0004 — Custom session authentication (scrypt + HMAC-signed cookie), no NextAuth
**Status:** Accepted · **Date:** inception

**Context.** Single operator, single deployment, no OAuth providers, no need for the NextAuth
dependency surface; full control over session semantics wanted; sandbox has no external auth
services.

**Decision.** `src/lib/auth.ts`: passwords hashed with scrypt (16-byte hex salt, 64-byte hash,
`timingSafeEqual` compare); session token `${userId}.${expMs}.${HMAC-SHA256(payload)}` signed
with `AUTH_SECRET` (≥32 chars, production fail-fast at module load), stored in an httpOnly /
sameSite=lax / secure-in-prod cookie `vendora_session`, MAX_AGE 30 days. `getSessionUser()`
resolves the user per request and rejects SUSPENDED accounts. Guards: `requireUser()` (401),
`requireAdmin()` (403) in `src/server/guards.ts`; organization scope enforced per-service
(membership check + 403).

**Consequences.** (+) zero auth dependencies, auditable in ~120 lines, revocation = user-row
status. (−) no server-side session store → logout is cookie-clear only (token remains valid
until expiry); no SSO/MFA; 30-day token lifetime trades security for convenience (documented in
threat model).

## ADR-0005 — MySQL + Prisma with string enums and TypeScript unions (no native DB enums)
**Status:** Accepted · **Date:** inception

**Context.** Schema-first development with frequent additive changes in a sandbox where
`prisma db push --accept-data-loss` is the de-facto migration tool; native MySQL enums make
additive value changes painful and Prisma's enum handling historically diverges across
providers (the repo even ships `scripts/db-provider.ts` to flip mysql⇄sqlite).

**Decision.** All status/type columns are `String @db.VarChar(n)` with the allowed values
documented in schema comments and enforced in TypeScript union types + zod schemas at the route
boundary. Money is `Decimal(12,2)` (`@db.Decimal`). Prisma client is a `globalThis` singleton.

**Consequences.** (+) adding an enum value = comment + TS union + zod edit, no DB migration;
provider-flip stays possible. (−) DB accepts arbitrary strings (no CHECK enforcement) → discipline
required: every write path must validate; typos surface at runtime, not compile time, if a union
is missed.

## ADR-0006 — Business document numbers via the Sequence service
**Status:** Accepted (D-006) · **Date:** inception

**Context.** Business documents (RFQ, quote, dispute, payout — and planned financing request,
agreement) need gap-free human-readable identifiers; client-side counters race; MySQL AUTO_INCREMENT
leaks volume and is per-table only.

**Decision.** `Sequence` table (`key`, `value`) + `src/server/modules/sequences/service.ts`:
`nextNumber(prefix)` does an `upsert` increment inside a `$transaction` with 3 retries on race,
formatting `PREFIX-YYYY-NNNNNN` (e.g. `RFQ-2025-000001`). Prefixes today: RFX→`RFQ`, `QTE`, `DSP`,
`PY`; planned: `FIN` (financing requests), `AGR` (agreements). Offers stay id-addressed (DP-12).

**Consequences.** (+) one numbering substrate, zero cross-table coupling. (−) every number
issuance is a write transaction (acceptable volume); gaps can still appear if a transaction
rolls back after `nextNumber` — accepted for business numbering.

## ADR-0007 — State machines + lazy sweeps; NO timers
**Status:** Owner-set (D-011) · **Date:** 2026-09

**Context.** The owner explicitly rejected time-based heartbeats/cron for development cadence
AND product logic: background timers in a sandbox whose processes get reaped are unreliable and
unobservable.

**Decision.** All lifecycle logic is explicit state-machine transitions enforced in services
(e.g. `RFQ_TRANSITIONS` in `rfq/service.ts:36-42`; payout `PENDING→PAID|CANCELLED` with 409 on
illegal moves), plus **lazy sweeps**: `expireStaleQuotes()` (quote validity, RFQ deadlines w/
grace hours, auto-expire rules), `sweepDisputes()` (escalation + seller-silence auto-resolve),
`processDueSchedules()` (recurring RFQ spawns) — triggered from read paths (`listMyRfqs`,
`getRfq`, `adminListRfqs`, `adminListQuotes`, `sellerRfqInbox`) via `nudgeBackgroundSweeps()`
with an in-flight guard. Planned financing expiry (`expiresAt` → EXPIRED) follows the same
pattern.

**Consequences.** (+) deterministic, observable, no daemon management; progression is driven by
usage. (−) time-based effects land only when someone reads an affected list (stale data between
reads); sweep cost sits on hot read paths (mitigated by conditional `updateMany` and the
in-flight guard).

## ADR-0008 — Thin routes, services in src/server/modules
**Status:** Accepted (D-005) · **Date:** inception

**Context.** App Router route handlers grow into 300-line blobs mixing validation, auth, business
rules and Prisma calls, making the RFQ state machine impossible to test or reuse from sweeps.

**Decision.** Route files (`src/app/api/**/route.ts`) do exactly: module-level zod schema →
`safeParse` → guard (`requireUser`/`requireAdmin`) → service call → map `ServiceError(message,
status)` to `NextResponse.json({error}, {status})`. All business logic lives in
`src/server/modules/<domain>/service.ts` (15 modules today: approvals, audit, coupons,
customer-groups, notifications, organizations, payments, payouts, price-lists, pricing,
products, rfq (+disputes, recurring), sequences, settings, vendors). Errors: every response body
is `{error: string}`.

**Consequences.** (+) one place per domain rule; sweeps and future jobs reuse services; API
contract is uniform. (−) route files are boilerplate-heavy; service layer has no interface
separation (single `service.ts` per module) — acceptable at current scale.

## ADR-0009 — Media pipeline: sha256-deduped assets, magic-byte validation, webp renditions, local-disk adapter
**Status:** Accepted · **Date:** 2026-09 (PLATFORM-1 restored local-disk)

**Context.** Product images need thumbnails (grid) and full renders (detail); sandbox storage is
the local disk; the same logo gets uploaded repeatedly by sellers; Content-Type headers lie;
EXIF rotation breaks displays.

**Decision.** `MediaAsset` keyed by sha256 (dedupe: re-upload returns the existing asset) with
renditions `thumb/medium/large/full` in webp (q78/q82) produced by sharp (EXIF honored then
stripped, `withoutEnlargement`). Uploads: SELLER/ADMIN only, multipart ≤6 files, ≤8 MB, ≤40 MP,
**magic-byte sniffing** of JPEG/PNG/GIF/WEBP (declared MIME never trusted) → 415/413 on failure.
Serving: extension→MIME allowlist, immutable caching + ETag/304, `nosniff`, `Content-Disposition:
inline`, CORP header. Deletes: owner-or-admin, **409 while referenced** (products, variants, past
order snapshots). Storage behind a `StorageAdapter` interface (`STORAGE_DRIVER`, default
`local-disk`); keys `YYYY/MM/{sha256[0..8]}-{6 rand}`. **Known P0 (ops runbook P0-3): the
local-disk adapter file was lost in an environment reset and is NOT in git history — rebuild +
commit is required.**

**Consequences.** (+) one storage subsystem for ALL future document needs (the planned
`ApplicantDocument` links `MediaAsset` rather than re-implementing storage — DP-19); safe,
cache-friendly serving. (−) local disk = no replication (backups are `git add` of
`storage/uploads/` + data dir); adapter loss is a hard outage.

## ADR-0010 — Scoped settings registry with append-only change history
**Status:** Accepted · **Date:** 2026-09 (QA-R8/DASH-2 era)

**Context.** RFQ behavior (routing, distribution, expiry, cancellation, disputes, approval,
pricing rules, commissions…) must be configurable per platform AND per organization type/org/
category/region, with admin trust in "who changed what" and the ability to roll back.

**Decision.** `RfqSetting` rows keyed `(panel, scopeType, scopeId)` with per-field precedence
`defaults ← PLATFORM ← ORG_TYPE ← ORG ← CATEGORY ← REGION` (most specific wins, field-granular,
scope chain cached 120 s). 7 sections / 22 panels declared in a typed registry
(`src/lib/rfq-settings/registry.ts`) that auto-generates the admin form + zod + history. Every
field mutation is an append-only `SettingChange` row; rollback restores `oldValue` and is itself
logged (`rollbackOfId` chain) — deliberately not FK-linked so history survives override deletion.
Storefront-wide config lives in `PlatformSetting` (key/value doc, tagged cache TTL 5 min).

**Consequences.** (+) auditable, reversible configuration; zero new tables per future panel —
the planned `financing` section registers into the same system. (−) per-field merge complexity;
settings reads must always go through the resolver, never raw rows.

## ADR-0011 — In-memory cache and rate limiting, single-process, Redis-shaped interfaces
**Status:** Accepted (interim) · **Date:** 2026-09

**Context.** No Redis in the sandbox; catalog/home/product pages recompute on every hit; abuse
protection needed on media and writes.

**Decision.** `src/lib/cache.ts`: tagged TTL cache (5 min) on `globalThis` (Turbopack
per-bundle safe) with tags products/categories/catalog/home/user:id. `src/lib/rate-limit.ts`:
sliding-window `Map<key, timestamps[]>` with named policies (login 10/10min, register 5/30min,
upload 30/10min, productWrite 60/10min, review 10/hr, order 20/10min, mediaRead 600/min),
lazy GC, and a code comment noting the 1:1 mapping to a Redis sorted-set.

**Consequences.** (+) zero infra; consistent within the single process. (−) per-process state
(restart clears limits — documented threat-model gap); **known gap: login/register/order/review
policies are defined but not wired to their routes** (security roadmap P0); cache invalidation is
tag-based only.

## ADR-0012 — Verification strategy: runtime E2E first; no unit runner adopted yet
**Status:** Accepted (interim; D-008 declares the target) · **Date:** 2026-09

**Context.** An autonomous team ships in the sandbox; the only universal executor available is
the dev server + a browser automation CLI; earlier attempts to keep a jest suite in-tree
diverged from reality.

**Decision.** Quality gates today: `bun run lint` (eslint), `scripts/verify-b2b.sh` (curl golden
path through org→RFQ→quote→accept→order), and the agent-browser E2E protocol (snapshot → click →
fill → assert, screenshots under `screenshots/`). D-008's declared baseline (60 tests / 4 files:
smoke 3, vendor-lifecycle 25, commission-payouts 12, catalog-moderation 20) is the target for an
on-disk artifact — currently it exists as intent only (test-plan risk R-1). The full strategy,
transition tables and acceptance criteria live in `team/docs/07-test-plan-acceptance-criteria.md`.

**Consequences.** (+) verification matches what the user actually sees; zero test-infra
maintenance. (−) no regression safety net between E2E rounds; state-machine edge cases are
checked manually; the gap to D-008 is tracked as risk R-1 with two remediation paths.

## ADR-0013 — Polymorphic RFQ backbone with typed provider pools (Super-Cart)
**Status:** Planned (P3; gated on owner approval of PLATFORM_PLAN) · **Date:** 2026-09

**Context.** Six product flows (B2C purchase, super-cart, supplier working capital,
accreditation, checkout financing, supplier-to-supplier) otherwise require five parallel request/
response systems.

**Decision (planned).** One RFQ backbone; `RfqLine.lineType: PRODUCT | SERVICE | FINANCING |
LOGISTICS | INSURANCE`; each line routes to a typed provider pool selected by `Organization.orgType`
(taxonomy extended in code with LOGISTICS / INSURANCE / SERVICE_PROVIDER — DP-7). Providers quote
only their lines; the buyer accepts best-per-line; the multi-party deal reuses the existing
multi-seller `Order`; per-line commission reuses the payout engine. Standalone financing
applications (Flows 3 & 5) are the same domain without the RFQ wrapper:
`FinancingRequest.targetType = WORKING_CAPITAL | QUOTE | ORDER | RFQ_LINE`.

**Consequences.** (+) one negotiation engine for everything; financing lights up as just another
line type. (−) the biggest refactor in the roadmap → sequenced after the financier core (P1/P2)
is stable; per-line acceptance semantics must be designed against the existing sibling
auto-decline behavior.

## ADR-0014 — Financing domain: single-entry, zero-JSON, substrate-reusing data model
**Status:** Owner-set (D-014; DP-18/DP-19) · **Date:** 2026-09

**Context.** Field-level competitor extraction (ymp.ye wizard + APIs — see
`team/FINANCIER_SCHEMA.md` §1) initially produced v3.0 with 10 Json columns and several
duplicated structures (storage metadata on ApplicantDocument, Organization facts re-stored on
FinancierProfile, businessInfo.industry duplicating Organization.industry). The owner rejected
that: "dont use any json data… you will duplicate data, and tables".

**Decision.** Three governing rules (FINANCIER_SCHEMA v4.0 §2): **R-1 zero JSON** — every list
is a child table (`FinancingProductAttribute/Requirement/Coverage`, `FinancingRequestInvite`,
`FinancingOfferInstallment`), every address is typed scalars (`User.residenceStreet/City/
District`, `FinancierBranch.street/city/district/lat/lng`); **R-2 single entry** — personal data
only on `User` (12 additive nullable scalars), requests reference, never copy (competitor's own
`account {id,name}` proves the pattern); **R-3 reuse the substrate** — `ApplicantDocument`
links `MediaAsset` via `mediaId` (no storage fields), `FinancierProfile` is slim (identity on
`Organization`), status history = `AuditLog.summary` + `Notification.body` (the legacy
`AuditLog.metadata` Json deliberately unused), numbers via `Sequence` (FIN/AGR), settings via the
`RfqSetting` registry. No geo lookup tables — free strings (DP-16). §8 documents the full
duplication audit.

**Consequences.** (+) every datum one query away; relational integrity; no JSON parsing layers.
(−) more small tables (17 planned models) — each justified by the audit; joins replace cheap
blob reads; the doctrine now binds ALL future domains (D-014).

## ADR-0015 — Financing agreement references the frozen offer (no terms snapshot)
**Status:** Planned (DP-20; recommend YES) · **Date:** 2026-09

**Context.** Competitor stores `installments[]` on the request and a mutable agreement. v3.0
proposed copying accepted offer terms into `FinancingAgreement.termsSnapshot` (Json) — a
duplication the owner's rules forbid; snapshot drift is a classic billing-dispute source.

**Decision (planned).** `FinancingAgreement` holds `offerId @unique` and NO copy of terms. On
acceptance the service **freezes** the offer: status transitions terminate, and the offer + its
`FinancingOfferInstallment` rows become immutable (enforced in the service layer, audited).
The agreement's own lifecycle is `fundingStatus PENDING → REPORTED_FUNDED → REPORTED_SETTLED`
(financier-reported, track-only per D-002) + `status ACTIVE|COMPLETED|DEFAULTED|CANCELLED`.

**Consequences.** (+) one source of terms; zero drift; audit trail = the offer itself.
(−) immutability is enforced by service discipline, not DB constraints (Prisma lacks
row-level locks on update by default) — covered by INV tests in the test plan.

## ADR-0016 — Dev-only deployment; Caddy gateway with per-query port escape
**Status:** Accepted (D-007; environment constraint) · **Date:** 2026-09

**Context.** The sandbox exposes exactly one external port; the Next dev server owns :3000;
side services (websocket demo :3003, future mini-services) need external reachability; `bun run
build` is forbidden (D-007).

**Decision.** Caddy listens on `:81` as the sole gateway: default `reverse_proxy
localhost:3000`; any request with query `XTransformPort=<port>` is proxied to that local port.
Consequences for clients: API/WS URLs are always relative (`io('/?XTransformPort=3003')`,
never `http://host:3003`); mini-services must be independent bun projects with fixed ports.
Process physics (reaped backgrounds) are handled by the double-fork pattern documented in the
ops runbook.

**Consequences.** (+) one origin, N services; zero CORS. (−) every external client must know the
query convention; gateway is a single point of failure; production deployment is out of scope
until the owner changes D-007.

---

## Change log

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-09 | Initial log consolidating invariants (D-001…D-014), prior rulings and the v4.0 financing data-model decisions (ADR-0014/0015) into ADR form. |
