# Vendora — Company-to-Company (B2B) Gap Analysis

> **Task ID:** TASK-0 · **Agent:** Recon worker (general-purpose) · **Mode:** READ-ONLY audit
> **Question answered:** *What must be fixed/finished on the C2C (company-to-company) side before the Financier module phase can safely begin?*
> **Method:** Full read of `prisma/schema.prisma` (760 lines, 32 models verified), all 15 `src/server/modules/*` services, the full `src/app/api/*` route tree, the b2b UI components, `src/lib/*` infrastructure; grep-verified absences; one runtime reproduction (missing storage module). Every claim below cites file:line evidence personally read.
> **Verdict vocabulary:** COMPLETE / PARTIAL / UI-DEMO-ONLY / NOT-FOUND / UNKNOWN.
> **Note on `whois.md`:** it describes the pre-B2B B2C system (25 endpoints, 7 tables — whois.md:47, :66) and is now historical; the B2B layer audited below post-dates it. Its P0=0/P1=4/P2=8/P3=5 registry was superseded by the PLATFORM-1/RFQ-SETTINGS/QA-R8 commits (git log).

---

## Q1. Organization lifecycle & governance — **PARTIAL**

- **Create works, both paths.** Self-service `POST /api/organizations` → `createOrganization()` — one-org-per-owner enforced (organizations/service.ts:106-114), starts `PENDING_VERIFICATION` (schema.prisma:239), OWNER membership created in-tx (:117-131), audited `ORG_CREATED` (:134-142). Admin path `adminCreateOrganization()` validates orgType COMPANY|BANK|MFI|EWALLET (:329-332), creditTerms 0-180 (:339-344), and can start ACTIVE+verified (:333-338, :396).
- **Verify/suspend/reactivate/reject exist (admin-only).** `adminUpdateOrganization()` accepts all four statuses; `ACTIVE` sets `verifiedAt` (organizations/service.ts:495-504) and audits `ORG_VERIFIED` (:533-542). Route: `src/app/api/admin/organizations/[id]/route.ts` (zod-validated incl. creditLimit 0–10M, route.ts:20).
- **Delete is protected.** Orgs with orders/RFQs/price-lists/approvals can only be suspended (organizations/service.ts:567-579) — trading history survives.
- **Member governance is add-only.** The ONLY member endpoints are `POST /api/organizations/[id]/members` (add, assignable roles ADMIN/BUYER/APPROVER/VIEWER — organizations/service.ts:14, :232-289, existing-user requirement :249-255). There is **no remove-member, no role-change, no leave-org, no ownership-transfer** anywhere in the route tree (verified: only 3 org route files exist — organizations/route.ts, [id]/route.ts, [id]/members/route.ts).
- **Org settings self-service is only the approval threshold.** `PATCH /api/organizations/[id]` accepts nothing but `approvalThreshold` (organizations/[id]/route.ts:23-29, OWNER/ADMIN-gated service-side :192-198). Profile edits (billing address, tax id, name) are admin-only — buyers cannot maintain their own company profile.
- **Suspend is soft-blocked inconsistently.** Checkout and quote-acceptance only consider `organization: { status: 'ACTIVE' }` memberships (orders/route.ts:140-143; rfq/service.ts:1118-1121), but `createRfq` checks membership existence only, not org status (rfq/service.ts:451-459) — a suspended org's member can still file RFQs attributed to that org. Pricing resolver correctly de-scopes non-ACTIVE orgs (pricing/resolver.ts:96-101).

## Q2. RFQ creation & buyer experience — **COMPLETE** (two caveats)

- **Draft → submit → review → reject/cancel state machine is real and role-guarded.** Transition table (rfq/service.ts:36-42), requester-only SUBMIT/CANCEL (:699-701), admin-only REVIEW/REJECT (:702-704), cancel-with-accepted-quote blocked (:705-707). Route wiring: rfqs/[id]/route.ts:38.
- **Creation enforces commercial rules from scoped settings.** Daily RFQ caps per buyer/org with 429 (:469-488), quantity 1–1M + variant existence/active checks (:497-515), MOQ block mode (:517-526), expiry deadline with buyer-override clamped to min/max days (:529-540), product/variant snapshotting (:553-571), `RFQ-YYYY-######` sequence (sequences/service.ts:11-29, tx-retried).
- **Expiry is enforced by a lazy sweep** — `expireStaleQuotes()` flips stale `SENT` quotes to EXPIRED, closes past-deadline RFQs after the grace period (with buyer + unresponded-seller notifications), auto-expires old no-validity quotes, and closes QUOTED RFQs whose quotes all lapsed (rfq/service.ts:349-430). Runs on every RFQ read path (:591-592, :605-606).
- **Tier routing (distribution) is live.** `computeEligibleSellers()` filters by verification stamp, avg catalog rating, open-dispute exclusion, and max-sellers cap with rating ranking (rfq/service.ts:266-323); SUBMIT notifies only eligible sellers (:729-745).
- **Product-prefill RFQs work.** Product page writes a sessionStorage prefill (product-view.tsx:295, `RFQ_PREFILL_KEY` defined b2b-shared.tsx:139, consumed b2b-shared.tsx:149-161); the RFQ composer pre-fills lines and the buyer sees tier ladders per config (rfq-view.tsx:971 uses `tiers.buyerSeesTiers`).
- **Caveat 1 — no deadline-extension action exists.** `extendedCount` is serialized (rfq/service.ts:216) and `maxExtensions` is a registry setting (rfq-settings/registry.ts:481), but there is no EXTEND transition in the table (:36-42) and no endpoint — grep found no other `extendedCount` writer. Dead feature-half.
- **Caveat 2 — several registry fields are declared but never enforced:** `requireSubscription`/`subscriptionPlans` (registry.ts:196-200), `reviewSlaHours` (:168), ranking prefs `preferCommission`/`preferLocal`/`localRadiusKm` (:207-210) — zero usages outside the registry (grep-verified).

## Q3. Seller inbox & quoting — **COMPLETE**

- **Inbox is query-driven, not notification-driven.** `sellerRfqInbox()` returns SUBMITTED/UNDER_REVIEW/QUOTED RFWs referencing the seller's catalog, with `myLineCount`/`myQuoteCount` (rfq/service.ts:1259-1281); UI: seller/rfq-inbox-tab.tsx.
- **Quote composer is server-validated.** `createQuote()`: sellers may only quote their own products (rfq/service.ts:818-827), admins may quote anything (sellerId null = platform-facilitated), validity date must be future (:829-831), per-seller daily quote cap (:842-853), zero-stock quoting blocked per settings (:856-864).
- **Tier prefill in the composer is product-level only.** Prefill = buyer target price → product's own `priceTiers` ladder → product price (rfq-inbox-tab.tsx:580-586). It does **not** consult ORG/GROUP price lists (contract prices) — and the server accepts any `unitPrice ≥ 0` without a floor (rfq/service.ts:817), so "tier prefill" is a convenience, not an enforcement.
- **Validity windows are real.** Quote.validUntil stored (schema.prisma:403), future-checked at creation (:829-831), re-checked at acceptance (:1106-1108), and lazily expired (:353-356).
- **Withdrawal supported** — own-quote or admin, blocked only when `cancellation.sellerWithdrawUntil === 'NEVER'` (rfq/service.ts:1404-1422); buyer is notified (:1436-1445).
- **PDF quote export exists** (`/api/quotes/[id]/pdf`, pdf-lib in package.json:55; UI rfq-view.tsx:1139).

## Q4. Negotiation & award — **COMPLETE**

- **Message threads are access-mirrored and rate-capped.** `listRfqMessages`/`postRfqMessage` reuse the getRfq access predicate (rfq/service.ts:1285-1305), close threads on terminal RFQ statuses (:1342-1344), cap messages per thread per day (:1346-1358), notify all participants (:1365-1391).
- **Accept/decline are guarded and atomic.** `respondToQuote()`: requester-only (:1101), SENT-only (:1103-1105), validity + RFQ-closed checks (:1106-1111); ACCEPT runs in one tx — quote ACCEPTED, sibling quotes auto-DECLINED, RFQ → ACCEPTED (:1155-1166); DECLINE leaves the RFQ QUOTED for more offers (:1167-1173); seller notified of outcome (:1185-1202).
- **Convert → order closes the loop.** `convertQuoteToOrder()`: ACCEPTED-only (:1503-1508), full stock re-check for products *and* variants (:1513-1544), shipping fallback chain (input → org billing → last order → buyer → quote-terms placeholder, :1546-1590), one tx creating the order (`sourceType: 'RFQ'`, `sourceQuoteId`, `poNumber`, `paymentTerms`, PROCESSING on-terms) + stock/soldCount updates + quote CONVERTED + RFQ ORDERED + INVOICE payment with NET-due date (:1592-1657).
- **Admin quote-review queue exists for routing** (`reviewQuote()` APPROVE → release to buyer, REJECT → seller notified — rfq/service.ts:1013-1085; route quotes/[id]/review/route.ts:29, CSRF+rate-limited).
- **Minor gap:** seller can't revise/replace a SENT quote (must withdraw and re-quote); buyer can't counter-offer (only message thread).

## Q5. Approval workflow — **PARTIAL**

- **The threshold engine works end-to-end.** `needsApproval()` = ACTIVE org + BUYER-role member + threshold > 0 + amount ≥ threshold (approvals/service.ts:37-47). Checkout routes over-threshold orders to `PENDING_APPROVAL` + creates the request inside the order tx (orders/route.ts:145-156, :215-221) and notifies approvers post-commit (:242-250). Quote acceptance routes to `createQuoteAcceptApprovalRequest` with duplicate-guard (approvals/service.ts:114-126, called rfq/service.ts:1136-1142).
- **Decide is well-guarded.** No self-approval (:268-269), decider must be OWNER/ADMIN/APPROVER member (:271-275); ORDER-approve flips the order to `PENDING_PAYMENT` (payment after org clears — :280-293); ORDER-reject restocks + cancels in-tx (:319-341); QUOTE_ACCEPT-approve performs the acceptance transactionally (:301-315); QUOTE_ACCEPT-reject leaves the quote open (:343-347). Audit + bell events on every decision (:351-399).
- **Queue + history exist:** `listApprovals()` gives deciders the org queue (PENDING first, take 50) and requesters their own requests (approvals/service.ts:219-247); buyer escape-hatch `cancelApprovalForOrder` voids requests when the buyer cancels (:409-417, wired orders/[id]/route.ts:61).
- **GAP — creditLimit is stored everywhere and enforced nowhere.** `Organization.creditLimit` exists (schema.prisma:242), admin can set it (organizations/service.ts:512-516), it's displayed (business-view.tsx:679, organizations-tab.tsx:238) — but grep across `src/` finds zero enforcement: no checkout check, no accept check, no outstanding-balance ledger. An org can buy infinitely beyond its limit today. *(This is SPRINT_PLAN TASK-3.)*
- **GAP — multi-org users can't choose context.** Checkout attaches the *first* ACTIVE membership (orders/route.ts:140-143); `listApprovals` surfaces only one org (approvals/service.ts:228-231). A member of two orgs cannot pick which one an order/acceptance belongs to.
- **GAP — approval history is capped at 50 rows, no org-level reporting** (no export, no aggregate).

## Q6. Post-award operations — **PARTIAL**

- **Order status machine is a strict +1 ladder.** `STATUS_FLOW = [PAID, PROCESSING, SHIPPED, DELIVERED]` (orders/[id]/route.ts:9, :114-120); PENDING_APPROVAL and PENDING_PAYMENT hard-block fulfillment (:102-112); quote-converted orders enter at PROCESSING (rfq/service.ts:1597); buyer cancel allowed on PAID/PENDING_APPROVAL/PENDING_PAYMENT with in-tx restock + approval withdraw + payment void (:46-89).
- **Recurring RFQ schedules are fully implemented.** Create validates the snapshot by drafting + deleting a real RFQ (recurring.ts:182-196), enforces max-active-per-buyer (:174-180) and allowed patterns (:163-171); the spawn engine is a lazy sweep with an **atomic compare-and-set claim** on `nextRunAt` (concurrent sweeps can't double-spawn, :426-437), supports autoPublish vs buyer-review drafts (:451-518), keepSameRecipients + recipient refresh (:457-466), empty-cycle accounting with auto-pause (:387-424), pause/resume/skip/delete (:255-334), preview heads-up notifications (:347-369).
- **Disputes are fully implemented.** Create (settings-gated reasons, window, duplicate guard, per-seller targeting — disputes.ts:138-257), seller respond with late-flagging (:261-312), buyer withdraw (:316-360), admin resolve with settings-allowed outcomes + effects (verification revoke, rating penalty, auto-suspend threshold) (:370-482), escalation + AUTO_RESOLVE sweep (:491-579), buyer/seller/admin views all wired (orders-view.tsx:35, seller/disputes-tab.tsx:11, admin/disputes-tab.tsx:13).
- **GAP — no OrderEvent/timeline persistence.** Schema has no OrderEvent model (verified full read); "shipped/delivered" timeline dates remain client-side projections. Consequence admitted in-code: the dispute window is measured from `order.createdAt` because **there is no `deliveredAt` stamp** (disputes.ts:167-169 comment).
- **GAP — dispute outcomes don't move money.** FULL_REFUND/PARTIAL_REFUND set status + seller-side effects only (disputes.ts:388-401); nothing touches `Payment`, `Payout`, or stock. No refund/capture-reversal path exists in payments/service.ts (only cancel of PENDING payments, :203-208).
- **GAP — fulfillment is order-level, not per-seller-item.** One seller advancing status advances it for every seller's items in a multi-seller order (orders/[id]/route.ts:98-100 checks only "sells an item").

## Q7. Money rails (per D-002) — **PARTIAL**

- **Three methods, all explicit `Payment` rows.** CARD = simulated gateway settling inline in the order tx (payments/service.ts:9-11, orders/route.ts:231-236, buyerPayOrder card path payments/service.ts:239-241 — reference `SIM-*`); BANK_TRANSFER = manual with bank details from platform config + buyer reference + admin capture (:91-97, :100-108, :244-251); INVOICE = NET-terms with parsed due date `NET[-\s]?N` (parseNetDays :110-114, ensurePayment :136-137) created at quote conversion (rfq/service.ts:1646-1654).
- **Capture/fail console is complete.** `adminCapturePayment` marks SUCCEEDED (+PAID flip unless on-terms) with audit + buyer notification (payments/service.ts:348-377, succeedPayment :172-200); `adminFailPayment` marks FAILED with reason (379-409). Buyer pay-later dialog (orders-view) re-pays either method.
- **Commissions & payouts are complete and atomic.** Config 0–90% zod-validated (payouts/service.ts:46-49); preview computes unsettled = SUCCEEDED-payment, non-cancelled, `payoutId IS NULL` items (:82-93); generate re-selects inside the tx and stamps `OrderItem.payoutId` (:121-159); mark-paid (:182-211); cancel releases items back (:213-237); seller earnings endpoint (:297-353). Vendor override `User.commissionRate` → platform default (schema.prisma:30, :628-629).
- **Sequences D-006 respected** — RFX/QTE/DSP/PY all via `nextNumber()` (sequences/service.ts:9).
- **GAP — D-002 tension (Section D item).** Bank-transfer instructions tell the buyer to *"Wire the total to the platform account"* (payments/service.ts:95) with platform bank details from config (:100-108), and payouts are platform → vendor ("sent to your account", payouts/service.ts:206). That is an operator-collector model (money passes THROUGH the platform), while D-002 says the platform *never collects buyer→vendor funds*. The Financier phase cannot be designed on top of an ambiguous money model — owner ruling required.
- **GAP — no payment driver abstraction.** `PAYMENT_DRIVER` env is only an on/off switch for CARD (payments/service.ts:81); the simulated gateway logic is inline in routes/services (no PaymentDriver interface). *(SPRINT_PLAN TASK-5.)*
- **GAP — no idempotency key on checkout POST** (orders/route.ts:32-46); a network retry can double-order. No webhooks/signature concept anywhere (appropriate for simulated rails, blocks real-gateway work).

## Q8. Security & hardening — **PARTIAL**

- **Auth crypto is sound and hardened vs the whois audit.** scrypt+salt, timing-safe compare (auth.ts:26-42); HMAC-signed 30-day stateless tokens (:48-67); `AUTH_SECRET` fails fast in production when missing/short (:10-21 — SEC-01 fixed); `secure` cookie in production (:108 — SEC-02 fixed); suspended users stop resolving sessions globally (:73-78).
- **GAP — no email verification, no password reset, no MFA.** Register creates + logs in instantly with no verification token (auth/register/route.ts:31-42); the route tree has only login/logout/me/register/become-seller — no forgot/reset/verify endpoints, no token model in schema.prisma (verified full read). Distribution's `minVerification` ladder is documented as "Email is always verified on this platform" (rfq/service.ts:286-288) — i.e., verification levels beyond the admin stamp don't exist. *(SPRINT_PLAN TASK-6.)*
- **GAP — rate limiting exists on newer B2B routes but NOT on the core ones.** Enforced on: uploads, media, products/bulk, disputes (create/respond/cancel/resolve), recurring, slides, admin rfq-settings + rollback, admin settings, quote review (grep-verified list). **Missing on: auth/login, auth/register, become-seller, orders POST, rfqs POST, quotes POST, organizations POST, approvals decide.** Policies `RATE_LIMITS.login/register/order` are defined (rate-limit.ts:59, :60, :64) but never imported by those routes — dead policies. *(SPRINT_PLAN TASK-4.)*
- **GAP — CSRF guard coverage is inverted.** `assertSameOrigin` (lib/http.ts:26-55, Sec-Fetch-Site + Origin/Host match) runs on 16 routes (disputes/recurring/uploads/slides/settings/bulk/quote-review) but **NOT on the money-moving ones: orders POST, quotes accept/decline/withdraw/convert, rfqs POST/transition, organizations, auth** (grep-verified). The most critical state-changing endpoints are the unprotected set.
- **CONFIRMED — `typescript.ignoreBuildErrors: true`** (next.config.ts:6-8) plus `reactStrictMode: false` (:9). Type errors will not fail any build. *(SPRINT_PLAN TASK-1.)*
- **CONFIRMED — `.env` is tracked in git** despite `.gitignore:34` listing `.env*` (`git ls-files` shows `.env` committed with DATABASE_URL). Tracked files ignore gitignore. Credential rotation + `git rm --cached .env` needed (Lead-only file per D-010).
- In-memory limiter/cache are single-process by design (rate-limit.ts:5-6; cache.ts:1-6) — see Q9.

## Q9. Performance & ops — **PARTIAL**

- **Catalog search/pagination is now SQL-side (TD-03 resolved).** `/api/products` builds Prisma `where` with multi-term AND search across title/description/category/store/owner, orderBy per sort key, skip/take + count (products/route.ts:8-13, :45-99). Public feeds filter ACTIVE products of ACTIVE sellers (:52-55).
- **LIVE P0 — media pipeline is broken right now.** `src/lib/storage/index.ts:2` imports `./local-disk`, **but `src/lib/storage/local-disk.ts` does not exist** — not on disk, not in git HEAD (`git show HEAD:` fatal; `bun -e` import reproduces `Cannot find module './local-disk'`). Both `POST /api/uploads` and `GET /api/media/*` funnel through `getStorage()` (uploads/route.ts:58+; media/[...key]/route.ts:40) → both 500 at request time. The file existed during PLATFORM-1 (worklog.md:886) and was lost again to a host reset — the recurring failure mode of this workspace. `storage/uploads/2026/` already holds orphaned renditions.
- **In-memory cache/limiter single-process risk.** cache.ts is globalThis-tagged (multi-bundle safe, :22-34) with tag invalidation (:88-99) — but one process only; rate-limit.ts admits "Single-process by design" (:5-6). Horizontal scale would fork both. *(SPRINT_PLAN TASK-7, DEFERRED.)*
- **Lazy sweeps tax every RFQ read.** `listMyRfqs`, `getRfq`, admin lists, and seller inbox each run `expireStaleQuotes()` + `nudgeBackgroundSweeps()` (rfq/service.ts:591-592, :605-606, :1218-1219, :1244-1245, :1260-1261). The QUOTED-stale check loads **every** QUOTED RFQ with all its quotes on every read (:417-429) — O(all-quoted) per request as volume grows.
- **Unbounded buyer lists.** `listMyRfqs` has no `take` (:593-601); `listMyOrganizations`, `listMyDisputes` similarly unpaginated (organizations/service.ts:147-156; disputes.ts:587-605). Admin lists cap at 100–200.
- **Dev-server reliability:** documented repeated unsupervised deaths (whois.md:88 "died 3×"; worklog.md:830, :872) — no process manager, no health-check restart (deployment/packaging deferred by owner per worklog.md:898).

## Q10. Test & evidence coverage — **NOT-FOUND** (as an automated suite)

- **Zero test files exist in the repository.** Glob/search across the whole tree for `**/*.test.*`, `**/*.spec.*`, `e2e/`, `qa/`, `tests/`, `__tests__/` returns nothing (excluding node_modules; `tests/` directory itself doesn't exist). `package.json` has no test script and no vitest/jest/playwright dependency (package.json:5-16, :17-82).
- **The D-008 "60 tests / 4 files" baseline has NO on-disk artifact.** DECISIONS.md:21-22 claims smoke 3 · vendor-lifecycle 25 · commission-payouts 12 · catalog-moderation 20, but no file in the repo matches any of those names (grep for `vendor-lifecycle|commission-payouts|catalog-moderation` matches only DECISIONS.md itself). The claim traces to agent-browser E2E sessions whose evidence lives only in worklog prose and `screenshots/` folders — not a re-runnable suite. **The baseline must be materialized before TASK-8 can "extend" it.**
- **What exists instead:** `scripts/verify-b2b.sh` (153 lines, bash+curl+grep golden path: login → org create → admin verify → price list ladder → … with PASS/FAIL counters) — a smoke script, not a test framework; plus `screenshots/{rfqfull,rfqsettings,approvals1,enforce1,next1,restore,upload1,...}` evidence dirs from QA rounds and worklog QA entries (worklog.md:853, :870, :897).
- **Zero-coverage flows (confirmed by the absence above):** RFQ chain, approvals, disputes, recurring, pricing resolution, uploads/media, coupons — none have a single automated test. Payments/payouts likewise (only the unverifiable agent-browser rounds).
- **DoD exposure:** PLAYBOOK §7 makes agent-browser E2E part of every task's Definition of Done, but with no persisted suite, "regression" is a manual re-run of one golden-path shell script.

---

# Section A — MUST fix before Financier (ordered)

| # | What | Why it blocks the Financier phase | Files involved | Size |
|---|---|---|---|---|
| A1 | **Restore the local-disk storage adapter** (recreate `local-disk.ts`; interface at storage/types.ts:16-36; traversal-safe, atomic writes, `storage/uploads` root) | The media pipeline is DOWN today (`index.ts:2` import fails → uploads/media 500). Financier flows will need document/receipt uploads; nothing file-shaped works until this is back. Third loss of this file — commit it this time. | `src/lib/storage/local-disk.ts` (new), smoke of `/api/uploads` + `/api/media` | **S** |
| A2 | **Wire the pricing resolver into checkout** — org buyers currently see contract prices on the product page (`/api/pricing/resolve`) but are **charged retail/variant price** at checkout (orders/route.ts:74-109 never calls `resolvePrices`/`buildBuyerContext`) | Financing decisions on RFQs/orders assume the order values are correct; today B2B checkout silently overcharges contract buyers. Money correctness gate. | `src/app/api/orders/route.ts`, `src/server/modules/pricing/resolver.ts`, `src/components/marketplace/checkout-view.tsx` | **M** |
| A3 | **Enforce org creditLimit at checkout / quote-accept** (block or route-to-approval when outstanding+new > limit) — creditLimit is stored/displayed only (Q5 evidence) | Financier module is credit-flavored; a platform that can't enforce its own credit field can't credibly route financing. (= SPRINT TASK-3) | `orders/route.ts`, `approvals/service.ts`, `rfq/service.ts` (accept path), `checkout-view.tsx` | **M** |
| A4 | **Type-safety gate:** `bunx tsc --noEmit` → 0 errors, flip `typescript.ignoreBuildErrors: false`, re-enable `reactStrictMode` (next.config.ts:6-9) | Every Financier schema/flow addition compounds untyped debt; the flag currently hides real errors in approvals/seed files (worklog.md:853). (= SPRINT TASK-1) | `next.config.ts` + all offending files | **M** |
| A5 | **Auth hardening:** email verification + password reset token flow (console transport in dev), wire `RATE_LIMITS.login/register` (rate-limit.ts:59-60) + `assertSameOrigin` onto auth routes | Financier connects BANK/MFI/EWALLET orgs to buyer financing requests — account-takeover via brute-force or reset-less accounts is unacceptable there. (= SPRINT TASK-6 + TASK-4 auth half) | `src/lib/auth.ts`, new token model, `src/app/api/auth/*`, schema push (Lead-gated) | **M** |
| A6 | **Rate limiting + CSRF on the remaining core routes** — orders POST, rfqs POST/transition, quotes POST/accept/decline/withdraw/convert, organizations POST, approvals decide (Q8 evidence: policies exist but are dead) | These are exactly the endpoints a financed trade will ride on; disputes/recurring already have both guards, the money routes have neither. (= SPRINT TASK-4 remainder) | `src/lib/rate-limit.ts` consumers, `src/lib/http.ts`, the listed routes | **S** |
| A7 | **Product 404 infinite skeleton → explicit not-found state** (product-view.tsx:390 `if (loading \|\| !product)` renders skeleton forever because use-api nulls data on error — use-api.ts:23-26) | Buyer-facing live defect on the path into RFQs ("request bulk pricing" lives on this page). (= SPRINT TASK-2) | `src/components/marketplace/product-view.tsx` | **S** |
| A8 | **Test foundation + wave:** first MATERIALIZE the D-008 baseline (60/4) as re-runnable agent-browser suites, then add RFQ chain, approvals, disputes, recurring, pricing, uploads, coupons coverage | The Financier phase's own DoD (F-5) extends a suite that currently doesn't exist on disk; Phase-1 exit ("all tasks DONE + TASK-9 regression green") is unmeasurable without it. (= SPRINT TASK-8) | new `e2e/` or `tests/` tree + runner | **L** |

**Suggested serialization:** A1 ∥ A7 ∥ A4-code-cleanup (disjoint). A2, A3 both touch `orders/route.ts` + checkout → serialize A2 → A3. A5 ∥ A6 after A4. A8 last (needs A1-A7 landed to test them).

# Section B — Can run in parallel (independent of the A-chain)

| # | Item | Evidence / files | Size |
|---|---|---|---|
| B1 | Org member governance completion: remove-member, role change, leave org (add-only today — Q1) | organizations/service.ts + new `[id]/members/[memberId]` route | M |
| B2 | Multi-org buyer context selector at checkout + approvals (first-membership assumption — Q5) | orders/route.ts:140-143, approvals/service.ts:228-231, checkout-view | M |
| B3 | OrderEvent timeline persistence + `deliveredAt` stamp (fixes dispute window anchor — disputes.ts:167-175) | schema (Lead-gated), orders routes, orders-view | M |
| B4 | Un-track `.env` from git + rotate DATABASE_URL (secrets hygiene — Q8) | `git rm --cached .env`, `.env` (Lead-only files) | S |
| B5 | Dead settings fields: enforce or remove (`requireSubscription`, `reviewSlaHours`, ranking prefs — Q2 caveat 2); RFQ deadline EXTEND action (`extendedCount`/`maxExtensions` half-wired) | rfq-settings/registry.ts, rfq/service.ts | S |
| B6 | Dispute outcome → money linkage design (FULL/PARTIAL_REFUND should void/reverse Payment and release payout items; today outcomes are status-only — Q6) | disputes.ts, payments/service.ts, payouts/service.ts | M |
| B7 | Seller quote revision (replace SENT quote) + buyer counter-offer primitive (nice-to-have for competitive tension — Q4 minor gap) | rfq/service.ts | M |

# Section C — Defer (safe to postpone past the Financier gate)

- **Cache/limiter store abstraction** (Redis-shaped interface swap) — SPRINT_PLAN TASK-7 is already DEFERRED; single-process is fine for current scale (rate-limit.ts:5-6, cache.ts:1-6).
- **Packaging/deployment** (Dockerfile, compose, supervisor, backups) — owner explicitly deferred (worklog.md:898); but revisit before any real traffic (whois 8.1 P0s remain unaddressed).
- **Money-type migration** — `Product.price`/`Order.total` are still Float (schema.prisma:71, :128); all new B2B money is Decimal. Migrate at a quiet moment, not mid-phase.
- **Dead dependency cleanup** (whois TD-14) — no runtime risk.
- **Per-seller/per-item fulfillment split for multi-seller orders** (Q6 gap) — real but not Financier-blocking.
- **RFQ read-path sweep optimization** (expireStaleQuotes O(all-QUOTED) per read — Q9) — matters at volume, not at current counts.

# Section D — Needs owner approval (business-model-adjacent / destructive)

1. **D-002 settlement-model ruling (blocks F-0 design).** Current rails are an operator-collector model: bank-transfer instructions direct the buyer to wire the total **to the platform account** (payments/service.ts:95, :100-108) and payouts are platform → vendor (payouts/service.ts:206, mark-paid). D-002 as written says the platform *never collects buyer→vendor funds* and settles externally. Either (a) **amend D-002** to permit platform-collected settlement (current code becomes correct, Financier can pool escrow-style flows through the platform — closest to what's built), or (b) **keep D-002** and re-path bank transfers to direct buyer→vendor wires with a buyer-submitted proof-of-payment that admins verify (platform never touches principal; commission invoiced separately). The Financier architecture (F-0) cannot start on an ambiguous money model. **Any implementation here touches D-001/D-002 — owner decision required.**
2. **Dispute refund execution.** Outcome effects currently stop at status/verification changes (disputes.ts:388-439). Making FULL_REFUND actually reverse a captured Payment / claw back a paid Payout moves real money and interacts with whichever D-002 model is chosen — design + owner sign-off before coding (relates to B6).
3. **`bun run db:push --accept-data-loss` remains the team's schema workflow** (package.json:10) and `.env` credential rotation (B4) involves destructive/git-history operations — Lead executes, owner informed.

---

## Cross-cutting invariant check (D-001..D-011)

- **D-001/D-002:** platform is orchestrator — EXCEPT the bank-transfer/payout collector model flagged in Section D-1. Flagged, not violated unilaterally.
- **D-003:** no tenantId anywhere (grep-verified during schema read); single marketplace confirmed.
- **D-004:** all B2B surfaces mount inside the single-route SPA (buyer-pages.tsx:14-17 wires RfqView/BusinessView into `/` views; no new routes added).
- **D-005:** business logic lives in `src/server/modules/*` — routes stay thin (verified across orgs/rfq/approvals/payments/payouts/disputes/recurring).
- **D-006:** all document numbers via Sequence service (sequences/service.ts:9, RFQ/QTE/DSP/PY).
- **D-007/D-008/D-009/D-010/D-011:** respected by this audit (read-only, one new file, worklog append only). **D-008's baseline claim is unverifiable on disk — see Q10.**

*End of TASK-0 gap analysis.*
