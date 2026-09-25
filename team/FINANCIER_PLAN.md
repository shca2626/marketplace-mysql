# Financier Module — Implementation Plan v1.1 (detail layer of PLATFORM_PLAN)

> **MASTER plan = `team/PLATFORM_PLAN.md` v2.0** (big picture, 6 flows, phases P0–P6).
> **DATA MODEL = `team/FINANCIER_SCHEMA.md` v4.0** — wizard-complete: owner's 3-step wizard
> walk-through + live authenticated extraction (`/api/profile`, `/api/fund-orders`,
> `/api/fund-order/{id}` raw JSON, localStorage user model, DOM enum codes) + code-grounded.
> This file keeps the task breakdown (FIN-0…FIN-9) and integration detail. Approval is governed by
> PLATFORM_PLAN's DP list — DP-1…DP-9 there + DP-10…DP-21 (DP-10..12 and DP-13..21 defined in
> FINANCIER_SCHEMA §10).
>
> The earlier §3 model sketch in this file is SUPERSEDED by FINANCIER_SCHEMA.md v4.0
> (17 models, ZERO Json columns per owner ruling: FinancierProfile (slim — identity on
> Organization), FinancierBranch, FinancingProduct (+Attribute/Requirement/Coverage child tables),
> FinancingRequest v2 [typed activity/underwriting/guarantee columns, nullable org — DP-13],
> FinancingRequestInvite, ApplicantDocument [mediaId → MediaAsset — ONE document subsystem,
> DP-19], FinancingOffer (+FinancingOfferInstallment), FinancingAgreement [references the frozen
> offer — DP-20], FinancingEvent, FinancingFee, AccreditationProgram/Criterion,
> SupplierAccreditation + sequences FIN/AGR + ADDITIVE User applicant-profile scalars — DP-14).

---

## 0. Approval checklist — what you are agreeing to

| # | Decision | Recommendation |
|---|---|---|
| **DP-1** | Financier identity model | Organization with `orgType` BANK/MFI/EWALLET + `FinancierProfile`; staff = org members (OWNER/ADMIN). **No new global role.** |
| **DP-2** | Platform revenue | **Success fee** on accepted offers: % of financed amount (default 0.75%, 0–5% configurable), accrued as `FinancingFee` rows, invoiced & collected **externally** (admin marks INVOICED/PAID). Platform never touches financing money. |
| **DP-3** | Product types v1 | `INVOICE_FINANCING` + `PO_FINANCING`. CREDIT_LINE deferred to v2. |
| **DP-4** | Request distribution | Open-to-matching by default (all ACTIVE verified financiers whose ticket range + product type match see the request); optional BUYER_SELECTED per request. Mirrors RFQ distribution concepts. |
| **DP-5** | Infrastructure recovery | DB is DOWN (host reset wiped user-space MariaDB; verified: nothing on :3306, `/home/z/mysql` gone). Approve running `scripts/recovery/README.md` (433MB download, re-init, reseed). **Prior business data is already lost** — reseed restores demo data only. Also fixes stale `.env` (currently SQLite URL). |
| **DP-13** | Individual applicants: `FinancingRequest.organizationId` nullable (null = individual/sole-proprietor; competitor-proven; Flow-5 prerequisite) | **YES** (FINANCIER_SCHEMA §9) |
| **DP-14** | Additive `User` applicant-profile columns (11 nullable: phone, whatsapp, DOB, gender, marital, nationality, identityType/Number, residence Json, residenceType) — single-entry rule | **YES** (FINANCIER_SCHEMA §3.1) |
| **DP-15** | Status notes via existing AuditLog + Notification substrate (no new column/table) | **YES** |
| **DP-16** | No geo lookup tables v1 — free strings + normalized product-coverage matching | **YES** |
| **DP-17** | Financier ratings + branch routing | **defer to v2** |

---

## 1. Verified current state

- Dev server + MySQL **both down** (MySQL datadir wiped by host reset; `.env` holds stale SQLite URL). Recovery runbook exists and is proven.
- `orgType` exists as a **String** column (default `COMPANY`, VarChar(16)) — BANK/MFI/EWALLET valid values enforced only in code (schema.prisma:232). No behavior attached beyond RFQ-settings scope resolution.
- Global roles only BUYER|SELLER|ADMIN; org member roles OWNER|ADMIN|BUYER|APPROVER|VIEWER. No FINANCIER role exists anywhere.
- Payment methods CARD|BANK_TRANSFER|INVOICE; Payout = platform→seller only. **No wallet/ledger exists — good, keeps D-002 structural.**
- Adding a new view = 5 registries in lockstep (View union, VIEWS set, param ser/de, CONSOLE/STOREFRONT sets, DASHBOARD_VIEWS). Admin tab = nav item + title + conditional (admin-view.tsx:50–63).
- Sequences: closed prefix union 'RFQ'|'QTE'|'DSP'|'PY' (add 'FIN' by editing the type).
- Workflow templates to mirror: approvals (guarded decide + no-self-approve + tx transitions), disputes (lifecycle + settings-driven windows + lazy sweeps), notifications (19 types, never-throw emit), audit (UPPER_SNAKE actions, swallow errors).

## 2. Vision — what the Financier module IS / IS NOT

**IS** (per D-001 orchestrator model): a governed connection marketplace for trade finance.
Buyer orgs request financing against accepted quotes/orders → verified financier institutions
see matching requests → send binding offers → buyer compares and accepts → platform tracks the
agreement status and charges the financier a success fee (invoiced externally). Full audit,
notifications, admin oversight.

**IS NOT** (hard non-negotiables): the platform never lends, never holds or moves financing
funds, never becomes a party to the financing contract, no wallets, no credit scoring,
no automated fee collection. Money flows **financier ⇄ buyer directly**; the platform only
orchestrates, records, and invoices its fee.

## 3. Domain model — governed by FINANCIER_SCHEMA.md v4.0 (single-entry + zero-JSON doctrine)

```prisma
User (+12 additive nullable applicant-profile scalar columns — DP-14)   // personal data ONCE, no Json
FinancierProfile      // 1:1 with Organization (orgType BANK/MFI/EWALLET)
FinancierBranch       // agents & branches
FinancingProduct      // offering: category taxonomy + amount ranges + 3 trait child tables
                       //   (Attribute/Requirement/Coverage — DP-21, ZERO Json)
FinancingRequest v2   // the application (number: FR-YYYY-######) — WHO (references only)
                       // + ACTIVITY + UNDERWRITING + ASK + GUARANTEE typed columns
                       // + consentAt; organizationId nullable (DP-13)
ApplicantDocument     // ONE doc subsystem (mediaId → MediaAsset): user KYC (requestId null) + request evidence (DP-19)
FinancingRequestInvite // BUYER_SELECTED distribution rows (no org-id JSON)
FinancingOffer        // financier bid + FinancingOfferInstallment rows (competitor installments[])
FinancingAgreement    // accepted deal (AGR- number; references the FROZEN offer — DP-20, no snapshot)
FinancingEvent        // track-only money ledger (D-002)
FinancingFee          // platform revenue (mirrors Payout)
AccreditationProgram / SupplierAccreditation   // Flow 4
```
Every wizard field maps to EXACTLY ONE home — see FINANCIER_SCHEMA §7 (traceability proof);
requests never copy profile data (competitor's own `fund-order.account = {id,name}` validates).

Registry edits: `'FIN'` added to SequencePrefix union (sequences/service.ts:9); new
`financing` SectionDef in RFQ_SETTINGS_SECTIONS (registry.ts:136 — panels: general
{enabled, requestExpiryDays, maxOffersPerRequest}, fees {financierSuccessPercent,
originationPercentCap}, distribution {defaultMode}) — admin form/zod/history/rollback derive automatically.

## 4. End-to-end flows (7)

1. **Institution onboarding** — admin sets an Organization's orgType → BANK/MFI/EWALLET (existing admin org CRUD) → FinancierProfile created PENDING_REVIEW → admin verifies (license/regulator) → ACTIVE. Audit + notification.
2. **Financier product setup** — OWNER/ADMIN members of the financier org create FinancingProducts (rate, fees, ranges, tenor).
3. **Applicant applies (3-step wizard — competitor-proven IA)** — from a product page ("Finance
   this", `productId` set → direct target), a quote/order ("Finance this", `targetType` set), or
   the business-view Financing card (open request → distribution pool):
   - **Step 1 — Profile & KYC review**: renders the applicant's `User` profile + existing KYC
     documents read-only, with "Edit profile" (updates `User` — ONE entry) and the
     personal-data-transfer consent checkbox → `consentAt`.
   - **Step 2 — Activity & financing amount**: the 22-field form (activity status, capital,
     installment capacity, previous financing, contribution, other income, activity type/name/
     description/start date/address/city/district/location type, amount, currency, purpose,
     guarantee type/status, attachments, notes) → typed `FinancingRequest` columns +
     `ApplicantDocument` rows. `FR-` number assigned; status SUBMITTED.
   - **Step 3 — Review & submit**: renders everything by reference from `User` + request (no
     copies) + terms agreement → submit → appears in "My financing requests" with status history.
4. **Financier responds** — financier console inbox → request detail (target quote/order context) → compose offer (rate/fee/tenor/validity) → SENT. Request → OFFERED.
5. **Buyer awards** — compare offers side-by-side → ACCEPT one → siblings auto-DECLINE (mirrors quote accept), FinancingFee ACCRUED (fee % × amount), request → ACCEPTED, offer → ACCEPTED. Notifications to all parties; audit rows on every transition.
6. **Agreement tracking** — accepted offer = the agreement record; financier updates funding status on their console (REPORTED_FUNDED / REPORTED_SETTLED via offer terms updates — status fields only, no money on platform).
7. **Fee settlement** — admin financing tab: ACCRUED fees visible → mark INVOICED (external invoice) → mark PAID. Mirrors Payout lifecycle exactly.

## 5. Surfaces (D-004: single-route SPA, ?view= only)

- **`?view=financier`** (NEW console — 5-registry lockstep edit): guard = signed-in user who is OWNER/ADMIN member of an org with financier orgType + ACTIVE profile. Sections: Inbox (distributed requests), Request detail + offer composer, My offers, Profile & products.
- **Buyer** — business-view gains a "Financing" Card in the stack (after ApprovalsCard, business-view.tsx:421): my requests list + create; quote/order detail gain "Request financing" entry; request detail with offers compare + accept.
- **Admin** — `?view=admin&tab=financing` (Finance nav group, nav-config.ts:92–98): institutions list (verify/suspend), all requests/offers monitor, fee console, financing settings panel.

## 6. API surface (conventions: requireUser/requireAdmin + service-level org guards, admin routes CSRF+rate-limited)

```
POST   /api/financing/requests                     buyer member creates
GET    /api/financing/requests                      buyer: own org · financier: distributed
GET    /api/financing/requests/[id]                 detail (both parties, membership-guarded)
PATCH  /api/financing/requests/[id]                 cancel (buyer)
POST   /api/financing/requests/[id]/offers          financier submits offer
POST   /api/financing/offers/[id]/accept            buyer accepts (siblings auto-decline, fee accrues)
POST   /api/financing/offers/[id]/decline           buyer declines
PATCH  /api/financing/offers/[id]                   financier withdraws / reports funded-settled
GET    /api/financier/profile                       console: profile + products
POST   /api/financier/products                      CRUD products (OWNER/ADMIN)
GET    /api/admin/financing/...                     institutions · requests · offers · fees
PATCH  /api/admin/financing/institutions/[id]       verify / suspend / reactivate
PATCH  /api/admin/financing/fees/[id]               mark invoiced / paid / waive
```

## 7. Governance wiring

- **Notifications**: new types `FINANCING_REQUEST_RECEIVED / OFFER_RECEIVED / OFFER_ACCEPTED / OFFER_DECLINED / OFFER_WITHDRAWN / FEE_ACCRUED / FEE_PAID` + new `linkView: 'financier'` in the union (notifications/service.ts:43) and bell client.
- **Audit**: `FINANCIER_VERIFIED / FINANCIER_SUSPENDED / FINANCING_REQUEST_SUBMITTED / OFFER_SENT / OFFER_ACCEPTED / FEE_ACCRUED / FEE_MARKED_PAID …`
- **Expiry**: lazy sweep (mirrors `sweepDisputes` disputes.ts:491) — requests past expiresAt → EXPIRED; offers past validUntil → EXPIRED (idempotent updateMany).

## 8. Task breakdown & schedule

| ID | Task | Scope (files) | Worker | Dep | Size | DoD |
|---|---|---|---|---|---|---|
| **FIN-0** | Infra recovery: run MariaDB runbook (download/init/secure) + fix stale `.env` → mysql URL + `db:push` + `db:seed` + dev server up | scripts/recovery, .env (lead-only) | **Lead** | — | S-M | `/api/products?limit=1` returns data · login 200 · server survives boundaries (double-fork) |
| **FIN-1** | Schema: models per FINANCIER_SCHEMA v4.0 (zero Json — DP-18) + `'FIN'`/`'AGR'` prefixes + `financing` settings registry group + **additive User scalar columns (DP-14)** + `db:push` + seed 2 demo financier orgs with profiles/products | prisma/schema.prisma (lead-gated), sequences/service.ts, rfq-settings/registry.ts, seeds | Dev | FIN-0 | M | push clean · seed shows 2 financier orgs · admin settings form renders new panels |
| **FIN-2** | Module services: request lifecycle, offer lifecycle, membership/orgType guards, fee accrual, expiry sweeps + notification types + audit actions | src/server/modules/financing/* (new) + notifications/audit wiring | Dev | FIN-1 | M-L | every transition + guard verified curl-level (401/403/happy paths) |
| **FIN-3** | API routes per §6 conventions | src/app/api/financing/*, financier/*, admin/financing/* | Dev | FIN-2 | M | all routes live, guards enforced, CSRF+rate-limit on admin routes |
| **FIN-4** | Financier console `?view=financier` (5-registry lockstep + console UI: inbox, detail, offer composer, my offers, profile) | routing.ts, marketplace.ts, marketplace-app.tsx, nav-config.ts, financier-view.tsx (new) | Dev | FIN-3 | L | E2E: financier sees distributed request, submits offer |
| **FIN-5** | Buyer surfaces: business-view Financing card, 3-step wizard intake (profile review → activity form → review), my-requests list + detail (status history notes from notifications), offers compare + accept, from quote/order entry points | business-view.tsx, rfq-view.tsx, orders/b2b views | Dev | FIN-4 | L | E2E: applicant completes 3-step wizard, compares offers, accepts; siblings auto-decline |
| **FIN-6** | Admin financing tab: institutions, monitor, fee console, settings | nav-config.ts, admin-view.tsx, admin/financing-tab.tsx (new) | Dev | FIN-5 | M | E2E: admin verifies institution, fee ACCRUED→INVOICED→PAID |
| **FIN-7** | Governance polish: sweeps end-to-end, notification bell routing, audit completeness check | modules/financing, notifications-bell.tsx | Dev | FIN-6 | S | expiry E2E + bell click-through E2E + audit table rows |
| **FIN-8** | Full QA regression: all 7 flows + core regression (catalog, checkout, RFQ chain) via agent-browser | QA | **Tester** | FIN-7 | M | screenshots + worklog evidence; zero console errors; 390px responsive |
| **FIN-9** | Docs: whois.md refresh + final worklog | docs | **Lead** | FIN-8 | S | updated docs committed |

**Serialization:** FIN-0→1→2→3 strictly serial (schema chain) · FIN-4→5→6 serial (nav/routing shared files) · FIN-7 can overlap FIN-5/6 with locks · one `db:push` at a time.

## 9. Risks & mitigations (from code recon)

| Risk | Mitigation |
|---|---|
| `orgType` is a free String (no DB enum) | zod validation on all financier paths; admin UI restricts to 4 values |
| One org per OWNER (organizations/service.ts:107) | financier staff join as ADMIN members; documented in onboarding flow |
| `linkView` union closed + bell client | extend both in FIN-2, not FIN-4 (no late surprise) |
| 5-registry lockstep for new view | FIN-4 checklist derived from recon (exact files/lines listed) |
| `Order.total` is Float vs Decimal elsewhere | financing math computed in Decimal from request/offer fields; format at edges |
| Host resets wipe MySQL + reaped processes | recovery runbook now FIN-0; double-fork pattern in runbook for server |
| DB already down, old data gone | DP-5: explicit owner approval — reseed = demo data only |

## 10. Non-goals (v1)

No lending, no wallets, no escrow, no credit scoring, no automated fee collection, no
CREDIT_LINE, no FX, no SaaS multi-tenancy. All financing money moves directly between buyer and
financier. (v1's "no document upload" non-goal was LIFTED in v3 and stays lifted in v4 — uploads go
through the ONE existing MediaAsset pipeline, DP-19.)

---

**Status: AWAITING OWNER APPROVAL (DP-1 … DP-21 — DP-10..12 and DP-13..21 defined in FINANCIER_SCHEMA §10;
DP-18/DP-19 are already owner-set rulings).**
On approval → TASK_BOARD updated → FIN-0 dispatched immediately → loop runs to FIN-9 without stopping.
