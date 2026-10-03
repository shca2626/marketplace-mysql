# Vendora — lastplan.md · The Final Production Plan (Phase 6 → Launch)

> **What this is:** the replan of every remaining task from Phase 6 to production launch.
> It supersedes the Phase 6–8 sketches in `mergedplan.md` (Phases 0–5 there are **complete and shipped**).
>
> **Inputs (three, merged):**
> 1. *Assessment of `answer4audit.md`* (external expert follow-up — verdict: "partially addressed; not audit-closed", with a P0/P1/P2 RBAC priority list and financial-integrity requirements).
> 2. The owner's eight decisions on the open questions (§2 below — binding).
> 3. The actual codebase state, re-verified for this plan (file-level evidence cited throughout).
>
> **Verified starting point:** Phases 0–5 complete and **pushed** — HEAD `8db9d42` on `origin/main` (correction to the working assumption: Phase 5 *is* pushed; `git status` clean, `main == origin/main`). Regression baseline per `mergedplan.md` §2 holds: retail loop, B2B RFQ loop, financing layer, 15+ admin panels, financier console, module activation matrix, RBAC substrate — all E2E-verified in earlier sessions.
>
> **Prime directive (owner):** complete the **main and core RBAC first, 100%** — then the rest in dependency order until the platform is **100% production-ready**.
>
> **Discipline (standing rules):**
> - Every phase ends with an E2E gate run in the browser (agent-browser), evidence captured.
> - After every successful gate: **commit + push to GitHub immediately** (standing owner rule).
> - A phase gate that fails blocks the next phase — no exceptions.
> - No destructive `db push --accept-data-loss` on financial data (see Phase 7's staged migration protocol).

---

## 1. What the expert's assessment actually demands (condensed into commitments)

The assessment's verdict — *"partially addressed; not audit-closed"* — is **accepted as the working truth**. Concretely, we adopt these as binding commitments:

| # | Assessment requirement | Where it lands in this plan |
|---|---|---|
| A1 | No normal `User.role = ADMIN` blanket bypass; break-glass = separate, MFA-protected, monitored account | **Phase 6.2** |
| A2 | No bare/shadowed `requireAdmin()`; explicit permission on every privileged route + route authorization matrix artifact | **Phase 6.1, 6.9** |
| A3 | Tenant & resource authorization on **reads as well as writes**, per-request org context (no multi-org union leakage) | **Phase 6.3, 6.10** |
| A4 | KYC/identity documents never served from public media URLs; authorization-checked delivery | **Phase 6.6** |
| A5 | MFA for privileged users **before** real customer data — a launch gate, not post-launch polish | **Phase 6.7** |
| A6 | Module authorization fails **closed** for unknown keys; org-scoped APIs resolve against the specific org in context | **Phase 6.3** |
| A7 | Negative authorization tests as a first-class regression suite (cross-tenant, revoked roles, disabled modules, self-approval, private docs) | **Phase 6.10** |
| A8 | ORG-scope role assignment requires active membership (invitation flow = atomic membership+role) | **Phase 6.4** |
| A9 | Hash staff invitation tokens (store hash, return raw once) | **Phase 6.5** |
| A10 | Audit writes atomic with the sensitive action they record; coverage verified | **Phase 6.11** |
| A11 | Least-privilege document access inside an org (role × document-sensitivity matrix, not "any member") | **Phase 6.8** |
| A12 | Money migration = **staged, reviewed financial migration** (backup → rules → per-row currency → shadow columns → backfill+reconcile → switch → constraints). Never a casual schema push | **Phase 7.1–7.2** |
| A13 | Atomic stock decrements, conditional payout claim with `payoutId: null` + row-count verification + immutable settlement lines | **Phase 7.3–7.4** |
| A14 | Full `ProductOffer → RfqLine → QuoteLine → OrderItem → Payout` attribution trace, tested with offer-seller ≠ product-seller | **Phase 7.6** |
| A15 | Recurring RFQ: durable run records with idempotency key; claim + creation atomic; crash recovery tested | **Phase 7.5** |
| A16 | `Product.stock` default → 0; `Order.status` default → not-PAID; state-transition validation | **Phase 7.7** |
| A17 | Accreditation renewal: explicit retention decision, atomic supersede | **Phase 7.8** |
| A18 | Treat every password that ever appeared in plan documents as **compromised** — rotate, revoke sessions, scrub docs | **Phase 6.0** |
| A19 | Re-run the audit against the resulting commit and close findings only with code + migration + test evidence | **Phase 7 gate + Phase 14** |

Everything the expert listed under "What I would accept from the response" (Decimal money, atomic stock, conditional payouts, private documents, token hashing, credential encryption, seller-level fulfillment, payment attempts/refunds when a real PSP arrives, cross-tenant negative tests) is scheduled below — nothing is dropped.

---

## 2. The Owner's Eight Decisions (binding answers to the open questions)

| Q | Decision (owner's words → engineering commitment) | Lands in |
|---|---|---|
| 1 | **Unverified-seller publishing:** admin-controlled, per-seller AND bulk; **default = "no" (do NOT block)**; sellers who are "not active" (suspended/inactive) are **always blocked** | Phase 8.5 |
| 2 | **Currency:** full **multi-currency** (not just dual display) — currency-aware money model, admin-managed FX rates, per-surface display + conversion | Phase 7.2 (+ buyer switcher UI in Phase 13) |
| 3 | **Multi-vendor:** Product/Offer split already shipped (Phase 4); now **finish it 100%** — offer attribution through quote→order→payout, per-seller fulfillment suborders | Phase 7.6 + 8.1 |
| 4 | **Financier console:** implement **ALL of it 100%** — full program CRUD, offers, inbox, agreements, accreditations, team, analytics, risk, Sharia artifacts, disbursement ops | Phase 10 |
| 5 | **Arabic/RTL:** **the LAST step** before final hardening | Phase 13 |
| 6 | **Monetization:** **a mix** — seller subscriptions + transaction commissions + financier fees, fully managed & customizable from admin (by actor, transaction type, category, seller, campaign…) | Phase 11 |
| 7 | **Platform-managed products:** strictly **3P marketplace — Vendora sells nothing (no 1P)**; the platform *manages* the entire catalog (agreements, CRUD…). The admin "add product" gap the owner has flagged repeatedly is closed with a **full** product form | Phase 9 |
| 8 | **KYC depth:** **both** — manual platform review (today's flow) **and** a verification-provider integration path, customizable from the admin platform (per document type: manual / provider / provider-then-manual) | Phase 12.4 |

---

## 3. Sequencing rationale (why this order)

```
Phase 6  RBAC & Security Core 100%      ← owner directive; every later phase rides on guards
Phase 7  Financial Integrity & Money   ← risky migration early; commerce/monetization build on Decimal
Phase 8  Commerce Depth                ← suborders + checkout financing + buyer/seller depth + Q1 policy
Phase 9  Admin Catalog & Products 100% ← owner's #1 operational pain ("told you 10 times")
Phase 10 Financier Console 100%        ← completes Q4; uses commerce + money substrate
Phase 11 Monetization Mix              ← fee engine + subscriptions (needs 7+8+10 substrate)
Phase 12 Directory, Discovery, Trust + KYC provider  ← growth surface; KYC provider per Q8
Phase 13 Arabic / RTL / i18n           ← LAST feature phase per owner Q5
Phase 14 Production Hardening & Launch ← final gates, drill, go-live
```

Dependency logic: RBAC gates everything (a permissioned admin console is the substrate for every later admin feature). The money migration must land before commerce depth, monetization, and multi-currency UI so no Float-based feature is built twice. Admin catalog (Phase 9) precedes financier completion (Phase 10) only because it is the owner's most-repeated operational demand and is independent of financier work. Arabic last per explicit owner instruction; hardening closes.

Estimated calendar: **~14–18 weeks** of focused work end-to-end (phases overlap where safe: 9 can start when 8's suborder design freezes).

---

# PART I — THE PLAN

## Phase 6 — RBAC & Security Core, 100% · ~2 weeks
**Owner directive: this is the most important phase. Do it 100%.**

Current verified state: `requireAdmin(permission?)` dual-mode guard (`src/server/guards.ts`), 903-line RBAC service, 497-line permission catalog (`src/lib/rbac-catalog.ts`), admin Roles & Access console, privilege bracketing, session-version invalidation, module gates (`requireModule`). The expert's assessment confirms the architecture is keepable — the *closure items* below make it 100%.

### 6.0 Credential hygiene (assessment A18 — first action, before any code)
1. Rotate **every** account password that has appeared in any plan document, seed script, or chat (admin, QA buyer/seller/financier accounts). New secrets generated and stored only in the secret store, never in repo/docs.
2. Bump `sessionVersion` for all users → all existing sessions die.
3. Scrub credentials from `mergedplan.md` §8 and any other tracked docs (replace with "rotated — see secret store"); note in commit message that history contains them, so rotation (not deletion) is the control.
4. Repo-wide sweep for hardcoded secrets/keys (WhatsApp session keys, API keys) → move to env; rotate what can't be moved.

### 6.1 Guard repairs — zero shadowed/bare privileged routes (A2)
1. Delete the **local `requireAdmin()` shadows** in `src/app/api/admin/slides/route.ts`, `src/app/api/admin/slides/[id]/route.ts`, `src/app/api/admin/settings/route.ts` — import the guard from `@/server/guards` with explicit keys (`storefront.manage`).
2. `src/app/api/quotes/[id]/review/route.ts` — the one remaining bare legacy call — gets its explicit permission key (RFQ quote-review domain).
3. **Guard-lint script** (`scripts/check-guards.ts`, wired into CI + regression): fails if any `route.ts` defines a local `requireAdmin`, calls `requireAdmin()` with no permission argument, or calls `requireModule` with a string literal not present in the module registry. This makes the defect class impossible to reintroduce.

### 6.2 End the `User.role = ADMIN` blanket bypass (A1)
1. Migrate the legacy super-admin account to the protected `platform.super-admin` RBAC role (assignment verified, audit-logged).
2. Flip `requireAdmin`/`requireAdminAny`/`requireModule` to **stop honoring `user.role === 'ADMIN'`** — `User.role` becomes a classification label only, never an authorization fact.
3. `requireAdmin()` with no permission key becomes a **throw** (programmer error), not a 403 — impossible to ship a permissionless privileged route.
4. **Break-glass path (deliberate, minimal):** a single dedicated `break-glass` account with the protected super-admin role, MFA-enforced (6.7), login alerted (notification + `BREAKGLASS_LOGIN` audit), every action it takes already audit-logged by the existing trail. No other bypass exists anywhere.

### 6.3 Module gating: fail closed + per-org resolution (A6, A3)
1. `src/server/modules/modules/service.ts` — replace both `?? true // unknown module keys fail open` branches: **API authorization fails closed** (unknown key → 403 `MODULE_UNKNOWN` + server-side config-error log). Storefront *availability* (nav rendering) resolves through the `ModuleDefinition` registry only — a key with no definition simply renders nothing; the two concerns are now separate, as the assessment required.
2. Org-scoped APIs must resolve module activation **against the specific organization in the request context** — audit every `requireModule` call site; org-scoped financier-console calls already pass `ctx.orgId` (keep), personal-scope user-union stays for *navigation features only*, and any route that authorizes **data access** by user-union is refactored to resolve per-target-org.
3. Tests: (a) misspelled module key on an API → denied, never granted; (b) multi-org user with module ON in org A and OFF in org B → org-B-scoped resource access denied, org-A allowed.

### 6.4 Role assignment integrity (A8)
1. `assignRole` (ORG scope) requires an **active `OrganizationMember` row** for (user, org) — verified before the write, tested.
2. The one sanctioned exception: the invitation flow creates membership + role assignment **atomically** (single `$transaction`) — already the financier-team path; extended as the only pattern for org-role onboarding.
3. Org member removal (existing org team API) revokes that member's org-scoped `UserRole` rows **in the same transaction** — no orphaned assignments. Backfill sweep: report + revoke any existing orphans.

### 6.5 Invitation tokens hashed (A9)
`StaffInvitation.token` → `tokenHash` (SHA-256, same pattern as `PasswordResetToken`/`OtpCode`): raw token returned exactly once at creation; consumption by hash lookup. Pending plaintext invitations at migration time are invalidated (owners re-invite — cheap and safe).

### 6.6 Private document delivery (A4)
1. New authorization-checked file route: `GET /api/documents/[id]/file` — policy: document owner; org members per the sensitivity matrix (6.8); platform staff with the relevant permission; financiers for documents shared into their review scope. Session-authenticated, rate-limited, audit-logged (`DOCUMENT_DOWNLOADED`).
2. Upload-side flagging: identity/KYC/financial uploads are marked **private** at ingest (`Upload.visibility` / document-type-driven); private keys are **excluded from the public `/api/media/[...key]` route** (404 for them there).
3. Admin console document viewers switch to short-lived **signed URLs** (HMAC + expiry + document-id binding) — no long-lived public links for sensitive material.
4. WhatsApp credentials encryption (accepted remediation): `WhatsAppSender.credsJson` AES-GCM encrypted at rest, decrypted only in the service process.

### 6.7 MFA for privileged users (A5 — launch gate, moved up from old Phase 8)
1. TOTP (RFC 6238) + generated backup codes; schema: `mfaSecret` (encrypted), `mfaEnabledAt`, `mfaRequired` (policy bit).
2. **Enforced** for: every account holding any platform-scope role, and org-scope roles covering role management, payouts, payment capture, KYC/document verification, dispute resolution, module management. (Buyers/sellers at large: optional, later — per assessment, privileged MFA is the gate.)
3. Login flow: password → (phone OTP where applicable) → TOTP challenge when enrolled/required. Sessions carry `mfaSatisfiedAt`; privileged guards check it.
4. Admin console: per-staff "Require MFA" toggle + platform policy setting; enrollment wizard with QR; recovery via admin reset (audit-logged).

### 6.8 Least-privilege document access inside orgs (A11)
1. Document sensitivity classes: `PUBLIC` / `ORG_INTERNAL` / `SENSITIVE_IDENTITY` / `SENSITIVE_FINANCIAL` — derived from document type (KYC IDs, licenses → identity; statements, payout details → financial).
2. Access matrix role × sensitivity within an org: OWNER/ADMIN full; approver/underwriter/reviewer per financing flow needs; **VIEWER/BUYER member → PUBLIC + ORG_INTERNAL only**. Matrix lives in one resolver with tests.
3. Negative tests: VIEWER denied a SENSITIVE_IDENTITY doc; org-B member denied org-A's ORG_INTERNAL doc.

### 6.9 Route authorization matrix — the artifact (A2)
`scripts/gen-route-matrix.ts` generates `audit/route-matrix.md`: every API route with method, required permission key, scope (PLATFORM/ORG/SELLER/BUYER/FINANCIER/OWNER), org-context resolution (explicit-ctx vs user-union), and the negative test IDs covering it. Regenerated in CI; drift = failure. This is the assessment's "permission-coverage inventory" — a **route-by-route result, not a count**.

### 6.10 Negative authorization test suite (A7 — first-class regression)
A scripted suite (`scripts/auth-negative-tests.ts`, run in CI + at every phase gate) executing the assessment's checklist end-to-end against the live server:

1. Org A cannot retrieve Org B's order / RFQ / application / approval / document (GET + PATCH + approve + download).
2. Buyer cannot perform approver action; vendor cannot reach platform staff routes.
3. Revoked role / suspended user → **immediate** access loss (sessionVersion + per-request DB-state verification both tested).
4. ORG role assignment to a non-member → 400 (except atomic invitation flow).
5. Disabled module → 403 at API (not just hidden nav).
6. Unknown/misspelled module key → denied.
7. Self-approval of one's own request → 403.
8. Private document via public media URL → 404; via signed URL after expiry → 403.
9. Break-glass account login → alert fired + audit row exists.
10. Privileged route without MFA-satisfied session → 403.

### 6.11 Audit atomicity & coverage (A10)
1. Sensitive state changes (role grants/revokes, payout mark-paid, financing gate decisions, module flips, document verify/reject) write their `AuditLog` row **inside the same `$transaction`** as the change. Sweep + refactor the outliers.
2. Failure-injection test: force an audit-write failure → the action rolls back (no silent skip).
3. Tamper-resistance statement: append-only via app code paths (verified: no update/delete calls), plus DB-level mitigation documented (restricted DB role for the app user blocking `UPDATE/DELETE` on `AuditLog` — applied where the managed MySQL plan allows; otherwise the operational control is documented and scheduled with DBA).

### Phase 6 acceptance gate (all must pass, in browser + scripted)
- [ ] Guard-lint script: zero local shadows, zero bare `requireAdmin`, zero unknown module literals — green.
- [ ] Route matrix generated; **100% of privileged routes carry an explicit permission key**; matrix committed.
- [ ] Negative suite: **10/10 green** with screenshots/log evidence.
- [ ] Legacy ADMIN bypass removed; super-admin operates purely via RBAC role; break-glass login triggers alert.
- [ ] MFA enrollment + enforced privileged login E2E (TOTP challenge → console access).
- [ ] Private KYC document: denied publicly, delivered via auth-checked route + signed URL, cross-org denial.
- [ ] All credentials rotated; docs scrubbed; old sessions dead.
- [ ] Full regression baseline (mergedplan §7) still green.
- [ ] **Commit + push.**

---

## Phase 7 — Financial Integrity & Multi-Currency · ~2 weeks
**The money phase. Everything here follows the assessment's staged-migration guidance (A12) — no casual schema pushes.**

### 7.1 Staged Float → Decimal migration (60 Float fields today)
Exactly the assessment's seven steps, as hard protocol:
1. **Backup + baselines:** full DB backup; row counts + financial reconciliation baselines (orders, payments, payouts, commissions, financing fees) captured as a signed report.
2. **Precision & currency rules:** `DECIMAL(15,2)` for settled amounts (totals, payout, fees); `DECIMAL(18,6)` for unit prices, rates, FX, intermediate math; currency-specific minor units defined (§7.2). Documented per-column mapping table reviewed before any DDL.
3. **Per-row currency determination:** from reliable per-table history (retail = USD; financing entities = YER); no blanket default where ambiguous — ambiguous rows are listed and resolved explicitly before backfill.
4. **Shadow columns + backfill:** Decimal columns added alongside Float (reviewed migration, **no `--accept-data-loss`**); backfill script writes old→new; automated diff report must be **zero-mismatch**.
5. **Writers/readers switch** to Decimal; reconcile orders, payments, payouts, commissions, financing fees against baselines — signed reconciliation report.
6. **Flip** production reads/writes only after reconciliation passes; documented rollback (Float columns retained until 7.1 step 7).
7. **Constraints & defaults after validation** (`CHECK (amount >= 0)` where semantically right, defaults fixed per 7.7); Float columns dropped in a separate, later reviewed migration.

### 7.2 Multi-currency substrate (Q2)
1. `Currency` (code, symbol, minorUnits, active) + `ExchangeRate` (pair, rate, validFrom, source, admin-managed history) — seeded USD, YER, SAR.
2. Money fields carry explicit `currency` codes (per 7.1 mapping); a configurable platform **base currency** for internal accounting.
3. Admin console: currency + FX management (manual entry now; auto-fetch provider hook later — Phase 12 pattern).
4. Display: per-surface default + conversion component ("YER 152,400 ≈ $122") driven by current rates; financing surfaces YER-native, retail USD-native, all amounts currency-explicit. Buyer-facing **switcher UI** arrives with i18n (Phase 13) — the data model is ready here.
5. `FinancingFee`, payouts, commissions, price lists all become currency-aware (Phase 11 fee engine builds on this).

### 7.3 Atomic inventory decrements (A13)
Replace read-check-write with conditional writes + affected-row verification on every path: `updateMany({ where: { id, stock: { gte: qty } }, data: { stock: { decrement: qty } } })` → `count === 1` or rollback. Paths: product base, variant (with parent total sync), offer (checkout), RFQ conversion, approval reservation, restock-on-cancel. **Concurrency test:** two parallel checkouts for the last unit → exactly one order, one 409.

### 7.4 Payout settlement hardening (A13)
1. Conditional claim: `updateMany({ where: { id IN (…), payoutId: null, order status OK }, data: { payoutId } })`; verify affected count === expected; mismatch → transaction abort + recompute.
2. **Immutable `PayoutLine`** snapshot rows (orderId, orderItemId, offerId, sellerId, amount, currency, commissionRate, commission, net, capturedAt): payouts stay auditable after cancellation/correction even when item links are released or re-stamped.
3. Mark-paid re-guarded (paid only from PENDING; idempotent).
4. **Concurrency test:** two simultaneous payout generations for one seller → one payout or a clean rejection — never duplicated settlement.

### 7.5 Recurring RFQ durability (A15)
1. `RecurringRfqRun` model: scheduleId, dueAt, status (CLAIMED/CREATED/FAILED), idempotency key (`scheduleId:dueAt` unique), rfqId.
2. Sweep claims by inserting the run row (unique key = the CAS) **and creating the RFQ in the same transaction**; failures leave a FAILED run that the next sweep retries (bounded retries + alert).
3. **Crash test:** kill between claim and creation → next sweep recovers, no duplicate RFQ, no lost run.

### 7.6 Offer attribution through quote → order → payout (A14, closes Q3)
1. `QuoteLine.offerId` added (snapshot semantics, like `OrderItem.offerId`); quote creation copies it from the `RfqLine` and validates the offer belongs to the quoted product.
2. Quote conversion: `OrderItem.sellerId = line.offerId ? offer.sellerId : product.sellerId` — **server-authoritative at conversion**, price/currency snapshotted from the accepted quote line.
3. **The trace test** (the assessment's exact demand): seller B's offer on a product primarily listed by seller A → RFQ targets B's offer → B quotes → buyer accepts → convert → assert at every hop the authoritative seller, offer, price, currency, quantity — through to B's payout. Green = Q3 closed.

### 7.7 Dangerous defaults + transitions (A16)
`Product.stock @default(0)` (+ data review of existing default-10 rows); `Order.status @default("PENDING_PAYMENT")` + a server-side transition map (PAID only via payment-success events; cancellations/failures only via legal transitions). Illegal transition attempts → 400 + audit.

### 7.8 Accreditation renewal retention (A17)
Decision per assessment: **retain history**. Renewal = new request row with `supersedesId`; prior request → `ARCHIVED` (never deleted) with its `RequirementSubmission` evidence intact; `ACCREDITATION_RENEWED` audit links the chain; archive + create + audit atomic in one transaction. (If the owner later opts for deletion on compliance grounds, it becomes a config flip — default is retain.)

### Phase 7 acceptance gate
- [ ] Reconciliation reports: zero-diff backfill, zero-diff switch, signed and committed.
- [ ] Concurrency tests (stock, payout) green; crash-recovery test green; attribution trace green.
- [ ] Multi-currency admin CRUD + conversion display E2E; financing figures YER-native.
- [ ] Defaults + transition guard tests green.
- [ ] Renewal flow archives (not deletes) — verified in data + audit.
- [ ] **Audit re-run (A19):** produce `answer4audit-v2.md` addendum with code + migration + test outputs for every finding this phase closed — sent for expert re-review.
- [ ] Full regression + **commit + push.**

---

## Phase 8 — Commerce Depth · ~2–3 weeks (old mergedplan Phase 6, expanded)

### 8.1 Per-seller fulfillment suborders
1. `OrderFulfillment` (orderId, sellerId, status: AWAITING→PACKED→SHIPPED→DELIVERED, carrier, tracking, per-item links, timestamps, events) — one per distinct seller in an order; `Order.status` becomes a **derived roll-up**.
2. Seller console ships per suborder (carrier + tracking + label preview); buyer order tracking renders per-seller groups + overall progress; partial cancellation per seller group (feeding payout/refund implications via Phase 7 lines).
3. RFQ-converted orders: suborders derive from per-item `sellerId` (7.6 makes this trustworthy).

### 8.2 Islamic finance at checkout (the Murabaha method)
1. Checkout payment method "Finance it (Murabaha)": pre-qualification via the financing engine (eligible financiers/programs by amount, tenor, buyer KYC level — L2+ gate per Phase 3 levels).
2. Financed order state machine: `PENDING_FINANCING → (offer picked + agreement signed) → FINANCED_CONFIRMED → PAID` on financier disbursement confirmation; agreement + installment schedule surface in the buyer's order view; financier console gets the disbursement queue.
3. Failed/expired pre-qualification falls back cleanly to standard payment (order stays payable, nothing half-committed).

### 8.3 Buyer depth
Spec-matrix compare (normalized attributes side-by-side), saved addresses CRUD (+ default + per-order selection), one-click reorder from past orders, guest checkout (email/phone, claim-account path afterward), product Q&A (buyer asks → seller answers → admin moderation; answers feed SEO).

### 8.4 Seller depth
Onboarding checklist (profile → logo → first listing → payout details, with progress state), store settings page (logo/banner/policies/payout account — completing the last Phase-1 leftovers), product-form draft autosave/recovery, CSV import polish, low-stock alerts (per-product threshold + notification), seller-scoped coupons, shipping zones (zone + rate + free-shipping threshold), analytics depth (views, conversion, funnel from existing event/audit data).

### 8.5 Unverified-seller publishing policy — owner decision Q1
1. Platform setting `marketplace.publishPolicyForUnverified`: **default `ALLOW`** (owner chose "no" to blocking).
2. Per-seller override in the admin vendor console: `ALLOW | REVIEW | BLOCK` + **bulk action** across vendors.
3. `REVIEW` routes publishes into the Phase 4 admin review queue (substrate exists); `BLOCK` rejects at API with a clear message.
4. **Hard rule independent of settings:** suspended/inactive sellers ("not active") are **always blocked** from publishing products AND offers — enforced at the write path, tested.
5. KYC-level hooks (Phase 3) remain composable on top (e.g. require L2 to publish even when policy = ALLOW, if configured).

### Phase 8 acceptance gate
- [ ] Mixed-seller order: both sellers ship independently; buyer sees grouped tracking; roll-up status correct.
- [ ] Financed checkout E2E: prequal → offer → agreement → disbursement → PAID + installments visible.
- [ ] Guest checkout completes; reorder works; Q&A round-trip works.
- [ ] Seller checklist/store settings/coupon/shipping/low-stock E2E.
- [ ] Publish policy: default ALLOW verified; per-seller + bulk flips verified; suspended seller blocked (API-level evidence).
- [ ] Regression + **commit + push.**

---

## Phase 9 — Admin Catalog & Product Management 100% · ~1.5 weeks (Q7 — "told you 10 times")

Verified today: the admin Catalog→Listings tab has a **simplified** curated-listing dialog (URL-pasted images, no media library, no variants, no structured specs) + CSV + clone. The owner's requirement is a **full** product management console. Vendora remains strictly 3P (no 1P selling) — the platform *curates and manages* the catalog.

1. **Full admin product form:** re-scope the seller 7-tab product form (media library uploads, structured specs, variant editor with attributes, shipping, SEO, GTIN/MPN/brand, category) for admin use — "Add Product" prominent in Catalog + Products panels. Ownership = Vendora Catalog system account (existing pattern), `isCurated` flagged.
2. **Full CRUD:** edit every field of curated listings; archive/restore; guarded delete (offers attached → archive-only with reason); bulk actions; change-log per edit (audit diff).
3. **Admin edit of seller listings (moderation with teeth):** extend today's rename-only path to the full form with mandatory change-reason, seller notification, and audit diff.
4. **Publication agreement management:** versioned agreement templates, per-org-type defaults, per-product requirement toggle, consent records searchable + exportable (audit evidence).
5. **Catalog quality tooling:** spec-template-driven validation for curated products; popular curation drag-ranking; duplicate-merge UX polish (Phase 4 substrate).

### Phase 9 acceptance gate
- [ ] Admin creates a product with media uploads + specs + variants → publishes → buyer sees/selects variants.
- [ ] Admin edits a seller listing → seller notified, audit diff recorded.
- [ ] Agreement template v2 applied → next seller publish re-captures consent.
- [ ] Guarded delete refuses when offers exist; archive path works.
- [ ] Regression + **commit + push.**

---

## Phase 10 — Financier Console 100% · ~1.5–2 weeks (Q4 — "implement all 100%")

Verified today (Phase 5): dashboard, services CRUD + Sharia terms, requirements composer, gated inbox, offers, accreditations + supersede-renewal, agreements, team & roles (underwriter/reviewer/branch officer), institution profile, activation journey. Completing it:

1. **Portfolio analytics:** approval rate, disbursed volume, average ticket, aging/NPL buckets (30/60/90+ arrears), per-branch/per-program breakdowns, charts + CSV export.
2. **Risk scoring:** per-financier configurable scoring model (KYC level, org tenure, order history, sector weights) → score computed per request as **decision support** (auto-decision only if the financier explicitly enables it).
3. **Sharia artifact management:** scholar certification records per program (upload/expiry/reminders — reusing the Phase 3 expiry engine), versioned contract templates with variable substitution, e-signature capture on agreements (signature image + content hash + audit trail).
4. **Disbursement operations:** queue → confirm (payment rail reference + FX snapshot via Phase 7 currency model) → installment tracking (due/collected/late) → configurable late-fee application (rate + cap per program).
5. **Collections & statements:** buyer statement of account per agreement (installments, payments, late fees), reminders through existing email/WhatsApp channels.
6. **Branch operations:** branch assignment on team members; branch-scoped inbox for branch officers; per-role underwriting limits (admin-configurable matrix).
7. **Public institution polish:** rich program pages (seeded rich content), branch locator, apply CTAs.

### Phase 10 acceptance gate
- [ ] Full lender lifecycle E2E: application → gate → forward → offer → agreement → e-sign → disburse → installment collection → statement.
- [ ] A late installment appears in NPL bucket; late fee applies per config with cap.
- [ ] Branch officer sees only their branch queue; underwriter limit enforced.
- [ ] Risk score surfaces on request with model breakdown.
- [ ] Regression + **commit + push.**

---

## Phase 11 — Monetization Mix · ~2 weeks (Q6 — mix, admin-customizable)

Substrate today: flat 10% commission snapshot at payout; `FinancingFee` model (SUCCESS/ORIGINATION/ACCREDITATION, ACCRUED→INVOICED→PAID/WAIVED); price lists; ModuleActivation (PLATFORM/ORG_TYPE/ORG — **no SUBSCRIPTION scope yet**).

1. **Fee engine — `FeeRule`:** event (ORDER_PAID, FINANCING_DISBURSED, RFQ_CONVERTED, SUBSCRIPTION_RENEWAL…), actor type (SELLER/FINANCIER/BUYER), scope (platform / category / seller / org / program), dimension (percent / flat / tiered-by-amount), precedence + effective dating; admin matrix UI + **simulator** ("what fee applies to this order?") + audit on every applied fee. The current 10% commission migrates to a platform rule — zero behavior change on day one.
2. **Seller subscriptions:** `SubscriptionPlan` (module bundle + limits: max products, CSV rows, RFQ bids) + `SellerSubscription` (status, renewAt); billing through the fee engine (invoice + manual payment capture now, PSP later); upgrade/downgrade proration rules; **new `SUBSCRIPTION` scope in the module resolution chain** (ORG > ORG_TYPE > SUBSCRIPTION-plan > PLATFORM > default).
3. **Financier monetization:** optional program listing fees, institution subscription tiers (analytics/risk scoring as paid modules), success fee on disbursement — all FeeRule-driven with caps.
4. **Commission customization:** per-seller overrides (existing `commissionRate` migrates into rules), per-category rates, promotional windows (e.g. 0% campaign periods).
5. **Revenue console:** MRR, commission earned, financing fees, per-actor breakdowns; **payout impact preview** before applying any rule change.

### Phase 11 acceptance gate
- [ ] Fee simulator's answer matches the fee actually applied on real order/financing/subscription flows.
- [ ] Seller on plan A vs B: correct modules + limits enforced (module chain includes SUBSCRIPTION scope).
- [ ] Commission invoice per payout; revenue dashboard reconciles with the fee ledger to the cent (Decimal).
- [ ] Promotional window applies and expires correctly.
- [ ] Regression + **commit + push.**

---

## Phase 12 — Directory, Discovery, Trust + KYC Provider · ~1.5–2 weeks

1. **Brands directory:** brand pages (logo, verified badge, product/offer counts, popular listings); trending/bestsellers pages; services directory beyond financing.
2. **Advanced discovery:** spec-attribute-driven facets (wattage, voltage, capacity…), typo-tolerant search, normalized cross-product comparison.
3. **Trust signals:** verified-store counters, transaction counts, storefront badges.
4. **KYC provider abstraction (Q8):** `KycProvider` interface (submit document set → status/claims), default `MANUAL` (today's review flow), admin-configurable provider settings per document type (`MANUAL | PROVIDER | PROVIDER_THEN_MANUAL`), no vendor lock-in; both paths fully audited; provider failure falls back to manual (tested with a mock provider).
5. PWA shell + newsletter capture as stretch items.

### Phase 12 acceptance gate
- [ ] Brand page E2E; facets narrow results correctly; search tolerates a typo.
- [ ] With mock provider enabled: doc routes through provider then falls back to manual on simulated failure — audit shows both.
- [ ] Regression + **commit + push.**

---

## Phase 13 — Arabic / RTL / i18n — THE LAST FEATURE PHASE · ~2 weeks (Q5)

1. Dictionary-based i18n with locale routing (`/ar/…`), persisted AR/EN toggle, direction-aware rendering.
2. RTL mirroring across marketplace + dashboards (logical CSS properties audit, component-level fixes, Arabic typography).
3. Arabic content: financier profiles, program copy, marketplace chrome, transactional emails (bilingual).
4. **Buyer-facing currency switcher UI** (riding Phase 7's currency/FX substrate — YER primary per blueprint, USD/SAR display).
5. Admin console: display-level AR where feasible (read-only), full AR staff UI not in scope.

### Phase 13 acceptance gate
- [ ] Complete buyer journey in AR RTL at 390px: browse → cart → checkout → order tracking, no overflow, no broken layout.
- [ ] AR email arrives; toggle persists across sessions.
- [ ] Currency switcher converts display correctly per surface.
- [ ] Regression + **commit + push.**

---

## Phase 14 — Production Hardening & Launch · ~1 week + ongoing

1. **Email-verification enforcement** (grace policy for buyers; strict for staff/sellers — staff already behind MFA from Phase 6).
2. **Session management UI:** admin sees + revokes active sessions per user; personal "sign-out everywhere" already exists — surfaced in settings.
3. **Rate limiting expansion** (auth, RFQ, quotes, document downloads) + password policy (length/composition/breach-list check) + **rotation policy for privileged accounts**.
4. **Ops:** automated Aiven backups with a **verified restore drill**; uptime monitoring; staging/production split; CI gates (lint + type + guard-lint + route-matrix sync + auth-negative suite + business regression).
5. **Performance:** pagination on all admin tables; image lazy-load/CDN polish; seed-data cleanup (example.com links, placeholder contacts, 2026 dates).
6. **Launch checklist:** secrets audit (nothing rotated in 6.0 leaked back), privacy/ToS pages live, support inbox wired, DSR path documented, three consecutive green full-regression runs, backup-restore drill signed.
7. **Final audit closure (A19):** `answer4audit-v2.md` updated with final evidence; any finding still open is explicitly risk-accepted in writing by the owner or closed.

### Phase 14 acceptance gate = LAUNCH GATE
- [ ] Full regression suite ×3 consecutive green (business + authorization-negative + financial-integrity).
- [ ] Backup restore drill passed and recorded.
- [ ] 60-minute stability soak: zero 502s, zero lost forms, zero console errors.
- [ ] Launch checklist signed by owner.
- [ ] Final **commit + push** + tag.

---

# PART II — CROSS-CUTTING RULES

## Regression checklist (updated — runs after EVERY phase)

**Business flows (existing baseline):** register → coupon order → tracking; RFQ create→quote→negotiate→accept→convert→fulfill; financing wizard → gate → offer → agreement; admin panel walk with count consistency; team invite/remove/role-change; 60-min soak.

**Authorization cases (new — from the assessment, permanent):**
- Org A ✗ Org B's order / RFQ / application / approval / document (read + write + approve + download).
- Buyer ✗ approver action; vendor ✗ staff routes; staff ✗ tenant data.
- Revoked/suspended user loses access **immediately**.
- ORG role ✗ assignment to non-member (except atomic invitation).
- Disabled module ✗ at API; unknown module key ✗ never grants.
- Self-approval ✗. Private doc ✗ via public media URL; expired signed URL ✗.
- Privileged session without MFA ✗.

**Financial-integrity cases (new):** concurrent last-unit checkout (one winner); concurrent payout generation (no duplicates); recurring crash-recovery (no lost/duplicate runs); offer-seller ≠ product-seller attribution trace end-to-end; reconciliation diff = 0 after any money migration.

## Explicit non-goals / deferrals (with rationale — agreed positions)
- **ABAC / resource-level conditional permissions** beyond the document matrix — no current requirement; revisit when "manage only this vendor's catalog" is a real ask. (Assessment concurs.)
- **Unifying OrganizationMember roles with RBAC** into one model — dual-model is documented and consistently enforced; revisit only on demonstrated inconsistency. (Assessment concurs.)
- **Real PSP integration** — checkout financing uses internal disbursement; the attempts/refunds schema substrate was designed in `answer4audit.md` and lands with the PSP commercial project, not this plan.
- **DB-level scope redesign** (empty-string sentinel) — stays while app validation + the Phase 6 test suite hold. (Assessment P2 concurs.)
- **Role-assignment soft-lifecycle columns** (revokedAt etc.) — delete-plus-audit remains; columns are a post-launch P2.
- **Full AR staff console** — buyer/seller/public AR only in Phase 13.

## Risk register (live)
| Risk | Status / mitigation |
|---|---|
| RESEND_API_KEY lost | Digest emails degrade (FAILED + retry UI). Owner must supply key before launch (Phase 14 checklist). |
| Money migration (Phase 7) | Staged protocol with backups, shadow columns, zero-diff gates, rollback — the plan's highest-risk item gets the strictest gates. |
| OOM under parallel compiles (4GB box) | Restart procedure known; staging/production split (Phase 14.4) is the durable fix. |
| Sandbox `DATABASE_URL` injection | Patched at `db.ts` layer; real deploys unaffected; documented. |
| Expert audit re-open | `answer4audit-v2.md` evidence cycle at Phase 7 gate + Phase 14 closure — findings close only with code+migration+test output. |

## Where each open item from the assessment & mergedplan lands (traceability)
- mergedplan Phase 6 (commerce) → **Phase 8**; Phase 7 (directory/AR) → **Phases 12 + 13**; Phase 8 (hardening) → **Phase 6 (MFA/security pulled up per assessment) + Phase 14**.
- Assessment P0 table (7 items) → Phase 6.0–6.10. P1 (6 items) → 6.4–6.11. P2 (4 items) → 6.11/14.2 + deferrals above.
- Owner Q1→8.5 · Q2→7.2/13.4 · Q3→7.6/8.1 · Q4→Phase 10 · Q5→Phase 13 · Q6→Phase 11 · Q7→Phase 9 · Q8→12.4.

---

*This is the complete and final replan. On approval ("audit agree"), execution begins at Phase 6.0 — credential rotation — followed by the RBAC closure items in order, each verified in-browser, each committed and pushed on its green gate.*
