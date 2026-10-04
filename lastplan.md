# Vendora — lastplan.md · v2 · The Final Production Plan (Phase 6 → Launch)

> **What this is:** the complete replan of every remaining task from Phase 6 to production launch.
> It supersedes `mergedplan.md` §6 (Phases 6–8 there) and **lastplan.md v1** (which the reviewer approved in direction but not as final).
>
> **Inputs (four, merged):**
> 1. *Review of `lastplan.md`* (the reviewer's verdict: **"approve the direction, not this plan as final"** — 13 required corrections, all incorporated here and traced in §"Revision history").
> 2. *Assessment of `answer4audit.md`* (external expert — "partially addressed; not audit-closed"; P0/P1/P2 RBAC priorities; staged financial-migration protocol).
> 3. The owner's eight binding decisions on the open questions (§2).
> 4. The actual codebase, re-verified for this plan (schema line numbers cited where they matter).
>
> **Verified starting point:** Phases 0–5 complete and pushed; HEAD `b1681f1` on `origin/main` (includes the WhatsApp pairing fix — see §6.0a).
>
> **Prime directive (owner):** complete the **main and core RBAC first, 100%** — then the rest in dependency order until production-ready.
>
> **Standing discipline (unchanged):**
> - Every phase ends with a gate verified in the browser (agent-browser), evidence captured.
> - After every green gate: **commit + push immediately** (standing owner rule).
> - A failed gate blocks the next phase — no exceptions.
> - **Adversarial tests, concurrency tests, and file-access tests run against staging only, never production** (reviewer §1).
> - No destructive schema work on financial data; all migrations follow the staged protocol (§7.1).
> - The final gate permits **explicitly approved residual risks** — it never forces the label "100% ready" while material risk remains (reviewer §13).

---

## 0. Reviewer's verdict → what changed in v2 (summary)

The reviewer approved: RBAC-first sequencing, credential hygiene before features, explicit permission checks + negative tests, per-organization module resolution, privileged MFA pulled forward, private KYC document delivery, staged money migration, atomic stock/payout concurrency, accreditation retention as an explicit decision, audit re-run on evidence. Those all remain, mostly unchanged.

The 13 corrections (each traced to its landing place below):

| # | Correction (reviewer) | Resolution in v2 |
|---|---|---|
| C1 | Isolated staging + **tested restore** before Phase 6/7, not Phase 14; document which environment every test touches | **New Phase 6.0** — staging isolation & verified-recovery pre-gate, before any authorization/concurrency testing |
| C2 | `@@unique([serviceId, organizationId])` makes "retain + create new" impossible — explicit schema change + status taxonomy + test | **Phase 7.8** — constraint replaced with an active-marker unique; `supersedesId` relation; ARCHIVED/EXPIRED/REJECTED/REVOKED defined; renewal-with-history test |
| C3 | 3P catalog vs "Vendora Catalog system seller" contradiction — ownership model specified before the form | **Phase 9.1** — data-model change first: `sellerId` nullable for curated listings, curator separated from seller, purchasability only via real vendor offers, negative test |
| C4 | Murabaha checkout depends on financier ops that only arrive in Phase 10; needs legal/Sharia review; installment payment model unspecified | **Moved to Phase 10.9** (after lender ops) + legal/Sharia review as a hard precondition + installment receive/allocate/reverse/reconcile model in Phase 10 |
| C5 | Document privacy vs content-hash dedup conflict; public media path must not serve sensitive docs; unknown types default sensitive; financier scope per application; short-lived uncacheable signed URLs; issuance ≠ retrieval logging | **Phase 6.6 redesigned** — separate private-vault storage namespace with dedup isolation; launch blocker |
| C6 | Stateless sessions vs promised per-session admin UI mismatch | **Phase 6.7** — persistent session registry added (id, device, created/last-used, revocation, mfaSatisfied); Phase 14 UI built on it |
| C7 | Route coverage must be a reviewed classification of **every** route into six buckets; CI fails on unclassified/unknown; include server actions, jobs, and other entry points | **Phase 6.2 + 6.10** — classification-first guard-lint and matrix; scope widened beyond `route.ts` |
| C8 | ADMIN removal is lockout-sensitive — tested rollout procedure; sweep `User.role === 'ADMIN'` outside route guards | **Phase 6.3** — six-step rollout + full-codebase sweep |
| C9 | Money migration: field-by-field inventory (only monetary floats); defined rounding rule before diff; transaction/display/settlement/accounting currencies; FX snapshots; historical currency from data; per-field decimals | **Phase 7.1** rewritten to this precision |
| C10 | Single authoritative stock source (base+variant); reservation expiry policy; payout one-item-one-line; corrections without rewriting history; claim-mismatch handling; snapshot/reconcile | **Phase 7.3 / 7.4** |
| C11 | Subscription scope must be an entitlement **ceiling**, not another overridable default; unpaid/downgrade tests | **Phase 11.2** — ceiling semantics + tests |
| C12 | Unverified-seller policy = explicit risk acceptance with mitigations; suspended/inactive block tested at every publishing path | **Phase 8.5** — risk register entry + mitigations + exhaustive path tests |
| C13 | Timeline is an assumption, not a commitment; final gate needs dependency/secret scanning, security testing, load testing, recovery verification, monitoring, legal review, deploy rehearsal, approved residual risks | **Phase 14 rewritten** |

---

## 1. Expert-assessment commitments (A1–A19) — carried from v1, unchanged

All nineteen commitments extracted from the *Assessment of `answer4audit.md`* remain in force and land as mapped in v1: A1→6.3, A2→6.2/6.10, A3→6.4, A4→6.6, A5→6.7, A6→6.4, A7→6.11, A8→6.5, A9→6.6, A10→6.12, A11→6.8, A12→7.1, A13→7.3/7.4, A14→7.6, A15→7.5, A16→7.7, A17→7.8, A18→6.0, A19→7-gate/14. (Full table retained from v1; this v2 adds the C1–C13 layer on top.)

---

## 2. The Owner's Eight Decisions (binding)

| Q | Decision | Lands in |
|---|---|---|
| 1 | Unverified-seller publishing: admin-controlled per-seller AND bulk; **default = ALLOW**; "not active" sellers **always blocked** | 8.5 (+ risk acceptance §C12) |
| 2 | Full multi-currency | 7.1–7.2 (+ buyer switcher 13.4) |
| 3 | Finish Product/Offer attribution 100% | 7.6 + 8.1 |
| 4 | Financier console: ALL 100% | Phase 10 |
| 5 | Arabic/RTL: the LAST step | Phase 13 |
| 6 | Monetization: mix, actor/transaction-dependent, admin-customizable | Phase 11 |
| 7 | Strictly 3P; platform manages the whole catalog; **full admin product form** | Phase 9 |
| 8 | KYC: manual + provider integration, admin-customizable | 12.4 |

---

## 3. Sequencing contract (the reviewer's three buckets, as hard order)

```
BUCKET 1 — BEFORE ANY PRODUCTION-SENSITIVE USE
  Phase 6  (6.0 credential rotation → 6.0b staging isolation → 6.1…6.12 RBAC/security core 100%)
     • rotate exposed credentials, kill sessions, scrub docs
     • isolated staging + verified recovery path
     • close legacy-admin, bare-guard, cross-tenant gaps
     • secure KYC/document storage & access
     • negative authorization tests (on staging)

BUCKET 2 — BEFORE FURTHER FINANCIAL OR COMMERCE EXPANSION
  Phase 7  Financial integrity & multi-currency (reviewed migration + tested restore path)
  Phase 8  Commerce depth (suborders, buyer/seller depth, publish policy)
  Phase 9  3P catalog ownership model + admin catalog 100%
  Phase 10 Financier operations 100% (incl. installment payments) → then Murabaha checkout (10.9)

BUCKET 3 — BEFORE CLAIMING PRODUCTION READINESS
  Phase 11 Monetization mix (subscriptions as entitlement ceilings)
  Phase 12 Directory, discovery, trust + KYC provider
  Phase 13 Arabic / RTL (last feature phase)
  Phase 14 Hardening & launch (expanded final gate)
```

Planning estimate: **~14–18 weeks** — an initial planning assumption only; a defensible delivery commitment requires decomposition and staffing estimates per phase (reviewer C13). Each phase below is scoped so it can be decomposed into a staffing estimate on demand.

---

# PART I — THE PLAN

## Phase 6 — RBAC & Security Core, 100% · ~2–3 weeks (staging pre-gate included)

### 6.0 Credential hygiene (first action — A18 / C1 bucket 1)
1. Rotate **every** password that has appeared in any plan document, seed script, or chat; store new secrets only in the secret store.
2. Bump `sessionVersion` for all users → all existing sessions die.
3. Scrub credentials from tracked documents (rotation is the control since history retains them).
4. Repo-wide secret sweep (keys, tokens, WhatsApp session artifacts) → move to env/secret store; rotate what cannot be moved.

### 6.0b Staging isolation & verified recovery (NEW — reviewer C1; supersedes the Phase-14 item)
**Nothing in 6.11/6.12 (adversarial, negative, or concurrency tests) or Phase 7 (financial migration) may touch production data.** Before those begin:
1. **Staging environment:** separate database (fresh schema + anonymized/seeded data — never a copy of real customer rows unless anonymized), separate storage root, separate app credentials, separate messaging credentials (WhatsApp test line distinct from any production line).
2. **Verified recovery:** take a real backup of the production DB and **restore it into staging**; row counts + spot-check queries must match. A backup that has never been restored is not a recovery plan. This drill is repeated before Phase 7 begins (the migration's rollback rehearsal).
3. **Environment-touch documentation** (`docs/environments.md`): every browser test, seed script, QA asset, and cron job listed with the environment it may touch; scripts get an environment guard (refuse to run against production URLs/DB unless `--allow-prod` is passed explicitly).
4. CI conventions: authz/concurrency suites parameterized by `STAGING_BASE_URL`; production is never a target.
- **Gate 6.0b:** staging serves the app end-to-end with seed data; a production backup has been restored to staging and verified; the environment map exists; no test asset is documented as production-touching.

### 6.0a WhatsApp channel — incident closed, hardening remaining (user-reported, fixed `b1681f1`)
The pairing failure ("WhatsApp service unreachable (fetch failed)") was the Baileys mini-service being down with `node_modules` never installed after a fresh checkout. Fixed: deps installed, service started on `:3031`, **self-healing watchdog** added (`scripts/whatsapp-watchdog.sh` — health check + install guard + restart), and pairing **verified end-to-end in the browser** (real pairing code issued for a test number; test row removed; evidence `db/qa/e2e/whatsapp-pairing-fixed.png`). The user can now add their number from the admin panel.
Remaining hardening lands in this plan: credential encryption (6.6 item 4), staging/production line separation (6.0b), service health monitoring + alerting (14.4), rate-limited pairing endpoints (14.3).

### 6.1 Guard repairs + classification-first guard-lint (A2, C7)
1. Delete the three local `requireAdmin()` shadows (`api/admin/slides/route.ts`, `api/admin/slides/[id]/route.ts`, `api/admin/settings/route.ts`); import from `@/server/guards` with explicit keys.
2. `api/quotes/[id]/review/route.ts` — add its explicit permission key.
3. **Guard-lint v2 (`scripts/check-guards.ts`, CI-wired):** a reviewed classification of **every** route — not just `route.ts` files — as exactly one of:
   `PUBLIC` · `AUTHENTICATED_USER` · `ORG_SCOPED` · `SELLER_SCOPED` · `FINANCIER_SCOPED` · `PLATFORM_PRIVILEGED`.
   CI fails on: an unclassified route, a missing authorization declaration, a permission key not present in the catalog, an ORG_SCOPED route whose target organization is not explicit and validated, or a local guard shadow. The classification file is reviewed by a human (reviewer's "reviewed classification", not generator-trust) — the generator can only *propose*; approval is a reviewed artifact.
4. **Scope of "entry points" widened:** server actions, background/scheduled jobs (recurring RFQ sweep, expiry scans, digest jobs), mini-service HTTP endpoints, and any non-route module that performs privileged writes are all classified and linted the same way.
- **Test:** introducing an unclassified route, a bogus permission key, or a shadow guard into a scratch branch makes CI fail.

### 6.2 End the `User.role = ADMIN` bypass — lockout-sensitive migration (A1, C8)
1. Precondition (order matters, all on staging first):
   a. Create and verify the replacement super-admin RBAC assignment (protected `platform.super-admin` role).
   b. Verify MFA enrollment **and recovery** (backup codes + admin-reset path) for that account.
   c. Test privileged access in staging with the RBAC-only guard active.
2. Deploy the guard change: `requireAdmin`/`requireAdminAny`/`requireModule` stop honoring `role === 'ADMIN'`; `requireAdmin()` without a key **throws** (programmer error).
3. Verify the break-glass path: dedicated break-glass account (protected role, MFA-enforced, login-alerted, audited) — verify login + alert fire.
4. **Documented, time-limited rollback** = re-apply the previous commit; it must not silently restore a broad ADMIN bypass (the rollback doc states exactly what it restores and its expiry).
5. **Full-codebase sweep** of `User.role === 'ADMIN'` / `role: 'ADMIN'` **outside route guards**: services, server actions, scheduled jobs, admin UI conditionals, seeds — every hit either removed (authorization is RBAC-only) or explicitly allow-listed with a written reason. The route linter alone cannot establish this; the sweep output is a reviewed artifact.
- **Gate:** staging E2E proves super-admin works via RBAC alone; break-glass alert fires; zero remaining authorization-fact uses of `User.role`.

### 6.3 Module gating: fail closed + per-organization resolution (A6, A3)
1. Unknown module keys at **API authorization** → 403 `MODULE_UNKNOWN` + config-error log (fail closed). Storefront availability renders only from the registry — separate concerns.
2. Every org-scoped API resolves activation against **the specific organization in the request context** (explicit `ctx.orgId`), never the user's org union. User-union resolution remains only for personal navigation.
3. Tests: misspelled key never grants; multi-org user (module ON in org A, OFF in org B) is denied org-B-scoped access, allowed for org A.

### 6.4 Role-assignment integrity (A8)
ORG-scope assignment requires an active `OrganizationMember` row (validated, tested); the invitation flow creates membership + assignment atomically; member removal revokes org-scoped roles in the same transaction; orphan sweep + backfill.

### 6.5 Invitation tokens hashed (A9)
`StaffInvitation.token` → `tokenHash` (SHA-256, same pattern as reset/OTP tokens); raw token shown once; pending plaintext invitations invalidated.

### 6.6 Private document delivery — redesigned per reviewer C5 (A4; **launch blocker**)
1. **Two storage namespaces:** `public-media` and `private-vault` (separate key roots). **Content-hash dedup never crosses namespaces** — the same bytes may exist twice (once per namespace) with different keys and different access semantics; dedup operates within a namespace only. A key in the private vault has **no public retrieval path at all** (404 at `/api/media/*` regardless of flags).
2. **Ingest classification:** document type drives namespace; **unknown/unspecced types default to the private vault** (fail-safe).
3. **Access policy (least privilege, C5/A11):** document owner; org members per the sensitivity matrix (6.9) — a plain member/VIEWER does not get identity/financial docs; platform staff per permission; **financier access is tied to a specific application or review scope** (the request/agreement they are reviewing — not mere financier membership).
4. **Signed URLs:** short-lived (minutes), uncacheable (`Cache-Control: no-store`), HMAC-bound to document + session/user, issued **only after authorization**.
5. **Audit fidelity:** `DOCUMENT_URL_ISSUED` and `DOCUMENT_FILE_RETRIEVED` are **distinct logged events** — issuance and actual retrieval are never conflated.
6. Migration: existing sensitive uploads moved to the vault namespace (keys rewritten); public/media URLs that ever exposed them are treated as compromised exposure windows in the risk register (they are content-hash keyed; the fix is namespace + route change, not key secrecy).
7. WhatsApp credential encryption (queued remediation): `WhatsAppSender.credsJson` AES-GCM at rest, decrypted only in the service process.

### 6.7 MFA + persistent session registry (A5, C6)
1. TOTP (RFC 6238) + backup codes; **enforced** for every account with any platform-scope role or org-scope roles covering role management, payouts, payment capture, KYC/document verification, dispute resolution, module management.
2. **Session registry (new model):** `Session` — id, userId, device/UA summary, ipLastSeen, createdAt, lastUsedAt, revokedAt, mfaSatisfiedAt. Every issued session token gets a row; `lastUsedAt` updated (throttled); revocation supports **both** a single session and all-sessions (`sessionVersion` bump remains the all-kill). This makes the Phase 14 session-management UI honest about what the architecture provides (C6).
3. Login flow: password → (phone OTP where applicable) → TOTP challenge; privileged guards check `mfaSatisfiedAt` on the session.
4. Admin console: per-staff "Require MFA" toggle + platform policy; enrollment wizard (QR); admin reset (audited).

### 6.8 Least-privilege document matrix inside orgs (A11)
Sensitivity classes (PUBLIC / ORG_INTERNAL / SENSITIVE_IDENTITY / SENSITIVE_FINANCIAL) × role — one tested resolver; negative tests per class.

### 6.9 Route authorization matrix — the reviewed artifact (A2, C7)
`scripts/gen-route-matrix.ts` emits `audit/route-matrix.md`: every route (and every classified non-route entry point per 6.1.4) with method, classification bucket, permission key, org-context resolution, and covering negative-test IDs. Generation is CI-checked against the reviewed classification file; drift fails.

### 6.10 Negative authorization test suite (A7, C1)
The ten-case suite from v1 (cross-tenant reads/writes/approvals/downloads; buyer-vs-approver; immediate revocation; non-member assignment; disabled module at API; unknown key; self-approval; private-doc via public URL + expired signed URL; break-glass alert; privileged-without-MFA) — **executed against staging only**, wired into CI and every phase gate.

### 6.11 Audit atomicity & coverage (A10)
Sensitive changes write their `AuditLog` row **inside the same transaction**; failure-injection test proves rollback (no silent skip); DB-level tamper mitigation documented (restricted DB role blocking UPDATE/DELETE on `AuditLog` where the managed plan allows; else documented operational control).

### Phase 6 acceptance gate (browser + scripted, on staging where adversarial)
- [ ] 6.0b gate passed: staging live, backup restored + verified, environment map committed.
- [ ] Guard-lint: zero unclassified routes, zero shadows, zero bare guards, zero unknown permission keys — **including non-route entry points**.
- [ ] Route matrix generated from the reviewed classification; 100% coverage.
- [ ] Negative suite 10/10 green on staging (screenshots/log evidence).
- [ ] ADMIN bypass removed via the six-step rollout; sweep artifact committed; break-glass verified with alert.
- [ ] MFA enrollment + enforced privileged login E2E; session registry records logins; single-session revoke works.
- [ ] Private doc: no public path (404), signed URL issuance + retrieval audited separately, cross-org denial, member-vs-identity-doc denial.
- [ ] Credentials rotated; docs scrubbed; all sessions invalidated once.
- [ ] Full business regression still green. **Commit + push.**

---

## Phase 7 — Financial Integrity & Multi-Currency · ~2–3 weeks

### 7.1 Staged Float → Decimal migration (A12, C9 — precision tightened)
**Field-by-field inventory first:** all 60 `Float` columns classified as MONEY / RATE / MEASUREMENT / RATING / GEO — **only monetary fields migrate** (`rating`, `lengthCm/widthCm/heightCm`, `latitude/longitude`, spec `validationMin/Max`, routing `minTicket/maxTicket` hints etc. stay Float or move to their own typed columns deliberately). The inventory is a reviewed artifact before any DDL.
1. Backup; reconciliation baselines (orders, payments, payouts, commissions, financing fees) — signed report.
2. **Type rules per field, not blanket:** settled totals/fees `DECIMAL(15,2)`; unit prices, commission rates, FX rates, intermediate math `DECIMAL(18,6)`; percentages reviewed for their natural scale. **Currency concepts kept distinct:** transaction currency (what the buyer paid in) · display currency (rendering) · settlement currency (what the seller was paid) · accounting/base currency (internal ledger) — each money row stores what applies.
3. **Per-row historical currency from actual data:** "retail = USD, financing = YER" are hypotheses — reconcile against stored records (order/payment/payout context, financing entity records); ambiguous rows are explicitly listed and resolved before backfill; no blanket default.
4. Shadow Decimal columns (reviewed migration, no destructive push) → backfill → **diff under a pre-declared rounding rule:** float→decimal intentionally rounds to the field's currency scale; the diff report must contain *only* differences exactly equal to the declared rounding function — any other mismatch blocks the migration. Rounding is never silently accepted.
5. **FX snapshot preserved on every converted/derived amount:** rate, rate timestamp, source, rounding policy stored with the record (order, payout, fee) — settlement evidence survives later rate changes.
6. Writers/readers switch; reconcile against baselines; signed report.
7. Flip; documented rollback; then constraints/defaults; then (later, separately) drop Float columns.

### 7.2 Multi-currency substrate (Q2)
`Currency` + `ExchangeRate` (pair, rate, validFrom, source, admin-managed history) seeded USD/YER/SAR; money rows carry explicit currency codes (per 7.1); configurable accounting base; admin FX console; conversion display component; financing YER-native, retail USD-native; buyer switcher UI in 13.4.

### 7.3 Inventory integrity (A13, C10)
1. Conditional atomic decrements everywhere (`updateMany where stock >= qty`, count-verified, rollback on mismatch); concurrency test: two parallel last-unit checkouts → exactly one order.
2. **Single authoritative stock source for base+variant:** variant products take `ProductVariant.stock` as the only authority; the parent `Product.stock` for variant products becomes a **derived read-model** maintained by the same transaction (with a reconciliation check job) — or is nulled for variant products outright; the inventory decision is documented either way. No path decrements both as independent authorities.
3. **Approval-pending reservations get an expiry policy:** reserved stock for orders awaiting approval is released after a configurable TTL (default 48h) or on rejection — job + test.
4. Restock-on-cancel/approval-reject mirrors decrements conditionally and atomically.

### 7.4 Payout settlement hardening (A13, C10)
1. Conditional claim `updateMany` with `payoutId: null` in the WHERE; affected-count verified; **mismatch → abort the transaction, recompute the eligible set, and alert** (never silently continue).
2. **Immutable `PayoutLine`:** one order item appears in **at most one settlement line** (unique constraint). Lines snapshot amount, commission, currency, FX rate/timestamp/source, capturedAt.
3. **Corrections never rewrite history:** a cancelled or corrected payout is represented by new reversing entries (accounting style) referencing the original lines — the payout remains fully explainable after order-item links are released or operational statuses change.
4. Mark-paid re-guarded (PENDING → PAID only, idempotent). Concurrency test: two simultaneous generations for one seller → one payout or clean rejection, never duplicate settlement.

### 7.5 Recurring RFQ durability (A15)
`RecurringRfqRun` with unique idempotency key (`scheduleId:dueAt`); claim + RFQ creation in one transaction; FAILED runs retried (bounded) + alerted; crash-injection test between claim and creation → recovery without loss or duplication.

### 7.6 Offer attribution end-to-end (A14, Q3)
`QuoteLine.offerId` (snapshot ref); conversion sets `OrderItem.sellerId` from the **offer's** seller when a line targeted one; the full-chain test (`ProductOffer → RfqLine → QuoteLine → OrderItem → Payout`) with **offer-seller ≠ product-primary-seller** asserting authoritative seller/offer/price/currency/quantity at every hop. Green = Q3 closed.

### 7.7 Dangerous defaults + transitions (A16)
`Product.stock @default(0)` (+ existing-data review); `Order.status @default("PENDING_PAYMENT")` + server-side transition map (PAID only from payment-success events); illegal transitions → 400 + audit.

### 7.8 Accreditation renewal — history retained, constraint fixed (A17, C2)
The current schema has `@@unique([serviceId, organizationId])` (schema line 1636) — **retaining prior requests while creating renewals is impossible under it.** Explicit schema change:
1. Replace the blanket unique with an **active-marker composite**: `@@unique([serviceId, organizationId, activeMarker])` where `activeMarker` is non-null only on the single live request (MySQL unique indexes allow multiple NULLs → unlimited history, at most one active per program/org — same pattern we already use for scope sentinels).
2. Add `supersedesId` self-relation (with audit chain `ACCREDITATION_RENEWED` linking old → new).
3. **Status taxonomy defined:** `ARCHIVED` (superseded by a renewal — evidence frozen, read-only) · `EXPIRED` (lapsed without renewal) · `REJECTED` (declined by financier) · `REVOKED` (withdrawn by platform) — each with its own re-entry rule (ARCHIVED/EXPIRED may renew; REJECTED/REVOKED follow their own policies).
4. Archive + create + audit **atomically**; supersede-renewal flow rewritten on this model.
5. **Test:** renewal can be created while the prior request **and its checklist evidence remain queryable**; the active-marker unique blocks a second concurrent live request (race test).
- Do not mark renewal complete until the constraint change + tests land.

### Phase 7 acceptance gate
- [ ] Field inventory reviewed; only monetary fields migrated; rounding rule pre-declared; diffs = declared-rounding-only, else blocked.
- [ ] Staging restore drill re-run (migration rollback rehearsal) — signed.
- [ ] Concurrency tests (stock, payout) + crash recovery + attribution trace green — **on staging**.
- [ ] Multi-currency admin CRUD + conversion display E2E; FX snapshots on derived amounts verified.
- [ ] Accreditation: renewal-with-history test green (constraint replaced).
- [ ] `answer4audit-v2.md` evidence addendum for every finding this phase closes → expert re-review (A19).
- [ ] Full regression + **commit + push.**

---

## Phase 8 — Commerce Depth · ~2–3 weeks (Murabaha checkout moved out — C4)

### 8.1 Per-seller fulfillment suborders
`OrderFulfillment` per distinct seller (status, carrier, tracking, per-item links, events); `Order.status` becomes a derived roll-up; seller ships per suborder; buyer tracking grouped per seller; partial cancellation per seller group (feeding 7.4 lines); RFQ conversions derive suborders from per-item `sellerId` (trustworthy after 7.6).

### 8.2 Buyer depth
Spec-matrix compare, saved addresses, reorder, guest checkout (email/phone + post-hoc account claim), product Q&A with moderation.

### 8.3 Seller depth
Onboarding checklist, store settings (logo/banner/policies/payout account), draft autosave/recovery, CSV import polish, low-stock alerts, seller coupons, shipping zones, analytics depth.

### 8.4 Checkout financing (Murabaha) — **moved to Phase 10.9** (C4: depends on financier disbursement operations that only complete in Phase 10; see the legal/Sharia precondition there).

### 8.5 Unverified-seller publishing policy (Q1, C12)
1. Platform setting `publishPolicyForUnverified`, **default `ALLOW`** (owner decision).
2. Per-seller override (`ALLOW | REVIEW | BLOCK`) + **bulk action**.
3. **Explicit risk acceptance recorded** (risk register): allowing unverified sellers to publish is a product choice, not a security control — documented fraud/trust risk with mitigations: visible verification status on storefronts/products, seller limits (listing caps for unverified), payout holds/thresholds for unverified sellers, enhanced review for higher-risk categories, and the admin's ability to flip the policy at any time.
4. **Hard rule:** suspended/inactive sellers are always blocked from publishing — enforced and tested at **every publishing path**: product create, product edit/republish, **offer create/update**, CSV bulk import, and any bulk action. The negative suite gains these cases.
- **Gate:** policy default verified; per-seller + bulk flips work; suspended-seller block proven at every path (API-level evidence).

### Phase 8 acceptance gate
- [ ] Mixed-seller order ships per suborder; grouped tracking; roll-up correct.
- [ ] Guest checkout, reorder, Q&A round-trip; seller checklist/settings/coupons/shipping/alerts E2E.
- [ ] Publish policy + risk acceptance artifact; suspended-block tests at all publishing paths green.
- [ ] Regression + **commit + push.**

---

## Phase 9 — 3P Catalog Ownership Model + Admin Product Management 100% · ~2 weeks (Q7, C3)

### 9.1 Data model first — resolve the system-seller contradiction (C3)
Today curated listings are owned by a "Vendora Catalog" **user** in `Product.sellerId` (required, primary-seller semantics, schema line 201) — a system account in that field risks vendor attribution, checkout, and payout eligibility. Change before the form:
1. `Product.sellerId` becomes **nullable**: `null` = platform-curated catalog record (no primary seller, not purchasable as such); existing curated rows migrate `sellerId → null` with ownership moved to `curatedById` (admin actor) for provenance.
2. **Purchasability rule:** a curated product is buyable **only through a real vendor's ACTIVE `ProductOffer`** — checkout requires an offer when `sellerId` is null. A curated product with no vendor offer is display-only (directory/aggregator semantics).
3. The Vendora Catalog system account is retired from `sellerId` semantics entirely; it can never receive vendor attribution, orders, or payout eligibility. Guards: payout/settlement queries exclude `sellerId: null` items without offers by construction (they can't exist as order items).
4. **Negative test:** a curated product with no real vendor offer cannot be purchased as a Vendora-sold product (API-level 400 + UI messaging).
5. Storefront rendering: `sellerId: null` renders the offers list / "available from these vendors" instead of a primary seller.

### 9.2 Full admin product form (the owner's repeated ask)
Re-scope the seller 7-tab form for admin use (media library uploads — not URL paste, structured specs, variant editor, shipping, SEO, GTIN/MPN/brand, category); "Add Product" prominent in Catalog + Products panels; creates curated (`sellerId: null`) records.

### 9.3 Full CRUD + moderation with teeth
Edit every field; archive/restore; guarded delete (offers attached → archive-only with reason); bulk actions; per-edit audit diff; admin edit of seller listings via full form with mandatory reason + seller notification + audit diff.

### 9.4 Publication agreement management
Versioned templates; per-org-type defaults; per-product requirement toggle; consent records searchable/exportable.

### Phase 9 acceptance gate
- [ ] C3 negative test green (curated w/o offer unpurchasable; no Vendora-sold attribution anywhere).
- [ ] Admin creates product with media uploads + specs + variants → publishes → buyer buys via a vendor offer.
- [ ] Admin edits seller listing → notification + audit diff; guarded delete; agreement v2 re-captures consent.
- [ ] Regression + **commit + push.**

---

## Phase 10 — Financier Operations 100% · ~2 weeks (Q4, C4)

### 10.1–10.7 (carried from v1)
Portfolio analytics (approval rate, disbursed volume, aging/NPL 30/60/90, per-branch/program, CSV export); risk scoring (configurable, decision-support, auto-decision only if explicitly enabled); Sharia artifact management (scholar certifications with expiry/reminders, versioned contract templates, e-signature with content hash + audit); disbursement operations (queue → confirm with payment rail reference + FX snapshot → installment tracking); collections & statements; branch operations (branch-scoped inboxes, underwriting limit matrix); public institution polish.

### 10.8 Installment payment model — explicit (C4: schema is track-only today)
`InstallmentPayment` records how payments are **received** (channel, reference, receivedAt, amount, currency), **allocated** (which installments, in what order — with partial-allocation and over/under-payment rules), **reversed** (reversal entries referencing originals — never rewrites), and **reconciled** (daily batch vs. rail exports where available; discrepancy queue). Aging/NPL and late fees are computed from allocated state, not from track-only rows.

### 10.9 Islamic finance at checkout (Murabaha) — AFTER 10.1–10.8, gated (C4)
**Hard preconditions before implementation:**
1. Minimum lender workflow complete and E2E-verified: request → review → offer → agreement execution → disbursement confirmation → installment collection.
2. **Qualified legal + Sharia review of the actual transaction sequence** — who purchases the goods, when ownership and risk transfer, how the resale to the buyer occurs, what evidence is retained, and how cancellation or default is handled — documented and signed off. The implementation follows the reviewed sequence; it does not invent one.
3. **Late-fee policy specifically reviewed** (a configurable cap is not evidence of permissibility) — policy text, cap, and calculation reviewed with the same sign-off.
Then: checkout "Finance it (Murabaha)" method → pre-qualification (KYC L2+ gate) → offer pick → agreement sign → financed order state machine → financier disbursement confirmation → PAID + installment schedule to the buyer; clean fallback to standard payment on pre-qualification failure/expiry.

### Phase 10 acceptance gate
- [ ] Full lender lifecycle E2E incl. installment receive/allocate/reverse/reconcile; statement correctness.
- [ ] Late installment → NPL bucket + reviewed late-fee application.
- [ ] Branch scoping + underwriter limits enforced.
- [ ] **Murabaha preconditions documented** (legal/Sharia sign-off artifacts) before any checkout code; then the financed-checkout E2E green.
- [ ] Regression + **commit + push.**

---

## Phase 11 — Monetization Mix · ~2 weeks (Q6, C11)

### 11.1 Fee engine
`FeeRule` (event × actor type × scope × dimension, precedence, effective dating) + simulator + audit on every applied fee; current 10% commission migrates to a platform rule (zero behavior change day one).

### 11.2 Seller subscriptions — **entitlement ceiling semantics (C11)**
1. `SubscriptionPlan` (module bundle + limits) + `SellerSubscription` (status, renewAt, grace, downgrade state).
2. **Security rule made explicit:** a subscription is an **entitlement ceiling** — organization-level or org-type module activations can only enable what the seller's subscription entitles; they can never exceed it. Resolution order for paid modules: entitlement = `subscriptionAllows AND (ORG override OR ORG_TYPE default OR PLATFORM default)`. An ORG flip can turn a paid module **off** for a seller; it cannot turn it **on** beyond the subscription.
3. **Renewal-failure behavior specified:** grace period (configurable, default 7 days, read-only warnings) → downgrade (paid modules off, limits re-clamped; data preserved read-only where applicable).
4. **Tests (the reviewer's exact demand):** an unpaid or downgraded subscription cannot retain paid entitlements through an organization override; grace/downgrade transitions verified.
5. New `SUBSCRIPTION` scope participates in the chain **as a ceiling layer**, not as another default in the specificity contest.

### 11.3 Financier monetization + commission customization + revenue console (carried from v1, on the same rules).

### Phase 11 acceptance gate
- [ ] Simulator matches fees actually applied across order/financing/subscription flows.
- [ ] Ceiling semantics proven by tests (unpaid/downgraded + org override attempt).
- [ ] Revenue dashboard reconciles with the fee ledger to the cent (Decimal).
- [ ] Regression + **commit + push.**

---

## Phase 12 — Directory, Discovery, Trust + KYC Provider · ~1.5–2 weeks (Q8)
Carried from v1 unchanged: brands directory, trending/bestsellers, services directory; spec-attribute facets, typo-tolerant search, normalized comparison; trust counters; `KycProvider` abstraction (MANUAL | PROVIDER | PROVIDER_THEN_MANUAL per document type, admin-customizable, mock-provider fallback test); PWA/newsletter stretch.

---

## Phase 13 — Arabic / RTL / i18n — THE LAST FEATURE PHASE · ~2 weeks (Q5)
Carried from v1 unchanged: locale routing + persisted toggle, RTL mirroring, Arabic content (profiles, program copy, chrome, bilingual emails), buyer currency switcher on the 7.2 substrate, AR buyer journey at 390px acceptance.

---

## Phase 14 — Production Hardening & Launch · expanded final gate (C13, A19)

### 14.1–14.3 (carried, amended)
Email-verification enforcement (strict for staff/sellers; grace for buyers); rate limiting expansion + password policy + privileged-account rotation; ops (automated backups **with the recurring restore drill already proven in 6.0b** re-verified on schedule; uptime monitoring incl. the WhatsApp mini-service health; staging/production split CI gates: lint + type + guard-lint + classification-sync + auth-negative suite + business regression).

### 14.4 Monitoring & incident ownership (expanded)
Alerting with named owners: downtime, OOM/restart events, migration jobs, pairing-service outages, reconciliation discrepancies, failed audit writes. On-call/ownership documented even if informal.

### 14.5 Launch gate — the full checklist (C13)
1. **Dependency & secret scanning** (SBOM + secret sweep, zero known-vulnerable pins unaccepted).
2. **Security testing of authorization and file access** — the negative suite plus a targeted private-document penetration pass (staging).
3. **Load & concurrency testing** for checkout, settlement, and the hot APIs (rates defined per endpoint; results recorded).
4. **Restore & recovery verification** — re-run of the 6.0b drill on the then-current production backup.
5. **Monitoring, alerting, incident ownership** live.
6. **Legal/privacy review** for KYC processing, agreements, communications, and financing flows (the 10.9 Sharia sign-off plus privacy: data subject requests, retention schedule, cross-border notes as applicable).
7. **Production deployment + rollback rehearsal** — a full deploy executed and rolled back on staging with the documented procedure.
8. **Three consecutive green full-regression runs** (business + authorization-negative + financial-integrity).
9. **Residual-risk review:** every open item is either closed with evidence or **explicitly accepted in writing by the owner** (registered risk, mitigation, review date). The gate does not force the label "100% ready" while material unaccepted risk remains.
10. Final **commit + push + tag**; `answer4audit-v2.md` updated with final evidence for expert re-run (A19).

---

# PART II — CROSS-CUTTING RULES

## Regression checklist (after EVERY phase)
**Business:** the mergedplan §7 baseline (register → coupon order → tracking; RFQ full loop; financing wizard → gate → offer → agreement; admin panels with count consistency; team invite/remove/role-change; 60-min soak).
**Authorization-negative (staging):** the ten cases of 6.10, plus the 8.5 publishing-path blocks.
**Financial-integrity (staging):** last-unit concurrency; payout concurrency; recurring crash recovery; offer-attribution trace; migration diffs = declared-rounding-only.
**WhatsApp channel health:** pairing start returns a code; watchdog keeps the service alive across a kill.

## Deferrals (unchanged in substance; reviewer-concordant)
ABAC/resource-level permissions; unifying org-member roles with RBAC; real PSP integration (substrate designed, lands with the commercial project); DB-level scope-sentinel redesign; role soft-lifecycle columns; full AR staff console.

## Risk register (live — updated in v2)
| Risk | Status / mitigation |
|---|---|
| WhatsApp mini-service availability | **Fixed** (`b1681f1`) — watchdog supervisor; monitoring/alerting lands 14.4. |
| Sensitive docs previously served from public media | Namespace + route fix in 6.6; exposure window noted; credential rotation in 6.0 covers linked risks. |
| Money migration | Staged protocol; pre-declared rounding; staging restore drill; rollback docs. |
| Unverified sellers trading (owner's ALLOW default) | Explicit risk acceptance + mitigations in 8.5 (register entry). |
| Murabaha implementation before legal/Sharia review | Blocked by 10.9 preconditions (sign-off artifacts required). |
| Subscription entitlement escalation via org override | Ceiling semantics + tests in 11.2. |
| RESEND_API_KEY lost | Owner action before launch (14.5 checklist). |
| OOM under parallel compiles | Restart procedure; staging/prod split in 14.1 is the durable fix. |

## Revision history
- **v2 (this document):** reviewer's 13 corrections incorporated — staging-first (6.0b), accreditation constraint fix (7.8), 3P ownership model (9.1), Murabaha resequenced with legal/Sharia preconditions + installment payment model (10.8–10.9), private-vault storage redesign (6.6), session registry (6.7), classification-first coverage (6.1/6.9), lockout-sensitive ADMIN rollout + full sweep (6.2), money-migration precision (7.1), stock/payout criteria (7.3/7.4), subscription ceiling (11.2), publish-policy risk acceptance (8.5), expanded launch gate + honest timeline (14). WhatsApp pairing incident fixed and documented (6.0a).
- **v1:** initial replan from the expert assessment + owner decisions (superseded).

---

*On approval, execution begins at Phase 6.0 (credential rotation) → 6.0b (staging isolation & verified restore) → the RBAC closure items in order — every gate browser-verified, every green gate committed and pushed.*
