# Vendora — lastplan.md · v3 · The Final Production Plan (Phase 6 → Launch)

> **What this is:** the complete replan of every remaining task from Phase 6 to production launch.
> It supersedes `mergedplan.md` §6 (Phases 6–8 there), **lastplan.md v1**, and **lastplan.md v2**.
>
> **Inputs (five, merged):**
> 1. *Review of `lastplan.md v2`* (the reviewer's verdict: **"accept as the working plan, not yet as the final production plan"** — 8 required amendments R1–R8 plus tightened items, all incorporated and traced in §0).
> 2. *Review of `lastplan.md`* (v1 — 13 required corrections C1–C13, incorporated in v2 and retained here).
> 3. *Assessment of `answer4audit.md`* (external expert — "partially addressed; not audit-closed"; P0/P1/P2 RBAC priorities; staged financial-migration protocol).
> 4. The owner's eight binding decisions on the open questions (§2) **plus two new decisions this plan requests** (D9, D10 — §2.1).
> 5. The actual codebase, re-verified for this plan (schema line numbers cited where they matter).
>
> **Verified starting point:** Phases 0–5 complete and pushed; HEAD `b1681f1` on `origin/main` (includes the WhatsApp pairing fix — §6.0a).
>
> **Prime directive (owner):** complete the **main and core RBAC first, 100%** — then the rest in dependency order until production-ready.
>
> **Standing discipline (unchanged):**
> - Every phase ends with a gate verified in the browser (agent-browser), evidence captured **and committed alongside the claim** (the reviewer cannot verify claims from prose; the evidence artifact is part of every gate).
> - After every green gate: **commit + push immediately** (standing owner rule).
> - A failed gate blocks the next phase — no exceptions.
> - Adversarial tests, concurrency tests, and file-access tests run **against staging only, never production** (C1).
> - No destructive schema work on financial data; all migrations follow the staged protocol (§7.1) **and the production rollout procedure (§7.1b)**.
> - **Completion-claims rule (reviewer, final assessment):** accreditation renewal, payout settlement, seller subscriptions, and Murabaha checkout are **not marked complete** until their data models **and** their concurrency/state-transition rules are explicit **and tested**. A feature whose state machine is not written down is not done.
> - The final gate permits **explicitly approved residual risks** — never the label "100% ready" while material unaccepted risk remains (C13).

---

## 0. Reviewer's v2 verdict → what changed in v3

The reviewer accepted (kept as-is): RBAC-first sequencing; explicit gates; staging-only security testing; migration caution; accreditation retention as an explicit decision; the session registry direction; the staging pre-gate concept; the publish-policy risk acceptance.

The reviewer's opening caveat stands for every phase: *they can review the plan's logic but cannot verify commits, fixes, tests, or schema changes from the document alone* — which is why every gate's evidence is a committed artifact and the audit re-run (A19) closes the loop.

The 8 required amendments (each traced to its landing place):

| # | Amendment (reviewer) | Resolution in v3 |
|---|---|---|
| R1 | A production DB restored into staging is itself a security incident (real PII, reset tokens, WhatsApp creds, notification destinations); outbound services must be dead before the restored app/jobs run; seeds must not be able to un-rotate credentials | **Phase 6.0b rewritten** — locked-down restore procedure with ordered steps (isolate → outbound kill → restore → sanitize → controlled verification), staging-only generated-credential seeds, no unredacted KYC files, aggregate-only financial comparisons |
| R2 | Variants live on `Product`, offers carry one price/stock for the whole product; `OrderItem.variantId` never records which seller's offer supplied that variant at what terms — "offer attribution 100%" (Q3) is not demonstrable without a variant×offer model | **Phase 7.6 rewritten + Decision D9 (§2.1)** — `OfferVariant` model (per-offer variant price/stock), `OrderItem.offerVariantId`, and the required two-vendor/different-terms test |
| R3 | A permanent unique constraint on `PayoutLine.orderItemId` blocks legitimate later settlements after cancellations/corrections; the invariant needed is "no two *simultaneously effective* settlements", with an immutable ledger that appends reversals | **Phase 7.4 rewritten** — line status model (PENDING/EFFECTIVE/REVERSED/CANCELLED) + DB-generated `effectiveKey` unique (one EFFECTIVE line per item at a time, unlimited history); the three reviewer cases (never-paid-cancelled, paid-then-corrected, settle-again) each specified and tested |
| R4 | `ModuleActivation` has PLATFORM/ORG_TYPE/ORG scopes only; sellers are users — a seller subscription on an implicit User↔Organization mapping has no defined tenant identity to enforce the ceiling against | **Phase 11.2 rewritten + Decision D10 (§2.1)** — sellers become first-class organizations (recommended) or a SELLER scope is added consistently; owner confirms before Phase 11 begins |
| R5 | A staging migration protocol does not define the production migration: concurrent writes during backfill, versioned migrations (never `db push`), reconciliation before cutover, monitored cutover, retained Float columns through an observation period; and the field inventory must name every monetary column's type/currency/rounding — "60 Floats" is context, not a target | **New Phase 7.1b** — the six-step production rollout procedure; **7.1 tightened** — inventory schema per monetary column (type, currency behavior, rounding rule, backfill source) |
| R6 | One order `status` serves payment state and fulfillment roll-up simultaneously; for Murabaha, financier disbursement to the seller ≠ buyer's obligation settled — `PAID` must never mean both | **Phase 7.7 rewritten** — `paymentStatus` and `fulfillmentStatus` as separate dimensions with separate transition maps; financed orders use FUNDED + a distinct buyer-obligation state machine; legacy mapping table with zero unmapped rows |
| R7 | An application-set `activeMarker` can disagree with request status; the active-status set must be complete (draft and returned states included) and the concurrent-renewal race must be provably single-winner | **Phase 7.8 rewritten** — DB-**generated** active key derived from status (cannot disagree), ACTIVE_SET enumerated exhaustively from the schema enum, every entry/exit transition rule tabled and tested |
| R8 | MFA/session details: encrypt TOTP secrets, hashed single-use backup codes, requirement derived from effective roles (not self-weakenable), recent step-up for sensitive actions, audited locked-out-admin recovery; and email verification must fit the phone-first/nullable-email design rather than silently becoming a universal prerequisite | **Phase 6.7 rewritten** — all five controls specified + the per-account-type verified-contact matrix |

Tightened items (reviewer's "other items"):

| Item | Landing |
|---|---|
| Curated products: audit every path that assumes non-null `Product.sellerId` (display, pricing, RFQ, reviews, orders, reports, seller analytics); no legacy price/stock fallback for offer-less curated products | 9.1 (tests added) |
| Private-vault assets unreachable through **every** public route incl. previously-issued URLs and CDN caches; unknown types private; existing public links inventoried for invalidation | 6.6 (invalidation sweep added) |
| Route classification: CI fails on an unclassified entry point itself — not merely on generated-doc drift | 6.1 (failure condition made primary) |
| WhatsApp watchdog must not install packages at runtime for production recovery — pinned lockfile, CI-built artifact, supervisor restart | 6.0a + 14.1 (production runbook changed) |
| E-signature: image + hash is evidence, not proof — signer identity, consent, document version, timestamp, full evidence package; legal review | 10.1 (e-signature spec expanded) |
| Fee engine: immutable `FeeAssessment` (idempotency key, applied-rule snapshot, currency, inputs, reversal entries) | 11.1 |
| KYC provider: failure ⇒ pending manual review, never auto-approval; webhook auth + idempotency + data minimization + retention + processing location | 12.4 (spec added) |

---

## 1. Expert-assessment commitments (A1–A19) — carried unchanged

A1→6.2, A2→6.1/6.9, A3→6.3, A4→6.6, A5→6.7, A6→6.3, A7→6.10, A8→6.4, A9→6.5, A10→6.11, A11→6.8, A12→7.1, A13→7.3/7.4, A14→7.6, A15→7.5, A16→7.7, A17→7.8, A18→6.0, A19→7-gate/14.5. (Full table retained from v1; v2 added the C1–C13 layer; v3 adds R1–R8 on top. No commitment removed.)

---

## 2. The Owner's Eight Decisions (binding) + two new decisions requested

| Q | Decision | Lands in |
|---|---|---|
| 1 | Unverified-seller publishing: admin-controlled per-seller AND bulk; **default = ALLOW**; "not active" sellers **always blocked** | 8.5 (+ risk acceptance) |
| 2 | Full multi-currency | 7.1–7.2 (+ buyer switcher 13.4) |
| 3 | Finish Product/Offer attribution 100% — **now explicitly including the variant×offer model (R2)** | 7.6 + 8.1 |
| 4 | Financier console: ALL 100% | Phase 10 |
| 5 | Arabic/RTL: the LAST step | Phase 13 |
| 6 | Monetization: mix, actor/transaction-dependent, admin-customizable | Phase 11 |
| 7 | Strictly 3P; platform manages the whole catalog; **full admin product form** | Phase 9 |
| 8 | KYC: manual + provider integration, admin-customizable | 12.4 |

### 2.1 New decisions required by the v2 review (blocking their phases — confirm during the Phase 6 window)

**D9 — Variant×offer data model (blocks 7.6 completion / Q3 closure).**
Facts: `ProductVariant` belongs to `Product` (catalog-level price/stock, schema 362–378); `ProductOffer` carries one price + one stock for the whole product per seller (277–303); `OrderItem.variantId` + `offerId` are loose refs that never record which offer supplied which variant on what terms (337–360).
- **Recommended (planned): `OfferVariant`** — per-offer variant rows (`@@unique([offerId, variantId])`) with price override, per-variant stock authority, sku, isActive; `OrderItem.offerVariantId` records the actual (offer, variant) sold; checkout/RFQ validation and attribution run against that row. Catalog-level `ProductVariant` price/stock become presentation/defaults for the product owner's primary listing — the purchase authority is always the (offer, variant) actually sold.
- **Alternative (rejected, documented):** variants as shared catalog choices with every offer covering all variants on identical terms — cannot express the required two-vendor test (different per-variant availability/pricing) and eliminates per-variant vendor price competition, contradicting Q7's 3P model.

**D10 — Seller tenant identity for subscriptions (blocks Phase 11).**
Facts: `ModuleActivation` scopes are PLATFORM | ORG_TYPE | ORG only (1972–1987); sellers are users — a seller subscription today would hang off an implicit User↔Organization mapping that permission checks, limits, and billing never see.
- **Recommended (planned): sellers become first-class organizations** — `orgType: SELLER`, single-owner membership created atomically at seller onboarding; existing sellers backfilled one-org-each; subscription, limits, module activation, and permission checks resolve against the seller org exactly like every other tenant. One tenant concept platform-wide.
- **Alternative (documented): `SELLER` scope in `ModuleActivation` keyed by userId** — lighter migration, but adds a fourth tenant concept that every permission check, limit surface, and billing path must special-case. Rejected for consistency unless the owner prefers it.

Both decisions carry the plan's recommendation as the working assumption; the owner's explicit confirmation is recorded in the worklog before the blocked phase begins.

---

## 3. Sequencing contract (reviewer's buckets + v2-review pre-gates, as hard order)

```
WHAT CAN PROCEED NOW (reviewer v2: "appropriate to begin in order,
                        subject to the staging safeguards")
  6.0   credential rotation + secret cleanup
  6.0b  staging isolation, safe restore, data-protection controls (R1)
  6.1–6.9 RBAC guard repair, classification, MFA + session registry (R8), private docs
  6.10–6.12 negative suites, audit atomicity

BUCKET 2 — BEFORE FURTHER FINANCIAL OR COMMERCE EXPANSION
  Phase 7  Financial integrity & multi-currency
           PRE-GATE (reviewer): the production migration rollout (7.1b)
           exists in the plan and its concurrent-write mechanism is
           staging-tested BEFORE Phase 7 executes its migration.
  Phase 8  Commerce depth (suborders on the 7.7 status split; publish policy)
  Phase 9  3P catalog ownership model + admin catalog 100%
  Phase 10 Financier operations 100% (installments) → Murabaha checkout (10.9)
           PRE-GATE (reviewer): variant/offer model (D9/7.6), payout
           correction semantics (7.4), order-status separation (7.7) are
           landed and tested before Phase 8 builds on them; seller
           subscription scope (D10) decided before Phase 11 begins.

BUCKET 3 — BEFORE CLAIMING PRODUCTION READINESS
  Phase 11 Monetization mix (subscriptions on D10's tenant; entitlement ceilings)
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
4. Repo-wide secret sweep (keys, tokens, WhatsApp session artifacts) → move to env/secret store; rotate what cannot be moved.
5. **Seed-script audit (R1):** no seed may write a known/committed password or a real credential. Seeds run on staging only, take generated credentials from the environment at runtime, and the guard-lint CI job gains a check that fails on hardcoded credentials in any seed/fixtures file — so a future seed run can never silently undo 6.0's rotation.

### 6.0b Staging isolation & **safe** verified recovery (C1, rewritten per R1)
**Nothing in 6.10 (negative/adversarial tests), 6.12, or Phase 7 may touch production data.** A production restore done carelessly is itself an incident: the backup contains real names, phone numbers, password-reset tokens, document references, WhatsApp credentials, and notification destinations. The procedure is ordered and each step is a gate for the next:

1. **Isolate first.** Staging = separate database, separate storage root, separate app credentials, separate messaging credentials (WhatsApp test line distinct from any production line), **no public access** (IP allowlist/VPN), and a named, restricted personnel list. The environment is locked down *before* any production data is copied in.
2. **Kill outbound before anything runs.** Disable outbound email (Resend), WhatsApp senders, payment rails, webhooks, and push integrations at the config level — **before the restored application or any of its jobs is enabled** (job inventory: recurring RFQ sweep, expiry scans, digest jobs, watchdogs). Verify the kills with a canary (an attempt to send must fail) — configuration is not proof.
3. **Restore into the locked environment.** Real production backup → staging; row counts must match.
4. **Sanitize before testers touch it.** Anonymize or remove: personal data (names, phones, emails, addresses), password-reset tokens, OTP codes, active sessions/session tokens, invitation tokens, API credentials/secrets, WhatsApp session artifacts. **Private KYC documents are not copied into staging at all by default** — test fixtures replace them; if a specific test genuinely needs real document shapes, they are redacted/protected and the exception is documented. Sanitization is scripted (re-runnable on every future restore), not manual.
5. **Verify the restore with controlled comparisons, not eyeballs on raw customer rows.** Per-table row counts, aggregate financial totals (SUM/COUNT by currency), and checksums — executed by the restricted operator role; aggregate-only query results are what testers ever see; any individual-row spot check is performed by the operator with anonymized output. Raw customer records are never handed to testers.
6. **Staging-only accounts with generated credentials.** All QA/test logins are re-seeded staging-only accounts whose credentials are generated at seed time from the environment (never committed, never equal to any production credential — see 6.0.5).
7. Re-enable the application against the sanitized data; verify jobs run with outbound still disabled.
8. **Environment-touch documentation** (`docs/environments.md`): every browser test, seed script, QA asset, and cron job listed with the environment it may touch; scripts get an environment guard (refuse production URLs/DB unless `--allow-prod` is passed explicitly).
9. CI conventions: authz/concurrency suites parameterized by `STAGING_BASE_URL`; production is never a target.
- **Gate 6.0b:** staging serves the app end-to-end on sanitized data; a production backup has been restored, sanitized, and verified via controlled comparisons; the outbound canary proves sends fail; the environment map exists; no test asset is documented as production-touching; the sanitization script is committed.

### 6.0a WhatsApp channel — incident closed; production recovery redefined (R-tightening)
The pairing failure ("WhatsApp service unreachable (fetch failed)") was the Baileys mini-service being down with `node_modules` never installed after a fresh checkout. Fixed: deps installed, service started on `:3031`, self-healing watchdog (`scripts/whatsapp-watchdog.sh`), pairing verified end-to-end in the browser (real pairing code issued; evidence `db/qa/e2e/whatsapp-pairing-fixed.png`). The user can add their number from the admin panel today.
**Production recovery policy (changed per review):** the watchdog's runtime install guard is a **dev-environment convenience only**. Production recovery must never install packages at runtime: the service is built from the pinned lockfile in CI, deployed as a known artifact, and the process supervisor restarts that artifact (14.1 lands this; the runbook replaces the install guard). Remaining hardening: credential encryption (6.6.7), staging/production line separation (6.0b), health monitoring + alerting (14.4), rate-limited pairing endpoints (14.3).

### 6.1 Guard repairs + classification-first guard-lint (A2, C7; R-tightening)
1. Delete the three local `requireAdmin()` shadows (`api/admin/slides/route.ts`, `api/admin/slides/[id]/route.ts`, `api/admin/settings/route.ts`); import from `@/server/guards` with explicit keys.
2. `api/quotes/[id]/review/route.ts` — add its explicit permission key.
3. **Guard-lint v2 (`scripts/check-guards.ts`, CI-wired):** a reviewed classification of **every** entry point — not just `route.ts` files — as exactly one of:
   `PUBLIC` · `AUTHENTICATED_USER` · `ORG_SCOPED` · `SELLER_SCOPED` · `FINANCIER_SCOPED` · `PLATFORM_PRIVILEGED`.
   **CI's primary failure condition is the route set itself: an unclassified entry point fails CI.** A missing authorization declaration, a permission key not present in the catalog, an ORG_SCOPED route whose target organization is not explicit and validated, or a local guard shadow each fail CI independently. (The generated matrix document's drift check in 6.9 is a second, redundant control — never the only one.)
4. **Scope of "entry points" widened:** server actions, background/scheduled jobs (recurring RFQ sweep, expiry scans, digest jobs), mini-service HTTP endpoints, and any non-route module performing privileged writes are all classified and linted the same way.
- **Test:** introducing an unclassified route, a bogus permission key, or a shadow guard into a scratch branch makes CI fail.

### 6.2 End the `User.role = ADMIN` bypass — lockout-sensitive migration (A1, C8)
1. Precondition (order matters, all on staging first):
   a. Create and verify the replacement super-admin RBAC assignment (protected `platform.super-admin` role).
   b. Verify MFA enrollment **and recovery** (backup codes + the audited admin-reset path of 6.7.5) for that account.
   c. Test privileged access in staging with the RBAC-only guard active.
2. Deploy the guard change: `requireAdmin`/`requireAdminAny`/`requireModule` stop honoring `role === 'ADMIN'`; `requireAdmin()` without a key **throws** (programmer error).
3. Verify the break-glass path: dedicated break-glass account (protected role, MFA-enforced, login-alerted, audited) — verify login + alert fire.
4. **Documented, time-limited rollback** = re-apply the previous commit; it must not silently restore a broad ADMIN bypass (the rollback doc states exactly what it restores and its expiry).
5. **Full-codebase sweep** of `User.role === 'ADMIN'` / `role: 'ADMIN'` **outside route guards**: services, server actions, scheduled jobs, admin UI conditionals, seeds — every hit either removed (authorization is RBAC-only) or explicitly allow-listed with a written reason. The sweep output is a reviewed artifact.
- **Gate:** staging E2E proves super-admin works via RBAC alone; break-glass alert fires; zero remaining authorization-fact uses of `User.role`.

### 6.3 Module gating: fail closed + per-organization resolution (A6, A3)
1. Unknown module keys at **API authorization** → 403 `MODULE_UNKNOWN` + config-error log (fail closed). Storefront availability renders only from the registry — separate concerns.
2. Every org-scoped API resolves activation against **the specific organization in the request context** (explicit `ctx.orgId`), never the user's org union. User-union resolution remains only for personal navigation.
3. Tests: misspelled key never grants; multi-org user (module ON in org A, OFF in org B) is denied org-B-scoped access, allowed for org A.

### 6.4 Role-assignment integrity (A8)
ORG-scope assignment requires an active `OrganizationMember` row (validated, tested); the invitation flow creates membership + assignment atomically; member removal revokes org-scoped roles in the same transaction; orphan sweep + backfill.

### 6.5 Invitation tokens hashed (A9)
`StaffInvitation.token` → `tokenHash` (SHA-256, same pattern as reset/OTP tokens); raw token shown once; pending plaintext invitations invalidated.

### 6.6 Private document delivery — two namespaces, no public leakage path (A4, C5; R-tightening)
1. **Two storage namespaces:** `public-media` and `private-vault` (separate key roots). **Content-hash dedup never crosses namespaces** — the same bytes may exist twice (once per namespace) with different keys and different access semantics; dedup operates within a namespace only.
2. **Ingest classification:** document type drives namespace; **unknown/unspecced types default to the private vault** (fail-safe). New type→namespace mappings require an explicit, audited allow-list change — never a default-to-public.
3. **Access policy (least privilege):** document owner; org members per the sensitivity matrix (6.8) — a plain member/VIEWER does not get identity/financial docs; platform staff per permission; **financier access is tied to a specific application or review scope** (the request/agreement they are reviewing — not mere financier membership).
4. **Signed URLs:** short-lived (minutes), uncacheable (`Cache-Control: no-store`), HMAC-bound to document + session/user, issued **only after authorization**.
5. **Audit fidelity:** `DOCUMENT_URL_ISSUED` and `DOCUMENT_FILE_RETRIEVED` are **distinct logged events** — issuance and actual retrieval are never conflated.
6. **Invalidation sweep (new):** every public route that can serve media is tested to 404 the vault namespace — **including previously-issued public URLs and CDN/cache layers**. The namespace key-root change makes old public keys dead by construction; the test proves it rather than assuming it. Existing public links are inventoried; any that ever pointed at sensitive documents are invalidated (and the exposure window recorded in the risk register).
7. Migration: existing sensitive uploads moved to the vault namespace (keys rewritten); the old exposure windows remain registered risks (namespace + route change is the fix, not key secrecy).
8. WhatsApp credential encryption: `WhatsAppSender.credsJson` AES-GCM at rest, decrypted only in the service process.

### 6.7 MFA + persistent session registry — security details specified (A5, C6, R8)
1. **TOTP (RFC 6238) enforced** for every account with any platform-scope role or org-scope roles covering role management, payouts, payment capture, KYC/document verification, dispute resolution, module management.
2. **TOTP secrets encrypted at rest** (AES-256-GCM; key from the secret store, not the DB credential; rotation procedure documented). The plaintext secret exists only in memory during enrollment/verification — never stored, never logged.
3. **Backup codes:** generated at enrollment, stored as **salted hashes**, **single-use** (each use flips a used-flag + audit event; replay is rejected). Admin re-issue invalidates the previous set.
4. **Requirement derivation — not self-weakenable:** `mfaRequired(user) = platformPolicy || any effective role carries REQUIRES_MFA`. Effective roles are computed from actual role assignments (RBAC), so adding a privileged role to a user **turns the requirement on** automatically, and the user's own settings page can offer enrollment but never a disable while required. Weakening the platform policy is an audited admin action with a second approver (privileged operation per 6.7.6).
5. **Step-up MFA for sensitive actions:** role grants/changes, payout generation/approval/mark-paid, KYC/document verification, module & policy changes, credential administration — each requires `mfaSatisfiedAt` **within a freshness window (default 5 minutes, configurable)** on the current session. A session that satisfied MFA at login this morning is not sufficient for these mutations.
6. **Locked-out-admin recovery:** a documented, audited runbook — identity verified out-of-band, either a second privileged approver (dual control) or the break-glass account (mandatory alert + audit), rate-limited, and every use reviewed post-hoc. Recovery is an operation with evidence, not a password reset.
7. **Session registry:** `Session` — id, userId, device/UA summary, ipLastSeen, createdAt, lastUsedAt, revokedAt, mfaSatisfiedAt. Every issued session token gets a row; `lastUsedAt` updated (throttled); revocation supports both a single session and all-sessions (`sessionVersion` bump remains the all-kill). The Phase 14 session-management UI is built on this registry — it is honest about what the architecture provides.
8. **Verified-contact matrix (fits phone-first + nullable `User.email`; no accidental universal email prerequisite):**
   - **Buyers:** verified phone (OTP) — unchanged, the phone-first design stands.
   - **Sellers:** at least one verified contact on file (phone **or** email); email is mandatory only when the seller's chosen channel is email.
   - **Platform staff & org staff/admins:** verified **email** required — invitations are email-bound; the invitee must verify that exact email before first privileged login (6.5's hashed invite tokens carry the binding).
   - Making email a universal login prerequisite would be an **intentional product change** requiring an owner decision — it is not a side effect of this plan.
9. Login flow: password → (phone OTP where applicable) → TOTP challenge; privileged guards check `mfaSatisfiedAt` on the session (and its freshness, per 6.7.5).
10. Admin console: per-staff "Require MFA" toggle + platform policy; enrollment wizard (QR); audited admin reset (feeds 6.7.6 recovery).

### 6.8 Least-privilege document matrix inside orgs (A11)
Sensitivity classes (PUBLIC / ORG_INTERNAL / SENSITIVE_IDENTITY / SENSITIVE_FINANCIAL) × role — one tested resolver; negative tests per class.

### 6.9 Route authorization matrix — the reviewed artifact (A2, C7)
`scripts/gen-route-matrix.ts` emits `audit/route-matrix.md`: every entry point (route + the 6.1.4 non-route set) with method, classification bucket, permission key, org-context resolution, and covering negative-test IDs. Generation is CI-checked against the reviewed classification file; drift fails. (This is the redundant second control — CI's primary failure condition is the classification itself, per 6.1.3.)

### 6.10 Negative authorization test suite (A7, C1)
The ten-case suite (cross-tenant reads/writes/approvals/downloads; buyer-vs-approver; immediate revocation; non-member assignment; disabled module at API; unknown key; self-approval; private-doc via public URL + expired signed URL; break-glass alert; privileged-without-MFA) — **executed against staging only**, wired into CI and every phase gate.

### 6.11 Audit atomicity & coverage (A10)
Sensitive changes write their `AuditLog` row **inside the same transaction**; failure-injection test proves rollback (no silent skip); DB-level tamper mitigation documented (restricted DB role blocking UPDATE/DELETE on `AuditLog` where the managed plan allows; else documented operational control).

### Phase 6 acceptance gate (browser + scripted, on staging where adversarial)
- [ ] 6.0b gate passed: staging live on sanitized data; backup restored + verified via controlled comparisons; outbound canary proves sends fail; environment map committed; sanitization script committed.
- [ ] Guard-lint: zero unclassified entry points, zero shadows, zero bare guards, zero unknown permission keys — **including server actions, jobs, and mini-service endpoints**; a scratch-branch probe fails CI.
- [ ] Route matrix generated from the reviewed classification; 100% coverage.
- [ ] Negative suite 10/10 green on staging (screenshots/log evidence).
- [ ] ADMIN bypass removed via the six-step rollout; sweep artifact committed; break-glass verified with alert.
- [ ] MFA: enrollment E2E; TOTP secret verified encrypted at rest (no plaintext in any dump); backup code use + replay-rejection audited; requirement auto-derives from an added privileged role; step-up window enforced on a sensitive action; locked-out-admin recovery executed per runbook with audit trail.
- [ ] Session registry records logins; single-session revoke works; all-sessions revoke works.
- [ ] Private doc: no public path (404) **including legacy URLs/CDN layers**; signed URL issuance + retrieval audited separately; cross-org denial; member-vs-identity-doc denial.
- [ ] Credentials rotated; docs scrubbed; seeds audited credential-free; all sessions invalidated once.
- [ ] Full business regression still green. **Commit + push.**

---

## Phase 7 — Financial Integrity & Multi-Currency · ~2–3 weeks

### 7.1 Staged Float → Decimal migration — the field inventory is the target (A12, C9, R5)
**The count of Float columns is context, not a migration target.** All 60 are classified MONEY / RATE / MEASUREMENT / RATING / GEO — only monetary fields migrate (`rating`, dimensions, geo, spec `validationMin/Max`, routing hints stay Float or move deliberately). The inventory is a reviewed artifact **with a column per monetary field**: table, column, current type, target type, **currency behavior** (fixed / row-context / derived), **rounding rule**, and backfill source of truth.
1. Backup; reconciliation baselines (orders, payments, payouts, commissions, financing fees) — signed report.
2. **Type rules per field, not blanket:** settled totals/fees `DECIMAL(15,2)`; unit prices, commission rates, FX rates, intermediate math `DECIMAL(18,6)`; percentages reviewed for their natural scale. **Currency concepts kept distinct:** transaction · display · settlement · accounting/base — each money row stores what applies.
3. **Per-row historical currency from actual data:** hypotheses reconciled against stored records; ambiguous rows explicitly listed and resolved before backfill; no blanket default.
4. Shadow Decimal columns (reviewed migration, no destructive push) → backfill → **diff under the pre-declared rounding rule:** the diff report must contain *only* differences exactly equal to the declared rounding function — anything else blocks. Rounding is never silently accepted.
5. **FX snapshot preserved on every converted/derived amount:** rate, rate timestamp, source, rounding policy stored with the record.
6. Writers/readers switch; reconcile against baselines; signed report.
7. Flip; documented rollback; then constraints/defaults; Float drops happen **only** per 7.1b.6.

### 7.1b Production migration rollout — the procedure the review required (R5; staging protocol alone is insufficient)
This is the **production** procedure; 7.1's staged protocol runs first on staging (that is its venue). Preconditions: 7.1 green on staging **including the restore drill**; production change window scheduled; **rollback decision criteria written before starting** (what triggers an abort at each step, and who decides).
1. **Tested backup + rollback decision:** a fresh production backup whose restore capability is proven by the 6.0b drill pattern; the go/no-go criteria are documented and signed before step 2.
2. **Versioned, reviewed migration — never `db push` against production.** `prisma migrate` artifacts reviewed as SQL; long-running backfills are batched, resumable, and pause-safe; each migration has a written reversal.
3. **Concurrent writes during backfill — a chosen and tested mechanism, not an assumption:** **dual-write** is the default (application writers update Float + Decimal columns in the same transaction, so the shadow set stays current for writes that land mid-backfill); alternatively a **controlled write-pause window** for cutover-sensitive steps. Whichever is chosen is tested on staging **under production-like concurrent-write load** before production.
4. **Production reconciliation report before cutover:** baseline totals vs backfilled Decimal totals; diffs = declared-rounding-only, per field; signed.
5. **Monitored cutover with a defined rollback point:** readers/writers switch behind a flag; error rates + a reconciliation job watch the new path; the rollback point is the flag flip back (Float remains authoritative-complete because dual-write kept it current); rollback is rehearsed on staging.
6. **Observation period before any Float drop (default 14 days, agreed with the owner):** Float columns are **retained** and continuously reconciled against Decimal on all new writes; the drop is its own reviewed migration executed only after the observation sign-off.

### 7.2 Multi-currency substrate (Q2)
`Currency` + `ExchangeRate` (pair, rate, validFrom, source, admin-managed history) seeded USD/YER/SAR; money rows carry explicit currency codes (per 7.1); configurable accounting base; admin FX console; conversion display component; financing YER-native, retail USD-native; buyer switcher UI in 13.4.

### 7.3 Inventory integrity (A13, C10)
1. Conditional atomic decrements everywhere (`updateMany where stock >= qty`, count-verified, rollback on mismatch); concurrency test: two parallel last-unit checkouts → exactly one order.
2. **Single authoritative stock source for base+variant:** per D9, the purchase-time authority is the **(offer, variant) pair** — `OfferVariant.stock` for offer-backed variant purchases; `ProductVariant.stock` remains the authority only for the product owner's primary listing; the parent `Product.stock` for variant products is a **derived read-model** maintained in the same transaction (with a reconciliation-check job). No path decrements two independent authorities for one unit.
3. **Approval-pending reservations get an expiry policy:** reserved stock for orders awaiting approval is released after a configurable TTL (default 48h) or on rejection — job + test.
4. Restock-on-cancel/approval-reject mirrors decrements conditionally and atomically.

### 7.4 Payout settlement — effective-settlement semantics, immutable ledger (A13, C10, R3)
**The invariant is "no two simultaneously effective settlements per order item" — not "one line ever."** A permanent unique constraint on `orderItemId` would block legitimate later settlements; the ledger must allow history to accumulate while preventing double-payment at any instant.
1. **`PayoutLine` model:** id, payoutId, orderItemId, `linePurpose` (SETTLEMENT | REVERSAL | REISSUE), amount, commission, currency, FX rate/timestamp/source snapshot, `status` (PENDING | EFFECTIVE | REVERSED | CANCELLED), `reversalOfLineId` (nullable self-FK), createdAt, transition timestamps.
2. **DB-enforced effectiveness (MySQL pattern):** a **generated column** `effectiveKey` = `orderItemId` when `status = 'EFFECTIVE'`, else `NULL`; `UNIQUE(effectiveKey)`. At most **one EFFECTIVE settlement line per order item at any moment**; unlimited NULLs = unlimited immutable history. (Modeled read-only in Prisma; the DDL lands in the reviewed migration like 7.8's marker.)
3. **The three reviewer cases, defined:**
   - **(a) Generated, never paid, cancelled:** lines transition PENDING → CANCELLED. Nothing was settled; the entries remain as history; the items are free for a future payout.
   - **(b) Paid, then corrected:** original lines stay; appended REVERSAL lines (negative amounts, `reversalOfLineId` → originals) move the originals EFFECTIVE → REVERSED. The payout's net is the sum; every entry remains explainable; when the reversal lands, the item's effective slot is freed.
   - **(c) Settle again after an operational correction:** once no EFFECTIVE line exists for the item, a new SETTLEMENT/REISSUE line **may** become EFFECTIVE (e.g., payout reissued after a banking failure). This is allowed by design — the unique key blocks only *simultaneous* double-settlement.
4. **Immutability:** amount/commission/currency/snapshot fields are never UPDATEd after insert; only status transitions and appended reversal/reissue entries; all transitions run in the same transaction as the payout-level state change.
5. Mark-paid re-guarded (PENDING → PAID only, idempotent, single-flight via conditional update).
6. **Tests:** cases (a), (b), (c) each E2E with ledger explainability asserted; two parallel generations for one seller → one payout or clean rejection; a second EFFECTIVE line for an item with one already EFFECTIVE is **rejected by the database**; reversal-then-reissue round-trip preserves the full history.

### 7.5 Recurring RFQ durability (A15)
`RecurringRfqRun` with unique idempotency key (`scheduleId:dueAt`); claim + RFQ creation in one transaction; FAILED runs retried (bounded) + alerted; crash-injection test between claim and creation → recovery without loss or duplication.

### 7.6 Offer attribution end-to-end — including variants (A14, Q3, D9, R2)
`QuoteLine.offerId` (snapshot ref); conversion sets `OrderItem.sellerId` from the **offer's** seller; **plus the D9 model:** `OfferVariant` (per-offer variant price/stock/sku/isActive, `@@unique([offerId, variantId])`) and `OrderItem.offerVariantId` — the purchased (offer, variant) pair is recorded, validated, priced, and stock-checked against that row at cart/checkout/RFQ-quote time. Migration: existing offers on variant products are backfilled OfferVariant rows from catalog defaults (non-destructive, documented).
**The Q3 completion test (reviewer's exact demand):** the full chain (`ProductOffer → OfferVariant → RfqLine/QuoteLine → OrderItem → PayoutLine`) with **two vendors selling the same catalog product, one or more variants with different availability and different prices between them** — asserting authoritative seller/offer/variant/price/currency/quantity/stock at every hop, including the vendor who is out of stock on a variant being unbuyable on that variant. Green (plus the R3 payout tests) = Q3 closed. *Q3 is not complete without this test.*

### 7.7 Order status — financial and fulfillment dimensions split (A16, R6)
Today one `Order.status` (PENDING_PAYMENT | PENDING_APPROVAL | PAID | PROCESSING | SHIPPED | DELIVERED | CANCELLED) serves payment state and fulfillment simultaneously — but an order can be funded while one seller shipped and another didn't, and for Murabaha the financier paying the seller does not settle the buyer's debt.
1. **Two dimensions on `Order`:**
   - `paymentStatus` (financial): `AWAITING_PAYMENT` · `PAID` · `FUNDED` · `PARTIALLY_REFUNDED` · `REFUNDED` · `OUTSTANDING` (disputed/uncollected balance).
   - `fulfillmentStatus` (derived roll-up): `UNFULFILLED` · `PARTIALLY_FULFILLED` · `FULFILLED` · `CANCELLED` (+ `PARTIALLY_CANCELLED` when suborders diverge) — derived from the `OrderFulfillment` suborder states (8.1) by an explicit, tested derivation rule.
2. **Server-side transition maps for both dimensions** (illegal transition → 400 + audit). The legacy single `status` is retained read-only during migration and removed after the observation discipline of 7.1b — never a silent repurpose.
3. **Financed orders never overload `PAID`:** financier disbursement to sellers sets `paymentStatus = FUNDED` — which **never** implies the buyer's obligation is settled. The buyer's debt lives in the financing domain as its own state machine (`ACTIVE → PAID_OFF / DEFAULTED / RESTRUCTURED / WRITTEN_OFF`, per 10.8–10.9) with `InstallmentPayment` as its ledger. "Seller received funds" and "buyer owes nothing" are **distinct events with distinct records**.
4. **One home per money flow:** `Payment` (buyer payment) · `Payout/PayoutLine` (seller settlement) · `InstallmentPayment` (buyer debt servicing) · `FinancingFee` (financier fees). No status field substitutes for a ledger.
5. **Legacy mapping table (backfill):** `PENDING_PAYMENT`→(AWAITING_PAYMENT, UNFULFILLED); `PENDING_APPROVAL`→ approval reads from `ApprovalRequest`, both dimensions pending; `PAID`→(PAID, fulfillment from suborder evidence); `PROCESSING`/`SHIPPED`/`DELIVERED`→ payment unchanged + fulfillment derived from suborders; `CANCELLED`→(CANCELLED fulfillment, payment per refund evidence). Backfill verified row-by-row — **zero unmapped rows** or the migration blocks.

### 7.8 Accreditation renewal — DB-derived active key, complete transition rules (A17, C2, R7)
The current schema has `@@unique([serviceId, organizationId])` (line 1636) — retaining prior requests while creating renewals is impossible under it. The v2 active-marker was application-set; a marker that can disagree with status is not an integrity control. Explicit schema change:
1. **Database-generated active key:** generated column `activeKey` = 1 when `status ∈ ACTIVE_SET`, else `NULL`; `UNIQUE(serviceId, organizationId, activeKey)`. Multiple NULLs → unlimited history; at most one live request per program/org; **the marker cannot disagree with status because the database derives it** — an application bug cannot create a second active row. (DDL in the reviewed migration; Prisma models it read-only.)
2. **ACTIVE_SET — exhaustive, from the schema's actual enum (line 1618):** `DRAFT`, `SUBMITTED`, `UNDER_PLATFORM_REVIEW`, `RETURNED_FOR_COMPLETION`, `FORWARDED_TO_FINANCIER`, `UNDER_FINANCIER_REVIEW`, `ACCREDITED`. Terminal/non-blocking: `REJECTED`, `EXPIRED`, `REVOKED`, `CANCELLED`, + new `ARCHIVED` (superseded by renewal — evidence frozen, read-only). **DRAFT and RETURNED_FOR_COMPLETION block a second application by design** — an in-flight draft occupies the slot (documented rule).
3. **Every entry/exit transition of ACTIVE_SET is tabled and tested:** DRAFT→SUBMITTED (stays active) · …→REJECTED/EXPIRED/REVOKED/CANCELLED (exits) · ACCREDITED (stays active until a renewal archives it). No transition outside the table is legal.
4. `supersedesId` self-relation + `ACCREDITATION_RENEWED` audit chain; archive + create + audit **atomically**.
5. **Tests:** renewal created while the prior request **and its checklist evidence remain queryable**; **the concurrent-renewal race — two parallel submissions → exactly one becomes active, the loser is rejected by the database** (not by an application check); every transition-rule row exercised.
- *Do not mark accreditation renewal complete until the generated-key constraint + transition table + race test land (completion-claims rule).*

### Phase 7 acceptance gate
- [ ] Field inventory reviewed — every monetary column typed/currency'd/rounded; only monetary fields migrated; diffs = declared-rounding-only, else blocked.
- [ ] **7.1b production rollout procedure written, its concurrent-write mechanism staging-tested under production-like load; rollback criteria + observation period agreed with the owner.**
- [ ] Staging restore drill re-run (migration rollback rehearsal) — signed.
- [ ] Concurrency tests (stock, payout) + crash recovery + **payout cases (a)/(b)/(c)** + **two-vendor variant attribution test** green — on staging.
- [ ] **Order-status split: both dimensions live, transition maps enforced, financed-order FUNDED≠buyer-clear mapping verified, legacy backfill zero-unmapped.**
- [ ] Accreditation: generated-key race test green; renewal-with-history green; transition table fully exercised.
- [ ] `answer4audit-v2.md` evidence addendum for every finding this phase closes → expert re-review (A19).
- [ ] Full regression + **commit + push.**

---

## Phase 8 — Commerce Depth · ~2–3 weeks (Murabaha checkout moved out — C4; builds on 7.7/7.4)

### 8.1 Per-seller fulfillment suborders — the fulfillment dimension's source of truth
`OrderFulfillment` per distinct seller (status, carrier, tracking, per-item links, events); the order-level `fulfillmentStatus` is the **derived roll-up** (7.7.2) with the derivation rule tested (all suborders FULFILLED → FULFILLED; mixed → PARTIALLY_FULFILLED; cancellation mix → PARTIALLY_CANCELLED/CANCELLED); seller ships per suborder; buyer tracking grouped per seller; partial cancellation per seller group (feeding 7.4's lines); RFQ conversions derive suborders from per-item `sellerId`/`offerVariantId` (trustworthy after 7.6).

### 8.2 Buyer depth
Spec-matrix compare, saved addresses, reorder, guest checkout (email/phone + post-hoc account claim), product Q&A with moderation.

### 8.3 Seller depth
Onboarding checklist, store settings (logo/banner/policies/payout account), draft autosave/recovery, CSV import polish, low-stock alerts, seller coupons, shipping zones, analytics depth.

### 8.4 Checkout financing (Murabaha) — **moved to Phase 10.9** (C4: depends on financier disbursement operations that complete in Phase 10; see the legal/Sharia precondition there).

### 8.5 Unverified-seller publishing policy (Q1, C12)
1. Platform setting `publishPolicyForUnverified`, **default `ALLOW`** (owner decision).
2. Per-seller override (`ALLOW | REVIEW | BLOCK`) + **bulk action**.
3. **Explicit risk acceptance recorded** (risk register): allowing unverified sellers to publish is a product choice, not a security control — documented fraud/trust risk with mitigations: visible verification status on storefronts/products, seller limits (listing caps for unverified), payout holds/thresholds for unverified sellers, enhanced review for higher-risk categories, and the admin's ability to flip the policy at any time.
4. **Hard rule:** suspended/inactive sellers are always blocked from publishing — enforced and tested at **every publishing path**: product create, product edit/republish, **offer create/update**, CSV bulk import, and any bulk action. The negative suite gains these cases.
- **Gate:** policy default verified; per-seller + bulk flips work; suspended-seller block proven at every path (API-level evidence).

### Phase 8 acceptance gate
- [ ] Mixed-seller order ships per suborder; grouped tracking; roll-up derivation correct (incl. mixed cancellation).
- [ ] Guest checkout, reorder, Q&A round-trip; seller checklist/settings/coupons/shipping/alerts E2E.
- [ ] Publish policy + risk acceptance artifact; suspended-block tests at all publishing paths green.
- [ ] Regression + **commit + push.**

---

## Phase 9 — 3P Catalog Ownership Model + Admin Product Management 100% · ~2 weeks (Q7, C3; R-tightening)

### 9.1 Data model first — resolve the system-seller contradiction (C3)
Today curated listings are owned by a "Vendora Catalog" **user** in `Product.sellerId` (required, primary-seller semantics, schema line 201) — a system account in that field risks vendor attribution, checkout, and payout eligibility. Change before the form:
1. `Product.sellerId` becomes **nullable**: `null` = platform-curated catalog record (no primary seller, not purchasable as such); existing curated rows migrate `sellerId → null` with ownership moved to `curatedById` (admin actor) for provenance.
2. **Purchasability rule:** a curated product is buyable **only through a real vendor's ACTIVE `ProductOffer`** — checkout requires an offer when `sellerId` is null. A curated product with no vendor offer is display-only (directory/aggregator semantics).
3. **No legacy fallback (reviewer's explicit demand):** a curated item without an active vendor offer must **never fall back to the product's legacy price or stock** — the fallback paths are removed, and the negative test proves the API returns 400 + the UI shows sourcing messaging rather than a purchasable price.
4. **Non-null-assumption audit (reviewer's list):** every path that today assumes `Product.sellerId` is non-null is swept and fixed — **product display, pricing resolver, RFQ, reviews, orders, reports, seller analytics** — each with a null-case test.
5. The Vendora Catalog system account is retired from `sellerId` semantics entirely; payout/settlement queries exclude offer-less items by construction (they cannot exist as order items).
6. Storefront rendering: `sellerId: null` renders the offers list / "available from these vendors" instead of a primary seller.

### 9.2 Full admin product form (the owner's repeated ask)
Re-scope the seller 7-tab form for admin use (media library uploads — not URL paste, structured specs, variant editor, shipping, SEO, GTIN/MPN/brand, category); "Add Product" prominent in Catalog + Products panels; creates curated (`sellerId: null`) records.

### 9.3 Full CRUD + moderation with teeth
Edit every field; archive/restore; guarded delete (offers attached → archive-only with reason); bulk actions; per-edit audit diff; admin edit of seller listings via full form with mandatory reason + seller notification + audit diff.

### 9.4 Publication agreement management
Versioned templates; per-org-type defaults; per-product requirement toggle; consent records searchable/exportable.

### Phase 9 acceptance gate
- [ ] C3 negative test green (curated w/o offer unpurchasable — **no legacy price/stock fallback**, API 400 + UI messaging; no Vendora-sold attribution anywhere).
- [ ] **Null-`sellerId` audit complete: display, pricing resolver, RFQ, reviews, orders, reports, seller analytics each handle the curated case with a test.**
- [ ] Admin creates product with media uploads + specs + variants → publishes → buyer buys via a vendor offer.
- [ ] Admin edits seller listing → notification + audit diff; guarded delete; agreement v2 re-captures consent.
- [ ] Regression + **commit + push.**

---

## Phase 10 — Financier Operations 100% · ~2 weeks (Q4, C4; R-tightening)

### 10.1–10.7 (carried from v1, amended)
Portfolio analytics (approval rate, disbursed volume, aging/NPL 30/60/90, per-branch/program, CSV export); risk scoring (configurable, decision-support, auto-decision only if explicitly enabled); Sharia artifact management (scholar certifications with expiry/reminders, versioned contract templates); **e-signature per the expanded spec below**; disbursement operations (queue → confirm with payment rail reference + FX snapshot → installment tracking); collections & statements; branch operations (branch-scoped inboxes, underwriting limit matrix); public institution polish.

**E-signature evidence package (R-tightening):** a signature image + content hash is *evidence*, not proof of execution. Each execution records: **signer identity binding** (authenticated session + step-up MFA at signing per 6.7.5), **explicit consent text + acceptance event**, **exact document version** (template version + content hash — hash mismatch fails closed: no execution), **server timestamp** (+ trusted time source noted for legal review), IP/device, and the complete audit trail. The package design is reviewed with legal (14.5 item 6) before launch.

### 10.8 Installment payment model — explicit (C4: schema is track-only today)
`InstallmentPayment` records how payments are **received** (channel, reference, receivedAt, amount, currency), **allocated** (which installments, in what order — with partial-allocation and over/under-payment rules), **reversed** (reversal entries referencing originals — never rewrites), and **reconciled** (daily batch vs. rail exports where available; discrepancy queue). Aging/NPL and late fees are computed from allocated state, not from track-only rows. This is the buyer-obligation ledger referenced by 7.7.3.

### 10.9 Islamic finance at checkout (Murabaha) — AFTER 10.1–10.8, gated (C4)
**Hard preconditions before implementation:**
1. Minimum lender workflow complete and E2E-verified: request → review → offer → agreement execution (per the 10.1 evidence package) → disbursement confirmation → installment collection.
2. **Qualified legal + Sharia review of the actual transaction sequence** — who purchases the goods, when ownership and risk transfer, how the resale to the buyer occurs, what evidence is retained, and how cancellation or default is handled — documented and signed off. The implementation follows the reviewed sequence; it does not invent one.
3. **Late-fee policy specifically reviewed** (a configurable cap is not evidence of permissibility) — policy text, cap, and calculation reviewed with the same sign-off.
Then: checkout "Finance it (Murabaha)" method → pre-qualification (KYC L2+ gate) → offer pick → agreement sign → financed order state machine (**on the 7.7 split**: `FUNDED` on disbursement; buyer obligation tracked on the financing state machine, never conflated) → installment schedule to the buyer; clean fallback to standard payment on pre-qualification failure/expiry. *Not marked complete until its state machine is written down and tested (completion-claims rule).*

### Phase 10 acceptance gate
- [ ] Full lender lifecycle E2E incl. installment receive/allocate/reverse/reconcile; statement correctness.
- [ ] Late installment → NPL bucket + reviewed late-fee application.
- [ ] Branch scoping + underwriter limits enforced.
- [ ] E-signature evidence package complete on a test execution (identity binding, consent, version+hash, timestamp, audit trail); hash-mismatch fails closed.
- [ ] **Murabaha preconditions documented** (legal/Sharia sign-off artifacts) before any checkout code; then the financed-checkout E2E green — with FUNDED ≠ buyer-obligation-cleared asserted.
- [ ] Regression + **commit + push.**

---

## Phase 11 — Monetization Mix · ~2 weeks (Q6, C11, R4)

### 11.1 Fee engine — immutable fee assessment (R-tightening)
`FeeRule` (event × actor type × scope × dimension, precedence, effective dating) + simulator; current 10% commission migrates to a platform rule (zero behavior change day one). Every applied fee writes an **immutable `FeeAssessment`**: idempotency key (event-scoped, e.g., order-item + fee-event), applied-rule snapshot (rule id + version + parameters at application time), currency + FX snapshot, calculation inputs (base amount, quantity, dimensions), resulting amount — and **reversals/corrections are separate appended rows, never rewrites**. The revenue console reconciles against this ledger to the cent (Decimal).

### 11.2 Seller subscriptions — a defined tenant first, then the ceiling (C11, R4, D10)
1. **Tenant identity decided before build (D10):** sellers are first-class organizations (recommended) or a SELLER scope is added — either way, **the subscription has an explicit tenant to attach to**, and module activation, permission checks, limits, and billing all resolve against that same identity. No implicit User↔Organization mapping. *(Owner confirmation recorded in the worklog before this phase begins; the recommendation is the working assumption.)*
2. `SubscriptionPlan` (module bundle + limits) + `SellerSubscription` (status, renewAt, grace, downgrade state) attached to the D10 tenant.
3. **Entitlement ceiling semantics:** a subscription is a **ceiling** — organization/org-type module activations can only enable what the subscription entitles; they can never exceed it. Resolution for paid modules: entitlement = `subscriptionAllows AND (ORG override OR ORG_TYPE default OR PLATFORM default)`. An ORG flip can turn a paid module **off**; it cannot turn it **on** beyond the subscription.
4. **Renewal-failure behavior:** grace period (configurable, default 7 days, read-only warnings) → downgrade (paid modules off, limits re-clamped; data preserved read-only where applicable).
5. **Tests:** an unpaid or downgraded subscription cannot retain paid entitlements through an organization override; grace/downgrade transitions verified; the tenant resolution is exercised for every limit surface. *Not marked complete until the tenant model + ceiling + tests are explicit (completion-claims rule).*

### 11.3 Financier monetization + commission customization + revenue console (carried from v1, on the same rules — reconciling against 11.1's FeeAssessment ledger).

### Phase 11 acceptance gate
- [ ] Simulator matches fees actually applied across order/financing/subscription flows (FeeAssessment idempotency + snapshot verified).
- [ ] D10 tenant resolution active for subscriptions, limits, and module gating; ceiling semantics proven by tests (unpaid/downgraded + org override attempt).
- [ ] Revenue dashboard reconciles with the fee ledger to the cent (Decimal).
- [ ] Regression + **commit + push.**

---

## Phase 12 — Directory, Discovery, Trust + KYC Provider · ~1.5–2 weeks (Q8, R-tightening)
Carried from v1: brands directory, trending/bestsellers, services directory; spec-attribute facets, typo-tolerant search, normalized comparison; trust counters; PWA/newsletter stretch.
**KYC provider spec (tightened):**
- `KycProvider` abstraction (MANUAL | PROVIDER | PROVIDER_THEN_MANUAL per document type, admin-customizable, mock-provider fallback test).
- **Failure semantics: a provider error/timeout leaves the case PENDING for manual review — never auto-approval** (tested: provider returns 500 → case pending, flagged for the manual queue).
- **Webhooks:** HMAC-signed, replay-protected (timestamp + nonce), event-id idempotency (duplicate delivery is a no-op), unauthenticated calls rejected 401 + audited.
- **Data minimization & retention:** only fields required per document type are transmitted; provider-processed documents land in the **private vault** (6.6 semantics — financier/platform scope only); retention schedule + deletion job documented; processing-location/cross-border note prepared for the 14.5 legal review.

---

## Phase 13 — Arabic / RTL / i18n — THE LAST FEATURE PHASE · ~2 weeks (Q5)
Carried from v1 unchanged: locale routing + persisted toggle, RTL mirroring, Arabic content (profiles, program copy, chrome, bilingual emails), buyer currency switcher on the 7.2 substrate, AR buyer journey at 390px acceptance.

---

## Phase 14 — Production Hardening & Launch · expanded final gate (C13, A19)

### 14.1–14.3 (carried, amended)
Email-verification enforcement **per the 6.7.8 contact matrix** (strict verified email for platform/org staff; sellers: verified contact on file; buyers phone-first; no accidental universal email prerequisite); rate limiting expansion + password policy + privileged-account rotation; ops (automated backups **with the recurring restore drill proven in 6.0b** re-verified on schedule; uptime monitoring incl. the WhatsApp mini-service health; staging/production split CI gates: lint + type + guard-lint + classification-sync + auth-negative suite + business regression). **WhatsApp production deployment = CI-built artifact from the pinned lockfile + supervisor restart (6.0a) — runtime package installation removed from every production runbook.**

### 14.4 Monitoring & incident ownership (expanded)
Alerting with named owners: downtime, OOM/restart events, migration jobs, pairing-service outages, reconciliation discrepancies, failed audit writes. On-call/ownership documented even if informal.

### 14.5 Launch gate — the full checklist (C13)
1. **Dependency & secret scanning** (SBOM + secret sweep, zero known-vulnerable pins unaccepted).
2. **Security testing of authorization and file access** — the negative suite plus a targeted private-document penetration pass (staging), including legacy-URL/CDN paths.
3. **Load & concurrency testing** for checkout, settlement, and the hot APIs (rates defined per endpoint; results recorded).
4. **Restore & recovery verification** — re-run of the 6.0b drill (with R1's safeguards) on the then-current production backup.
5. **Monitoring, alerting, incident ownership** live.
6. **Legal/privacy review** for KYC processing, agreements, communications, and financing flows — the 10.9 Sharia sign-off, the 10.1 e-signature evidence package, the 12.4 retention/processing-location notes, plus data-subject requests, retention schedule, and cross-border notes as applicable.
7. **Production deployment + rollback rehearsal** — a full deploy executed and rolled back on staging with the documented procedure; **the 7.1b production-migration procedure rehearsed end-to-end**.
8. **Three consecutive green full-regression runs** (business + authorization-negative + financial-integrity).
9. **Completion-claims audit (reviewer's final assessment):** accreditation renewal, payout settlement, seller subscriptions, and Murabaha checkout each verified to have **explicit data models + explicit concurrency/state-transition rules + passing tests** — anything less is re-labeled as partial with its gap registered.
10. **Residual-risk review:** every open item is either closed with evidence or **explicitly accepted in writing by the owner** (registered risk, mitigation, review date). The gate does not force the label "100% ready" while material unaccepted risk remains.
11. Final **commit + push + tag**; `answer4audit-v2.md` updated with final evidence for expert re-run (A19).

---

# PART II — CROSS-CUTTING RULES

## Regression checklist (after EVERY phase)
**Business:** the mergedplan §7 baseline (register → coupon order → tracking; RFQ full loop; financing wizard → gate → offer → agreement; admin panels with count consistency; team invite/remove/role-change; 60-min soak).
**Authorization-negative (staging):** the ten cases of 6.10, plus the 8.5 publishing-path blocks.
**Financial-integrity (staging):** last-unit concurrency (incl. per-OfferVariant); payout concurrency + **cases (a)/(b)/(c) + double-EFFECTIVE rejection**; recurring crash recovery; offer-attribution trace (**two-vendor variant test**); migration diffs = declared-rounding-only; **order-status dimension transitions + legacy mapping**.
**WhatsApp channel health:** pairing start returns a code; watchdog keeps the service alive across a kill.

## Deferrals (unchanged in substance; reviewer-concordant)
ABAC/resource-level permissions; unifying org-member roles with RBAC; real PSP integration (substrate designed, lands with the commercial project); DB-level scope-sentinel redesign; role soft-lifecycle columns; full AR staff console.

## Risk register (live — updated in v3)
| Risk | Status / mitigation |
|---|---|
| WhatsApp mini-service availability | Fixed (`b1681f1`) — watchdog supervisor; **production recovery redefined to CI-built artifact + supervisor restart (no runtime installs)**; monitoring/alerting lands 14.4. |
| Sensitive docs previously served from public media | Namespace + route fix in 6.6 incl. the legacy-URL/CDN invalidation sweep; exposure window registered; credential rotation in 6.0 covers linked risks. |
| **Staging restore exposing production PII / firing outbound (R1)** | 6.0b's ordered procedure (isolate → outbound kill → restore → sanitize → controlled verification); scripted sanitization; staging-only generated-credential seeds; gate blocks all later phases. |
| Money migration | Staged protocol (7.1) **+ production rollout procedure (7.1b)**: versioned migrations, tested dual-write, reconciliation, monitored cutover, retained Float through observation. |
| Payout double-settlement or un-correctable history | 7.4 effective-settlement semantics: DB-generated effectiveKey unique, immutable lines, reversal/reissue entries; cases (a)/(b)/(c) tested. |
| Variant/offer attribution gaps | D9 `OfferVariant` model + `OrderItem.offerVariantId` + two-vendor test (7.6); Q3 not claimable without it. |
| Order status conflation (esp. Murabaha) | 7.7 two-dimension split + distinct buyer-obligation state machine; FUNDED never means buyer-clear. |
| Accreditation race / marker drift | 7.8 DB-generated active key + complete transition table + concurrency race test. |
| Seller subscriptions without a tenant | D10 decision required before Phase 11; recommendation = seller organizations. |
| Unverified sellers trading (owner's ALLOW default) | Explicit risk acceptance + mitigations in 8.5 (register entry). |
| Murabaha implementation before legal/Sharia review | Blocked by 10.9 preconditions (sign-off artifacts required). |
| Subscription entitlement escalation via org override | Ceiling semantics + tests in 11.2 (on the D10 tenant). |
| E-signature legal validity | 10.1 evidence package + 14.5 item 6 legal review; hash mismatch fails closed. |
| KYC provider failure auto-approving | 12.4: failure ⇒ PENDING + manual queue (tested); webhook auth + idempotency. |
| RESEND_API_KEY lost | Owner action before launch (14.5 checklist). |
| OOM under parallel compiles | Restart procedure; staging/prod split in 14.1 is the durable fix. |

## Revision history
- **v3 (this document):** the v2 review's 8 required amendments incorporated — safe staging restore procedure with sanitization + outbound kill + controlled verification (6.0b); `OfferVariant` model + two-vendor test + Decision D9 (7.6); payout effective-settlement semantics with DB-generated unique + cases (a)/(b)/(c) (7.4); seller tenant Decision D10 (11.2); production migration rollout procedure + per-column inventory precision (7.1/7.1b); order financial/fulfillment status split + financed-order semantics + legacy mapping (7.7); DB-generated accreditation active key + complete ACTIVE_SET + transition table + race test (7.8); MFA/session security details + verified-contact matrix (6.7). Tightened: curated-product no-fallback + null-assumption audit (9.1); private-vault legacy-URL/CDN invalidation (6.6); CI fails on unclassified entry points (6.1); WhatsApp production artifact policy (6.0a/14.1); e-signature evidence package (10.1); immutable FeeAssessment (11.1); KYC provider failure/webhook/retention spec (12.4); completion-claims audit in the launch gate (14.5.9).
- **v2:** reviewer's 13 corrections incorporated (C1–C13) + WhatsApp incident fixed and documented (superseded by v3).
- **v1:** initial replan from the expert assessment + owner decisions (superseded).

---

*On approval, execution begins at Phase 6.0 (credential rotation) → 6.0b (staging isolation & safe verified restore) → the RBAC closure items in order — every gate browser-verified, every green gate committed and pushed. D9/D10 are presented to the owner during the Phase 6 window; their phases block on the recorded decision.*
