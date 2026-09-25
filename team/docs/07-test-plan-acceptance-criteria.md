# Vendora — Test Plan & Acceptance Criteria

**Doc 07 · team/docs series · Version 1.0 · September 2026**
**Audience:** the Vendora autonomous engineering team (Lead, full-stack developer agents, tester/auditor agents) and the product owner.
**Governing references:** `team/DECISIONS.md` (D-001…D-013), `team/PLAYBOOK.md` §7 (DoD), `team/PLATFORM_PLAN.md` v2.0 (phases P0–P6, DP list), `team/FINANCIER_SCHEMA.md` v4.0, `team/FINANCIER_PLAN.md` v1.1. Code facts cited from `src/server/modules/*`, `src/lib/*`, `prisma/schema.prisma`, `scripts/*`.

---

## 1. Current state of testing — the honest baseline

This document is written against the codebase **as it exists today**, not as we wish it existed.

**What exists on disk (verified):**

| Asset | Location | Status |
|---|---|---|
| ESLint | `bun run lint` (eslint 9, eslint-config-next) | Exists; DoD gate #1 (touched files clean) |
| B2B golden-path API script | `scripts/verify-b2b.sh` (153 lines, bash + curl + jq) | Exists; 10 steps, ~40 assertions, exit code = pass/fail |
| Agent-browser E2E protocol | `agent-browser` CLI (installed at `/usr/local/bin/agent-browser`) driven manually by QA agents | Exists as a **protocol**, not as stored, repeatable scripts |
| Screenshot evidence | `screenshots/<round>/NN-name.png` across 14+ round dirs | Exists; per-round evidence, not regression-comparable except via `diff screenshot --baseline` |
| Dev-server log check | `dev.log` (all-200s sweep after QA rounds) | Exists; manual |

**What does NOT exist (verified by code search, re-confirmed this round):**

- **No on-disk test suite.** Zero matches anywhere for `*.test.*`, `*.spec.*`, `__tests__/`, vitest/jest/playwright config; `package.json` has **no `test` script**. There is nothing to run in CI because there is no CI.
- **DECISIONS.md D-008** declares an E2E baseline of “60 tests / 4 files (smoke 3 · vendor-lifecycle 25 · commission-payouts 12 · catalog-moderation 20)”. **This is a statement of intent only — no such test files exist.** The gap between D-008's declared baseline and the actual state is the single most important risk in this plan (**R-1**, §13).
- Historical QA was performed by orchestrator-run agent-browser passes and recorded as worklog prose + screenshots (QA-R8, CRON-R7…R10, RFQ-FULL, ENFORCE-1, APPROVALS-1, NEXT-1, RFQ-SETTINGS rounds). Those are **one-time verifications, not repeatable assets**.

**Consequence for this plan:** until an on-disk suite lands (R-1 remediation), the *primary automated layer* is runtime verification: agent-browser E2E executed per QA round, plus the curl-level golden path. This plan therefore specifies those two layers precisely, treats a future unit layer as planned scope, and defines exactly which manual steps a tester agent must perform and leave evidence for, so that DoD rule “No E2E evidence = NOT DONE” is auditable.

---

## 2. Scope, objectives & test strategy

### 2.1 Objectives

1. Prove the **business invariants** (D-001…D-013) hold — especially: the platform never creates money-transfer code paths (D-001/D-002), only route `/` exists (D-004), no timers drive anything (D-011).
2. Prove every **state machine** (RFQ, Quote, Dispute, Payout, Order, Payment — later FinancingRequest/Offer/Agreement/Fee) accepts exactly its allowed transitions and rejects every other one with the documented status code.
3. Prove the **API surface** (88 route files under `src/app/api/**`) honors its contract: `{error: string}` error envelope, 400 zod validation, 401/403 guards, 409 state conflicts, 429 with `Retry-After`.
4. Prove **money math** (payout = Σgross − commission; commissionRate precedence) and idempotency guards on quote accept.
5. Make every acceptance criterion for epics E-01…E-12 (§8) a Given/When/Then statement a tester can execute with agent-browser or curl and leave evidence for.

### 2.2 Out of scope

- Load/stress testing (single-node dev deployment; perf smoke only, §10.1).
- Cross-browser matrices (Chromium via agent-browser only).
- i18n/localization testing (English-only UI today, §10.4).
- Payment-gateway integration testing (no gateway exists; payments are method records + admin capture by design, D-002).

### 2.3 Test strategy pyramid — adapted to this codebase

A classic pyramid (many unit tests, few E2E) assumes a unit-test framework. Vendora has none, and PLAYBOOK §10 warns browser-E2E is a turn-budget killer inside small fix tasks. The strategy is therefore **runtime verification-first**, inverted-but-disciplined:

| Layer | What | Runs where | Status |
|---|---|---|---|
| **L3 — E2E (primary)** | agent-browser golden paths + per-epic flows: snapshot → click/fill → assert → screenshot. Views via `?view=` deep links. | QA-dedicated tasks (QA-R#, FIN-8), never inside small FIX-# tasks | **Active today** (protocol exists, scripts do not — R-1) |
| **L2 — API contract** | `scripts/verify-b2b.sh` (extend with per-domain scripts: negative matrices, 409 ladders, 429 probes, pagination envelopes) | Any task, cheap, deterministic | **Partially active** (one 10-step golden path exists) |
| **L1 — unit / integration (future)** | Service-level tests for `src/server/modules/*` (pricing resolver, payout math, sweep functions with clock injection), run by a `bun test` script | Local + future CI | **Planned** — blocked on R-1 remediation decision |
| **L0 — static** | `bun run lint`; schema duplication audit greps (§9); zero-JSON grep for financier models | Every task | **Active today** |

Discipline rules that make the inverted pyramid safe:
- Every L3 run follows the same protocol and leaves a screenshot dir + worklog verdict (PLAYBOOK §4/§7).
- Every mutation task re-runs at minimum the golden path (`verify-b2b.sh`) — full agent-browser sweep only in QA-dedicated rounds (PLAYBOOK §10).
- Negative tests (409/403/400) are executed at L2 (curl) wherever possible — cheaper and more precise than browser-driven failure UX; browser only asserts the user-visible rendering of the error (toast/alert text).

---

## 3. Test environments & data

### 3.1 Environment

| Item | Value | Source |
|---|---|---|
| App | `bun run dev` → Next.js on **:3000** | D-007 |
| Proxy | Caddy on **:81** (preserves Host header — CSRF Origin comparison stays valid) | D-007, `src/lib/http.ts` |
| Forbidden | `bun run build` / production start in dev verification | D-007 |
| DB | MySQL (user-space MariaDB) at `127.0.0.1:3306/vendora`, `DATABASE_URL` env | PLAYBOOK §10 |
| Auth | `AUTH_SECRET` ≥ 32 chars (fail-fast if missing; session cookie httpOnly, SameSite=Lax, secure in prod) | `src/lib/auth.ts` |
| Server restart | Double-fork pattern `( ( cmd & ) & )` — plain `&` children are reaped at command boundary | PLAYBOOK §10 |
| Logs | `dev.log` — tail after any server-affecting change; QA rounds end with an all-200s sweep | PLAYBOOK §10 |

**Clock:** there is no test clock. Sweep tests (§6) manipulate time by **direct DB update** (`UPDATE … SET validUntil/expiresAt/escalateAt/nextRunAt = past`) then trigger the lazy sweep through a read path. Never add timers to do this (D-011).

### 3.2 Seeding

| Script | What it creates | Notes |
|---|---|---|
| `bun run db:seed` (`scripts/seed-demo.ts`) | 1 admin, 5 sellers w/ stores, buyer trio (demo/casey/riley) + 5 reviewer-pool buyers, 6 categories, ~products with images, **Acme Trading Co** (ACTIVE, verified, NET-45, $75,000 credit, **$500 approvalThreshold**), members demo=OWNER / casey=APPROVER / riley=BUYER, group + org-contract price lists, demo RFQs/quotes | Destructive: wipes organizations/org members first |
| `bun run db:seed:b2b` (`scripts/seed-b2b.ts`) | `retail` default CustomerGroup, `RFQ`/`QTE` sequences, WELCOME10 coupon row | Idempotent upserts |
| `scripts/cleanup-b2b.ts`, `scripts/cleanup-uploads.ts` | Strip B2B artifacts / orphaned upload renditions | Run before re-verifying golden path to avoid duplicate-org noise |

### 3.3 Test account matrix

| Account | Credentials | Role / shape | Used to test |
|---|---|---|---|
| `admin@vendora.com` | `admin1234` | ADMIN | All 16 admin surfaces, verification, payouts, dispute resolution, quote moderation |
| `demo@vendora.com` | `demo1234` | BUYER, **Acme OWNER**, has prior orders | Golden path buyer, org owner, approvals (as approver), WELCOME10 negative (not first order) |
| `casey@vendora.com` | `demo1234` | BUYER, Acme **APPROVER** | Approval decide, no-self-approve is N/A (never requests) |
| `riley@vendora.com` | `demo1234` | BUYER, Acme **BUYER member** | Orders ≥ $500 → PENDING_APPROVAL routing |
| `seller1@vendora.com` … `seller5@vendora.com` | `seller1234` | SELLER — TechNest, UrbanThread Co., Casa Verde Home, PeakForm Gear, Wildbloom Studio | Seller console, quote composer, multi-seller lines, quote routing (`verifiedAt` tiering) |
| (create on demand) | — | **Suspended seller** — admin → Vendors → suspend (e.g. seller4) | Login 403, session invalidation, checkout 400 when his product is in cart |
| (fresh, per run) | random email | Newly registered buyer | WELCOME10 first-order positive, register rate-limit probes |

> The Acme org approval threshold is **$500** (`seed-demo.ts:923`) — use cart totals just below/at/above it for the approval routing boundary tests.

---

## 4. Current verification assets inventory

### 4.1 `bun run lint`

ESLint over the repo. DoD gate #1: clean for touched files. Known baseline: `tsc` shows ~122 pre-existing diagnostics (unchanged across rounds); QA rounds require **zero new** errors in touched files.

### 4.2 `scripts/verify-b2b.sh` — the API golden path

Run against the dev server; prints PASS/FAIL lines, exits non-zero on any failure. Steps (all assertions included):

| # | Step | Key assertions |
|---|---|---|
| 1 | Sessions | buyer + admin login 200, session cookies |
| 2 | Org registration (buyer) | empty list first; org created; status `PENDING_VERIFICATION`; requester `myRole=OWNER` |
| 3 | Admin verify + credit config | admin org list ≥1; PATCH → `ACTIVE`, `creditTermsDays=30`, `creditLimit=50000`; `verifiedAt` set |
| 4 | Customer group + group price list w/ qty breaks | group created; price list `scope=GROUP, priority=10`; 3 ladder entries (P1@1=−15%, P1@10=−30%, P2@5=$9.99) |
| 5 | Map org → group; pricing resolves | P1@5 → `source=GROUP`; P1@50 crosses the 10+ break → exact −30% price; P2@1 → `RETAIL` |
| 6 | ORG contract list outranks group | contract list `scope=ORG, priority=5`; P1@5 → `CONTRACT` beats GROUP; `savingsPercent=50` |
| 7 | RFQ lifecycle | RFQ DRAFT (number assigned) → buyer cannot quote (403) → SUBMIT → quote (NET-30 terms) → RFQ `QUOTED`, quote visible to buyer → 2nd competing quote → accept → quote `ACCEPTED`, RFQ `ACCEPTED`, **sibling auto-`DECLINED`** |
| 8 | Coupons are DB-backed | WELCOME10 anonymous → “Sign in to use this code”; fresh user → `valid:true`; demo buyer (prior orders) rejected; admin creates BULK15 → validates at $600 |
| 9 | Audit trail | admin audit-logs contains `ORG_VERIFIED`, `RFQ_SUBMITTED`, `QUOTE_ACCEPTED`, `PRICELIST_ENTRIES_REPLACED` |
| 10 | Access control | audit-logs: 401 anonymous, 403 for buyer; RFQ owner reads own detail |

**Planned extensions (L2 growth):** per-domain negative scripts `scripts/tests/*.sh` (see §7) — same harness pattern (curl + jq + PASS/FAIL counters).

### 4.3 Agent-browser E2E protocol

The canonical runtime-verification loop every QA round follows (also the DoD gate #3 evidence generator):

1. **Open** — `agent-browser open http://127.0.0.1:3000/` (use `:81` when verifying the Caddy path). SPA: all views are `?view=` deep links (`?view=catalog`, `?view=product&id=…`, `?view=rfqs`, `?view=business`, `?view=seller`, `?view=admin&tab=…`, `?view=orders`, `?view=favorites`).
2. **Snapshot** — `agent-browser snapshot` returns the accessibility tree with `@ref`s; use refs for stable targeting (never raw CSS selectors that churn).
3. **Interact** — `click @ref` · `fill <sel> <text>` · `select <sel> <val>` · `check` · `press Enter|Tab` · `scroll down 600` · `wait <sel|ms>`.
4. **Assert** — `get text <sel>` / `get count <sel>` / `is visible <sel>` / `get url` (post-navigation), or `eval "<js>"` for computed styles (containment checks: scrollHeight vs clientHeight, overflow), localStorage, and the console-error trap.
5. **Viewport/theme matrix** — `set viewport 375 667` (mobile), `768 1024` (tablet), `1440 900` (desktop); `set media dark`. (Historical rounds used 390px — new rounds standardize on **375**.)
6. **Error trap** — before navigating: `eval` to install `window.__errors=[]` + `window.addEventListener('error',…)`; after the pass, `agent-browser errors` must be empty and `console` free of red entries; end with a `dev.log` all-200s tail check.
7. **Evidence** — `agent-browser screenshot screenshots/<round>/NN-step-name.png` after each meaningful state; the round dir is the DoD evidence. Optional: `diff screenshot --baseline` for pixel-regression on stable flows.
8. **Session shaping** — `cookies set --curl <jar>` lets a round reuse a curl-login session (mixing L2 logins with L3 flows), `cookies clear` between role switches.

**Budget rule (PLAYBOOK §10):** browser E2E belongs to QA-dedicated tasks only; FIX-# tasks verify via curl/lint/log.

### 4.4 Screenshot evidence archive (existing rounds)

`upload1` (image upload incl. oversize rejection) · `restore`/`restore2` (product form rebuild, variants, B2B intact) · `5a` (admin control tower) · `5b` (buyer B2B UI incl. mobile 390 + dark) · `rfqfull` (RFQ full cycle incl. convert-to-order, print, admin tower) · `approvals1` (approval workflow, policy 750-era, dark/mobile) · `enforce1` (disputes + recurring enforcement) · `next1` (notifications, convert, orders) · `rfqsettings` (settings rail incl. scope overrides, mobile, dark) · `history/qa-r7…r10` (invoice/payouts/a11y, notifications inbox, orders timeline, store covers/nav).

**QA history to honor (regression hotspots):** QA-R8 fixed the settings-rail containment bug (Radix ScrollArea viewport grew beyond its clip — rebuilt as native `overflow-y-auto` sticky card) and the mobile catalog card overflow (Add button escaping the card frame); the 3-seller E2E (same product quoted by 3 sellers, RFQ-2026-000017) is the canonical multi-seller regression. Any change to `rfq-settings.tsx`, `product-card.tsx`, or scroll containers must re-verify those flows at 375px.

---

## 5. Test matrix — functional areas × test types × status

Status legend: **E** = exists w/ evidence · **P** = partial · **PL** = planned (this doc defines it) · **—** = not applicable.

| # | Functional area | L3 E2E (agent-browser) | L2 API contract | Negative (400/403/409) | Sweeps / expiry | Invariant (D-rules) | A11y + responsive | Unit (future L1) |
|---|---|---|---|---|---|---|---|---|
| 1 | Auth & sessions (login/register/logout/me/become-seller, suspension) | E (login modal, role dashboards) | P (verify-b2b step 1, 10) | P (401/403/suspended-403) | — | P (D-004 route check) | P | PL |
| 2 | Catalog browse & search (filters, autocomplete, pagination) | E (qa-r7/r10 rounds) | P (`/api/catalog`, `/api/products`) | PL (bad params 400) | — | — | E (390px rounds; re-standardize 375) | PL |
| 3 | Product detail & variants (pills, qty, stock) | E (restore2) | P | P (out-of-stock 400/409 at quote & checkout) | — | — | E | PL |
| 4 | Cart & checkout (drawer, coupon, shipping, methods) | E (restore2, qa-r8 saved-cart) | P | P (invalid coupon 400, suspended seller 400) | — | — | P | PL |
| 5 | Coupons (DB-backed, admin CRUD) | P (admin tab) | E (verify-b2b step 8) | E (first-order guard) | — (expiry field exists; sweep PL) | — | P | PL |
| 6 | Payments (methods, BANK_TRANSFER capture, fail) | P (admin tab) | P | P (409 double-capture, non-pending fail) | — | **E-critical (D-002: no money movement — admin capture is a record flip)** | — | PL |
| 7 | Orders (buyer view/invoice, seller fulfillment PAID→…→DELIVERED, admin list) | E (rfqfull, next1) | P | P (cancel guards) | — | — | E (orders timeline, mobile) | PL |
| 8 | Disputes (open→respond→escalate→resolve; seller-silence auto-resolve) | E (enforce1) | P | P (409 closed-thread) | **P** (sweepDisputes via read-path trigger — R-3) | P (verifiedAt clearing) | E (mobile buyer disputes) | PL |
| 9 | RFQ full cycle (draft→submit→quote→accept→convert; messages; inbox; multi-seller) | E (rfqfull, 5b, QA-R8) | E (verify-b2b step 7) | E (403 buyer-quote, 409 wrong-state) | P (expireStaleQuotes — R-3) | P | E (375/dark) | PL |
| 10 | Recurring RFQs (schedule, pause/resume/skip, auto-publish) | E (enforce1) | P | P | P (processDueSchedules incl. auto-pause on stock-out — R-3) | — | P | PL |
| 11 | Approvals (threshold routing, queue, decide, no-self-approve) | E (approvals1) | P | PL (self-approve rejection) | — | P (requester ≠ decider) | E (dark/mobile) | PL |
| 12 | Pricing resolver (RETAIL/GROUP/CONTRACT precedence, qty breaks, savings) | E (5b contract price screenshots) | E (verify-b2b steps 5–6) | PL (nonexistent product 400) | — | — | — | **PL priority-1** (pure function) |
| 13 | Organizations & members (register, verify, credit, suspend, members) | E (5a/5b) | E (verify-b2b steps 2–3) | P (403 non-member) | — | P | E | PL |
| 14 | Seller console (products CRUD + variants + media, orders, earnings, RFQ inbox, disputes) | E (upload1, restore2, QA-R8) | P | P (owner-only 403) | — | P (suspended 403) | E | PL |
| 15 | Admin console — 16 surfaces (14 sidebar sections; Pricing & Lists carries Price Lists + Customer Groups sub-consoles) | E (5a + later rounds; storefront designer via admin-settings) | P (admin tree ~40 routes) | E (401/403 — verify-b2b step 10) | — | — | P | PL |
| 16 | Media uploads (pipeline, renditions, in-use delete guard, rate limit) | E (upload1) | P | E (409 in-use, oversize reject) | — | — | — | PL |
| 17 | Notifications (bell, unread, deep links, mark-read) | E (next1, qa-r8) | P | P (401) | — | — | E (dark/mobile) | PL |
| 18 | Settings & rollback (RFQ settings 22 panels × 4 scopes, history, rollback; platform settings) | E (rfqsettings) | P | P (rollback CSRF+RL) | — | P (live enforcement after change) | E (rail containment regression!) | PL |
| 19 | Storefront theme (branding, hero slides, store view, covers) | E (qa-r10) | P (admin slides CRUD w/ CSRF+RL) | P | — | — | E | — |
| 20 | **Financing (PLANNED — P1/P2/P4)** | PL | PL | PL | PL (lazy sweep) | **PL-critical (zero-JSON, single-entry, D-002 track-only)** | PL | PL |
| 21 | **Super-Cart (PLANNED — P3)** | PL | PL | PL | — | PL (D-001 check on new lineTypes) | PL | PL |

---

## 6. State-machine transition test tables

**How to read.** For each machine: (a) the allowed-transition table (positive tests, expected 2xx + resulting status), (b) forbidden transitions (negative tests, expected **409** unless noted — the service error contract), (c) sweep tests where the machine has lazy time-based transitions (D-011: no cron — sweeps fire on read paths `listMyRfqs`, `getRfq`, `adminListRfqs`, `adminListQuotes`, `sellerRfqInbox`; test protocol: **set the clock by direct DB update, then hit a triggering read path**, then assert DB + API state).

Sources: `src/server/modules/rfq/service.ts` (`RFQ_TRANSITIONS`, accept/withdraw/review/convert guards), `rfq/disputes.ts` (header state diagram, `sweepDisputes`), `rfq/recurring.ts` (`processDueSchedules`), `payouts/service.ts`, `payments/service.ts`, `approvals/service.ts`, `seller-view.tsx:177` (fulfillment ladder), `prisma/schema.prisma` status comments; PLANNED machines from `FINANCIER_SCHEMA.md` v4.0 §5.

### 6.1 RFQ (statuses: DRAFT SUBMITTED UNDER_REVIEW QUOTED ACCEPTED REJECTED CANCELLED EXPIRED ORDERED)

**6.1.a Allowed transitions**

| From | Action (actor) | To | Notes / assertions |
|---|---|---|---|
| DRAFT | SUBMIT (buyer) | SUBMITTED | `submittedAt` set; deadline defaulted from `rfqExpiry` settings if absent |
| DRAFT | CANCEL (buyer) | CANCELLED | |
| SUBMITTED | REVIEW (admin) | UNDER_REVIEW | |
| SUBMITTED | REJECT (admin) | REJECTED | |
| SUBMITTED | CANCEL (buyer) | CANCELLED | 409 if any quote is ACCEPTED |
| UNDER_REVIEW | REJECT (admin) | REJECTED | only exit |
| SUBMITTED / UNDER_REVIEW | seller creates quote | QUOTED | auto-flip on first quote |
| QUOTED | buyer accepts a quote | ACCEPTED | sibling quotes auto-DECLINED; `closedAt` |
| ACCEPTED | CONVERT (buyer) | ORDERED | order created; quote → CONVERTED; stock re-check 409 on shortfall |
| (any open, deadline passed) | lazy sweep | EXPIRED | see 6.1.c |

**6.1.b Forbidden transitions (expect 409, message `Cannot <action> an RFQ in <status>`)**

| From | Attempted action | Expected |
|---|---|---|
| DRAFT | REVIEW / REJECT | 409 |
| SUBMITTED | SUBMIT again | 409 |
| REJECTED / EXPIRED / ORDERED | any action | 409 (terminal) |
| QUOTED with an ACCEPTED quote | CANCEL | 409 “Cannot cancel an RFQ with an accepted quote” |
| ACCEPTED | CANCEL | 409 |
| CANCELLED / REJECTED / EXPIRED / ORDERED | post a message to thread | 409 “the thread is closed” |
| any | buyer creates a quote on own RFQ | **403** “sellers or admins” |
| SUBMITTED→… | quote on REJECTED RFQ | 409 “quotes are closed” (only SUBMITTED/UNDER_REVIEW/QUOTED accept quotes) |
| any | quote a zero-stock line | 409 out-of-stock message |

**6.1.c Sweep tests (`expireStaleQuotes`, 4 rules — trigger via read path)**

| # | Setup (direct DB update) | Trigger | Expected |
|---|---|---|---|
| S1 | `Quote.status='SENT'`, `validUntil = now−1h` | GET list triggering sweep | Quote → `EXPIRED` |
| S2 | RFQ `SUBMITTED`, `expiresAt = now − (graceHours+1)h`, rfqExpiry.enabled, actionOnExpiry=EXPIRE | read path | RFQ → `EXPIRED`, `closedAt` set; buyer notified when `notifyBuyerOnExpiry` |
| S3 | same + `notifyUnresponded` on, seller of a line never quoted | read path | that seller gets “closed before you sent a quote” notification |
| S4 | `expiresAt` inside grace window | read path | **no** transition (grace respected) |
| S5 | rfqExpiry.actionOnExpiry = KEEP_OPEN | read path | **no** transition |

### 6.2 Quote (statuses: DRAFT SENT PENDING_REVIEW ACCEPTED DECLINED REJECTED EXPIRED CONVERTED WITHDRAWN)

**6.2.a Allowed transitions**

| From | Action (actor) | To | Notes |
|---|---|---|---|
| (create) | seller/admin composes | SENT — or PENDING_REVIEW when quote-routing settings gate the seller (e.g. unverified `verifiedAt` tier) | number QTE-… |
| PENDING_REVIEW | admin APPROVE | SENT | `sentAt`; buyer notified RFQ_QUOTE_RECEIVED; audit QUOTE_APPROVED |
| PENDING_REVIEW | admin REJECT | REJECTED | audit QUOTE_REJECTED; seller notified |
| SENT | buyer ACCEPT | ACCEPTED | RFQ → ACCEPTED; **siblings → DECLINED**; may create approval request if ≥ org threshold → `pendingApproval` in response |
| SENT | buyer DECLINE | DECLINED | |
| SENT | seller WITHDRAW (or admin force) | WITHDRAWN | cancellation settings may lock non-admin withdraw |
| SENT | validUntil passes | EXPIRED | lazy sweep (S1) |
| ACCEPTED | buyer CONVERT | CONVERTED | RFQ → ORDERED; Order created |
| ACCEPTED | sibling of an accepted quote | DECLINED | automatic (declinedAt set) |

**6.2.b Forbidden transitions (expect 409)**

| From | Attempted | Expected |
|---|---|---|
| SENT | ACCEPT after `validUntil` passed | 409 “This quote has expired” |
| SENT | ACCEPT when RFQ already ACCEPTED/ORDERED | 409 “This RFQ is already closed” |
| ACCEPTED | ACCEPT again (double-accept / replay) | 409 `Quote is accepted — cannot accept` (idempotency guard) |
| any ≠ SENT | DECLINE / WITHDRAW | 409 `Quote is <status> — cannot …` |
| any ≠ PENDING_REVIEW | review APPROVE/REJECT | 409 “nothing to review” |
| any ≠ ACCEPTED | CONVERT | 409 “only accepted quotes can convert” |
| ACCEPTED (RFQ already ORDERED) | CONVERT | 409 “already been converted to an order” |
| ACCEPTED | CONVERT with insufficient stock (product or variant) | 409 “Not enough stock for … Request a revised quote.” |
| another seller's quote | WITHDRAW by non-owner seller | **403** Access denied |

### 6.3 Dispute (statuses: OPEN SELLER_RESPONDED ESCALATED RESOLVED CLOSED CANCELLED)

**6.3.a Allowed transitions**

| From | Action (actor) | To | Notes |
|---|---|---|---|
| (create) | buyer opens on delivered order | OPEN | `escalateAt = now + autoEscalateDays`; seller notified w/ `sellerResponseDays` window |
| OPEN | seller RESPOND | SELLER_RESPONDED | re-arms `escalateAt` |
| OPEN/SELLER_RESPONDED | `escalateAt` passes | ESCALATED | lazy `sweepDisputes`; audit DISPUTE_ESCALATED |
| OPEN | buyer withdraws (own) | CANCELLED | `closedAt`; audit DISPUTE_CANCELLED |
| OPEN/SELLER_RESPONDED/ESCALATED | admin RESOLVE (outcome ∈ FULL_REFUND PARTIAL_REFUND SELLER_PENALTY NO_ACTION …) | RESOLVED | seller-loss outcomes **clear seller `verifiedAt`** when `affectsVerification`; audit DISPUTE_RESOLVED |
| (terminal resting state) | — | CLOSED / CANCELLED | see schema comment; order CANCELLED is a reject path input |

**6.3.b Forbidden transitions**

| From | Attempted | Expected |
|---|---|---|
| RESOLVED/CLOSED/CANCELLED | respond / cancel / resolve | 409 (terminal; thread closed) |
| non-buyer | cancel another buyer's dispute | **403** |
| buyer | resolve own dispute (self-adjudge) | **403** (admin-only route `requireAdmin`) |
| dispute on CANCELLED order | open | 400/409 (order-status guard) |

**6.3.c Sweep tests (`sweepDisputes`)**

| # | Setup | Expected |
|---|---|---|
| S1 | OPEN, `escalateAt = past` | → ESCALATED on next trigger; seller+admin notified |
| S2 | OPEN, seller silent beyond `sellerResponseDays` | auto-RESOLVED in buyer's favor (default outcome **FULL_REFUND**, first enabled outcome otherwise); audit DISPUTE_AUTO_RESOLVED; may clear `verifiedAt` |
| S3 | dispute on a since-CANCELLED order during sweep | skipped (no resolution against cancelled orders) |

### 6.4 Payout (statuses: PENDING PAID CANCELLED)

**6.4.a Allowed transitions**

| From | Action (actor) | To | Notes |
|---|---|---|---|
| — | admin GENERATE for seller | PENDING | aggregates paid, unsettled OrderItems (`order.status≠CANCELLED`, payment SUCCEEDED, `payoutId` null); number PY-…; 409 “Nothing to settle” when empty |
| PENDING | admin MARK-PAID (note ≤500) | PAID | `paidAt`; audit PAYOUT_PAID; seller notified |
| PENDING | admin CANCEL (reason) | CANCELLED | audit PAYOUT_CANCELLED |

**6.4.b Forbidden transitions (expect 409 `Payout is already <status>`)**

| From | Attempted | Expected |
|---|---|---|
| PAID | mark-paid again | 409 |
| CANCELLED | mark-paid | 409 |
| PAID | cancel | 409 |
| PENDING | generate again for same seller while items already settled | 409 “Nothing to settle — no paid, unsettled items” |

**Invariant (D-001/D-002) on every payout test:** payout is a **record + mark-paid** — no code path may move money. Test = code inspection checklist (§9 INV-1/INV-2) plus the behavioral fact that mark-paid only writes status/paidAt/note.

### 6.5 Order (statuses: PENDING_PAYMENT PENDING_APPROVAL PAID PROCESSING SHIPPED DELIVERED CANCELLED)

**6.5.a Allowed transitions**

| From | Action (actor) | To | Notes |
|---|---|---|---|
| (checkout, CARD, no approval) | place order | PAID | payment SUCCEEDED inline |
| (checkout, CARD, approval needed) | place order | PENDING_APPROVAL | approval request PENDING |
| (checkout, BANK_TRANSFER) | place order | PENDING_PAYMENT | payment PENDING w/ instructions |
| PENDING_APPROVAL | approver APPROVE | PENDING_PAYMENT | request APPROVED; payment proceeds |
| PENDING_APPROVAL | approver REJECT | CANCELLED | request REJECTED; buyer notified |
| PENDING_PAYMENT | buyer PAY (BANK_TRANSFER) | stays PENDING_PAYMENT | reference recorded; awaits capture |
| PENDING_PAYMENT | admin CAPTURE payment | PAID | payment SUCCEEDED; order flips |
| PAID | seller advances | PROCESSING | seller console “advance status” |
| PROCESSING | seller advances | SHIPPED | |
| SHIPPED | seller advances | DELIVERED | |
| open states | cancel per policy | CANCELLED | (e.g. approval rejection; disputes reference it) |

**6.5.b Forbidden transitions**

| From | Attempted | Expected |
|---|---|---|
| PAID (not PENDING_PAYMENT) | buyer PAY again | 409/`error` guard (`order.status !== 'PENDING_PAYMENT'`) |
| non-seller-owner | advance another seller's order | **403** |
| DELIVERED | advance | no-op/error (ladder undefined — expect graceful refusal) |
| cart containing suspended-seller product | checkout | **400** (blocked at order creation) |

### 6.6 Payment (statuses: PENDING SUCCEEDED FAILED CANCELLED)

| From | Action | To | Notes |
|---|---|---|---|
| (ensure) | order needs payment | PENDING | idempotent: existing PENDING payment is updated, not duplicated |
| PENDING | card path / admin capture | SUCCEEDED | order → PAID (unless invoice terms); **sibling PENDING payments → CANCELLED** |
| PENDING | buyer cancels / superseded | CANCELLED | |
| PENDING | admin FAIL (note) | FAILED | audit PAYMENT_FAILED |

Forbidden: capture a SUCCEEDED payment → 409 “Payment already captured”; capture FAILED/CANCELLED → 409 `Payment is <status>`; mark-fail non-PENDING → 409. Idempotency test: two `ensurePayment` calls for one order → single PENDING row.

### 6.7 Recurring RFQ schedule (bonus machine — real code, tested in ENFORCE-1)

| From | Action | To |
|---|---|---|
| ACTIVE, `nextRunAt ≤ now`, not paused | `processDueSchedules` (lazy, read-path) | publishes a new RFQ run; `nextRunAt` advanced by cycle |
| ACTIVE | user PAUSE | paused (`pausedUntil` or flag) — no runs while paused |
| paused | user RESUME | ACTIVE; `nextRunAt` recomputed from resume |
| ACTIVE | user SKIP cycle | `nextRunAt` += one cycle (no run spawned) |
| ACTIVE, product out of stock at run time | sweep | **auto-paused** + owner notified (verified in enforce1) |

Forbidden/negative: skip on a paused schedule (409/guard); preview notification window only (`nextRunAt` within preview horizon → heads-up notification).

### 6.8 PLANNED — FinancingRequest (`FINANCIER_SCHEMA.md` v4.0 §5; statuses: DRAFT SUBMITTED UNDER_REVIEW INFO_REQUESTED OFFERED ACCEPTED DECLINED_ALL EXPIRED CANCELLED WITHDRAWN)

| From | Action | To | Notes |
|---|---|---|---|
| DRAFT | wizard submit | SUBMITTED | FR-YYYY-###### number; `consentAt` required (stamped) |
| SUBMITTED | financier picks up | UNDER_REVIEW | status note → AuditLog `FINANCING_STATUS_CHANGED` + Notification (DP-15) |
| SUBMITTED/UNDER_REVIEW | financier requests info | INFO_REQUESTED | |
| INFO_REQUESTED | applicant answers | UNDER_REVIEW | |
| UNDER_REVIEW | first offer SENT | OFFERED | |
| OFFERED | applicant accepts one offer | ACCEPTED | siblings auto-DECLINED → request DECLINED_ALL if none left; FinancingFee ACCRUED; FinancingAgreement created referencing the **frozen** offer |
| (pre-acceptance) | applicant cancels | CANCELLED / WITHDRAWN | wizard “Cancel request” |
| (past `expiresAt`) | lazy sweep | EXPIRED | mirrors sweepDisputes — no cron |

Forbidden (PL): transitions not in table → 409; accept with a request in DRAFT → 409; expired offer accept → 409. Sweep (PL): `expiresAt` past → EXPIRED on read trigger.

### 6.9 PLANNED — FinancingOffer (statuses: DRAFT SENT ACCEPTED DECLINED EXPIRED WITHDRAWN)

| From | Action | To |
|---|---|---|
| DRAFT | financier sends | SENT (id-addressed; DP-12 no offer numbers) |
| SENT | applicant accepts | ACCEPTED — siblings auto-DECLINED; agreement created from frozen offer snapshot |
| SENT | applicant declines | DECLINED |
| SENT | financier withdraws | WITHDRAWN |
| SENT | `validUntil` passes | EXPIRED (lazy sweep) |

Forbidden (PL): accept/decline non-SENT → 409; withdraw non-SENT → 409; double-accept → 409 (mirror the Quote idempotency guard).

### 6.10 PLANNED — FinancingAgreement (`fundingStatus`: PENDING → REPORTED_FUNDED → REPORTED_SETTLED; `status` → COMPLETED)

| From | Event reported by financier | To | Notes |
|---|---|---|---|
| PENDING | DISBURSEMENT FinancingEvent | fundingStatus REPORTED_FUNDED | **track-only ledger** — the platform records, never moves money (D-002) |
| REPORTED_FUNDED | REPAYMENT events accumulate | REPORTED_SETTLED → status COMPLETED | money NEVER on platform |

Forbidden (PL): PENDING → REPORTED_SETTLED skip (409); settle before funded (409); any money-transfer side effect in code = **D-002 violation, P0 defect**.

### 6.11 PLANNED — FinancingFee (statuses: ACCRUED INVOICED PAID WAIVED)

| From | Action | To |
|---|---|---|
| (offer accepted) | auto | ACCRUED (fee % × financed amount) |
| ACCRUED | admin marks invoiced (external invoice) | INVOICED |
| INVOICED | admin marks paid (external settlement) | PAID |
| ACCRUED/INVOICED | admin waives | WAIVED |

Forbidden (PL): mark-paid from ACCRUED (skip INVOICED) → 409; waive PAID → 409; any automated collection path → D-002 violation. Mirrors Payout lifecycle exactly — test table 6.4 is the template.

**Machine count: 11 transition tables (7 live + 4 planned) · 33 forbidden-transition negative cases · 11 sweep cases.**

---

## 7. API contract tests (per-domain checklist)

### 7.0 Global contract (applies to all 88 routes under `src/app/api/**`)

| Rule | Test |
|---|---|
| Error envelope | Every failure returns `{ "error": "<human message>" }` (sometimes with detail fields); never a bare stack/500 body |
| Validation | zod parse failure → **400** with message |
| Auth | `requireUser` → **401** `{error:'Please sign in first'}` anonymous; `requireAdmin` → **403** `{error:'Admin access required'}` for BUYER/SELLER |
| Ownership | buyer reading another buyer's RFQ/order → 403/404 per service guard |
| CSRF | unsafe methods on CSRF-wired routes (uploads, products/bulk, disputes×4, recurring×4, quotes/review, admin settings/slides/rfq-settings/rollback) reject cross-site: browser sends `Sec-Fetch-Site: cross-site` → **403** `Cross-site requests are not allowed` + `X-Reason: csrf:…`. curl (no Origin header) is deliberately allowed. **Coverage gap to track:** remaining mutation routes (orders, quotes accept/decline/withdraw/convert, approvals decide, organizations, favorites, auth) rely on the SameSite=Lax session cookie only — extending `assertSameOrigin` is a hardening backlog item (see security doc) |
| Rate limits | 429 body `{error:'Too many requests — slow down and try again shortly'}` + **`Retry-After`** header (seconds) |
| Pagination | list endpoints return envelope + `page/pageSize` or `limit/offset` (admin audit-logs uses `pageSize`; products uses `limit`) — assert envelope shape, totals, and empty-page behavior |

### 7.1 Rate-limit matrix (verified wiring)

| Bucket | Policy | Keyed by | Wired? |
|---|---|---|---|
| `upload` | 30 / 10 min | user | **Yes** (`/api/uploads`) |
| `productWrite` | 60 / 10 min | user | **Yes** (`/api/products/bulk`) |
| `mediaRead` | 600 / min | IP | **Yes** (`/api/media/[...key]`) |
| inline admin/op buckets | 20–60 / min | IP | **Yes** (admin:settings 20, admin:slides 30–60, admin:rfq-settings 60, settings-rollback 30, quote:review 60, disputes:create 10 / respond 20 / cancel 20 / resolve 60, recurring:create 20 / patch 30 / delete 30 / skip 20) |
| `login` | 10 / 10 min | IP | **NO — preset defined in `src/lib/rate-limit.ts:59`, not referenced by any route (gap)** |
| `register` | 5 / 30 min | IP | **NO — same gap** |
| `order` | 20 / 10 min | user | **NO — same gap** |
| `review` | 10 / hour | user | **NO — same gap** |

Test procedure: fire N+1 requests (curl loop), expect the (N+1)th → 429 with `Retry-After` ≥ 1; after `resetBucket`-worthy events (e.g. successful login) the bucket clears. **All limits are in-memory, per-process** (single-node dev) — see R-2.

### 7.2 Per-domain checklists

| Domain (routes) | Contract checks (all Planned unless noted) |
|---|---|
| **auth** (`login/register/logout/me/become-seller`) | login 200 + cookie (httpOnly/Lax); wrong password 401; suspended user login → **403** “suspended by the platform administrator”; register 201/200 (weak password → 400); `me` reflects role; become-seller flips role BUYER→SELLER; logout clears session. E: verify-b2b step 1 |
| **products** (`/api/products`, `[id]`, `bulk`, `export`) | list pagination `limit`, filters; create (seller) 201; update/delete by non-owner → **403**; admin moderation fields; export CSV headers; bulk import row-error reporting (**known latent defect: bulk import writes columns absent from schema — AUDIT-R1; do not gate releases on it, track FIX**) |
| **catalog / categories / home** | envelope shape; only ACTIVE products surface anonymously; category tree; home payload (featured, slides) |
| **pricing/resolve** | E: verify-b2b steps 5–6 (GROUP/CONTRACT/RETAIL precedence, qty breaks, `savingsPercent`); nonexistent productId → 400; anonymous defaults to RETAIL |
| **coupons/validate + admin/coupons** | E: step 8 (first-order guard, min subtotal, admin CRUD, inactive → invalid) |
| **orders** (`/api/orders`, `[id]`, `[id]/pay`) | create with suspended-seller item → **400**; unknown product → 400; coupon path; approval routing ≥ $500 for BUYER member of ACTIVE org; pay guards (6.5.b); invoice/serialization |
| **payments** (`methods`, admin `payments` + `capture/fail`) | methods list (CARD/BANK_TRANSFER/INVOICE); capture 409 double; fail 409 non-pending; admin-only 403 |
| **payouts** (admin `payouts` + `preview/generate/mark-paid/cancel`, config) | preview math (see §10.5); generate 409 empty; 409 wrong-state (6.4.b); config zod 0–90% bounds → 400 outside |
| **disputes** (`/api/disputes` + respond/cancel, admin resolve) | create on own delivered order only; respond by seller only; cancel by buyer only; resolve admin-only; 409 closed thread; rate limits per 7.1 |
| **rfqs** (`/api/rfqs`, `[id]`, `[id]/quotes`, `[id]/messages`, `inbox`) | create (buyer) w/ lines incl. free-text productName lines; submit/cancel per 6.1; quotes seller/admin only (buyer → 403); messages 409 on closed RFQ + anti-spam per-day cap; inbox scoped to sellers of lines (+ routing settings scope) |
| **quotes** (`accept/decline/withdraw/review/convert/pdf`) | per 6.2; `pdf` returns a PDF (pdf-lib) for the buyer; review admin-only |
| **recurring-rfqs** (+ `[id]`, `skip`) | create/pause/resume/skip per 6.7; CSRF + RL wired |
| **approvals** (`/api/approvals`, `[id]/decide`) | queue scoped to approver roles; decide APPROVE/REJECT per 6.5; **requester deciding own request → rejected (no self-approve)**; 409 already-decided |
| **organizations** (`/api/organizations`, `[id]`, `[id]/members`) | register → PENDING_VERIFICATION + OWNER; one org per OWNER; member add/remove role guards; suspended org blocks approval routing; admin PATCH sets status/credit/groupIds |
| **favorites / reviews / notifications** | favorites toggle idempotent; review once per product per buyer (guard); notifications list + mark-read 401 anonymous |
| **media / uploads** | upload → MediaAsset + renditions; oversize/type rejection; delete in-use → **409** (product reference or past-order snapshot); media read rate limit |
| **settings / rfq-config** | public settings subset; rfq-config resolves scoped values for the caller (org > platform); admin mutations CSRF+RL |
| **admin tree** (~40 routes: stats, vendors, products, orders, payments, payouts, organizations, price-lists, customer-groups, coupons, rfqs, quotes, disputes, audit-logs, slides, settings, rfq-settings, rollback) | every route: 401 anonymous, 403 non-admin (E for audit-logs); happy-path envelope; mutations audited |

---

## 8. Acceptance criteria per epic (Given/When/Then)

Numbering `AC-<epic>-<n>`. Every AC must be executable via §4 protocol (agent-browser) or §7 (curl) and leave evidence (screenshot/curl transcript) in the worklog. **97 ACs total.**

### E-01 Account (7)

- **AC-E01-01** — Given an anonymous visitor, when they open `/` and submit the login modal with `demo@vendora.com` / `demo1234`, then the header shows the buyer identity and `?view=account` renders the buyer dashboard.
- **AC-E01-02** — Given an anonymous visitor, when they submit login with a wrong password, then the API returns 401 with `{error}` and the modal shows the message without a page reload.
- **AC-E01-03** — Given a suspended seller (admin → Vendors → Suspend), when they attempt login, then the API returns **403** “suspended by the platform administrator”; when they use a pre-existing session cookie, then `getSessionUser` returns null and all API calls return 401.
- **AC-E01-04** — Given a BUYER, when they complete become-seller, then their role flips to SELLER and the seller console becomes available without re-login.
- **AC-E01-05** — Given any logged-in user, when they open any dashboard view, then all navigation stays on `/` with `?view=` parameters only (D-004) — the browser URL never gains a new path segment.
- **AC-E01-06** — Given a registration payload with a weak password / invalid email, when POSTed, then the API returns 400 with a zod message and no user row is created.
- **AC-E01-07** — Given a user, when they log out, then the session cookie is cleared and guarded views redirect to sign-in prompts.

### E-02 Catalog (6)

- **AC-E02-01** — Given the seeded catalog, when an anonymous visitor opens `?view=catalog`, then only ACTIVE products render with category filters, sorting, and working pagination.
- **AC-E02-02** — Given a search query, when typed in the search box, then autocomplete suggestions appear and submitting filters the grid; zero results render the empty state (qa-r8).
- **AC-E02-03** — Given a product card, when the viewport is 375px, then the Add-to-cart button stays fully inside the card frame (QA-R8 regression) and the grid has zero horizontal overflow.
- **AC-E02-04** — Given the catalog at 375px / 768px / 1440px, when each is snapshotted, then no horizontal scrollbar exists on `document.documentElement` (eval `scrollWidth <= clientWidth`).
- **AC-E02-05** — Given an admin-taken-down product (status ≠ ACTIVE), when a buyer opens its old URL, then it does not appear in catalog/search/home results.
- **AC-E02-06** — Given the hero slider, when slides are configured by admin, then the storefront renders them with the dark-mode variant intact.

### E-03 Checkout & Payment (9)

- **AC-E03-01** — Given a buyer with items in the cart, when they open the cart drawer and checkout with CARD, then an order is created **PAID** with a SUCCEEDED payment and stock decrements.
- **AC-E03-02** — Given checkout with BANK_TRANSFER selected, when the order is placed, then it is `PENDING_PAYMENT` with instructions, the payment is PENDING, and stock is not yet consumed per policy.
- **AC-E03-03** — Given a BANK_TRANSFER order, when admin captures the payment, then payment → SUCCEEDED and the order → PAID (audit PAYMENT_CAPTURED path).
- **AC-E03-04** — Given an applied coupon code that is invalid/expired/below-min-subtotal, when checkout proceeds, then the API returns 400 with the reason and the order is not created.
- **AC-E03-05** — Given WELCOME10 and a brand-new account, when applied at checkout, then the 10% discount applies; given `demo@vendora.com` (has prior orders), then it is rejected (first-order guard) — E in verify-b2b step 8.
- **AC-E03-06** — Given a cart containing a product of a seller who becomes suspended, when checkout is attempted, then the API returns 400 naming the unavailable product and no order is created.
- **AC-E03-07** — Given a payment already SUCCEEDED, when capture is attempted again, then the API returns 409 “Payment already captured” and no duplicate payment row exists.
- **AC-E03-08** — Given any checkout flow, when the order is created, then money semantics are records only: no external transfer call exists in the code path (D-002 code-inspection checklist §9).
- **AC-E03-09** — Given checkout at 375px, when the buyer completes the flow, then the layout is contained (sticky footer, no overflow) and the success state renders the order confirmation.

### E-04 Orders & Disputes (8)

- **AC-E04-01** — Given a PAID order, when the seller advances status three times, then the order traverses PAID → PROCESSING → SHIPPED → DELIVERED and the buyer order view reflects each step on the timeline.
- **AC-E04-02** — Given a seller, when they attempt to advance an order they do not own, then the API returns 403.
- **AC-E04-03** — Given a DELIVERED order, when the buyer opens a dispute with a reason from the settings-enabled list, then the dispute is OPEN, `escalateAt` is set from `autoEscalateDays`, and the seller is notified with the response window.
- **AC-E04-04** — Given an OPEN dispute, when the seller responds, then status → SELLER_RESPONDED and `escalateAt` re-arms.
- **AC-E04-05** — Given an OPEN dispute past `escalateAt` (set via DB), when any dispute read path fires, then status → ESCALATED with audit DISPUTE_ESCALATED.
- **AC-E04-06** — Given an escalated dispute, when admin resolves FULL_REFUND, then status → RESOLVED, the seller's `verifiedAt` is cleared (when `affectsVerification`), and audit DISPUTE_RESOLVED exists.
- **AC-E04-07** — Given a seller silent beyond `sellerResponseDays` (set via DB), when the sweep triggers, then the dispute auto-resolves with the default outcome FULL_REFUND and audit DISPUTE_AUTO_RESOLVED.
- **AC-E04-08** — Given a RESOLVED dispute, when the buyer attempts to cancel or the seller responds, then the API returns 409 (thread closed).

### E-05 RFQ & Negotiation (10)

- **AC-E05-01** — Given a buyer in an ACTIVE org, when they create an RFQ with catalog lines + a free-text line, then it is saved DRAFT with number `RFQ-YYYY-NNNNNN` and lines carry seller attribution.
- **AC-E05-02** — Given a DRAFT RFQ, when submitted, then status → SUBMITTED, `submittedAt` set, deadline defaulted from `rfqExpiry` when absent, and targeted sellers' inboxes list it.
- **AC-E05-03** — Given a SUBMITTED RFQ with a catalog line, when that product's seller quotes (price/qty/terms), then the RFQ → QUOTED and the buyer sees the quote card led by the store name.
- **AC-E05-04** — Given quote routing settings that gate unverified sellers, when such a seller quotes, then the quote is `PENDING_REVIEW` (invisible to buyer) until admin approves → SENT.
- **AC-E05-05** — Given two competing SENT quotes, when the buyer accepts one, then it → ACCEPTED, the sibling → DECLINED automatically, and the RFQ → ACCEPTED (E in verify-b2b step 7).
- **AC-E05-06** — Given an ACCEPTED quote, when the buyer converts, then an Order is created from the quote lines, the quote → CONVERTED, the RFQ → ORDERED, and stock is re-checked (409 on shortfall).
- **AC-E05-07** — Given the same product offered by 3 different sellers (TechNest/UrbanThread/Casa Verde), when an RFQ references all three lines, then each seller's inbox receives it, an unrelated seller does not, and each can quote only their own line (QA-R8 canonical regression).
- **AC-E05-08** — Given a quote past its `validUntil` (set via DB), when a triggering read fires, then the quote → EXPIRED and accepting it afterwards returns 409 “This quote has expired”.
- **AC-E05-09** — Given an RFQ thread, when messages are exchanged, then both parties see the live thread; when the RFQ is closed, then posting returns 409.
- **AC-E05-10** — Given a buyer, when they attempt to create a quote on their own RFQ, then the API returns 403 (E in verify-b2b step 7).

### E-06 Organization & Approvals (8)

- **AC-E06-01** — Given a buyer, when they register an organization, then it is `PENDING_VERIFICATION`, they are OWNER, and admin sees it in the org list (E in verify-b2b steps 2–3).
- **AC-E06-02** — Given a pending org, when admin verifies with `creditTermsDays` + `creditLimit` + group mapping, then status → ACTIVE, `verifiedAt` is set, and audit `ORG_VERIFIED` is written.
- **AC-E06-03** — Given an ACTIVE org, when the owner adds members with roles (ADMIN/APPROVER/BUYER/VIEWER), then members gain scoped access; unknown emails are refused (5b evidence).
- **AC-E06-04** — Given Acme (threshold $500) and Riley (BUYER member), when Riley checks out a $499 cart, then the order skips approval (born PAID/PENDING_PAYMENT).
- **AC-E06-05** — Given the same setup with a $500+ cart, when Riley checks out, then the order is `PENDING_APPROVAL`, a PENDING approval request exists, and approvers (minus Riley) are notified.
- **AC-E06-06** — Given a PENDING approval, when Casey (APPROVER) approves, then the order → PENDING_PAYMENT/PAID per method, the request is APPROVED, and Riley is notified.
- **AC-E06-07** — Given a PENDING approval, when the requester Riley attempts to decide it herself, then the API refuses (requester never self-approves).
- **AC-E06-08** — Given a quote acceptance ≥ threshold under approval policy, when accepted, then acceptance is held pending approval (siblings not declined until approved; on approve → accept cascade, on reject → quote stays open).

### E-07 Pricing (7)

- **AC-E07-01** — Given an anonymous buyer, when resolving a product, then the source is RETAIL (E verify-b2b step 5).
- **AC-E07-02** — Given an org mapped to a group with a qty-break ladder, when the member resolves 5 units then 50, then the price moves from the 1+ entry to the 10+ entry with `savingsPercent` reported (E).
- **AC-E07-03** — Given both a GROUP list (priority 10) and an ORG contract list (priority 5), when the member resolves, then CONTRACT wins (E verify-b2b step 6).
- **AC-E07-04** — Given a customer group, when admin archives it / the price list, then resolutions fall back to the next precedence level.
- **AC-E07-05** — Given a price list with entries, when admin replaces entries via PUT, then the ladder is atomically replaced (audit `PRICELIST_ENTRIES_REPLACED`) and no orphan entries remain.
- **AC-E07-06** — Given the default `retail` group, when any mutation is attempted on it, then it is refused (default-group guard, 5a evidence).
- **AC-E07-07** — Given pricing changes, when storefront/product views render, then contract prices show savings badges and the correct unit price at the chosen quantity (5b screenshots).

### E-08 Seller Console (7)

- **AC-E08-01** — Given a seller, when they open `?view=seller`, then Overview shows sales/fulfilment/store-health stats for their store only.
- **AC-E08-02** — Given the product form, when creating a product with variants/media/shipping/SEO across tabs, then the draft saves, media uploads produce renditions, and publish yields an ACTIVE listing (restore2 regression suite).
- **AC-E08-03** — Given an oversize or wrong-type image, when uploaded, then it is rejected with a clear message (upload1 evidence).
- **AC-E08-04** — Given a media asset referenced by a product, when deleted, then the API returns 409; when unreferenced, then renditions + row are removed.
- **AC-E08-05** — Given the RFQ inbox, when a distributed RFQ arrives, then the seller can quote per line with tier-prefill from settings, and the composer enforces stock limits (409 on zero-stock).
- **AC-E08-06** — Given seller earnings, when payouts are generated/paid by admin, then the earnings tab shows pending vs paid settlement consistent with the payout records.
- **AC-E08-07** — Given a suspended seller, when any seller-console write is attempted with an old session, then the API returns 401 (session rejected) — the console is unreachable.

### E-09 Admin Console (8)

- **AC-E09-01** — Given an admin, when opening `?view=admin`, then all 14 sidebar sections render (16 surfaces incl. Price Lists + Customer Groups sub-consoles) with `?view=admin&tab=<key>` deep-linkable.
- **AC-E09-02** — Given the vendors tab, when a seller is suspended and later reactivated, then both transitions write audit rows and the seller's login ability toggles (403 ↔ 200).
- **AC-E09-03** — Given the products tab, when a listing is taken down, then it disappears from the storefront but the seller's copy shows the moderation status.
- **AC-E09-04** — Given the payouts tab, when preview → generate → mark-paid is executed, then commission math matches §10.5 and the seller is notified.
- **AC-E09-05** — Given the RFQ pipeline tab, when filtering all RFQs/quotes, then admin sees every record with review actions and the quote moderation queue works (PENDING_REVIEW → SENT/REJECTED).
- **AC-E09-06** — Given RFQ settings, when a panel value is changed for a scope (platform/org), then the change is enforced on the next affected operation, appears in history, and can be rolled back (rfqsettings round evidence).
- **AC-E09-07** — Given the audit tab, when any of the actions in §4.2 step 9 occurs, then the audit log lists actor/type/summary (uppercase action codes).
- **AC-E09-08** — Given a non-admin, when opening any admin surface, then the UI shows AccessDenied and the API returns 403 (E verify-b2b step 10).

### E-10 Notifications & Media (7)

- **AC-E10-01** — Given a buyer with unread notifications, when the bell opens, then items deep-link to their view (`linkView`/`linkId`) and mark-read updates the badge (next1 evidence).
- **AC-E10-02** — Given the events in E-03…E-06, when each fires, then the corresponding notification type is emitted to the right party (never to unrelated users) — RFQ_QUOTE_RECEIVED, RFQ_QUOTE_REJECTED, dispute, approval, payout types.
- **AC-E10-03** — Given notification emission inside a transaction, when the notification service fails, then the business transaction still commits (never-throw emit).
- **AC-E10-04** — Given the upload pipeline, when an image is uploaded, then thumb/medium/large/full renditions exist on disk (`storage/uploads/YYYY/MM/`) and the media route serves them with cache headers.
- **AC-E10-05** — Given media reads, when 601 requests hit within a minute from one IP, then the 601st returns 429 with `Retry-After`.
- **AC-E10-06** — Given path traversal attempts (`../` in key), when requested, then the media route returns 404 (FIX-1 evidence).
- **AC-E10-07** — Given dark mode, when the bell/popovers render, then contrast and theming hold (qa-r8 dark evidence).

### E-11 Financing — PLANNED (14; blocks: DP-1…DP-17 approval, FIN-0…FIN-9)

- **AC-E11-01** — Given an admin, when they set an organization's `orgType` to BANK/MFI/EWALLET, then a FinancierProfile is created PENDING_REVIEW and the org appears in the financing institutions list.
- **AC-E11-02** — Given a pending FinancierProfile, when admin verifies it, then it becomes ACTIVE with audit `FINANCIER_VERIFIED` and the financier console becomes reachable to its OWNER/ADMIN members.
- **AC-E11-03** — Given a verified financier org member, when they open `?view=financier`, then the console (inbox, request detail, offer composer, my offers, profile & products) renders — the 5-registry lockstep edit was done atomically (D-004 intact: only `?view=`).
- **AC-E11-04** — Given a buyer member, when they start the wizard from a product page (“Finance this”), then **Step 1** shows their User profile + existing KYC documents read-only, offers “Edit profile” (which updates `User` — one entry), and requires the data-transfer consent checkbox before continuing; `consentAt` is stamped on submit.
- **AC-E11-05** — Given step 1 consented, when the applicant fills **Step 2** (22 controls: activity status/capital/capacity/previous financing/contribution/other income/activity type-name-description-start-address-city-district-location type/amount/currency/purpose/guarantee type+status/attachments/notes), then every field lands in exactly one typed `FinancingRequest` column or `ApplicantDocument` row with an `FR-YYYY-######` number and status SUBMITTED.
- **AC-E11-06** — Given **Step 3**, when it renders, then it shows the review **by reference** (User + request data, zero copies) and submission makes the request appear in “My financing requests” with status history notes (AuditLog `FINANCING_STATUS_CHANGED` + Notification).
- **AC-E11-07** — Given a submitted request, when a matching financier sends an offer (rate/fee/tenor/validity/installments), then the request → OFFERED and the applicant is notified OFFER_RECEIVED.
- **AC-E11-08** — Given multiple offers, when the applicant opens the compare view, then offers render side-by-side and accepting one marks it ACCEPTED, auto-declines siblings, creates a `FinancingAgreement` referencing the frozen offer, and accrues a `FinancingFee` (fee % × amount, default 0.75%).
- **AC-E11-09** — Given an agreement, when the financier reports funding/settlement events, then `fundingStatus` moves PENDING → REPORTED_FUNDED → REPORTED_SETTLED and each is a typed `FinancingEvent` row — **track-only ledger, no money movement code path exists (D-002)**.
- **AC-E11-10** — Given accrued fees, when admin marks INVOICED then PAID (or WAIVED), then the fee lifecycle completes with audit rows and external-settlement semantics only (mirrors Payout).
- **AC-E11-11** — Given the duplication audit (FINANCIER_SCHEMA §8), when executed as checks, then FinancingRequest contains **no profile-copy columns** (no legalName/website/industry/email re-storage) and every competitor structure has exactly one Vendora home.
- **AC-E11-12** — Given `prisma/schema.prisma`, when the financier models are grepped, then the count of `Json` columns in financier models is **0** (zero-JSON doctrine; audit-log metadata excluded — deliberately unused by this domain).
- **AC-E11-13** — Given a request past `expiresAt` (set via DB), when a read-path sweep fires, then the request → EXPIRED with no cron/timer involved (D-011).
- **AC-E11-14** — Given KYC documents uploaded once at user scope, when a later request needs them, then they are **reused** (dual-scope ApplicantDocument: `requestId` null for KYC) — uploading a second copy of the same KYC doc for the same user is refused or deduplicated.

### E-12 Super-Cart — PLANNED (6; P3)

- **AC-E12-01** — Given an RFQ, when a line of type SERVICE/FINANCING/LOGISTICS/INSURANCE is added (`RfqLine.lineType`), then the line routes to the typed provider pool instead of the product seller.
- **AC-E12-02** — Given a multi-line mixed RFQ, when each provider quotes their lines, then per-line accept/decline is possible without forcing whole-cart acceptance.
- **AC-E12-03** — Given per-line acceptances, when the deal is awarded, then a multi-party order/deal is created with per-party commission computed by the existing engine.
- **AC-E12-04** — Given financing lines in the cart, when the buyer checks out with financing, then the request flows through the E-11 machinery (no separate path; D-001 intact — platform orchestrates, never funds).
- **AC-E12-05** — Given the consolidated comparison view, when offers from multiple providers are present, then the buyer can compare and award per line with a single coherent UX.
- **AC-E12-06** — Given any new lineType code, when reviewed, then no money-transfer path is introduced (D-001/002 invariant sweep must stay clean).

---

## 9. Invariant & negative tests — the D-rules as executable checks

| ID | Invariant | Executable check | Type |
|---|---|---|---|
| INV-1 | **D-001** Platform never holds inventory / is never merchant of record | Code inspection checklist: no Product ownership by platform, no platform-funded order path — assert every order has seller lines w/ `sellerId` | Code review + API |
| INV-2 | **D-002** Settlement is external; payout = record + mark-paid | `rg -i "transfer|wallet|escrow|stripe|payout.*send" src/server/modules/payouts src/server/modules/payments` → no money-movement calls; mark-paid writes only status/paidAt/note | Code grep (L0) |
| INV-3 | **D-004** Only route `/` | `rg "route\(|<Link href=\"/" src/app src/components` → no new path segments; navigation always `?view=`; browser URL assertion in every E2E round | L0 + L3 |
| INV-4 | **D-005** Logic in modules, routes thin | Route files contain only parse/guard/service-call/serialize (review checklist on PR) | Code review |
| INV-5 | **D-006** Atomic sequences | RFX/QTE/PY/DSP numbers always sequential within a transaction; concurrent creation test (2 parallel creates → 2 distinct numbers, no gaps) | L2 |
| INV-6 | **D-007** Dev-only verification | No release gates depend on `bun run build`; QA runs against `bun run dev` :3000 (+ Caddy :81 pass-through check) | Process |
| INV-7 | **D-011** No timers | `rg "setInterval|setTimeout.*drive|cron|node-cron" src/` → no development-cadence timers; sweeps are read-path triggered only | L0 grep |
| INV-8 | Approval no-self-approve | Requester id is excluded from notified approvers (`userId: { not: requesterId }`); decide-by-requester refused | L2 + code |
| INV-9 | Org credit threshold triggers | $499 vs $500+ checkout routing (AC-E06-04/05) | L2/L3 |
| INV-10 | Suspended seller 403s | login 403 + checkout 400 + session 401 matrix (AC-E01-03, E03-06) | L2 |
| INV-11 | Suspended users rejected by `getSessionUser` | `src/lib/auth.ts:77` — session with suspended user → null → 401 everywhere | L2 |
| INV-12 | **Zero-JSON (financier, planned)** | `rg -A0 "Json" prisma/schema.prisma` restricted to financier models (FinancierProfile…FinancingFee, FinancingRequest/Offer/Agreement/Event/Fee, ApplicantDocument, FinancingProduct + trait tables) → **0 matches** (AuditLog.metadata pre-exists and is deliberately unused by the domain) | L0 grep |
| INV-13 | **Single-entry (financier, planned)** | `rg "legalName|website|industry|email|phone" prisma/schema.prisma` — these columns appear ONLY on Organization/User, never on FinancingRequest/FinancierProfile (duplication audit, AC-E11-11) | L0 grep |
| INV-14 | Consent stamped (planned) | FinancingRequest submitted without `consentAt` → impossible via API (zod + service guard); wizard step-1 checkbox gates submission (AC-E11-04) | L2/L3 |
| INV-15 | Owner doctrine: no C2C gates (D-012) | C2C phase tasks absent from active gates; financier module not blocked by C2C | Board check |

---

## 10. Non-functional tests

### 10.1 Performance smoke (dev-grade, not load testing)

| Check | Method | Threshold (dev hardware) |
|---|---|---|
| Catalog search p95 | curl loop (50 reqs) on `/api/products?search=…` | < 500 ms p95 (note: search is in-memory full-catalog — TD-03 known limitation; track, don't gate) |
| Product page load | agent-browser `open` + `wait` timing | interactive < 3 s on dev |
| Pricing resolve p95 | curl loop `/api/pricing/resolve` | < 300 ms p95 |
| Admin overview w/ seeded data | agent-browser | renders without waterfall regressions |

### 10.2 Accessibility

Keyboard navigation (Tab order reaches header → nav → content → footer; focus visible on all interactive elements); dialog focus trap + Escape close; `aria-*` on tabs/dialogs (Radix primitives); contrast spot-checks on status chips (amber/emerald/rose) in light + dark; form labels associated (react-hook-form + Label). Method: agent-browser `press Tab` walks + snapshot inspection + VLM screenshot review (established QA practice).

### 10.3 Responsive

Viewport matrix **375 × 667 / 768 × 1024 / 1440 × 900** (`set viewport`). Every round: zero horizontal overflow (eval scrollWidth ≤ clientWidth), sticky footer on mobile, touch targets ≥ 44px on primary actions, mobile buy bar behavior (CRON-R5), settings-rail containment regression (QA-R8). Dark mode via `set media dark` for at least one view per round.

### 10.4 i18n

English-only UI today. No locale switching to test. Guard: no hardcoded currency assumptions beyond USD display formatting; date formatting via shared `format.ts` (spot-check only).

### 10.5 Data-integrity (math) tests

| Check | Formula / rule | Test |
|---|---|---|
| Payout math | `net = round((gross − commission), 2)`; `commission = round(gross × rate/100, 2)`; gross = Σ paid, unsettled order items (excludes CANCELLED orders, non-SUCCEEDED payments, already-settled items) | Seed known orders → generate → assert all three numbers |
| CommissionRate precedence | `seller.commissionRate ?? PlatformSetting payouts.defaultCommissionPercent` (0–90%, zod) | Set vendor override → regenerate → rate changes; clear override → platform default applies; 91% → 400 |
| Quote accept idempotency | second accept → 409; net effect of exactly one acceptance (siblings declined once, one notification set, one audit row) | L2 replay test |
| Sequence integrity | RFQ/QTE/PY/DSP monotonic, gap-free per transaction | concurrent create test (INV-5) |
| Payment sibling cleanup | succeed a payment → other PENDING payments of the order → CANCELLED | L2 |

### 10.6 Security regression list

Executed from the dedicated security hardening document (team/docs security doc); summarized here so QA rounds re-run them: session cookie flags (httpOnly/SameSite=Lax/secure-in-prod), CSRF matrix (§7.0 — including the coverage-gap routes), rate-limit probes (§7.1 incl. the 4 unwired presets), media path traversal 404 (AC-E10-06), ownership guards on every seller/admin route, admin route 401/403 sweep (E verify-b2b step 10), zod rejection of out-of-bounds config (payout % 0–90), audit presence for every mutating admin action.

---

## 11. Defect management

### 11.1 Severity ladder

| Level | Definition | Response | Blocks release? |
|---|---|---|---|
| **P0** | Business-invariant violation (D-001/002 money path, tenant leak), data loss, total outage of `/` | Fix immediately; lead escalation if §8 PLAYBOOK applies | Yes — blocks everything |
| **P1** | Core flow broken (login, checkout, RFQ chain, payout math wrong) | FIX-# task dispatched next loop iteration | Yes — blocks the epic |
| **P2** | Feature broken w/ workaround (e.g. one admin tab dead, a 409 where 400 expected) | FIX-# queued before new scope | No |
| **P3** | Degraded UX (layout drift, a11y failure, dark-mode glitch) | Batched into QA rounds | No |
| **P4** | Cosmetic (copy, spacing) | Backlog | No |

### 11.2 Regression policy

- **Module change → golden path re-run** (`verify-b2b.sh`) is the minimum automated regression for any `src/server/modules/*` change.
- **UI change in a QA hotspot** (§4.4 list) → targeted agent-browser re-check of that flow at 375px + dark.
- **Schema change** → reseed cycle + golden path + affected-epic ACs re-run.
- **QA-dedicated rounds (QA-R#, FIN-8)** → full sweep: golden path + changed epics + invariant greps + dev.log 200-sweep.
- Every regression result is a worklog verdict (PASS/FAIL per PLAYBOOK §6 transition table).

### 11.3 DoD gate (PLAYBOOK §7 — restated as test gates)

1. `bun run lint` clean for touched files. 2. Schema pushed if changed (`bun run db:push`, one agent at a time). 3. agent-browser E2E of the changed user flows with evidence in worklog. 4. worklog appended. 5. TASK_BOARD/SPRINT_PLAN updated. **No E2E evidence = NOT DONE** — this document's §4.3 protocol defines what counts as evidence (round dir + step screenshots + error-trap result).

---

## 12. Exit criteria & sign-off per phase (PLATFORM_PLAN P0…P6)

| Phase | Exit criteria (all must hold) | Sign-off |
|---|---|---|
| **P0 INFRA** | DB up (recovery runbook done), `db:push` + both seeds clean, `/api/products?limit=1` returns data, login 200, server survives command boundary (double-fork), golden path runs end-to-end | Lead (DP-5 owner approval precedes) |
| **P1 FINANCIER CORE** | INV-12/13 greps clean; AC-E11-01…07 pass; wizard 3 steps E2E'd; financier console renders; admin verify/suspend E2E'd | Lead + owner (phase go/no-go is §8 escalation) |
| **P2 SUPPLIER WORKING CAPITAL** | AC-E11-08…14 pass incl. fee lifecycle + agreement events + duplication audit; FIN-8 regression sweep green (catalog, checkout, RFQ chain re-verified) | Lead |
| **P3 SUPER-CART** | AC-E12-01…06 pass; multi-seller regression (QA-R8 3-seller flow) still green; per-line commission math verified | Lead |
| **P4 CUSTOMER FINANCING** | AC-E11 financing-from-checkout path passes; **DP-6 track-only-ledger ruling honored** — INV-2 grep extended to financing module, zero money-movement code | Lead + owner (DP-6) |
| **P5 ACCREDITATION** | Accreditation program CRUD + doc review + verified badge E2E; auto-pass flag on financing apps verified | Lead |
| **P6 POLISH** | Full-platform regression: all epics' ACs, all invariant greps, responsive matrix, perf smoke, docs updated (FIN-9) | Lead + owner |

Per-epic sign-off = every AC in §8 for that epic marked PASS with evidence link (worklog Task ID), zero P0/P1 open, regression policy §11.2 satisfied.

---

## 13. Risks & gaps register

| ID | Risk / gap | Impact | Mitigation |
|---|---|---|---|
| **R-1** | **No on-disk test suite exists** (no jest/vitest/playwright files, no `test` script) while D-008 declares a 60-test/4-file E2E baseline. All “tests” are transient agent-browser runs + one bash golden path. | Regression coverage is only as good as the last QA round's memory; D-008 is formally unmet; refactors (P3 Super-Cart) risk silent breakage | Owner/Lead decision required: either (a) fund the on-disk suite (playwright specs mirroring §6 tables + §8 ACs, `bun test` for L1) and update D-008 with real numbers, or (b) amend D-008 to define the agent-browser protocol + verify-b2b.sh as the baseline. Until then this doc's matrices mark the true state (§1) |
| **R-2** | Rate limits are **in-memory, per-process** (single node) and 4 presets (login, register, order, review) are defined but **not wired** to any route | 429 tests pass locally but prove nothing about multi-instance deploys; brute-force damping on auth is currently absent in practice | Wire the 4 presets (FIX task); treat in-memory limiter as dev-only; note in security doc; re-run §7.1 matrix after wiring |
| **R-3** | Sweeps (expireStaleQuotes, sweepDisputes, processDueSchedules) fire **only via read paths** (listMyRfqs, getRfq, adminListRfqs, adminListQuotes, sellerRfqInbox) — no scheduler exists by design (D-011) | Time-based transitions can be arbitrarily late if nobody reads; sweep tests depend on manually triggering the right read path | Acceptable per D-011 (owner directive). Test protocol (§6 clock-via-DB + read-trigger) must name the exact trigger endpoint per sweep; document any read path that misses a sweep call as a defect |
| **R-4** | **Test data drift** — golden path creates a new org per run (“Acme Trading Co” × N), WELCOME10/BULK15 accumulate, seller product clones from QA rounds pollute the catalog | verify-b2b.sh assertions weaken over time (e.g. “empty org list” only true on fresh DB); compare flows pick up stray sellers | Re-seed discipline: run `db:seed` + `cleanup-b2b.ts` before QA rounds; verify-b2b.sh already randomizes fresh-buyer emails; add a pre-flight assertion helper that fails fast on unexpected fixture counts |

---

*End of document. Counts: 11 state-machine transition tables (7 live + 4 planned) · 33 forbidden-transition negative cases (30 tabulated + 3 inline in §6.6) · 11 sweep cases (8 numbered + 3 machine-table expiry transitions) · 97 Given/When/Then acceptance criteria (77 current-scope E-01…E-10 + 14 financing-planned E-11 + 6 super-cart-planned E-12) · 15 invariant checks (INV-1…INV-15, 4 financier-planned) · 21-row functional test matrix · 4 register risks.*
