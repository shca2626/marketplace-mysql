# Vendora — lastplan.md · v5 · The Final Production Plan (Phase 6 → Launch)

> **What this is:** the complete replan of every remaining task from Phase 6 to production launch.
> It supersedes `mergedplan.md` §6 (Phases 6–8 there), **lastplan.md v1–v4**.
>
> **Inputs (seven, merged):**
> 1. *Review of `lastplan.md v4`* (the reviewer's verdict: **"approve beginning the credential and staging work, but not yet the plan as final; Phase 7's financial design not closed"** — 7 remaining blockers S1–S7 + 4 hardening items H1–H4, all incorporated and traced in §0).
> 2. *Review of `lastplan.md v3`* (B1–B8 + M1–M3, incorporated in v4 and retained here).
> 3. *Review of `lastplan.md v2`* (R1–R8, incorporated in v3 and retained here).
> 4. *Review of `lastplan.md`* (v1 — C1–C13, incorporated in v2 and retained here).
> 5. *Assessment of `answer4audit.md`* (external expert — "partially addressed; not audit-closed"; P0/P1/P2 RBAC priorities; staged financial-migration protocol).
> 6. The owner's eight binding decisions on the open questions (§2) **plus two decisions this plan requests** (D9, D10 — §2.1; D10's three-concept identity model is now specified per S1/S2, and its **buyer-duality sub-decision is PROPOSED, pending explicit owner confirmation** per S3).
> 7. The actual codebase, re-verified for this plan (schema line numbers cited where they matter).
>
> **Verified starting point:** Phases 0–5 complete and pushed; lastplan v4 at `c7eefb6` on `origin/main`.
>
> **Prime directive (owner):** complete the **main and core RBAC first, 100%** — then the rest in dependency order until production-ready.
>
> **Standing discipline (unchanged):**
> - Every phase ends with a gate verified in the browser (agent-browser), evidence captured **per the evidence standard below**.
> - After every green gate: **commit + push immediately** (standing owner rule).
> - A failed gate blocks the next phase — no exceptions.
> - Adversarial tests, concurrency tests, and file-access tests run **against staging only, never production** (C1).
> - No destructive schema work on financial data; all migrations follow the staged protocol (§7.1) **and the production rollout procedure (§7.1b)** — versioned, reviewed migrations; **never `db push`** against production, and given the single-production-database topology, staging verification and written rollback plans are the primary safety net (H3).
> - **Completion-claims rule:** accreditation renewal, payout settlement, seller subscriptions, and Murabaha checkout are **not marked complete** until their data models **and** their concurrency/state-transition rules are explicit **and tested**. A feature whose state machine is not written down is not done. **The affected phases close only with migration results and concurrency tests — never with plan text alone** (v4-review final assessment).
> - **Evidence standard (M3):** a gate artifact records the **tested commit hash, environment, exact command or procedure, result, and any excluded cases with reasons**. A commit hash, screenshot path, or assertion that a test passed is a *claim*, not a result. **Committed evidence must never contain live secrets, pairing codes, or customer data.**
> - The final gate permits **explicitly approved residual risks** — never the label "100% ready" while material unaccepted risk remains (C13).

---

## 0. Reviewer's v4 verdict → what changed in v5

The reviewer approved beginning credential and staging work, and found the major structural repairs sound (safe staging procedure, production migration sequence, seller-organization planning, refund records, private-vault proxy, payout claim/ledger split, recurring two-transaction design). The remaining blockers concern the seller migration's semantics, payout history coverage, and job-recovery fencing:

| # | Blocking issue (reviewer) | Resolution in v5 |
|---|---|---|
| S1 | V4 misidentifies existing `sellerId` fields as "actor snapshots" — they are **seller identity** (`ProductOffer.sellerId` = the seller offering; `OrderItem.sellerId` = the seller attributed the sale; `Payout.sellerId` = the seller receiving payment); relabeling them changes meaning and makes history ambiguous | **§2.1 D10 + 7.0 rewritten with the three-concept identity model:** `sellerOrgId` (authoritative vendor tenant) · existing `sellerId` columns (retained **as historical seller-account identity — meaning preserved, not relabeled**) · actual actors (`createdById`/`processedById`/`executedById` — `Quote.createdById` already exists as the issuing actor, schema line 614) |
| S2 | The D10 mapping omits seller-owned `Product` records, `Quote.sellerId` authorization, primary-product purchase/RFQ paths, analytics/coupons/policies/moderation — and needs one authoritative attribution source | **7.0 now carries a field-by-field mapping table** (org-ref vs historical-account-ref vs normalized-offer, per record type) + **normalized primary offers**: every seller-owned product's primary listing is backfilled as an ACTIVE `ProductOffer` (price/stock from the product), making **the offer layer the single authoritative source of seller attribution for commerce** |
| S3 | "Buyer duality = yes" was labeled "decided" but the owner never decided it; and unverified sellers must be distinguishable from suspended ones — `Organization.status = PENDING_VERIFICATION` must not accidentally block the owner's ALLOW policy | **§2.1 D10 rewritten:** buyer duality is **PROPOSED, pending explicit owner confirmation** (with its sub-questions spelled out: buyer membership + status prerequisites; participation in buyer approvals and financing); **verification state moves out of `Organization.status`** onto a dedicated `SellerProfile.verificationState` — org `status` stays operational (ACTIVE/SUSPENDED/…), the 8.5 publish policy consults the verification state, and suspension remains the operational hard block |
| S4 | No legacy payout backfill (old settled `OrderItem.payoutId` links never become `PayoutLine`s — unprotected by the claim system and absent from the ledger); `Payout.status = PAID` doesn't protect against retries around an actual bank transfer; EFFECTIVE timing undefined | **7.4 expanded:** legacy `PayoutLine` backfill with reconciliation against payout totals + an unreconstructable-cases report; `Payout` gains `transferReference` + unique idempotency key + `executedById`/`executedAt` (retries reuse the key; duplicate references detected); **lines become EFFECTIVE only on the confirmed-transfer event (operator-verified reference at mark-paid)** — the DB claim prevents duplicate internal claims, the reference + reconciliation discipline handles external exactly-once (honestly acknowledged as an operational control, not a database guarantee) |
| S5 | The recurring-run lease isn't fenced — a stale worker whose lease expired could still complete Tx 2 after another worker reclaimed the run | **7.5 expanded:** per-claim **fencing token** (`leaseToken` random per claim, rewritten on reclaim); Tx 2's update is conditional on `id AND leaseToken AND status = CLAIMED` with affected-rows verification; **the A/B/A test** (A's lease expires, B reclaims, A's late Tx 2 aborts; exactly one RFQ) |
| S6 | Legacy fulfillment backfill underspecified — existing orders have no per-seller fulfillment rows, and old global statuses can't prove per-seller state | **7.7 expanded:** documented initialization mapping (legacy global status → per-seller `OrderFulfillment` state, uniformly per seller group) + the limitation stated (old data cannot prove partial per-seller fulfillment) + mixed-signal orders routed through the **same legacy-ambiguity report with recorded decisions** — historical per-seller evidence is never implied where none exists |
| S7 | Refunds are order-level only; no distinction between requested/approved, owed-but-not-paid, and actually completed; no item-level allocation or effects on payouts/commissions | **7.7.3 rebuilt:** refund **obligation vs execution** state model (`REQUESTED` → `APPROVED` (obligation) → `COMPLETED` only with payment reference or manual-payment evidence / `DENIED`/`CANCELLED`; corrections as appended reversals) + `RefundAllocation` rows linking refunds to **order items / fulfillment groups** with buckets for items, shipping, discounts, taxes + defined effects: payout claim releases + `PayoutLine` reversals for cancelled items, commission reversal entries, and `paymentStatus` refund states settable **only from COMPLETED refund evidence** |

Hardening items:

| # | Item | Landing |
|---|---|---|
| H1 | Offer-variant terms must never be reconstructed from a live offer after quote issuance — the snapshot is the fact | 7.6 (rule made explicit; terms-preservation test retained) |
| H2 | Last-active-owner invariant: removing/demoting the only active org owner must fail unless another owner is assigned atomically | 6.4 (invariant + test) |
| H3 | One-database constraint: production schema changes via reviewed versioned migrations only — staging verification + rollback planning are the safety net | 7.1b preamble (explicit) |
| H4 | CI/staging credentials must be **technically unable** to connect to the production DB — URL checks alone are not a boundary | 6.0b (separate DB user accounts with host/grant separation; the failed-connection attempt is itself a gate test) |

---

## 1. Expert-assessment commitments (A1–A19) — carried unchanged

A1→6.2, A2→6.1/6.9, A3→6.3, A4→6.6, A5→6.7, A6→6.3, A7→6.10, A8→6.4, A9→6.5, A10→6.11, A11→6.8, A12→7.1, A13→7.3/7.4, A14→7.6, A15→7.5, A16→7.7, A17→7.8, A18→6.0, A19→7-gate/14.5. (Full table retained from v1; v2 added C1–C13; v3 added R1–R8; v4 added B1–B8 + M1–M3; v5 adds S1–S7 + H1–H4. No commitment removed.)

---

## 2. The Owner's Eight Decisions (binding) + two decisions requested

| Q | Decision | Lands in |
|---|---|---|
| 1 | Unverified-seller publishing: admin-controlled per-seller AND bulk; **default = ALLOW**; "not active" sellers **always blocked** | 8.5 (+ risk acceptance; **verification ≠ suspension** per S3) |
| 2 | Full multi-currency | 7.1–7.2 (+ buyer switcher 13.4) |
| 3 | Finish Product/Offer attribution 100% — including the variant×offer model (R2/B7) | 7.0 + 7.6 + 8.1 |
| 4 | Financier console: ALL 100% | Phase 10 |
| 5 | Arabic/RTL: the LAST step | Phase 13 |
| 6 | Monetization: mix, actor/transaction-dependent, admin-customizable | Phase 11 |
| 7 | Strictly 3P; platform manages the whole catalog; **full admin product form** | Phase 9 |
| 8 | KYC: manual + provider integration, admin-customizable | 12.4 |

### 2.1 The two requested decisions

**D9 — Variant×offer data model (blocks 7.6 completion / Q3 closure).**
Facts: `ProductVariant` belongs to `Product` (catalog-level price/stock, schema 362–378); `ProductOffer` carries one price + one stock for the whole product per seller (277–303); `OrderItem.variantId` + `offerId` are loose refs (337–360); `RfqLine.offerId`/`variantId` are loose refs (587–608); `QuoteLine` has **no offer reference at all** (673–689).
- **Recommended (planned): `OfferVariant`** — per-offer variant rows (`@@unique([offerId, variantId])`) with price override, per-variant stock authority, sku, isActive; `OrderItem.offerVariantId` records the actual (offer, variant) sold; `RfqLine.offerVariantId` + `QuoteLine.offerVariantId` persist the identity through the RFQ/quote path with commercial snapshots (7.6). Catalog-level `ProductVariant` price/stock become presentation/defaults for the product owner's primary listing — the purchase authority is always the (offer, variant) actually sold.
- **Alternative (rejected, documented):** variants as shared catalog choices with every offer covering all variants on identical terms — cannot express the required two-vendor test (different per-variant availability/pricing) and eliminates per-variant vendor price competition, contradicting Q7's 3P model.

**D10 — Seller tenant identity (decision recorded during Phase 6 → 6.13; implemented at 7.0; rewritten per S1/S2/S3).**

*The three-concept identity model (S1) — no existing column is relabeled:*
1. **`sellerOrgId` — the authoritative vendor tenant.** Added to `ProductOffer`, `OrderItem`, `Payout` (+ `PayoutLine`), `OrderFulfillment`, `Quote`; the organization that owns the selling relationship: grouping, settlement, fulfillment, RBAC scope, subscription attachment, limits, analytics.
2. **The existing `sellerId` columns — historical seller-account identity, meaning preserved.** `ProductOffer.sellerId` remains *the seller account offering the product*; `OrderItem.sellerId` remains *the seller account attributed the sale*; `Payout.sellerId` remains *the seller account receiving the payout*; `Quote.sellerId` remains *the fulfilling seller account*; `Product.sellerId` remains *the owning seller account* (until Phase 9's curated nullability). These are **vendor identity, not actors** — they are never described or used as "who performed the action."
3. **Actual actors — separate fields where the action matters.** `Quote.createdById` already records the issuing actor (schema 614). `Payout` gains `executedById` (who confirmed the transfer) — generation/mark-paid actors also flow to the AuditLog; `ProductOffer` creation actor comes from the AuditLog (no actor column is invented where none is needed).

*The full field mapping (S2) — every seller-identity touchpoint classified (org-ref / historical-account-ref / normalized-offer):*

| Record / path | Treatment |
|---|---|
| Seller-owned `Product` records | **Normalized offer (authoritative):** the 7.0 backfill creates one ACTIVE `ProductOffer` per seller-owned product from its current price/stock (the "primary listing offer"), so **the offer layer becomes the single authoritative source of seller attribution for commerce**. `Product.sellerId` remains the historical owner account; Phase 9 later makes it nullable for curated records (9.1). The product's own price/stock become read-model presentation for that offer (7.3's single-authority rule applies). |
| `ProductOffer` | `sellerOrgId` added (authoritative tenant); `sellerId` retained as the seller-account identity (above). |
| `OrderItem` / `Payout` / `PayoutLine` / `OrderFulfillment` | `sellerOrgId` added (authoritative); `sellerId` retained as historical seller-account identity. |
| `Quote` | `sellerOrgId` added (seller-org-scoped authorization for issuing/managing quotes); `sellerId` retained as the historical fulfilling-seller account; `createdById` is the actor (existing). |
| Primary-product purchase & RFQ paths | After the normalized-offer backfill they are **offer-backed** like everything else; attribution, pricing, and stock authority flow the offer path; RFQ lines without an explicit offer target remain open-to-offers (existing semantics) and resolve attribution through whichever offer is transacted. |
| Seller analytics, moderation | Re-keyed to `sellerOrgId` (authoritative); existing user-keyed aggregates retained as historical views during migration. |
| Seller coupons | `Coupon` has **no seller field today** (schema 1115–1127 — platform-only); the seller coupons of 8.3 attach to `sellerOrgId` from day one. |
| Store policies/settings | Land on `SellerProfile` (7.0), which belongs to the seller org. |

*Buyer duality — PROPOSED, pending explicit owner confirmation (S3; not "decided"):*
- **Proposal:** a seller organization may also act as a buyer organization — **but only through the same machinery as any buyer**: an active membership with buyer roles and the org being operationally ACTIVE; if confirmed, it participates in buyer approval flows (approval thresholds, `ApprovalRequest`) and **may** be eligible for financing as a buyer, subject to financier accreditation/KYC exactly like any other org (the financing gate is KYC/accreditation, not seller-ness). **The owner's explicit yes/no on each of these three sub-points is recorded in 6.13 before Phase 7 begins.**
- **Unverified ≠ suspended (S3, feeds 8.5):** seller verification moves to `SellerProfile.verificationState` (`UNVERIFIED | PENDING | VERIFIED | REJECTED`); `Organization.status` remains **operational** (ACTIVE/SUSPENDED/…). An unverified seller org is operationally ACTIVE so the owner's default-ALLOW publish policy (Q1) works as chosen; the 8.5 policy and its mitigations consult `verificationState`; **suspension remains the operational hard block** (always blocked from publishing, every path). `Organization.status = PENDING_VERIFICATION` is never used to represent "unverified seller" — that conflates onboarding state with trust state and would accidentally block the owner's policy.

Both D9 and D10 carry the plan's recommendation as the working assumption; **the owner's explicit confirmations are recorded in the worklog during Phase 6 — D10 (with its buyer-duality sub-points) before Phase 7's schema design begins (6.13), D9 before 7.6 implementation.**

---

## 3. Sequencing contract (reviewer's buckets + review-round pre-gates, as hard order)

```
APPROVED TO BEGIN NOW (v4 review: credential rotation, seed cleanup,
                       staging isolation, the safe restore, and the
                       Phase 6 RBAC work — under the documented gates)
  6.0   credential rotation + secret cleanup (+ evidence sensitivity pass)
  6.0b  staging isolation, SAFE restore, data-protection controls
        (R1, B1, + H4 credential-level DB isolation)
  6.1–6.9 RBAC guard repair, classification, MFA + session registry,
        private docs (B8 proxy model) — implementation on staging
  6.10–6.12 negative suites, audit atomicity
  6.13  D10 decision RECORDED (three-concept identity + buyer duality
        + verification-vs-suspension rule — §2.1) before Phase 7 schema

BUCKET 2 — BEFORE FURTHER FINANCIAL OR COMMERCE EXPANSION
  Phase 7  Financial integrity & multi-currency
           PRE-GATE (v4 review): before Phase 7 schema is considered
           final — the seller-tenant model per S1/S2 (7.0), payout
           legacy backfill + transfer idempotency + EFFECTIVE timing
           (7.4), fenced recurring recovery (7.5), legacy fulfillment
           initialization (7.7), refund obligation/execution model
           (7.7.3) are the designs; they close only with migration
           results + concurrency tests, not plan text.
           PRE-GATE (R5): 7.1b's rollout procedure + staging-tested
           concurrent-write mechanism before the migration executes.
  Phase 8  Commerce depth (fulfillment ops on 7.7's model; publish
           policy on verificationState)
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

### 6.0b Staging isolation & **safe** verified recovery (C1, R1, B1, H4)
**Nothing in 6.10 (negative/adversarial tests), 6.12, or Phase 7 may touch production data.** A production restore done carelessly is itself an incident. The procedure is ordered and each step is a gate for the next:
1. **Isolate first.** Staging = separate database, separate storage root, separate app credentials, separate messaging credentials (WhatsApp test line distinct from any production line), **no public access** (IP allowlist/VPN), and a named, restricted personnel list — locked down *before* any production data is copied in.
2. **Kill outbound before anything runs.** Disable outbound email (Resend), WhatsApp senders, payment rails, webhooks, and push integrations at the config level — **before the restored application or any of its jobs is enabled** (job inventory: recurring RFQ sweep, expiry scans, digest jobs, watchdogs). Verify the kills with a canary (an attempt to send must fail) — configuration is not proof.
3. **Restore into the locked environment.** Real production backup → staging; row counts must match.
4. **Sanitize before testers touch it.** Scripted (re-runnable on every future restore): anonymize/remove personal data (names, phones, emails, addresses), password-reset tokens, OTP codes, active sessions/session tokens, invitation tokens, API credentials/secrets, WhatsApp session artifacts. **Private KYC documents are not copied into staging at all by default** — test fixtures replace them; any exception is redacted/protected and documented.
5. **Verify the restore with controlled comparisons, not eyeballs on raw customer rows.** Per-table row counts, aggregate financial totals (SUM/COUNT by currency), checksums — executed by the restricted operator role; aggregate-only results are what testers ever see. Raw customer records are never handed to testers.
6. **Staging-only accounts with generated credentials.** All QA/test logins are re-seeded staging-only accounts whose credentials are generated at seed time from the environment (never committed, never equal to any production credential — 6.0.5).
7. Re-enable the application against the sanitized data; verify jobs run with outbound still disabled.
8. **Script safety — fail closed, no override (B1).** Test, seed, and destructive QA scripts **have no production mode at all**: they refuse production URLs/credentials unconditionally — **there is no `--allow-prod` flag to mistake**; they detect a production target by fingerprint (known prod URL/DB host) and abort. **Production migration and deployment are separate, protected workflows with their own explicit approval and audit trail** (7.1b, 14.x) — never a switch on a test script.
9. **Credential-level database isolation (H4).** URL checks are not a boundary: staging and CI use **separate database user accounts**, restricted by grants and host rules so those credentials **cannot authenticate to the production database at all** — the failure is technical, not conventional. **The gate test: an attempted connection to the production DB using the staging/CI credential must be rejected by the server** (evidence captured per the standard).
10. **Environment-touch documentation** (`docs/environments.md`): every browser test, seed script, QA asset, and cron job listed with the environment it may touch.
11. CI conventions: authz/concurrency suites parameterized by `STAGING_BASE_URL`; production is never a target.
- **Gate 6.0b:** staging serves the app end-to-end on sanitized data; a production backup has been restored, sanitized, and verified via controlled comparisons; the outbound canary proves sends fail; the environment map exists; no test asset is documented as production-touching; the sanitization script is committed; a deliberate attempt to point a QA script at a production target aborts (tested); **the staging-credential→production-DB connection attempt is rejected (tested)**.

### 6.0a WhatsApp channel — incident closed; production recovery redefined
The pairing failure ("WhatsApp service unreachable (fetch failed)") was the Baileys mini-service being down with `node_modules` never installed after a fresh checkout. Fixed: deps installed, service started on `:3031`, self-healing watchdog (`scripts/whatsapp-watchdog.sh`), pairing verified end-to-end in the browser (evidence `db/qa/e2e/whatsapp-pairing-fixed.png` — the one-time code itself was scrubbed in 6.0.4's sensitivity pass). The user can add their number from the admin panel today.
**Production recovery policy:** the watchdog's runtime install guard is a **dev-environment convenience only**. Production recovery never installs packages at runtime: the service is built from the pinned lockfile in CI, deployed as a known artifact, and the process supervisor restarts that artifact (14.1). Remaining hardening: credential encryption (6.6.7), staging/production line separation (6.0b), health monitoring + alerting (14.4), rate-limited pairing endpoints (14.3).

### 6.1 Guard repairs + classification-first guard-lint (A2, C7)
1. Delete the three local `requireAdmin()` shadows (`api/admin/slides/route.ts`, `api/admin/slides/[id]/route.ts`, `api/admin/settings/route.ts`); import from `@/server/guards` with explicit keys.
2. `api/quotes/[id]/review/route.ts` — add its explicit permission key.
3. **Guard-lint v2 (`scripts/check-guards.ts`, CI-wired):** a reviewed classification of **every** entry point — not just `route.ts` files — as exactly one of: `PUBLIC` · `AUTHENTICATED_USER` · `ORG_SCOPED` · `SELLER_SCOPED` · `FINANCIER_SCOPED` · `PLATFORM_PRIVILEGED`. **CI's primary failure condition is the route set itself: an unclassified entry point fails CI.** A missing authorization declaration, a permission key not present in the catalog, an ORG_SCOPED route whose target organization is not explicit and validated, or a local guard shadow each fail CI independently. (The 6.9 matrix drift check is a second, redundant control.)
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

### 6.4 Role-assignment integrity, active membership, and the last-owner invariant (A8, M2, H2)
1. ORG-scope assignment requires an **active membership** — **defined once, canonically (M2):** a membership is active iff **the `OrganizationMember` row exists AND `User.status = 'ACTIVE'` AND `Organization.status = 'ACTIVE'`** (schema facts: `User.status` ACTIVE|SUSPENDED; `Organization.status` PENDING_VERIFICATION|ACTIVE|SUSPENDED|REJECTED; `OrganizationMember` has no lifecycle field of its own — and does not need one). This predicate lives in **one** server resolver used by every service; **no service invents its own interpretation.**
2. The invitation flow creates membership + assignment atomically; member removal revokes org-scoped roles in the same transaction; orphan sweep + backfill.
3. **Last-active-owner invariant (H2):** removing or demoting the **last active OWNER** of an organization fails closed unless another active owner is assigned **in the same transaction** (owner-swap is atomic or refused). This matters doubly once seller organizations (7.0) have multiple members — a seller org must never be left ownerless. Tested: last-owner removal → refusal; owner swap in one transaction → success.
4. Tests: suspended user's membership is inactive for assignment/validation; suspended org likewise; the single resolver is the only implementation (lint/grep guard).

### 6.5 Invitation tokens hashed (A9)
`StaffInvitation.token` → `tokenHash` (SHA-256, same pattern as reset/OTP tokens); raw token shown once; pending plaintext invitations invalidated.

### 6.6 Private document delivery — authenticated proxy for the vault (A4, C5, R8, B8)
1. **Two storage namespaces:** `public-media` and `private-vault` (separate key roots). **Content-hash dedup never crosses namespaces** — the same bytes may exist twice with different keys and access semantics; dedup operates within a namespace only.
2. **Ingest classification:** document type drives namespace; **unknown/unspecced types default to the private vault** (fail-safe). New type→namespace mappings require an explicit, audited allow-list change — never a default-to-public.
3. **Access policy (least privilege):** document owner; org members per the sensitivity matrix (6.8); platform staff per permission; **financier access tied to a specific application or review scope** (the request/agreement they are reviewing — not mere financier membership).
4. **Retrieval mechanism — the authenticated proxy model (B8 decision):** a signed/short-lived URL for a vault asset points at an **application route that streams the bytes**. Every retrieval request re-authenticates the session, re-authorizes against the access policy (6.8), enforces the URL's expiry + one-time nonce, writes `DOCUMENT_FILE_RETRIEVED`, and only then streams. **No redirects to object storage/CDN for vault assets.** URLs are minutes-TTL, uncacheable (`Cache-Control: no-store`), HMAC-bound to document + user + nonce. (The rejected alternative — transferable bearer URLs with CDN-log evidence — is documented for the record.)
5. **Audit fidelity:** `DOCUMENT_URL_ISSUED` and `DOCUMENT_FILE_RETRIEVED` are **distinct logged events** — issuance and actual retrieval are never conflated (and with the proxy model, retrieval is provably post-authorization).
6. **Invalidation sweep:** every public route that can serve media is tested to 404 the vault namespace — **including previously-issued public URLs and CDN/cache layers**. Existing public links are inventoried; any that ever pointed at sensitive documents are invalidated and the exposure window recorded in the risk register.
7. Migration: existing sensitive uploads moved to the vault namespace (keys rewritten); the old exposure windows remain registered risks.
8. WhatsApp credential encryption: `WhatsAppSender.credsJson` AES-GCM at rest, decrypted only in the service process.

### 6.7 MFA + persistent session registry (A5, C6, R8)
1. **TOTP (RFC 6238) enforced** for every account with any platform-scope role or org-scope roles covering role management, payouts, payment capture, KYC/document verification, dispute resolution, module management.
2. **TOTP secrets encrypted at rest** (AES-256-GCM; key from the secret store, not the DB credential; rotation procedure documented). The plaintext secret exists only in memory during enrollment/verification — never stored, never logged.
3. **Backup codes:** generated at enrollment, stored as **salted hashes**, **single-use** (each use flips a used-flag + audit event; replay is rejected). Admin re-issue invalidates the previous set.
4. **Requirement derivation — not self-weakenable:** `mfaRequired(user) = platformPolicy || any effective role carries REQUIRES_MFA`. Effective roles are computed from actual role assignments (RBAC), so adding a privileged role **turns the requirement on** automatically; the user's settings page can offer enrollment but never a disable while required. Weakening the platform policy is an audited admin action with a second approver (6.7.5).
5. **Step-up MFA for sensitive actions:** role grants/changes, payout generation/approval/mark-paid, KYC/document verification, module & policy changes, credential administration — each requires `mfaSatisfiedAt` **within a freshness window (default 5 minutes, configurable)** on the current session.
6. **Locked-out-admin recovery:** a documented, audited runbook — identity verified out-of-band, either a second privileged approver (dual control) or the break-glass account (mandatory alert + audit), rate-limited, and every use reviewed post-hoc.
7. **Session registry:** `Session` — id, userId, device/UA summary, ipLastSeen, createdAt, lastUsedAt, revokedAt, mfaSatisfiedAt. Every issued session token gets a row; `lastUsedAt` updated (throttled); revocation supports both a single session and all-sessions (`sessionVersion` bump remains the all-kill).
8. **Verified-contact matrix (phone-first + nullable `User.email`):** buyers: verified phone (OTP); sellers: at least one verified contact on file (phone **or** email), email mandatory only when email is the seller's chosen channel; platform staff & org staff/admins: verified **email** required — invitations are email-bound; the invitee must verify that exact email before first privileged login. Making email a universal login prerequisite would be an **intentional product change** requiring an owner decision — not a side effect of this plan.
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

### 6.13 Seller tenant identity — D10 decision + model recorded (B2/S1/S2/S3; before Phase 7's schema design)
1. The owner confirms (or amends) the D10 recommendation (§2.1): sellers become first-class organizations; **the three-concept identity model** (sellerOrgId tenant · existing `sellerId` columns as historical seller-account identity, meaning preserved · actors via `createdById`/`executedById`/AuditLog) is accepted; **the field-by-field mapping table** (normalized primary offers; `Quote.sellerOrgId`; analytics/coupons/policies keyed to the org) is accepted; **the buyer-duality proposal's three sub-points** (buyer machinery prerequisite; approval-flow participation; financing-eligibility-as-buyer) each get an explicit yes/no.
2. The decision + spec are recorded in the worklog and `docs/seller-tenant-model.md`; the Phase 7 schema work (7.0) implements exactly this spec — any deviation re-opens the decision.
3. D9 is confirmed in the same window (it lands later, at 7.6).
- **Gate:** decision recorded before Phase 7 begins; docs committed.

### Phase 6 acceptance gate (browser + scripted, on staging where adversarial; evidence per the standing standard)
- [ ] 6.0b gate passed: staging live on sanitized data; backup restored + verified via controlled comparisons; outbound canary proves sends fail; environment map committed; sanitization script committed; QA-script-against-production aborts (tested); **staging-credential→production-DB connection rejected (tested, H4)**.
- [ ] Guard-lint: zero unclassified entry points, zero shadows, zero bare guards, zero unknown permission keys — including server actions, jobs, and mini-service endpoints; a scratch-branch probe fails CI.
- [ ] Route matrix generated from the reviewed classification; 100% coverage.
- [ ] Negative suite 10/10 green on staging (evidence per the standard: commit, environment, command, result, exclusions).
- [ ] ADMIN bypass removed via the rollout; sweep artifact committed; break-glass verified with alert.
- [ ] MFA: enrollment E2E; TOTP secret encrypted at rest (verified in a dump); backup code use + replay-rejection audited; requirement auto-derives from an added privileged role; step-up window enforced on a sensitive action; locked-out-admin recovery executed per runbook with audit trail.
- [ ] Session registry records logins; single-session revoke works; all-sessions revoke works.
- [ ] Private doc: proxy model — no public path (404) including legacy URLs/CDN; retrieval requires an authenticated, authorized session (tested unauthenticated + cross-session); issuance vs. retrieval audited separately; member-vs-identity-doc denial.
- [ ] **Last-active-owner invariant (H2): last-owner removal refused; atomic owner swap succeeds.**
- [ ] Credentials rotated; docs + QA evidence scrubbed; seeds audited credential-free; all sessions invalidated once.
- [ ] **6.13: D10 decision recorded (incl. buyer-duality sub-points); seller-tenant spec committed.**
- [ ] Full business regression still green. **Commit + push.**

---

## Phase 7 — Financial Integrity & Multi-Currency · ~2–3 weeks

### 7.0 Seller tenant substrate (B2/S1/S2; implements the 6.13 decision; precedes all other Phase 7 schema work)
1. **`SellerProfile`** (1:1 `Organization`, unique organizationId; ownerUserId; **`verificationState`** `UNVERIFIED | PENDING | VERIFIED | REJECTED` per S3 — verification lives here, `Organization.status` stays operational) — store settings land here in 8.3.
2. **Identity columns per the three-concept model (S1):** `sellerOrgId` added as the authoritative tenant on `ProductOffer`, `OrderItem`, `Payout` (+ `PayoutLine`), `OrderFulfillment`, `Quote`. **Existing `sellerId` columns are retained with their meaning unchanged — historical seller-account identity** (the seller offering / attributed the sale / receiving the payout / fulfilling the quote). `Payout` additionally gains `executedById` (actor, S4). Actors that matter today already have homes (`Quote.createdById`; AuditLog).
3. **Normalized primary offers (S2):** the backfill creates one ACTIVE `ProductOffer` per seller-owned product from its current price/stock — the product's "primary listing offer." From that point **the offer layer is the single authoritative source of seller attribution for commerce**; the product's own price/stock become the read-model for that offer (7.3's single-authority rule). RFQ lines and carts that today target the product implicitly resolve to this offer.
4. **Reviewed, resumable backfill:** one organization + SellerProfile + OWNER membership per existing seller user; `sellerOrgId` set on offers, order items, payouts, quotes, fulfillments; normalized primary offers created. New writes set both identifiers from creation. **Backfill verification is a gate:** spot-check reconciliation (every seller user has an org; every offer's sellerOrgId matches its seller's org; every seller-owned product has a primary offer) — results committed.
5. RBAC `SELLER_SCOPED` resolution switches to the org (`ctx.orgId` = seller org) — same machinery as every other org scope.
6. Tests: an offer's `sellerOrgId` matches its seller-account's org; multi-member seller orgs (a second SELLER-role member manages offers/payouts under the org); buyer duality (if confirmed in 6.13: the seller org places an order as a buyer org through standard buyer machinery).
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

### 7.1b Production migration rollout — explicit order (R5, M1, H3)
**Single-database constraint (H3, explicit):** production runs on **one** managed MySQL database — there is no cluster or failover to catch a bad migration. The staging rehearsal, the versioned reviewed migrations, and the written rollback plans are the primary safety net; nothing here is optional.
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

### 7.4 Payout settlement — claim layer, immutable ledger, transfer discipline, legacy backfill (A13, C10, R3, B3, B4, S4)
**The invariant is "no two simultaneously effective settlements per order item" — enforced by a claim, not by forbidding history.**
**A. The settlement claim (mutable state, serializes generation):**
1. Claiming an item for a payout is a **conditional single-flight**: `UPDATE OrderItem SET payoutId = ? WHERE id = ? AND payoutId IS NULL` with **affected-rows verified** — mismatch → abort the transaction, recompute the eligible set, and alert. No second generation can claim the same item, pending or otherwise, before any external transfer is initiated.
2. Release: a payout **cancelled before payment** frees its claims (`payoutId → null`, same transaction); a payout **reversed after payment** frees its claims in the same transaction that posts the reversal entries — enabling a later reissue.
3. The claim is mutable pointer state — it is **not** accounting history.
**B. The immutable ledger (accounting postings, append-only):**
4. **`PayoutLine`:** id, payoutId, orderItemId, `linePurpose` (`SETTLEMENT` | `REVERSAL` | `REISSUE`), amount, commission, currency, FX rate/timestamp/source snapshot, `status` (`PENDING` | `EFFECTIVE` | `REVERSED` | `CANCELLED`), `reversalOfLineId` (nullable self-FK), createdAt, transition timestamps. Amount/commission/currency/snapshot fields are **never UPDATEd after insert** — only status transitions and appended entries. Status and purpose values are **CHECK-constrained** (B4).
5. **The DB backstop — a generated `claimKey` that guards claim-purpose lines only:** `claimKey` = `orderItemId` when `linePurpose ∈ {SETTLEMENT, REISSUE}` **and** `status ∈ {PENDING, EFFECTIVE}`; else `NULL`. `UNIQUE(claimKey)`. **REVERSAL lines never occupy the slot** — a reversal is an accounting fact, not a claim; it can coexist with the next settlement's claim.
**C. External transfer discipline (S4):**
6. **`Payout` execution fields:** `transferReference` (bank/manually-confirmed reference), `transferIdempotencyKey` (unique — derived from payout number + execution attempt), `executedById`, `executedAt`. Mark-paid requires a **non-empty transfer reference**; retries after a timeout **reuse the idempotency key** and reconcile against the actual transfer before confirming; duplicate references across payouts are detected and blocked (two payouts, one bank reference = alert + block). For manual payments the operator-entered reference is the evidence; the discipline (confirm-then-mark) is the control. **Honesty clause:** the database claim prevents duplicate *internal* claims; it cannot make an external bank transfer exactly-once — the reference + reconciliation discipline is the control, and its residual risk is registered.
7. **EFFECTIVE timing (S4):** lines become `EFFECTIVE` when the payout's **confirmed execution** lands — the mark-paid event carrying the verified transfer reference (step-up-authenticated per 6.7.5) — not merely on a status flip without evidence. Between claim and confirmation, lines are `PENDING`.
**D. Legacy payout backfill (S4):**
8. Existing `Payout` + `OrderItem.payoutId` links are backfilled into `PayoutLine` records (`SETTLEMENT`, `EFFECTIVE` for PAID payouts / `CANCELLED` for cancelled ones), snapshotting amounts/commissions from the historical data. **Reconciliation:** per-payout line sums vs the payout's stored totals (grossAmount/commission/netAmount) — mismatches and unreconstructable cases (broken links, impossible totals) land in a **payout-legacy-ambiguity report** resolved individually with recorded decisions, exactly like 7.7's status mapping. After the backfill, every settled item is covered by the claim system and the ledger.
9. **The three correction cases, end to end:** (a) generated-never-paid-cancelled: claim released, lines PENDING→CANCELLED, items free; (b) paid-then-corrected: REVERSAL entries appended, originals EFFECTIVE→REVERSED, claim released; (c) settle-again: once no claim-purpose line holds the item, a new SETTLEMENT/REISSUE line claims it and becomes EFFECTIVE on confirmed execution.
10. Payout-level and line-level transitions share one transaction; mark-paid single-flight via conditional update.
11. **Tests:** two concurrent generations → exactly one claim wins; reversal → release → reissue round-trip preserving history; duplicate EFFECTIVE claim-purpose line rejected by the database; REVERSAL never blocks a subsequent claim; **mark-paid without a transfer reference rejected; duplicate reference across payouts blocked; retry-after-timeout reuses the idempotency key**; legacy-backfill reconciliation report zero-unresolved.

### 7.5 Recurring-RFQ durability — durable run-state with fencing (A15, B5, S5)
**Two transactions, plus a fencing token so a stale worker can never act after losing its lease (S5):**
1. **Tx 1 — claim:** create-or-claim the unique `RecurringRfqRun` (idempotency key `scheduleId:dueAt`) with a **lease** (`leaseExpiresAt`) and a **fencing token** (`leaseToken` — random per claim, rewritten on every reclaim).
2. **Tx 2 — execute (fenced):** the RFQ creation transaction **also** performs a conditional update of the run row: `UPDATE … SET status='CREATED' WHERE id = ? AND leaseToken = ? AND status = 'CLAIMED'` — **affected-rows verified**. A stale worker whose lease expired (and was reclaimed, rewriting the token) fails this update, aborts, and creates nothing. Success is durable at Tx 2's commit even if the worker dies immediately after.
3. **Failure path:** if Tx 2 fails, the run is preserved/updated as `FAILED` (retry-counted, bounded) with the error; retries **reuse the same idempotency key**; **stale leases** (`leaseExpiresAt` passed, still `CLAIMED`) are reclaimed by the sweep (new fencing token) and re-run.
4. The sweep (a classified job per 6.1.4) owns claiming, reclaiming, and bounded retries; alerts fire on terminal failure.
- **Tests (crash trio + the fencing race):** worker crash before Tx 2 (stale lease reclaimed, RFQ created exactly once); an RFQ-creation error (run FAILED, retried with the same key, still exactly-once); crash after Tx 2 before the worker responds (run already CREATED; no duplicate); **A/B/A fencing: A's lease expires, B reclaims (new token), A's late Tx 2 aborts on the token check — exactly one RFQ exists.**

### 7.6 Offer attribution end-to-end — variants persisted through the whole path (A14, Q3, D9, R2, B7, H1)
`QuoteLine.offerId` (snapshot ref); conversion sets `OrderItem.sellerId`/`sellerOrgId` from the **offer's** seller (7.0); **the D9 model:** `OfferVariant` (`@@unique([offerId, variantId])`, per-variant price/stock authority, sku, isActive) + `OrderItem.offerVariantId` — and the identity persisted at every earlier stage:
1. **`RfqLine.offerVariantId`** (nullable; set when the buyer targets a specific vendor's variant).
2. **`QuoteLine.offerVariantId` + commercial snapshot:** the quote line snapshots the **seller-specific terms actually quoted** — offer ref, variant ref, currency, quoted unit price, quantity, and the applicable inventory (or its absence) at quote time. **H1 rule (explicit): quoted terms are never reconstructed from a live offer after issuance — the snapshot on the line is the fact.** Pricing changes to the offer afterward do not alter an issued quote's recorded terms.
3. **Pair validation at every transition:** wherever an (offer, variant) pair is consumed — RFQ line create, quote line create, quote accept → order conversion — the pair must exist, be active, and **belong to the same product**, or the transition fails closed.
4. **Migration:** existing offers on variant products backfill `OfferVariant` rows from catalog defaults; existing `QuoteLine`s get `offerId`/`offerVariantId` backfilled from their RFQ lines where provable, flagged where not.
**The Q3 completion test:** the full chain (`ProductOffer → OfferVariant → RfqLine → QuoteLine → OrderItem → PayoutLine`) with **two vendors selling the same catalog product, one or more variants with different availability and different prices between them** — asserting authoritative seller-org/offer/variant/price/currency/quantity/stock at every hop, the vendor out of stock on a variant being unbuyable on that variant, **and** the quote and resulting order preserving the exact seller-specific variant terms (never reconstructed from the live offer — H1). Green (plus the 7.4 tests) = Q3 closed. *Q3 is not complete without this test.*

### 7.7 Order status — dimensions split, refund ledger, legacy initialization (A16, R6, B6, S6, S7)
Today one `Order.status` (PENDING_PAYMENT | PENDING_APPROVAL | PAID | PROCESSING | SHIPPED | DELIVERED | CANCELLED) serves payment and fulfillment simultaneously.
1. **`paymentStatus` (financial):** `AWAITING_PAYMENT` · `PAID` · `FUNDED` · `PARTIALLY_REFUNDED` · `REFUNDED` · `OUTSTANDING`. **`OUTSTANDING` defined precisely:** *a non-financed order with an unpaid balance under invoiced payment terms (e.g., NET-30 past due) or a captured under-payment* — **never** a financed buyer obligation (those exist only in the financing state machine, 10.8–10.9). Refund states are settable **only from COMPLETED refund-ledger evidence** (item 3).
2. **`fulfillmentStatus` (derived roll-up):** `UNFULFILLED` · `PARTIALLY_FULFILLED` · `FULFILLED` · `PARTIALLY_CANCELLED` · `CANCELLED` — derived from the **minimal `OrderFulfillment` model introduced in this phase** (per-`sellerOrgId` grouping, status, per-item links) with an explicit, tested derivation rule; **Phase 8.1 builds the operational depth on it.**
3. **Refund model — obligation vs. execution, item-level (S7):**
   - **`Refund` states:** `REQUESTED` (or created from a dispute outcome) → `APPROVED` (**obligation established** — approved but not yet paid) → `COMPLETED` (**only with execution evidence**: a payment reference, or manual-payment evidence recorded by an authenticated actor with step-up per 6.7.5) / `DENIED` / `CANCELLED`; corrections are appended reversal entries, never rewrites. **A refund obligation is never conflated with a completed refund.**
   - **`RefundAllocation`:** each refund links to its **order items or fulfillment group** with allocation buckets — items, shipping, discounts, taxes — so a partial refund is bound to exactly the items it covers. Phase 8's per-seller-group partial cancellation produces refunds whose allocations target that group's items.
   - **Effects (defined):** allocations determine which items' payout claims are released / which `PayoutLine`s get REVERSAL entries (per 7.4); commission reversals follow the same lines; `paymentStatus` refund states are computed **only from COMPLETED refunds' allocations** (while a refund is APPROVED-but-unpaid, the order shows its prior state plus a pending-refund indicator — never a completed-refund status).
   - Manual refunds are supported and recorded (no PSP yet — the ledger is the evidence; actor + reference + timestamps).
4. **Server-side transition maps for both dimensions** (illegal transition → 400 + audit). The legacy single `status` is retained read-only during migration and removed after 7.1b's observation discipline.
5. **Financed orders never overload `PAID`:** financier disbursement to sellers sets `paymentStatus = FUNDED` — which **never** implies the buyer's obligation is settled. The buyer's debt lives in the financing domain as its own state machine (`ACTIVE → PAID_OFF / DEFAULTED / RESTRUCTURED / WRITTEN_OFF`) with `InstallmentPayment` as its ledger.
6. **One home per money flow:** `Payment` (buyer payment) · `Payout/PayoutLine` (seller settlement) · `Refund/RefundAllocation` (money returned to buyer) · `InstallmentPayment` (buyer debt servicing) · `FinancingFee` (financier fees). No status field substitutes for a ledger.
7. **Legacy mapping — honest, not assumptive:** the provable mapping table (`PENDING_PAYMENT`→(AWAITING_PAYMENT, UNFULFILLED); `PENDING_APPROVAL`→ approval from `ApprovalRequest`, both dimensions pending; `PAID`→(PAID, fulfillment from suborder evidence); `PROCESSING`/`SHIPPED`/`DELIVERED`→ payment unchanged + fulfillment derived; refund states only where COMPLETED-refund evidence exists).
   - **Legacy fulfillment initialization (S6):** existing orders get `OrderFulfillment` rows per distinct `sellerOrgId` on their items, initialized from the legacy **global** status via a documented uniform mapping (DELIVERED→DELIVERED, SHIPPED→SHIPPED, PROCESSING→PROCESSING, PAID/PENDING_*→UNFULFILLED, CANCELLED→CANCELLED — applied identically to every seller group on the order). **Limitation stated in the artifact:** legacy data cannot prove per-seller partial fulfillment — a globally SHIPPED order initializes every group as SHIPPED; no historical per-seller evidence exists or is implied. Orders with mixed signals (e.g., cancelled rows with delivered-item evidence) are routed through the **legacy-ambiguity report** and resolved with recorded decisions.
   - **The gate is "zero rows in the ambiguity report without a recorded decision"** — for status, fulfillment, and refund mapping alike — never "zero unmapped by assumption."

### 7.8 Accreditation renewal — constrained statuses, DB-derived active key (A17, C2, R7, B4)
The current schema has `@@unique([serviceId, organizationId])` (line 1636) — retaining prior requests while creating renewals is impossible under it. `AccreditationRequest.status` is a **String column with documented values** (schema line 1618 comment), not a Prisma enum — so the value set must be **database-constrained** before a generated key can trust it. Explicit schema change:
1. **CHECK constraints first:** the valid status values — `DRAFT`, `SUBMITTED`, `UNDER_PLATFORM_REVIEW`, `RETURNED_FOR_COMPLETION`, `FORWARDED_TO_FINANCIER`, `UNDER_FINANCIER_REVIEW`, `ACCREDITED`, `REJECTED`, `EXPIRED`, `REVOKED`, `CANCELLED`, plus the new `ARCHIVED` — are enforced by a **DB CHECK** (reviewed migration SQL; Prisma doesn't model CHECKs — the schema comment is updated and a CI drift check flags their absence). **An invalid value is rejected by the database** — it can never produce a NULL key and slip past the unique.
2. **Database-generated active key from the constrained set:** generated column `activeKey` = 1 when `status ∈ ACTIVE_SET`, else `NULL`; `UNIQUE(serviceId, organizationId, activeKey)`. Multiple NULLs → unlimited history; at most one live request per program/org; the marker **cannot disagree with status** because the database derives it.
3. **ACTIVE_SET (complete, from the documented values):** `DRAFT`, `SUBMITTED`, `UNDER_PLATFORM_REVIEW`, `RETURNED_FOR_COMPLETION`, `FORWARDED_TO_FINANCIER`, `UNDER_FINANCIER_REVIEW`, `ACCREDITED`. Terminal: `REJECTED`, `EXPIRED`, `REVOKED`, `CANCELLED`, `ARCHIVED`. **DRAFT and RETURNED_FOR_COMPLETION block a second application by design** (documented rule).
4. **Expiry before renewal:** an `ACCREDITED` record whose `validUntil` has passed is transitioned to `EXPIRED` **both** by the scheduled expiry job **and** by the transactionally guarded renewal path (renewal of a lapsed accreditation first flips the stale record to `EXPIRED` inside the same transaction, then creates the new request) — an expired grant can never block its own renewal.
5. **Every ACTIVE_SET entry/exit transition is tabled and tested**; no transition outside the table is legal. `supersedesId` self-relation + `ACCREDITATION_RENEWED` audit chain; archive + create + audit atomically.
6. **Tests:** invalid status writes rejected by the CHECK; expired-grant renewal succeeds (with the in-transaction EXPIRED flip); **the concurrent-renewal race — two parallel submissions → exactly one becomes active, the loser rejected by the database**; every transition-rule row exercised.

### Phase 7 acceptance gate
- [ ] **7.0 gate: seller-org substrate live; backfill reconciliation report committed; primary-offer normalization verified; three-concept identity columns in place; multi-member + (if confirmed) buyer-duality tests green.**
- [ ] Field inventory reviewed — every monetary column typed/currency'd/rounded; only monetary fields migrated; diffs = declared-rounding-only, else blocked.
- [ ] **7.1b procedure written with its 7-step order (dual-write deployed before backfill); the mechanism staging-tested under production-like load; single-database rollback plans documented (H3); rollback criteria + observation period agreed.**
- [ ] Staging restore drill re-run (migration rollback rehearsal) — signed.
- [ ] Concurrency tests (stock, payout claims, **fenced recurring — incl. the A/B/A race**) + **payout cases (a)/(b)/(c) + claim race + transfer-reference/idempotency rules + legacy-backfill reconciliation zero-unresolved** + **two-vendor variant terms-preservation test** green — on staging.
- [ ] **Order-status split: refund obligation/execution model live with item-level allocations; minimal `OrderFulfillment` live with tested derivation; legacy fulfillment initialization mapping + ambiguity report zero-unresolved; `OUTSTANDING` per definition; financed FUNDED≠buyer-clear.**
- [ ] Accreditation: CHECK + generated-key constraints live; invalid-status write rejected; expired-grant renewal green; race test green; transition table fully exercised.
- [ ] `answer4audit-v2.md` evidence addendum (per the evidence standard) for every finding this phase closes → expert re-review (A19).
- [ ] Full regression + **commit + push.**

---

## Phase 8 — Commerce Depth · ~2–3 weeks (Murabaha checkout moved out — C4; builds on 7.0/7.4/7.6/7.7)

### 8.1 Per-seller fulfillment operations — on the 7.7 model
`OrderFulfillment` was introduced minimally in 7.7. Phase 8.1 delivers the **operational depth**: carrier, tracking numbers, event history, buyer tracking grouped per seller, partial cancellation per seller group (producing 7.7.3 refunds whose allocations target that group's items, and releasing claims / reversing `PayoutLine`s per 7.4), RFQ conversions deriving suborders from per-item `sellerOrgId`/`offerVariantId`. The roll-up derivation rule (7.7.2) is re-tested against the full operational surface.

### 8.2 Buyer depth
Spec-matrix compare, saved addresses, reorder, guest checkout (email/phone + post-hoc account claim), product Q&A with moderation.

### 8.3 Seller depth — on the seller-org tenant (7.0)
Onboarding checklist, store settings (logo/banner/policies/payout account — landing on `SellerProfile`), draft autosave/recovery, CSV import polish, low-stock alerts, **seller coupons (new — attach to `sellerOrgId` from day one; `Coupon` has no seller field today)**, shipping zones, analytics depth.

### 8.4 Checkout financing (Murabaha) — **moved to Phase 10.9** (C4: depends on financier disbursement operations that complete in Phase 10).

### 8.5 Unverified-seller publishing policy (Q1, C12, S3)
1. Platform setting `publishPolicyForUnverified`, **default `ALLOW`** (owner decision).
2. Per-seller override (`ALLOW | REVIEW | BLOCK`) + **bulk action** — overrides recorded against the seller org (7.0) with the user-level legacy flag migrated.
3. **Verification ≠ suspension (S3):** the policy consults `SellerProfile.verificationState` (UNVERIFIED sellers may publish per the owner's ALLOW); **suspension (`Organization.status = SUSPENDED` / user SUSPENDED) is the operational hard block** — always enforced, every path.
4. **Explicit risk acceptance recorded** (risk register): allowing unverified sellers to publish is a product choice, not a security control — documented fraud/trust risk with mitigations: visible verification status on storefronts/products, seller limits (listing caps for unverified), payout holds/thresholds for unverified sellers, enhanced review for higher-risk categories, and the admin's ability to flip the policy at any time.
5. **Hard rule:** suspended/inactive sellers are always blocked from publishing — enforced and tested at **every publishing path**: product create, product edit/republish, **offer create/update**, CSV bulk import, and any bulk action. The negative suite gains these cases.
- **Gate:** policy default verified; per-seller + bulk flips work; unverified-but-ALLOWed seller publishes successfully; suspended-seller block proven at every path (API-level evidence).

### Phase 8 acceptance gate
- [ ] Mixed-seller order ships per suborder; grouped tracking; roll-up derivation correct (incl. mixed cancellation); partial cancellation produces item-allocated refunds + claim releases + line reversals per 7.4/7.7.3.
- [ ] Guest checkout, reorder, Q&A round-trip; seller checklist/settings (on SellerProfile)/coupons (org-keyed)/shipping/alerts E2E.
- [ ] Publish policy + risk acceptance artifact; unverified≠suspended distinction verified; suspended-block tests at all publishing paths green.
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
1. **Tenant identity (decided in 6.13, built in 7.0):** the subscription attaches to the **seller organization** — module activation, permission checks, limits, and billing all resolve against that same tenant.
2. `SubscriptionPlan` (module bundle + limits) + `SellerSubscription` (status, renewAt, grace, downgrade state) on the seller org.
3. **Entitlement ceiling semantics:** a subscription is a **ceiling** — organization/org-type module activations can only enable what the subscription entitles; they can never exceed it. Resolution for paid modules: entitlement = `subscriptionAllows AND (ORG override OR ORG_TYPE default OR PLATFORM default)`. An ORG flip can turn a paid module **off**; it cannot turn it **on** beyond the subscription.
4. **Renewal-failure behavior:** grace period (configurable, default 7 days, read-only warnings) → downgrade (paid modules off, limits re-clamped; data preserved read-only where applicable).
5. **Tests:** unpaid/downgraded subscription cannot retain paid entitlements through an organization override; grace/downgrade transitions verified; the tenant resolution is exercised for every limit surface.

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
Email-verification enforcement **per the 6.7.8 contact matrix**; rate limiting expansion + password policy + privileged-account rotation; ops (automated backups **with the recurring restore drill proven in 6.0b** re-verified on schedule — with R1/B1/H4 safeguards; uptime monitoring incl. the WhatsApp mini-service health; staging/production split CI gates: lint + type + guard-lint + classification-sync + auth-negative suite + business regression). **WhatsApp production deployment = CI-built artifact from the pinned lockfile + supervisor restart — runtime package installation removed from every production runbook.**

### 14.4 Monitoring & incident ownership (expanded)
Alerting with named owners: downtime, OOM/restart events, migration jobs, pairing-service outages, reconciliation discrepancies, failed audit writes. On-call/ownership documented even if informal.

### 14.5 Launch gate — the full checklist (C13, M3)
1. **Dependency & secret scanning** (SBOM + secret sweep, zero known-vulnerable pins unaccepted).
2. **Security testing of authorization and file access** — the negative suite plus a targeted private-document penetration pass (staging), including legacy-URL/CDN paths **and unauthenticated/cross-session attempts at the proxy route**.
3. **Load & concurrency testing** for checkout, settlement, and the hot APIs (rates defined per endpoint; results recorded per the evidence standard).
4. **Restore & recovery verification** — re-run of the 6.0b drill (with R1/B1/H4 safeguards) on the then-current production backup.
5. **Monitoring, alerting, incident ownership** live.
6. **Legal/privacy review** for KYC processing, agreements, communications, and financing flows — the 10.9 Sharia sign-off, the 10.1 e-signature evidence package, the 12.4 retention/processing-location notes, plus data-subject requests, retention schedule, and cross-border notes as applicable.
7. **Production deployment + rollback rehearsal** — a full deploy executed and rolled back on staging with the documented procedure; **the 7.1b production-migration procedure rehearsed end-to-end**, including the dual-write-before-backfill order and the single-database rollback plans (H3).
8. **Three consecutive green full-regression runs** (business + authorization-negative + financial-integrity) — each run's evidence recorded per the standard.
9. **Completion-claims audit:** accreditation renewal, payout settlement, seller subscriptions, and Murabaha checkout each verified to have **explicit data models + explicit concurrency/state-transition rules + passing tests + migration results** — anything less is re-labeled as partial with its gap registered.
10. **Residual-risk review:** every open item is either closed with evidence or **explicitly accepted in writing by the owner** (registered risk, mitigation, review date).
11. Final **commit + push + tag**; `answer4audit-v2.md` updated with final evidence for expert re-run (A19).

---

# PART II — CROSS-CUTTING RULES

## Regression checklist (after EVERY phase)
**Business:** the mergedplan §7 baseline (register → coupon order → tracking; RFQ full loop; financing wizard → gate → offer → agreement; admin panels with count consistency; team invite/remove/role-change; 60-min soak).
**Authorization-negative (staging):** the ten cases of 6.10, plus the 8.5 publishing-path blocks (unverified≠suspended cases).
**Financial-integrity (staging):** last-unit concurrency (incl. per-OfferVariant); payout claim race + cases (a)/(b)/(c) + reversal-doesn't-block-reissue + duplicate-EFFECTIVE rejection + **transfer-reference/idempotency rules + legacy-backfill reconciliation**; **recurring crash/recovery trio + A/B/A fencing race**; offer-attribution trace (**two-vendor variant terms-preservation test, no live-offer reconstruction**); migration diffs = declared-rounding-only; **order-status dimension transitions + refund obligation/execution/allocation effects + legacy initialization zero-unresolved**.
**WhatsApp channel health:** pairing start returns a code; watchdog keeps the service alive across a kill.
**Evidence:** every entry per the standing standard (commit, environment, command, result, exclusions; no sensitive content).

## Deferrals (unchanged in substance; reviewer-concordant)
ABAC/resource-level permissions; unifying org-member roles with RBAC; real PSP integration (substrate designed, lands with the commercial project); DB-level scope-sentinel redesign; role soft-lifecycle columns; full AR staff console.

## Risk register (live — updated in v5)
| Risk | Status / mitigation |
|---|---|
| Existing `sellerId` columns relabeled as actors (S1) | Closed by design: three-concept model in §2.1/7.0 — identity meaning preserved; actors have their own fields (`Quote.createdById` exists; `Payout.executedById` added). |
| Seller-migration blind spots (S2) | 7.0 field-by-field mapping table + normalized primary offers; backfill reconciliation is a gate artifact. |
| Buyer-duality assumed without owner decision (S3) | Recorded as PROPOSED with three explicit sub-points; 6.13 records the owner's answers; verification/suspension split via `SellerProfile.verificationState`. |
| Legacy payouts outside the claim/ledger system (S4) | 7.4.8 backfill + reconciliation report (zero-unresolved gate); transfer reference + idempotency key + EFFECTIVE-on-confirmed-transfer. |
| External transfer double-payment | Internal claims are DB-enforced; external exactly-once is an operational discipline (reference confirm + duplicate detection + reconciliation) — residual risk registered (7.4.6 honesty clause). |
| Stale recurring worker double-creating (S5) | Fencing token in Tx 2 conditional update; A/B/A test in the suite. |
| Legacy fulfillment ambiguity (S6) | Uniform initialization mapping + stated limitation + ambiguity report with recorded decisions. |
| Refund obligation confused with execution (S7) | State model REQUESTED→APPROVED→COMPLETED(+evidence); item-level allocations; paymentStatus refund states only from COMPLETED evidence. |
| Destructive test against production (B1) | Fail-closed scripts, no override flag; production workflows separate+protected; abort tested. |
| Staging/CI credentials reaching production DB (H4) | Separate DB users with grant/host separation; the failed-connection attempt is a gate test. |
| Ownerless organizations after member removal (H2) | 6.4.3 last-active-owner invariant (atomic swap or refusal); tested. |
| Seller identity built on users then re-tenanted (B2) | 6.13 decision + 7.0 substrate before all other Phase 7 schema work. |
| Payout double-settlement / blocked reissue (B3) | 7.4 claim layer + claim-purpose-only `claimKey` + all tests. |
| Invalid status strings bypassing generated keys (B4) | CHECK constraints + generated keys from constrained sets (7.8, 7.4.4). |
| Recurring-RFQ loss on rollback (B5) | 7.5 durable run-state + fencing. |
| Refund states without evidence / fulfillment gating gap (B6) | 7.7 refund ledger first; minimal `OrderFulfillment` in 7.7; OUTSTANDING defined. |
| Quote/order variant terms not provable (B7) | 7.6 persisted identity + snapshots + pair validation + terms-preservation test (H1: no live-offer reconstruction). |
| Signed URLs overstated as session-bound (B8) | 6.6.4 authenticated-proxy model. |
| WhatsApp mini-service availability | Fixed (`b1681f1`); production recovery = CI-built artifact + supervisor restart; monitoring/alerting 14.4. |
| Sensitive docs previously served from public media | 6.6 namespace + proxy + invalidation sweep; exposure window registered; rotation in 6.0. |
| Staging restore exposing production PII / firing outbound (R1) | 6.0b ordered procedure; scripted sanitization; aggregate-only verification. |
| Money migration | 7.1 staged protocol + 7.1b explicit 7-step production order; single-database rollback plans (H3); observation period; Float drops separated. |
| Variant/offer attribution gaps (R2) | D9 `OfferVariant` + full-path identity + two-vendor test. |
| Order status conflation (esp. Murabaha) (R6) | 7.7 two dimensions + refund ledger + FUNDED≠buyer-clear. |
| Accreditation race / marker drift (R7) | 7.8 CHECK + generated key + transition table + race test. |
| Seller subscriptions without a tenant (R4) | D10 decided in 6.13, built in 7.0; subscriptions on the seller org. |
| Unverified sellers trading (owner's ALLOW default) | Explicit risk acceptance + mitigations in 8.5 (verificationState-based). |
| Murabaha before legal/Sharia review | Blocked by 10.9 preconditions. |
| Subscription entitlement escalation via org override | Ceiling semantics + tests in 11.2. |
| E-signature legal validity | 10.1 evidence package + 14.5 item 6 legal review. |
| KYC provider failure auto-approving | 12.4: failure ⇒ PENDING + manual queue (tested); webhook auth + idempotency. |
| RESEND_API_KEY lost | Owner action before launch (14.5 checklist). |
| OOM under parallel compiles | Restart procedure; staging/prod split in 14.1 is the durable fix. |

## Revision history
- **v5 (this document):** the v4 review's remaining blockers incorporated — three-concept seller identity (tenant / historical seller-account identity / actors — no relabeling, S1) + full field-by-field mapping with normalized primary offers (S2) + buyer duality re-recorded as PROPOSED with sub-points + verification≠suspension via SellerProfile.verificationState (S3) + payout legacy backfill, transfer reference/idempotency key, EFFECTIVE-on-confirmed-transfer with the honesty clause (S4) + recurring-run fencing token with the A/B/A test (S5) + legacy fulfillment initialization mapping with stated limitations (S6) + refund obligation-vs-execution state model with item-level allocations and defined effects (S7). Hardening: no live-offer reconstruction rule (H1), last-active-owner invariant (H2), single-database migration discipline (H3), credential-level DB isolation (H4).
- **v4:** v3 review's B1–B8 + M1–M3 (superseded).
- **v3:** v2 review's R1–R8 + tightened items (superseded).
- **v2:** v1 review's C1–C13 + WhatsApp incident (superseded).
- **v1:** initial replan from the expert assessment + owner decisions (superseded).

---

*On approval, execution begins at Phase 6.0 (credential rotation + evidence sensitivity pass) → 6.0b (staging isolation & safe verified restore, incl. credential-level DB isolation) → the RBAC closure items → 6.13 (D10 decision recorded, incl. buyer-duality sub-points) — every gate browser-verified per the evidence standard, every green gate committed and pushed. D9 is confirmed in the same Phase 6 window; 7.0 implements the seller-tenant substrate before any other Phase 7 schema work.*
