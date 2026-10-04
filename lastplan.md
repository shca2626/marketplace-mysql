# Vendora — lastplan.md · v4 · The Final Production Plan (Phase 6 → Launch)

> **What this is:** the complete replan of every remaining task from Phase 6 to production launch.
> It supersedes `mergedplan.md` §6 (Phases 6–8 there), **lastplan.md v1–v3**.
>
> **Inputs (six, merged):**
> 1. *Review of `lastplan.md v3`* (the reviewer's verdict: **"approve the direction, but not the final execution plan yet"** — 8 blocking issues B1–B8 + 3 execution details, all incorporated and traced in §0).
> 2. *Review of `lastplan.md v2`* (R1–R8, incorporated in v3 and retained here).
> 3. *Review of `lastplan.md`* (v1 — C1–C13, incorporated in v2 and retained here).
> 4. *Assessment of `answer4audit.md`* (external expert — "partially addressed; not audit-closed"; P0/P1/P2 RBAC priorities; staged financial-migration protocol).
> 5. The owner's eight binding decisions on the open questions (§2) **plus two decisions this plan requests** (D9, D10 — §2.1; **D10 now must be resolved during Phase 6**, per B2).
> 6. The actual codebase, re-verified for this plan (schema line numbers cited where they matter).
>
> **Verified starting point:** Phases 0–5 complete and pushed; lastplan v3 at `85da4fa` on `origin/main`.
>
> **Prime directive (owner):** complete the **main and core RBAC first, 100%** — then the rest in dependency order until production-ready.
>
> **Standing discipline (unchanged):**
> - Every phase ends with a gate verified in the browser (agent-browser), evidence captured **per the evidence standard below**.
> - After every green gate: **commit + push immediately** (standing owner rule).
> - A failed gate blocks the next phase — no exceptions.
> - Adversarial tests, concurrency tests, and file-access tests run **against staging only, never production** (C1).
> - No destructive schema work on financial data; all migrations follow the staged protocol (§7.1) **and the production rollout procedure (§7.1b)**.
> - **Completion-claims rule:** accreditation renewal, payout settlement, seller subscriptions, and Murabaha checkout are **not marked complete** until their data models **and** their concurrency/state-transition rules are explicit **and tested**. A feature whose state machine is not written down is not done.
> - **Evidence standard (B/M3 — applies to every gate):** a gate artifact records the **tested commit hash, environment, exact command or procedure, result, and any excluded cases with reasons**. A commit hash, screenshot path, or assertion that a test passed is a *claim*, not a result. **Committed evidence must never contain live secrets, pairing codes, or customer data** — evidence is redacted/synthesized; the raw artifacts stay in the restricted QA store. Existing `db/qa/` artifacts get a sensitivity pass during 6.0's scrub.
> - The final gate permits **explicitly approved residual risks** — never the label "100% ready" while material unaccepted risk remains (C13).

---

## 0. Reviewer's v3 verdict → what changed in v4

The reviewer approved the direction: safe staging preparation, offer variants, accreditation history, status separation, subscription entitlements, and the production migration rollout all land as designed. The remaining blockers affect security, settlement correctness, and phase ordering — each resolved here:

| # | Blocking issue (reviewer) | Resolution in v4 |
|---|---|---|
| B1 | `--allow-prod` on test scripts contradicts "tests never touch production" — a mistaken flag could run destructive tests on the real DB | **6.0b.8 rewritten** — test/seed/destructive-QA scripts **fail closed for production URLs and credentials, no override flag exists**; production migration and deployment are **separate protected workflows with explicit approval**, never a switch on a test script |
| B2 | D10 must resolve **during Phase 6, before Phase 7's schema design** (seller identity affects `ProductOffer.sellerId`, `OrderItem.sellerId`, `Payout.sellerId`, the proposed `PayoutLine`, `OrderFulfillment`, RBAC, and subscriptions); also: can seller orgs act as buyer orgs? | **New 6.13 + 7.0** — D10 decision recorded in Phase 6 with the full tenant model (§2.1 expanded: seller orgs, SellerProfile, **buyer duality = yes**, record-by-record mapping); **7.0 implements the substrate** before any other Phase 7 schema work |
| B3 | The `effectiveKey` unique doesn't support the described reversal flow (a REVERSAL line that is EFFECTIVE would occupy the slot) and permits duplicate PENDING lines racing before either is EFFECTIVE | **7.4 redesigned as two layers** — a mutable **settlement claim** (conditional `OrderItem.payoutId` single-flight at generation, affected-rows verified) separated from the **immutable ledger**; the generated unique key is redefined to guard **claim-purpose lines only** (`SETTLEMENT`/`REISSUE` in `PENDING`/`EFFECTIVE`); REVERSAL postings never occupy it; concurrent generation / reversal / release / reissue each tested |
| B4 | `AccreditationRequest.status` is a **String** (documented values), not a Prisma enum — invalid values could generate a NULL key and bypass the unique; expired `ACCREDITED` rows could block renewal | **7.8 rewritten** — description corrected to "documented value set on a String column"; **DB CHECK constraints** validate statuses (incl. `ARCHIVED`) so the generated key derives from a **constrained** set; expired-accredited → `EXPIRED` enforced **in the transactionally guarded renewal path as well as** the scheduled expiry job; tests: invalid status writes rejected, expired-grant renewal, concurrent renewals. **Same principle applied to `PayoutLine` status/purpose** |
| B5 | "Run claim + RFQ creation in one transaction" contradicts "FAILED runs are retained and retried" — a rollback removes the run row; nothing is left to retry | **7.5 rewritten** — durable run-state design: (tx1) create/claim unique run with a lease; (tx2) RFQ creation + mark run `CREATED` atomically; failure preserves/updates the run as `FAILED`; stale leases reclaimed; retries reuse the same idempotency key; three crash tests |
| B6 | Refund states exist without a refund ledger; Phase 7 gates `fulfillmentStatus` on `OrderFulfillment` which only arrives in Phase 8; "zero-unmapped legacy" is unprovable where refund evidence doesn't exist; `OUTSTANDING` is undefined | **7.7 rewritten** — a **refund/adjustment ledger** (incl. manual refunds) lands **before** `REFUNDED`/`PARTIALLY_REFUNDED` become settable; the **minimal `OrderFulfillment` model moves into 7.7** (Phase 8.1 builds operational depth on it); the legacy gate becomes "**zero rows in the ambiguous-legacy report without a recorded decision**" (each individually resolved, never silently defaulted); `OUTSTANDING` defined precisely — non-financed unpaid balance under invoiced terms, **never** a financed buyer obligation (those live only in the financing state machine) |
| B7 | `OfferVariant` identity isn't persisted on the RFQ/quote path — `RfqLine.offerId`+`variantId` are loose refs; nothing proves which offer-variant terms were quoted | **7.6 expanded** — `RfqLine.offerVariantId` + `QuoteLine.offerVariantId` + commercial snapshots at each stage (offer, variant, currency, quoted price, quantity, applicable inventory); pair-exists-and-belongs-to-the-same-product validation at **every transition**; the terms-preservation test asserts the **seller-specific variant terms** survive RFQ→quote→order, not merely the catalog variant ID |
| B8 | "Session-bound" signed URLs are really bearer capabilities unless the serving endpoint actually checks the session; a redirect can't log real retrievals | **6.6.4 rewritten** — the **authenticated proxy model is chosen** for the private vault: every file request hits an application route that checks the current session, authorizes, streams the bytes, and writes the retrieval event. No object-storage redirects for vault assets. Public media serving is unchanged |

Execution/migration details made explicit:

| # | Detail | Landing |
|---|---|---|
| M1 | Production migration order must be explicit (deploy dual-write **before** backfill, so no write lands only in old columns during backfill) | 7.1b — the 7-step order, numbered |
| M2 | `OrganizationMember` has no `active` field — "active membership" needs one definition, not per-service inventions | 6.4 — canonical definition: row exists AND `User.status = ACTIVE` AND `Organization.status = ACTIVE`; one tested resolver |
| M3 | Evidence = tested commit + environment + command + result + exclusions; no sensitive data committed as evidence | Standing discipline (header) + 14.5 |

---

## 1. Expert-assessment commitments (A1–A19) — carried unchanged

A1→6.2, A2→6.1/6.9, A3→6.3, A4→6.6, A5→6.7, A6→6.3, A7→6.10, A8→6.4, A9→6.5, A10→6.11, A11→6.8, A12→7.1, A13→7.3/7.4, A14→7.6, A15→7.5, A16→7.7, A17→7.8, A18→6.0, A19→7-gate/14.5. (Full table retained from v1; v2 added C1–C13; v3 added R1–R8; v4 adds B1–B8 + M1–M3. No commitment removed.)

---

## 2. The Owner's Eight Decisions (binding) + two decisions requested

| Q | Decision | Lands in |
|---|---|---|
| 1 | Unverified-seller publishing: admin-controlled per-seller AND bulk; **default = ALLOW**; "not active" sellers **always blocked** | 8.5 (+ risk acceptance) |
| 2 | Full multi-currency | 7.1–7.2 (+ buyer switcher 13.4) |
| 3 | Finish Product/Offer attribution 100% — including the variant×offer model (R2/B7) | 7.0 + 7.6 + 8.1 |
| 4 | Financier console: ALL 100% | Phase 10 |
| 5 | Arabic/RTL: the LAST step | Phase 13 |
| 6 | Monetization: mix, actor/transaction-dependent, admin-customizable | Phase 11 |
| 7 | Strictly 3P; platform manages the whole catalog; **full admin product form** | Phase 9 |
| 8 | KYC: manual + provider integration, admin-customizable | 12.4 |

### 2.1 The two requested decisions (with full model specs — B2 moves D10's deadline to Phase 6)

**D9 — Variant×offer data model (blocks 7.6 completion / Q3 closure).**
Facts: `ProductVariant` belongs to `Product` (catalog-level price/stock, schema 362–378); `ProductOffer` carries one price + one stock for the whole product per seller (277–303); `OrderItem.variantId` + `offerId` are loose refs (337–360); `RfqLine.offerId`/`variantId` are loose refs (587–608); `QuoteLine` has **no offer reference at all** (673–689).
- **Recommended (planned): `OfferVariant`** — per-offer variant rows (`@@unique([offerId, variantId])`) with price override, per-variant stock authority, sku, isActive; `OrderItem.offerVariantId` records the actual (offer, variant) sold; **plus B7:** `RfqLine.offerVariantId` + `QuoteLine.offerVariantId` persist the identity through the RFQ/quote path with commercial snapshots (see 7.6). Catalog-level `ProductVariant` price/stock become presentation/defaults for the product owner's primary listing — the purchase authority is always the (offer, variant) actually sold.
- **Alternative (rejected, documented):** variants as shared catalog choices with every offer covering all variants on identical terms — cannot express the required two-vendor test (different per-variant availability/pricing) and eliminates per-variant vendor price competition, contradicting Q7's 3P model.

**D10 — Seller tenant identity (decision recorded during Phase 6 → 6.13; implemented at 7.0 — before any other Phase 7 schema work; Phase 11 builds on it).**
Facts: sellers are users today — `ProductOffer.sellerId → User`, `OrderItem.sellerId`, `Payout.sellerId → User` (918–919), the proposed `PayoutLine`, `OrderFulfillment`, RBAC scopes, and subscriptions all need the same tenant; `ModuleActivation` scopes are PLATFORM | ORG_TYPE | ORG only (1972–1987).
- **Recommended (planned): sellers become first-class organizations.** The model, specified in full (this is what Phase 6 records and Phase 7.0 implements):
  - **Tenant identity:** a seller is an `Organization` with a 1:1 **`SellerProfile`** (unique organizationId; ownerUserId; store settings migrate here in 8.3). Selling is a **capability of an organization**, not a disjoint org type.
  - **Buyer duality — YES (decided):** a seller organization **can also act as a buyer organization** (common B2B: the same legal entity purchases and sells). Buying requires membership + the org-role machinery that already exists; selling requires the SellerProfile + SELLER-role members. Financier org types (BANK/MFI/EWALLET) are not seller-enabled.
  - **Record mapping:** `ProductOffer` gains `sellerOrgId` (authoritative tenant) alongside `sellerId` (acting user, retained as an immutable actor snapshot); `OrderItem` gains `sellerOrgId` (authoritative for fulfillment grouping + settlement) with `sellerId` retained as the actor snapshot; `Payout`/`PayoutLine` settle against `sellerOrgId`; `OrderFulfillment` is per `sellerOrgId`; RBAC `SELLER_SCOPED` resolves `ctx.orgId` = the seller org (same machinery as every org scope); `SellerSubscription` (11.2) attaches to the seller org.
  - **Migration (7.0):** a reviewed, resumable backfill creates one organization + SellerProfile + OWNER membership per existing seller user and sets `sellerOrgId` on their offers/order items/payouts; new writes set both identifiers; `sellerId` columns are never rewritten (they stay as actor history).
- **Alternative (documented, rejected): `SELLER` scope in `ModuleActivation` keyed by userId** — lighter migration, but adds a fourth tenant concept every permission check, limit surface, and billing path must special-case. Rejected for consistency unless the owner prefers it.

Both decisions carry the plan's recommendation as the working assumption; **the owner's explicit confirmation is recorded in the worklog during Phase 6 — D10 before Phase 7's schema design begins (B2), D9 before 7.6 implementation.**

---

## 3. Sequencing contract (reviewer's buckets + v3/v4-review pre-gates, as hard order)

```
WHAT CAN PROCEED NOW (v3 review: "ready to support initial credential
                       cleanup and staging setup ONCE production-targeted
                       scripts are made unconditionally safe" — B1 first)
  6.0   credential rotation + secret cleanup (+ evidence sensitivity pass)
  6.0b  staging isolation, SAFE restore, data-protection controls (R1, B1)
  6.1–6.9 RBAC guard repair, classification, MFA + session registry, private
        docs (B8 proxy model) — implementation proceeds on staging
  6.10–6.12 negative suites, audit atomicity
  6.13  D10 seller-tenant decision RECORDED (B2) — before Phase 7 schema design

BUCKET 2 — BEFORE FURTHER FINANCIAL OR COMMERCE EXPANSION
  Phase 7  Financial integrity & multi-currency
           PRE-GATE (v3 review + B2): before Phase 7 executes — the seller
           tenant model (6.13/7.0), payout claims & reversal semantics
           (7.4), accreditation constraints (7.8), recurring-job recovery
           (7.5), and the order/payment/fulfillment status design (7.7)
           are resolved designs. The v3 review names these "not optional
           later polish" — they determine the data model.
           PRE-GATE (R5): 7.1b's production rollout procedure exists and
           its concurrent-write mechanism is staging-tested BEFORE the
           migration executes.
  Phase 8  Commerce depth (fulfillment ops on 7.7's model; publish policy)
  Phase 9  3P catalog ownership model + admin catalog 100%
  Phase 10 Financier operations 100% (installments) → Murabaha checkout (10.9)

BUCKET 3 — BEFORE CLAIMING PRODUCTION READINESS
  Phase 11 Monetization mix (subscriptions on the 6.13 tenant; ceilings)
  Phase 12 Directory, discovery, trust + KYC provider
  Phase 13 Arabic / RTL (last feature phase)
  Phase 14 Hardening & launch (expanded final gate)
```

Planning estimate: **~14–18 weeks** — an initial planning assumption only; a defensible delivery commitment requires decomposition and staffing estimates per phase (C13). Each phase is scoped so it can be decomposed on demand.

---

# PART I — THE PLAN

## Phase 6 — RBAC & Security Core, 100% · ~2–3 weeks (staging pre-gate included)

### 6.0 Credential hygiene (first action — A18 / bucket 1)
1. Rotate **every** password that has appeared in any plan document, seed script, or chat; store new secrets only in the secret store.
2. Bump `sessionVersion` for all users → all existing sessions die.
3. Scrub credentials from tracked documents (rotation is the control since history retains them).
4. Repo-wide secret sweep (keys, tokens, WhatsApp session artifacts) → move to env/secret store; rotate what cannot be moved. **+ evidence sensitivity pass (M3):** existing committed QA artifacts (`db/qa/**`) reviewed — live secrets, pairing codes, and customer data are redacted or the artifact is replaced with a synthesized equivalent.
5. **Seed-script audit (R1):** no seed may write a known/committed password or a real credential. Seeds run on staging only, take generated credentials from the environment at runtime, and CI fails on hardcoded credentials in any seed/fixtures file — a future seed run can never silently undo 6.0's rotation.

### 6.0b Staging isolation & **safe** verified recovery (C1, R1, B1)
**Nothing in 6.10 (negative/adversarial tests), 6.12, or Phase 7 may touch production data.** A production restore done carelessly is itself an incident. The procedure is ordered and each step is a gate for the next:
1. **Isolate first.** Staging = separate database, separate storage root, separate app credentials, separate messaging credentials (WhatsApp test line distinct from any production line), **no public access** (IP allowlist/VPN), and a named, restricted personnel list — locked down *before* any production data is copied in.
2. **Kill outbound before anything runs.** Disable outbound email (Resend), WhatsApp senders, payment rails, webhooks, and push integrations at the config level — **before the restored application or any of its jobs is enabled** (job inventory: recurring RFQ sweep, expiry scans, digest jobs, watchdogs). Verify the kills with a canary (an attempt to send must fail) — configuration is not proof.
3. **Restore into the locked environment.** Real production backup → staging; row counts must match.
4. **Sanitize before testers touch it.** Scripted (re-runnable on every future restore): anonymize/remove personal data (names, phones, emails, addresses), password-reset tokens, OTP codes, active sessions/session tokens, invitation tokens, API credentials/secrets, WhatsApp session artifacts. **Private KYC documents are not copied into staging at all by default** — test fixtures replace them; any exception is redacted/protected and documented.
5. **Verify the restore with controlled comparisons, not eyeballs on raw customer rows.** Per-table row counts, aggregate financial totals (SUM/COUNT by currency), checksums — executed by the restricted operator role; aggregate-only results are what testers ever see. Raw customer records are never handed to testers.
6. **Staging-only accounts with generated credentials.** All QA/test logins are re-seeded staging-only accounts whose credentials are generated at seed time from the environment (never committed, never equal to any production credential — 6.0.5).
7. Re-enable the application against the sanitized data; verify jobs run with outbound still disabled.
8. **Script safety — fail closed, no override (B1).** Test, seed, and destructive QA scripts **have no production mode at all**: they refuse production URLs/credentials unconditionally — **there is no `--allow-prod` flag to mistake**; they detect a production target by fingerprint (known prod URL/DB host) and abort. **Production migration and deployment are separate, protected workflows with their own explicit approval and audit trail** (7.1b, 14.x) — never a switch on a test script.
9. **Environment-touch documentation** (`docs/environments.md`): every browser test, seed script, QA asset, and cron job listed with the environment it may touch.
10. CI conventions: authz/concurrency suites parameterized by `STAGING_BASE_URL`; production is never a target.
- **Gate 6.0b:** staging serves the app end-to-end on sanitized data; a production backup has been restored, sanitized, and verified via controlled comparisons; the outbound canary proves sends fail; the environment map exists; no test asset is documented as production-touching; the sanitization script is committed; **a deliberate attempt to point a QA script at a production target aborts (tested)**.

### 6.0a WhatsApp channel — incident closed; production recovery redefined
The pairing failure ("WhatsApp service unreachable (fetch failed)") was the Baileys mini-service being down with `node_modules` never installed after a fresh checkout. Fixed: deps installed, service started on `:3031`, self-healing watchdog (`scripts/whatsapp-watchdog.sh`), pairing verified end-to-end in the browser (evidence `db/qa/e2e/whatsapp-pairing-fixed.png` — **pairing code in that artifact is redacted in 6.0.4's sensitivity pass**). The user can add their number from the admin panel today.
**Production recovery policy:** the watchdog's runtime install guard is a **dev-environment convenience only**. Production recovery never installs packages at runtime: the service is built from the pinned lockfile in CI, deployed as a known artifact, and the process supervisor restarts that artifact (14.1). Remaining hardening: credential encryption (6.6.7), staging/production line separation (6.0b), health monitoring + alerting (14.4), rate-limited pairing endpoints (14.3).

### 6.1 Guard repairs + classification-first guard-lint (A2, C7)
1. Delete the three local `requireAdmin()` shadows (`api/admin/slides/route.ts`, `api/admin/slides/[id]/route.ts`, `api/admin/settings/route.ts`); import from `@/server/guards` with explicit keys.
2. `api/quotes/[id]/review/route.ts` — add its explicit permission key.
3. **Guard-lint v2 (`scripts/check-guards.ts`, CI-wired):** a reviewed classification of **every** entry point — not just `route.ts` files — as exactly one of: `PUBLIC` · `AUTHENTICATED_USER` · `ORG_SCOPED` · `SELLER_SCOPED` · `FINANCIER_SCOPED` · `PLATFORM_PRIVILEGED`. **CI's primary failure condition is the route set itself: an unclassified entry point fails CI.** A missing authorization declaration, a permission key not present in the catalog, an ORG_SCOPED route whose target organization is not explicit and validated, or a local guard shadow each fail CI independently. (The 6.9 matrix drift check is a second, redundant control — never the only one.)
4. **Scope widened:** server actions, background/scheduled jobs (recurring RFQ sweep, expiry scans, digest jobs), mini-service HTTP endpoints, and any non-route module performing privileged writes are all classified and linted the same way.
- **Test:** an unclassified route, a bogus permission key, or a shadow guard introduced on a scratch branch makes CI fail.

### 6.2 End the `User.role = ADMIN` bypass — lockout-sensitive migration (A1, C8)
1. Preconditions (all on staging first): create and verify the replacement super-admin RBAC assignment (protected `platform.super-admin` role); verify MFA enrollment **and recovery** (backup codes + the audited admin-reset path of 6.7.6); test privileged access with the RBAC-only guard active.
2. Deploy the guard change: `requireAdmin`/`requireAdminAny`/`requireModule` stop honoring `role === 'ADMIN'`; `requireAdmin()` without a key **throws** (programmer error).
3. Verify the break-glass path: dedicated break-glass account (protected role, MFA-enforced, login-alerted, audited) — verify login + alert fire.
4. **Documented, time-limited rollback** = re-apply the previous commit; it must not silently restore a broad ADMIN bypass (the rollback doc states exactly what it restores and its expiry).
5. **Full-codebase sweep** of `User.role === 'ADMIN'` / `role: 'ADMIN'` **outside route guards**: services, server actions, scheduled jobs, admin UI conditionals, seeds — every hit either removed (authorization is RBAC-only) or explicitly allow-listed with a written reason. The sweep output is a reviewed artifact.
- **Gate:** staging E2E proves super-admin works via RBAC alone; break-glass alert fires; zero remaining authorization-fact uses of `User.role`.

### 6.3 Module gating: fail closed + per-organization resolution (A6, A3)
1. Unknown module keys at **API authorization** → 403 `MODULE_UNKNOWN` + config-error log (fail closed). Storefront availability renders only from the registry — separate concerns.
2. Every org-scoped API resolves activation against **the specific organization in the request context** (explicit `ctx.orgId`), never the user's org union. User-union resolution remains only for personal navigation.
3. Tests: misspelled key never grants; multi-org user (module ON in org A, OFF in org B) is denied org-B-scoped access, allowed for org A.

### 6.4 Role-assignment integrity + the canonical "active membership" definition (A8, M2)
1. ORG-scope assignment requires an **active membership** — **defined once, canonically (M2):** a membership is active iff **the `OrganizationMember` row exists AND `User.status = 'ACTIVE'` AND `Organization.status = 'ACTIVE'`** (schema facts: `User.status` ACTIVE|SUSPENDED, `Organization.status` PENDING_VERIFICATION|ACTIVE|SUSPENDED|REJECTED; `OrganizationMember` has no lifecycle field of its own — and does not need one). This predicate lives in **one** server resolver used by every service; **no service invents its own interpretation.**
2. The invitation flow creates membership + assignment atomically; member removal revokes org-scoped roles in the same transaction; orphan sweep + backfill.
3. Tests: suspended user's membership is inactive for assignment/validation; suspended org likewise; the single resolver is the only implementation (lint/grep guard).

### 6.5 Invitation tokens hashed (A9)
`StaffInvitation.token` → `tokenHash` (SHA-256, same pattern as reset/OTP tokens); raw token shown once; pending plaintext invitations invalidated.

### 6.6 Private document delivery — authenticated proxy for the vault (A4, C5, R8, B8)
1. **Two storage namespaces:** `public-media` and `private-vault` (separate key roots). **Content-hash dedup never crosses namespaces** — the same bytes may exist twice with different keys and access semantics; dedup operates within a namespace only.
2. **Ingest classification:** document type drives namespace; **unknown/unspecced types default to the private vault** (fail-safe). New type→namespace mappings require an explicit, audited allow-list change — never a default-to-public.
3. **Access policy (least privilege):** document owner; org members per the sensitivity matrix (6.8); platform staff per permission; **financier access tied to a specific application or review scope** (the request/agreement they are reviewing — not mere financier membership).
4. **Retrieval mechanism — the authenticated proxy model (B8 decision):** a signed/short-lived URL for a vault asset points at an **application route that streams the bytes**. Every retrieval request re-authenticates the session, re-authorizes against the access policy (6.8), enforces the URL's expiry + one-time nonce, writes `DOCUMENT_FILE_RETRIEVED`, and only then streams. **No redirects to object storage/CDN for vault assets** — so "session-bound" is literally true and the retrieval event is real. URLs are minutes-TTL, uncacheable (`Cache-Control: no-store`), HMAC-bound to document + user + nonce. (The rejected alternative — transferable bearer URLs with CDN-log evidence — is documented for the record; it is weaker audit-wise and not chosen.)
5. **Audit fidelity:** `DOCUMENT_URL_ISSUED` and `DOCUMENT_FILE_RETRIEVED` are **distinct logged events** — issuance and actual retrieval are never conflated (and with the proxy model, retrieval is provably post-authorization).
6. **Invalidation sweep:** every public route that can serve media is tested to 404 the vault namespace — **including previously-issued public URLs and CDN/cache layers**. Existing public links are inventoried; any that ever pointed at sensitive documents are invalidated and the exposure window recorded in the risk register.
7. Migration: existing sensitive uploads moved to the vault namespace (keys rewritten); the old exposure windows remain registered risks.
8. WhatsApp credential encryption: `WhatsAppSender.credsJson` AES-GCM at rest, decrypted only in the service process.

### 6.7 MFA + persistent session registry (A5, C6, R8)
1. **TOTP (RFC 6238) enforced** for every account with any platform-scope role or org-scope roles covering role management, payouts, payment capture, KYC/document verification, dispute resolution, module management.
2. **TOTP secrets encrypted at rest** (AES-256-GCM; key from the secret store, not the DB credential; rotation procedure documented). The plaintext secret exists only in memory during enrollment/verification — never stored, never logged.
3. **Backup codes:** generated at enrollment, stored as **salted hashes**, **single-use** (each use flips a used-flag + audit event; replay is rejected). Admin re-issue invalidates the previous set.
4. **Requirement derivation — not self-weakenable:** `mfaRequired(user) = platformPolicy || any effective role carries REQUIRES_MFA`. Effective roles are computed from actual role assignments (RBAC), so adding a privileged role **turns the requirement on** automatically; the user's settings page can offer enrollment but never a disable while required. Weakening the platform policy is an audited admin action with a second approver (6.7.5).
5. **Step-up MFA for sensitive actions:** role grants/changes, payout generation/approval/mark-paid, KYC/document verification, module & policy changes, credential administration — each requires `mfaSatisfiedAt` **within a freshness window (default 5 minutes, configurable)** on the current session. A session that satisfied MFA at login this morning is not sufficient for these mutations.
6. **Locked-out-admin recovery:** a documented, audited runbook — identity verified out-of-band, either a second privileged approver (dual control) or the break-glass account (mandatory alert + audit), rate-limited, and every use reviewed post-hoc.
7. **Session registry:** `Session` — id, userId, device/UA summary, ipLastSeen, createdAt, lastUsedAt, revokedAt, mfaSatisfiedAt. Every issued session token gets a row; `lastUsedAt` updated (throttled); revocation supports both a single session and all-sessions (`sessionVersion` bump remains the all-kill).
8. **Verified-contact matrix (phone-first + nullable `User.email`; no accidental universal email prerequisite):** buyers: verified phone (OTP); sellers: at least one verified contact on file (phone **or** email), email mandatory only when email is the seller's chosen channel; platform staff & org staff/admins: verified **email** required — invitations are email-bound; the invitee must verify that exact email before first privileged login. Making email a universal login prerequisite would be an **intentional product change** requiring an owner decision — not a side effect of this plan.
9. Login flow: password → (phone OTP where applicable) → TOTP challenge; privileged guards check `mfaSatisfiedAt` on the session (and its freshness, per 6.7.5).
10. Admin console: per-staff "Require MFA" toggle + platform policy; enrollment wizard (QR); audited admin reset (feeds 6.7.6 recovery).

### 6.8 Least-privilege document matrix inside orgs (A11)
Sensitivity classes (PUBLIC / ORG_INTERNAL / SENSITIVE_IDENTITY / SENSITIVE_FINANCIAL) × role — one tested resolver; negative tests per class.

### 6.9 Route authorization matrix — the reviewed artifact (A2, C7)
`scripts/gen-route-matrix.ts` emits `audit/route-matrix.md`: every entry point (route + the 6.1.4 non-route set) with method, classification bucket, permission key, org-context resolution, and covering negative-test IDs. Generation is CI-checked against the reviewed classification file; drift fails. (Second, redundant control — CI's primary failure condition is the classification itself, per 6.1.3.)

### 6.10 Negative authorization test suite (A7, C1)
The ten-case suite (cross-tenant reads/writes/approvals/downloads; buyer-vs-approver; immediate revocation; non-member assignment; disabled module at API; unknown key; self-approval; private-doc via public URL + expired signed URL; break-glass alert; privileged-without-MFA) — **executed against staging only**, wired into CI and every phase gate.

### 6.11 Audit atomicity & coverage (A10)
Sensitive changes write their `AuditLog` row **inside the same transaction**; failure-injection test proves rollback (no silent skip); DB-level tamper mitigation documented (restricted DB role blocking UPDATE/DELETE on `AuditLog` where the managed plan allows; else documented operational control).

### 6.12 (folded into 6.10/6.11 — the v1 "authorization test infrastructure" item; no separate work remains)

### 6.13 Seller tenant identity — D10 decision + model recorded (NEW — B2; before Phase 7's schema design)
1. The owner confirms (or amends) the D10 recommendation (§2.1): **sellers become first-class organizations** with a 1:1 `SellerProfile`; **seller orgs can also act as buyer orgs** (decided: yes); the record mapping (offer/order-item/payout/payout-line/fulfillment/RBAC/subscription → `sellerOrgId`) is accepted; the migration approach (7.0 backfill, `sellerId` retained as actor snapshot) is accepted.
2. The decision + spec are recorded in the worklog and `docs/seller-tenant-model.md`; the Phase 7 schema work (7.0) implements exactly this spec — any deviation re-opens the decision.
3. D9 is confirmed in the same window (it lands later, at 7.6).
- **Gate:** decision recorded before Phase 7 begins; docs committed.

### Phase 6 acceptance gate (browser + scripted, on staging where adversarial; evidence per the standing standard)
- [ ] 6.0b gate passed: staging live on sanitized data; backup restored + verified via controlled comparisons; outbound canary proves sends fail; environment map committed; sanitization script committed; **QA-script-against-production aborts (tested)**.
- [ ] Guard-lint: zero unclassified entry points, zero shadows, zero bare guards, zero unknown permission keys — including server actions, jobs, and mini-service endpoints; a scratch-branch probe fails CI.
- [ ] Route matrix generated from the reviewed classification; 100% coverage.
- [ ] Negative suite 10/10 green on staging (evidence per the standard: commit, environment, command, result, exclusions).
- [ ] ADMIN bypass removed via the rollout; sweep artifact committed; break-glass verified with alert.
- [ ] MFA: enrollment E2E; TOTP secret encrypted at rest (verified in a dump); backup code use + replay-rejection audited; requirement auto-derives from an added privileged role; step-up window enforced on a sensitive action; locked-out-admin recovery executed per runbook with audit trail.
- [ ] Session registry records logins; single-session revoke works; all-sessions revoke works.
- [ ] Private doc: **proxy model** — no public path (404) including legacy URLs/CDN; retrieval requires an authenticated, authorized session (tested unauthenticated + cross-session); issuance vs. retrieval audited separately; member-vs-identity-doc denial.
- [ ] Credentials rotated; docs + QA evidence scrubbed (sensitivity pass); seeds audited credential-free; all sessions invalidated once.
- [ ] **6.13: D10 decision recorded; seller-tenant spec committed.**
- [ ] Full business regression still green. **Commit + push.**

---

## Phase 7 — Financial Integrity & Multi-Currency · ~2–3 weeks

### 7.0 Seller tenant substrate (NEW — B2; implements the 6.13 decision; precedes all other Phase 7 schema work)
1. `SellerProfile` (1:1 `Organization`, unique organizationId; ownerUserId; store settings land here in 8.3) — selling is a capability of an organization; buyer duality per D10.
2. `sellerOrgId` added to `ProductOffer`, `OrderItem`, `Payout` (+ the new `PayoutLine`), and the new `OrderFulfillment` — the **authoritative tenant** for grouping, settlement, fulfillment, RBAC scope, and (later) subscription attachment. Existing `sellerId` columns are retained and continue to record the **acting user** (immutable actor snapshots; never rewritten).
3. **Reviewed, resumable backfill:** one organization + SellerProfile + OWNER membership per existing seller user; `sellerOrgId` set on their offers/order items/payouts. New writes set both identifiers from creation.
4. RBAC `SELLER_SCOPED` resolution switches to the org (`ctx.orgId` = seller org) — same machinery as every other org scope; the user-union path is not used for seller-scope authorization.
5. Tests: an offer's `sellerOrgId` matches its seller's org; multi-member seller orgs (a second SELLER-role member manages offers/payouts under the org); buyer duality (the seller org places an order as a buyer org).
- **Gate 7.0:** substrate live + backfill verified + tests green — only then do 7.1+ schema changes proceed.

### 7.1 Staged Float → Decimal migration — the field inventory is the target (A12, C9, R5)
**The count of Float columns is context, not a migration target.** All 60 are classified MONEY / RATE / MEASUREMENT / RATING / GEO — only monetary fields migrate. The inventory is a reviewed artifact **with a column per monetary field**: table, column, current type, target type, **currency behavior** (fixed / row-context / derived), **rounding rule**, and backfill source of truth.
1. Backup; reconciliation baselines (orders, payments, payouts, commissions, financing fees) — signed report.
2. **Type rules per field, not blanket:** settled totals/fees `DECIMAL(15,2)`; unit prices, commission rates, FX rates, intermediate math `DECIMAL(18,6)`; percentages reviewed for their natural scale. **Currency concepts kept distinct:** transaction · display · settlement · accounting/base — each money row stores what applies.
3. **Per-row historical currency from actual data:** hypotheses reconciled against stored records; ambiguous rows explicitly listed and resolved before backfill; no blanket default.
4. Shadow Decimal columns → backfill → **diff under the pre-declared rounding rule:** the diff report must contain *only* differences exactly equal to the declared rounding function — anything else blocks.
5. **FX snapshot preserved on every converted/derived amount:** rate, rate timestamp, source, rounding policy stored with the record.
6. Writers/readers switch; reconcile against baselines; signed report.
7. Flip; documented rollback; then constraints/defaults; Float drops happen **only** per 7.1b step 7.

### 7.1b Production migration rollout — explicit order (R5, M1)
This is the **production** procedure; 7.1's staged protocol runs first on staging (that is its venue). Preconditions: 7.1 green on staging including the restore drill; production change window scheduled; **rollback decision criteria written before starting** (what triggers an abort at each step, and who decides).
**The order (each step deploys before the next begins):**
1. **Add nullable shadow Decimal columns** (versioned, reviewed migration — never `db push`).
2. **Deploy backward-compatible dual-write code** — the application updates Float + Decimal columns in the same transaction on every write. *(This must be live before the backfill so no write lands only in the old columns while it runs.)*
3. **Run the resumable, pause-safe backfill** (batched; safe to restart; progress table).
4. **Reconcile:** baseline totals vs backfilled Decimal totals; diffs = declared-rounding-only, per field; signed report before proceeding.
5. **Switch reads behind a flag** (monitored cutover; the rollback point is the flag flip back — Float remains authoritative-complete because dual-write kept it current; rollback rehearsed on staging under production-like concurrent-write load, which is also how the dual-write mechanism itself is tested).
6. **Continue dual-writing and reconciling through the observation period** (default 14 days, agreed with the owner): a reconciliation job compares new-write Float vs Decimal continuously; discrepancies alert.
7. **Drop the Float columns in a separate reviewed migration** — only after the observation sign-off.
Production migrations and deployments remain **separate protected workflows with explicit approval** (B1) — they are never test scripts with a flag.

### 7.2 Multi-currency substrate (Q2)
`Currency` + `ExchangeRate` (pair, rate, validFrom, source, admin-managed history) seeded USD/YER/SAR; money rows carry explicit currency codes (per 7.1); configurable accounting base; admin FX console; conversion display component; financing YER-native, retail USD-native; buyer switcher UI in 13.4.

### 7.3 Inventory integrity (A13, C10)
1. Conditional atomic decrements everywhere (`updateMany where stock >= qty`, count-verified, rollback on mismatch); concurrency test: two parallel last-unit checkouts → exactly one order.
2. **Single authoritative stock source:** per D9, the purchase-time authority is the **(offer, variant) pair** — `OfferVariant.stock` for offer-backed variant purchases; `ProductVariant.stock` remains the authority only for the product owner's primary listing; the parent `Product.stock` for variant products is a **derived read-model** maintained in the same transaction (with a reconciliation-check job). No path decrements two independent authorities for one unit.
3. **Approval-pending reservations get an expiry policy:** reserved stock for orders awaiting approval is released after a configurable TTL (default 48h) or on rejection — job + test.
4. Restock-on-cancel/approval-reject mirrors decrements conditionally and atomically.

### 7.4 Payout settlement — claim layer + immutable ledger (A13, C10, R3, B3)
**The invariant is "no two simultaneously effective settlements per order item" — enforced by a claim, not by forbidding history.** Two layers, separated on purpose:
**A. The settlement claim (mutable state, serializes generation):**
1. Claiming an item for a payout is a **conditional single-flight**: `UPDATE OrderItem SET payoutId = ? WHERE id = ? AND payoutId IS NULL` with **affected-rows verified** — mismatch → abort the transaction, recompute the eligible set, and alert. **No second generation can claim the same item, pending or otherwise, before any external transfer is initiated** (B3's race closed at claim time, not at EFFECTIVE time).
2. Release: a payout **cancelled before payment** frees its claims (`payoutId → null`, same transaction as the cancellation); a payout **reversed after payment** frees its claims in the same transaction that posts the reversal entries — enabling a later reissue.
3. The claim is mutable pointer state — it is **not** accounting history (that's the ledger below).
**B. The immutable ledger (accounting postings, append-only):**
4. **`PayoutLine`:** id, payoutId, orderItemId, `linePurpose` (`SETTLEMENT` | `REVERSAL` | `REISSUE`), amount, commission, currency, FX rate/timestamp/source snapshot, `status` (`PENDING` | `EFFECTIVE` | `REVERSED` | `CANCELLED`), `reversalOfLineId` (nullable self-FK), createdAt, transition timestamps. Amount/commission/currency/snapshot fields are **never UPDATEd after insert** — only status transitions and appended entries.
5. **The DB backstop — a generated `claimKey` that guards claim-purpose lines only (B3):** `claimKey` = `orderItemId` when `linePurpose ∈ {SETTLEMENT, REISSUE}` **and** `status ∈ {PENDING, EFFECTIVE}`; else `NULL`. `UNIQUE(claimKey)`. **REVERSAL lines never occupy the slot** — a reversal is an accounting fact, not a claim; it can coexist with the next settlement's claim. Status values and purposes are **CHECK-constrained** (B4 principle: free-form strings cannot silently fall outside the rule) — the DDL lands in the reviewed migration and is drift-checked.
6. **The three correction cases, end to end:**
   - **(a) Generated, never paid, cancelled:** claim released (A.2); lines PENDING → CANCELLED (claimKey → NULL by status change); items free for a future payout.
   - **(b) Paid, then corrected:** reversal entries appended (REVERSAL, `reversalOfLineId` → originals, negative amounts) move originals EFFECTIVE → REVERSED; the payout's net is the sum; every entry remains explainable; the claim is released.
   - **(c) Settle again after correction:** once no claim-purpose line holds the item, a new SETTLEMENT/REISSUE line claims it (A.1) and may become EFFECTIVE — allowed by design; the unique key blocks only *simultaneous* double-settlement.
7. Mark-paid re-guarded (PENDING → PAID only, idempotent, single-flight); payout-level and line-level state transitions share one transaction.
8. **Tests (B3's list):** two concurrent generations → exactly one claim wins (the loser aborts cleanly, recompute + alert); reversal → release → reissue round-trip preserving full history; a duplicate EFFECTIVE claim-purpose line **rejected by the database**; a REVERSAL line never blocks a subsequent claim (case (b)→(c) sequence).

### 7.5 Recurring-RFQ durability — durable run-state design (A15, B5)
**Two transactions, not one (B5): a run row that rolls back with its RFQ leaves nothing to retry.**
1. **Tx 1 — claim:** create-or-claim the unique `RecurringRfqRun` (idempotency key `scheduleId:dueAt`) with a **lease** (`leaseExpiresAt`) in a short transaction. A crashed worker's claim is recoverable because the row survives.
2. **Tx 2 — execute:** create the RFQ and mark the run `CREATED` **atomically**. Success is durable at this point even if the worker dies immediately after.
3. **Failure path:** if Tx 2 fails, the run is preserved/updated as `FAILED` (retry-counted, bounded) with the error; retries **reuse the same idempotency key** so a retry can never double-create; **stale leases** (`leaseExpiresAt` passed, still not `CREATED`) are reclaimed by the sweep and re-run.
4. The sweep (already a classified job per 6.1.4) owns claiming, reclaiming, and bounded retries; alerts fire on terminal failure.
- **Tests (B5's list):** worker crash before Tx 2 (stale lease reclaimed, RFQ created exactly once); an RFQ-creation error (run FAILED, retried with the same key, still exactly-once creation); crash after Tx 2 before the worker responds (run already CREATED; no duplicate).

### 7.6 Offer attribution end-to-end — variants persisted through the whole path (A14, Q3, D9, R2, B7)
`QuoteLine.offerId` (snapshot ref); conversion sets `OrderItem.sellerId`/`sellerOrgId` from the **offer's** seller (7.0); **the D9 model:** `OfferVariant` (`@@unique([offerId, variantId])`, per-variant price/stock authority, sku, isActive) + `OrderItem.offerVariantId` — and **B7: the identity is persisted at every earlier stage too:**
1. **`RfqLine.offerVariantId`** (nullable; set when the buyer targets a specific vendor's variant) — persisted alongside `offerId`/`variantId`.
2. **`QuoteLine.offerVariantId` + commercial snapshot:** the quote line snapshots the **seller-specific terms actually quoted** — offer ref, variant ref, currency, quoted unit price, quantity, and the applicable inventory (or its absence) at quote time. Terms surviving from RFQ→quote is a **fact recorded on the line**, not a reconstruction from `(offerId, variantId)` lookups that may have changed since.
3. **Pair validation at every transition:** wherever an (offer, variant) pair is consumed — RFQ line create, quote line create, quote accept → order conversion — the pair must exist, be active, and **belong to the same product**, or the transition fails closed.
4. **Migration:** existing offers on variant products backfill `OfferVariant` rows from catalog defaults (non-destructive, documented); existing `QuoteLine`s get `offerId`/`offerVariantId` backfilled from their RFQ lines where provable, flagged where not.
**The Q3 completion test:** the full chain (`ProductOffer → OfferVariant → RfqLine → QuoteLine → OrderItem → PayoutLine`) with **two vendors selling the same catalog product, one or more variants with different availability and different prices between them** — asserting authoritative seller-org/offer/variant/price/currency/quantity/stock at every hop, including the vendor out of stock on a variant being unbuyable on that variant, **and** the quote and resulting order preserving the exact seller-specific variant terms (not merely the catalog variant ID). Green (plus the 7.4 tests) = Q3 closed. *Q3 is not complete without this test.*

### 7.7 Order status — financial and fulfillment dimensions split, with a refund ledger (A16, R6, B6)
Today one `Order.status` (PENDING_PAYMENT | PENDING_APPROVAL | PAID | PROCESSING | SHIPPED | DELIVERED | CANCELLED) serves payment and fulfillment simultaneously.
1. **`paymentStatus` (financial):** `AWAITING_PAYMENT` · `PAID` · `FUNDED` · `PARTIALLY_REFUNDED` · `REFUNDED` · `OUTSTANDING`. **`OUTSTANDING` defined precisely (B6):** *a non-financed order with an unpaid balance under invoiced payment terms (e.g., NET-30 past due) or a captured under-payment* — **never** a financed buyer obligation (those exist only in the financing state machine, 10.8–10.9). `REFUNDED`/`PARTIALLY_REFUNDED` are settable **only from refund-ledger evidence** (item 3).
2. **`fulfillmentStatus` (derived roll-up):** `UNFULFILLED` · `PARTIALLY_FULFILLED` · `FULFILLED` · `PARTIALLY_CANCELLED` · `CANCELLED` — derived from the **`OrderFulfillment` model, which moves INTO this phase (B6 sequencing fix):** 7.7 introduces the minimal model (per-`sellerOrgId` grouping, status, per-item links) with an explicit, tested derivation rule; **Phase 8.1 builds the operational depth on it** (carrier, tracking, events, partial-cancellation flows). Phase 7 no longer gates on a model that doesn't exist yet.
3. **Refund/adjustment ledger (B6 — lands before the refund states become settable):** a `Refund` record for every real refund — order, payment reference where one exists, amount + currency (Decimal per 7.1), reason, actor (admin/financier/system), method + external reference (**manual refunds are supported and recorded** — there is no PSP yet; the ledger is the evidence), plus reversal/correction entries as appends (never rewrites). `paymentStatus` transitions to refund states are computed from this ledger only. A dispute outcome of "FULL_REFUND" **creates a refund-ledger obligation**; it is not itself proof money moved.
4. **Server-side transition maps for both dimensions** (illegal transition → 400 + audit). The legacy single `status` is retained read-only during migration and removed after the observation discipline of 7.1b.
5. **Financed orders never overload `PAID`:** financier disbursement to sellers sets `paymentStatus = FUNDED` — which **never** implies the buyer's obligation is settled. The buyer's debt lives in the financing domain as its own state machine (`ACTIVE → PAID_OFF / DEFAULTED / RESTRUCTURED / WRITTEN_OFF`, per 10.8–10.9) with `InstallmentPayment` as its ledger. "Seller received funds" and "buyer owes nothing" are **distinct events with distinct records**.
6. **One home per money flow:** `Payment` (buyer payment) · `Payout/PayoutLine` (seller settlement) · `Refund` (money returned to buyer) · `InstallmentPayment` (buyer debt servicing) · `FinancingFee` (financier fees). No status field substitutes for a ledger.
7. **Legacy mapping — honest, not assumptive (B6):** the mapping table covers what is **provable** (`PENDING_PAYMENT`→(AWAITING_PAYMENT, UNFULFILLED); `PENDING_APPROVAL`→ approval reads from `ApprovalRequest`, both dimensions pending; `PAID`→(PAID, fulfillment from suborder evidence); `PROCESSING`/`SHIPPED`/`DELIVERED`→ payment unchanged + fulfillment derived; refund states only where refund evidence exists). **Ambiguous historical rows — e.g., paid-then-cancelled with no refund record — are NOT silently defaulted:** they land in a **legacy-ambiguity report** and each is resolved with a recorded decision (assigned state + reason) by the operator. **The gate is "zero rows in that report without a recorded decision," not "zero unmapped by assumption."**

### 7.8 Accreditation renewal — constrained statuses, DB-derived active key (A17, C2, R7, B4)
The current schema has `@@unique([serviceId, organizationId])` (line 1636) — retaining prior requests while creating renewals is impossible under it. Correction (B4): `AccreditationRequest.status` is a **String column with documented values** (schema line 1618 comment), not a Prisma enum — so the value set must be **database-constrained** before a generated key can trust it. Explicit schema change:
1. **CHECK constraints first:** the valid status values — `DRAFT`, `SUBMITTED`, `UNDER_PLATFORM_REVIEW`, `RETURNED_FOR_COMPLETION`, `FORWARDED_TO_FINANCIER`, `UNDER_FINANCIER_REVIEW`, `ACCREDITED`, `REJECTED`, `EXPIRED`, `REVOKED`, `CANCELLED`, plus the new `ARCHIVED` — are enforced by a **DB CHECK** (reviewed migration SQL; Prisma doesn't model CHECKs — the schema comment is updated and a drift check in CI flags their absence). **An invalid value (misspelled, arbitrary string) is rejected by the database** — it can never produce a NULL key and slip past the unique (B4's bypass closed).
2. **Database-generated active key from the constrained set:** generated column `activeKey` = 1 when `status ∈ ACTIVE_SET`, else `NULL`; `UNIQUE(serviceId, organizationId, activeKey)`. Multiple NULLs → unlimited history; at most one live request per program/org; the marker **cannot disagree with status** because the database derives it.
3. **ACTIVE_SET (complete, from the documented values):** `DRAFT`, `SUBMITTED`, `UNDER_PLATFORM_REVIEW`, `RETURNED_FOR_COMPLETION`, `FORWARDED_TO_FINANCIER`, `UNDER_FINANCIER_REVIEW`, `ACCREDITED`. Terminal: `REJECTED`, `EXPIRED`, `REVOKED`, `CANCELLED`, `ARCHIVED` (superseded — evidence frozen, read-only). **DRAFT and RETURNED_FOR_COMPLETION block a second application by design** (documented rule).
4. **Expiry before renewal (B4):** an `ACCREDITED` record whose `validUntil` has passed is transitioned to `EXPIRED` **both** by the scheduled expiry job **and** by the transactionally guarded renewal path (renewal of a lapsed accreditation first flips the stale record to `EXPIRED` inside the same transaction, then creates the new request) — an expired grant can never block its own renewal.
5. **Every ACTIVE_SET entry/exit transition is tabled and tested**; no transition outside the table is legal. `supersedesId` self-relation + `ACCREDITATION_RENEWED` audit chain; archive + create + audit atomically.
6. **Tests (B4's list):** invalid status writes rejected by the CHECK; expired-grant renewal succeeds (with the in-transaction EXPIRED flip); **the concurrent-renewal race — two parallel submissions → exactly one becomes active, the loser rejected by the database**; every transition-rule row exercised.
- *Do not mark accreditation renewal complete until the CHECK + generated-key constraints + transition table + tests land (completion-claims rule).*

### Phase 7 acceptance gate
- [ ] **7.0 gate:** seller-org substrate live, backfill verified, multi-member + buyer-duality tests green.
- [ ] Field inventory reviewed — every monetary column typed/currency'd/rounded; only monetary fields migrated; diffs = declared-rounding-only, else blocked.
- [ ] **7.1b procedure written with its 7-step order; dual-write deployed before backfill (order verified in the runbook); the mechanism staging-tested under production-like load; rollback criteria + observation period agreed.**
- [ ] Staging restore drill re-run (migration rollback rehearsal) — signed.
- [ ] Concurrency tests (stock, payout claims, recurring crash/recovery) + **payout cases (a)/(b)/(c) + claim race + reversal-doesn't-block-reissue** + **two-vendor variant terms-preservation test** green — on staging.
- [ ] **Order-status split: refund ledger live and backing the refund states; minimal `OrderFulfillment` model live with tested derivation; `OUTSTANDING` per definition; financed FUNDED≠buyer-clear; legacy ambiguity report has zero unresolved rows.**
- [ ] Accreditation: CHECK + generated-key constraints live; invalid-status write rejected; expired-grant renewal green; race test green; transition table fully exercised.
- [ ] `answer4audit-v2.md` evidence addendum (per the evidence standard) for every finding this phase closes → expert re-review (A19).
- [ ] Full regression + **commit + push.**

---

## Phase 8 — Commerce Depth · ~2–3 weeks (Murabaha checkout moved out — C4; builds on 7.0/7.4/7.6/7.7)

### 8.1 Per-seller fulfillment operations — on the 7.7 model
`OrderFulfillment` was introduced minimally in 7.7 (per-`sellerOrgId` grouping, status, per-item links). Phase 8.1 delivers the **operational depth**: carrier, tracking numbers, event history, buyer tracking grouped per seller, partial cancellation per seller group (feeding 7.4's claim releases + reversal entries), RFQ conversions deriving suborders from per-item `sellerOrgId`/`offerVariantId`. The roll-up derivation rule (7.7.2) is re-tested against the full operational surface.

### 8.2 Buyer depth
Spec-matrix compare, saved addresses, reorder, guest checkout (email/phone + post-hoc account claim), product Q&A with moderation.

### 8.3 Seller depth — on the seller-org tenant (7.0)
Onboarding checklist, store settings (logo/banner/policies/payout account — landing on `SellerProfile`), draft autosave/recovery, CSV import polish, low-stock alerts, seller coupons, shipping zones, analytics depth.

### 8.4 Checkout financing (Murabaha) — **moved to Phase 10.9** (C4: depends on financier disbursement operations that complete in Phase 10; see the legal/Sharia precondition there).

### 8.5 Unverified-seller publishing policy (Q1, C12)
1. Platform setting `publishPolicyForUnverified`, **default `ALLOW`** (owner decision).
2. Per-seller override (`ALLOW | REVIEW | BLOCK`) + **bulk action** — overrides recorded against the seller org (7.0) with the user-level legacy flag migrated.
3. **Explicit risk acceptance recorded** (risk register): allowing unverified sellers to publish is a product choice, not a security control — documented fraud/trust risk with mitigations: visible verification status on storefronts/products, seller limits (listing caps for unverified), payout holds/thresholds for unverified sellers, enhanced review for higher-risk categories, and the admin's ability to flip the policy at any time.
4. **Hard rule:** suspended/inactive sellers are always blocked from publishing — enforced and tested at **every publishing path**: product create, product edit/republish, **offer create/update**, CSV bulk import, and any bulk action. The negative suite gains these cases.
- **Gate:** policy default verified; per-seller + bulk flips work; suspended-seller block proven at every path (API-level evidence).

### Phase 8 acceptance gate
- [ ] Mixed-seller order ships per suborder; grouped tracking; roll-up derivation correct (incl. mixed cancellation); partial cancellation releases claims/reverses lines per 7.4.
- [ ] Guest checkout, reorder, Q&A round-trip; seller checklist/settings (on SellerProfile)/coupons/shipping/alerts E2E.
- [ ] Publish policy + risk acceptance artifact; suspended-block tests at all publishing paths green.
- [ ] Regression + **commit + push.**

---

## Phase 9 — 3P Catalog Ownership Model + Admin Product Management 100% · ~2 weeks (Q7, C3)

### 9.1 Data model first — resolve the system-seller contradiction (C3)
Today curated listings are owned by a "Vendora Catalog" **user** in `Product.sellerId` (required, primary-seller semantics, schema line 201). Change before the form:
1. `Product.sellerId` becomes **nullable**: `null` = platform-curated catalog record (no primary seller, not purchasable as such); existing curated rows migrate `sellerId → null` with ownership moved to `curatedById` (admin actor) for provenance.
2. **Purchasability rule:** a curated product is buyable **only through a real vendor's ACTIVE `ProductOffer`** — checkout requires an offer when `sellerId` is null. A curated product with no vendor offer is display-only (directory/aggregator semantics).
3. **No legacy fallback:** a curated item without an active vendor offer must **never fall back to the product's legacy price or stock** — the fallback paths are removed, and the negative test proves the API returns 400 + the UI shows sourcing messaging rather than a purchasable price.
4. **Non-null-assumption audit:** every path that today assumes `Product.sellerId` is non-null is swept and fixed — **product display, pricing resolver, RFQ, reviews, orders, reports, seller analytics** — each with a null-case test.
5. The Vendora Catalog system account is retired from `sellerId` semantics entirely; payout/settlement queries exclude offer-less items by construction (they cannot exist as order items).
6. Storefront rendering: `sellerId: null` renders the offers list / "available from these vendors" instead of a primary seller.

### 9.2 Full admin product form (the owner's repeated ask)
Re-scope the seller 7-tab form for admin use (media library uploads — not URL paste, structured specs, variant editor, shipping, SEO, GTIN/MPN/brand, category); "Add Product" prominent in Catalog + Products panels; creates curated (`sellerId: null`) records.

### 9.3 Full CRUD + moderation with teeth
Edit every field; archive/restore; guarded delete (offers attached → archive-only with reason); bulk actions; per-edit audit diff; admin edit of seller listings via full form with mandatory reason + seller notification + audit diff.

### 9.4 Publication agreement management
Versioned templates; per-org-type defaults; per-product requirement toggle; consent records searchable/exportable.

### Phase 9 acceptance gate
- [ ] C3 negative test green (curated w/o offer unpurchasable — no legacy price/stock fallback, API 400 + UI messaging; no Vendora-sold attribution anywhere).
- [ ] Null-`sellerId` audit complete: display, pricing resolver, RFQ, reviews, orders, reports, seller analytics each handle the curated case with a test.
- [ ] Admin creates product with media uploads + specs + variants → publishes → buyer buys via a vendor offer.
- [ ] Admin edits seller listing → notification + audit diff; guarded delete; agreement v2 re-captures consent.
- [ ] Regression + **commit + push.**

---

## Phase 10 — Financier Operations 100% · ~2 weeks (Q4, C4)

### 10.1–10.7 (carried, amended)
Portfolio analytics (approval rate, disbursed volume, aging/NPL 30/60/90, per-branch/program, CSV export); risk scoring (configurable, decision-support, auto-decision only if explicitly enabled); Sharia artifact management (scholar certifications with expiry/reminders, versioned contract templates); **e-signature per the expanded spec below**; disbursement operations (queue → confirm with payment rail reference + FX snapshot → installment tracking); collections & statements; branch operations (branch-scoped inboxes, underwriting limit matrix); public institution polish.

**E-signature evidence package:** a signature image + content hash is *evidence*, not proof of execution. Each execution records: **signer identity binding** (authenticated session + step-up MFA at signing per 6.7.5), **explicit consent text + acceptance event**, **exact document version** (template version + content hash — hash mismatch fails closed: no execution), **server timestamp** (+ trusted time source noted for legal review), IP/device, and the complete audit trail. The package design is reviewed with legal (14.5 item 6) before launch.

### 10.8 Installment payment model — explicit (C4: schema is track-only today)
`InstallmentPayment` records how payments are **received** (channel, reference, receivedAt, amount, currency), **allocated** (which installments, in what order — with partial-allocation and over/under-payment rules), **reversed** (reversal entries referencing originals — never rewrites), and **reconciled** (daily batch vs. rail exports where available; discrepancy queue). Aging/NPL and late fees are computed from allocated state, not from track-only rows. This is the buyer-obligation ledger referenced by 7.7.5.

### 10.9 Islamic finance at checkout (Murabaha) — AFTER 10.1–10.8, gated (C4)
**Hard preconditions before implementation:**
1. Minimum lender workflow complete and E2E-verified: request → review → offer → agreement execution (per the 10.1 evidence package) → disbursement confirmation → installment collection.
2. **Qualified legal + Sharia review of the actual transaction sequence** — who purchases the goods, when ownership and risk transfer, how the resale to the buyer occurs, what evidence is retained, and how cancellation or default is handled — documented and signed off. The implementation follows the reviewed sequence; it does not invent one.
3. **Late-fee policy specifically reviewed** — policy text, cap, and calculation reviewed with the same sign-off.
Then: checkout "Finance it (Murabaha)" method → pre-qualification (KYC L2+ gate) → offer pick → agreement sign → financed order state machine (**on the 7.7 split**: `FUNDED` on disbursement; buyer obligation tracked on the financing state machine, never conflated) → installment schedule to the buyer; clean fallback to standard payment on pre-qualification failure/expiry. *Not marked complete until its state machine is written down and tested (completion-claims rule).*

### Phase 10 acceptance gate
- [ ] Full lender lifecycle E2E incl. installment receive/allocate/reverse/reconcile; statement correctness.
- [ ] Late installment → NPL bucket + reviewed late-fee application.
- [ ] Branch scoping + underwriter limits enforced.
- [ ] E-signature evidence package complete on a test execution (identity binding, consent, version+hash, timestamp, audit trail); hash-mismatch fails closed.
- [ ] Murabaha preconditions documented (legal/Sharia sign-off artifacts) before any checkout code; then the financed-checkout E2E green — with FUNDED ≠ buyer-obligation-cleared asserted.
- [ ] Regression + **commit + push.**

---

## Phase 11 — Monetization Mix · ~2 weeks (Q6, C11, R4)

### 11.1 Fee engine — immutable fee assessment
`FeeRule` (event × actor type × scope × dimension, precedence, effective dating) + simulator; current 10% commission migrates to a platform rule (zero behavior change day one). Every applied fee writes an **immutable `FeeAssessment`**: idempotency key (event-scoped), applied-rule snapshot (rule id + version + parameters at application time), currency + FX snapshot, calculation inputs, resulting amount — **reversals/corrections are separate appended rows, never rewrites**. The revenue console reconciles against this ledger to the cent (Decimal).

### 11.2 Seller subscriptions — on the Phase 6 tenant, ceiling semantics (C11, R4, D10)
1. **Tenant identity (decided in 6.13, built in 7.0):** the subscription attaches to the **seller organization** — module activation, permission checks, limits, and billing all resolve against that same tenant. No implicit User↔Organization mapping.
2. `SubscriptionPlan` (module bundle + limits) + `SellerSubscription` (status, renewAt, grace, downgrade state) on the seller org.
3. **Entitlement ceiling semantics:** a subscription is a **ceiling** — organization/org-type module activations can only enable what the subscription entitles; they can never exceed it. Resolution for paid modules: entitlement = `subscriptionAllows AND (ORG override OR ORG_TYPE default OR PLATFORM default)`. An ORG flip can turn a paid module **off**; it cannot turn it **on** beyond the subscription.
4. **Renewal-failure behavior:** grace period (configurable, default 7 days, read-only warnings) → downgrade (paid modules off, limits re-clamped; data preserved read-only where applicable).
5. **Tests:** unpaid/downgraded subscription cannot retain paid entitlements through an organization override; grace/downgrade transitions verified; the tenant resolution is exercised for every limit surface. *Not marked complete until the tenant model + ceiling + tests are explicit (completion-claims rule).*

### 11.3 Financier monetization + commission customization + revenue console (carried, on the same rules — reconciling against 11.1's FeeAssessment ledger).

### Phase 11 acceptance gate
- [ ] Simulator matches fees actually applied across order/financing/subscription flows (FeeAssessment idempotency + snapshot verified).
- [ ] Subscription tenant = seller org (7.0 substrate); ceiling semantics proven by tests (unpaid/downgraded + org override attempt).
- [ ] Revenue dashboard reconciles with the fee ledger to the cent (Decimal).
- [ ] Regression + **commit + push.**

---

## Phase 12 — Directory, Discovery, Trust + KYC Provider · ~1.5–2 weeks (Q8)
Carried from v1: brands directory, trending/bestsellers, services directory; spec-attribute facets, typo-tolerant search, normalized comparison; trust counters; PWA/newsletter stretch.
**KYC provider spec:**
- `KycProvider` abstraction (MANUAL | PROVIDER | PROVIDER_THEN_MANUAL per document type, admin-customizable, mock-provider fallback test).
- **Failure semantics: a provider error/timeout leaves the case PENDING for manual review — never auto-approval** (tested: provider returns 500 → case pending, flagged for the manual queue).
- **Webhooks:** HMAC-signed, replay-protected (timestamp + nonce), event-id idempotency (duplicate delivery is a no-op), unauthenticated calls rejected 401 + audited.
- **Data minimization & retention:** only fields required per document type are transmitted; provider-processed documents land in the **private vault** (6.6 semantics — proxy retrieval only); retention schedule + deletion job documented; processing-location/cross-border note prepared for the 14.5 legal review.

---

## Phase 13 — Arabic / RTL / i18n — THE LAST FEATURE PHASE · ~2 weeks (Q5)
Carried unchanged: locale routing + persisted toggle, RTL mirroring, Arabic content (profiles, program copy, chrome, bilingual emails), buyer currency switcher on the 7.2 substrate, AR buyer journey at 390px acceptance.

---

## Phase 14 — Production Hardening & Launch · expanded final gate (C13, A19)

### 14.1–14.3 (carried, amended)
Email-verification enforcement **per the 6.7.8 contact matrix** (strict verified email for platform/org staff; sellers: verified contact on file; buyers phone-first); rate limiting expansion + password policy + privileged-account rotation; ops (automated backups **with the recurring restore drill proven in 6.0b** re-verified on schedule — with R1's safeguards; uptime monitoring incl. the WhatsApp mini-service health; staging/production split CI gates: lint + type + guard-lint + classification-sync + auth-negative suite + business regression). **WhatsApp production deployment = CI-built artifact from the pinned lockfile + supervisor restart (6.0a) — runtime package installation removed from every production runbook.**

### 14.4 Monitoring & incident ownership (expanded)
Alerting with named owners: downtime, OOM/restart events, migration jobs, pairing-service outages, reconciliation discrepancies, failed audit writes. On-call/ownership documented even if informal.

### 14.5 Launch gate — the full checklist (C13, M3)
1. **Dependency & secret scanning** (SBOM + secret sweep, zero known-vulnerable pins unaccepted).
2. **Security testing of authorization and file access** — the negative suite plus a targeted private-document penetration pass (staging), including legacy-URL/CDN paths **and unauthenticated/cross-session attempts at the proxy route**.
3. **Load & concurrency testing** for checkout, settlement, and the hot APIs (rates defined per endpoint; results recorded per the evidence standard).
4. **Restore & recovery verification** — re-run of the 6.0b drill (with R1/B1 safeguards) on the then-current production backup.
5. **Monitoring, alerting, incident ownership** live.
6. **Legal/privacy review** for KYC processing, agreements, communications, and financing flows — the 10.9 Sharia sign-off, the 10.1 e-signature evidence package, the 12.4 retention/processing-location notes, plus data-subject requests, retention schedule, and cross-border notes as applicable.
7. **Production deployment + rollback rehearsal** — a full deploy executed and rolled back on staging with the documented procedure; **the 7.1b production-migration procedure rehearsed end-to-end**, including the dual-write-before-backfill order.
8. **Three consecutive green full-regression runs** (business + authorization-negative + financial-integrity) — each run's evidence recorded per the standard (commit, environment, command, result, exclusions).
9. **Completion-claims audit:** accreditation renewal, payout settlement, seller subscriptions, and Murabaha checkout each verified to have **explicit data models + explicit concurrency/state-transition rules + passing tests** — anything less is re-labeled as partial with its gap registered.
10. **Residual-risk review:** every open item is either closed with evidence or **explicitly accepted in writing by the owner** (registered risk, mitigation, review date). The gate does not force the label "100% ready" while material unaccepted risk remains.
11. Final **commit + push + tag**; `answer4audit-v2.md` updated with final evidence for expert re-run (A19).

---

# PART II — CROSS-CUTTING RULES

## Regression checklist (after EVERY phase)
**Business:** the mergedplan §7 baseline (register → coupon order → tracking; RFQ full loop; financing wizard → gate → offer → agreement; admin panels with count consistency; team invite/remove/role-change; 60-min soak).
**Authorization-negative (staging):** the ten cases of 6.10, plus the 8.5 publishing-path blocks.
**Financial-integrity (staging):** last-unit concurrency (incl. per-OfferVariant); **payout claim race + cases (a)/(b)/(c) + reversal-doesn't-block-reissue + duplicate-EFFECTIVE rejection**; **recurring crash/recovery trio (pre-Tx2, Tx2 error, post-Tx2)**; offer-attribution trace (**two-vendor variant terms-preservation test**); migration diffs = declared-rounding-only; **order-status dimension transitions + refund-ledger-backed refund states + legacy-ambiguity zero-unresolved**.
**WhatsApp channel health:** pairing start returns a code; watchdog keeps the service alive across a kill.
**Evidence:** every entry per the standing standard (commit, environment, command, result, exclusions; no sensitive content).

## Deferrals (unchanged in substance; reviewer-concordant)
ABAC/resource-level permissions; unifying org-member roles with RBAC; real PSP integration (substrate designed, lands with the commercial project); DB-level scope-sentinel redesign; role soft-lifecycle columns; full AR staff console.

## Risk register (live — updated in v4)
| Risk | Status / mitigation |
|---|---|
| Destructive test against production (B1) | 6.0b.8: fail-closed scripts, **no override flag exists**; production workflows are separate protected processes; abort tested. |
| Seller identity built on users then re-tenanted (B2) | 6.13 decision + 7.0 substrate **before all other Phase 7 schema work**; record-by-record mapping specified (§2.1 D10). |
| Payout double-settlement / blocked reissue (B3) | 7.4 claim layer (single-flight `payoutId` claim) + immutable ledger + claim-purpose-only `claimKey`; all four tests. |
| Invalid status strings bypassing generated keys (B4) | 7.8 CHECK constraints (incl. `ARCHIVED`) + generated key from constrained set + expiry-before-renewal (job + transactional path); same principle on `PayoutLine` (7.4.5). |
| Recurring-RFQ loss on rollback (B5) | 7.5 durable run-state (lease tx + execute tx + FAILED preservation + stale-lease reclaim + idempotent retries); crash trio tested. |
| Refund states without evidence / fulfillment gating gap (B6) | 7.7 refund/adjustment ledger first; minimal `OrderFulfillment` moved into 7.7; `OUTSTANDING` precisely defined; legacy-ambiguity report with recorded decisions. |
| Quote/order variant terms not provable (B7) | 7.6 `RfqLine`/`QuoteLine.offerVariantId` + commercial snapshots + pair validation at every transition + terms-preservation test. |
| Signed URLs overstated as session-bound (B8) | 6.6.4 authenticated-proxy model (session verified at retrieval; retrieval event real; no storage redirects). |
| WhatsApp mini-service availability | Fixed (`b1681f1`); production recovery = CI-built artifact + supervisor restart; monitoring/alerting 14.4. |
| Sensitive docs previously served from public media | 6.6 namespace + proxy + invalidation sweep (legacy URLs/CDN); exposure window registered; rotation in 6.0. |
| Staging restore exposing production PII / firing outbound (R1) | 6.0b ordered procedure; scripted sanitization; aggregate-only verification; staging-only generated-credential seeds. |
| Money migration | 7.1 staged protocol + 7.1b explicit 7-step production order (dual-write before backfill); observation period; Float drops separated. |
| Variant/offer attribution gaps (R2) | D9 `OfferVariant` + full-path identity (B7) + two-vendor test (7.6). |
| Order status conflation (esp. Murabaha) (R6) | 7.7 two dimensions + refund ledger + FUNDED≠buyer-clear. |
| Accreditation race / marker drift (R7) | 7.8 CHECK + generated key + transition table + race test. |
| Seller subscriptions without a tenant (R4) | D10 decided in 6.13, built in 7.0; subscriptions on the seller org (11.2). |
| Unverified sellers trading (owner's ALLOW default) | Explicit risk acceptance + mitigations in 8.5. |
| Murabaha before legal/Sharia review | Blocked by 10.9 preconditions (sign-off artifacts). |
| Subscription entitlement escalation via org override | Ceiling semantics + tests in 11.2. |
| E-signature legal validity | 10.1 evidence package + 14.5 item 6 legal review; hash mismatch fails closed. |
| KYC provider failure auto-approving | 12.4: failure ⇒ PENDING + manual queue (tested); webhook auth + idempotency. |
| RESEND_API_KEY lost | Owner action before launch (14.5 checklist). |
| OOM under parallel compiles | Restart procedure; staging/prod split in 14.1 is the durable fix. |

## Revision history
- **v4 (this document):** the v3 review's blockers incorporated — no `--allow-prod` (B1→6.0b.8); D10 moved to Phase 6 with the full seller-org model + buyer duality + 7.0 substrate (B2→6.13/7.0/§2.1); payout claim/ledger split with claim-purpose `claimKey` (B3→7.4); CHECK-constrained statuses + expiry-before-renewal (B4→7.8, 7.4.5); durable recurring run-state with lease + crash trio (B5→7.5); refund ledger + fulfillment model in 7.7 + OUTSTANDING definition + honest legacy mapping (B6→7.7); offerVariant persisted through RFQ/quote with snapshots + pair validation (B7→7.6); authenticated-proxy vault retrieval (B8→6.6.4); explicit 7-step migration order (M1→7.1b); canonical active-membership definition (M2→6.4); evidence standard incl. the QA-artifact sensitivity pass (M3→standing discipline/6.0.4/14.5).
- **v3:** v2 review's R1–R8 + tightened items (superseded).
- **v2:** v1 review's C1–C13 + WhatsApp incident (superseded).
- **v1:** initial replan from the expert assessment + owner decisions (superseded).

---

*On approval, execution begins at Phase 6.0 (credential rotation + evidence sensitivity pass) → 6.0b (staging isolation & safe verified restore) → the RBAC closure items → 6.13 (D10 decision recorded) — every gate browser-verified per the evidence standard, every green gate committed and pushed. D9 is confirmed in the same Phase 6 window; 7.0 implements the seller-tenant substrate before any other Phase 7 schema work.*
