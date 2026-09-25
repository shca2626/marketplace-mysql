# Vendora — PLATFORM COMPLETION PLAN v3.0 (BIG PICTURE — FOR OWNER APPROVAL)

> Master plan absorbing FINANCIER_PLAN v2.0 as **Phase 1 detail**.
> Evidence: full code recon (file:line) + owner's 6-flow spec + competitor analysis
> (ymp.ye — Yemen Microfinance Platform: public pages AND owner's authenticated wizard
> walk-through + live API extraction `/api/profile`, `/api/fund-orders`, `/api/fund-order/{id}`)
> + **owner's v5 rulings: services-not-products, the platform verification gate as the essence
> of the platform, the general+specific requirements engine, accreditation as a MAIN service,
> universal documents** (FINANCIER_SCHEMA v5.0).
> **Nothing executes until you approve.**

---

## 0. What the competitor taught us (data-model inputs — v5 re-read)

ymp.ye (منصة اليمن للتمويل الأصغر) is a microfinance aggregator. Relevant data structures:
- **Provider directory** — institutions (Al-Amal Bank, Al-Kuraimi, Al-Tadhamun, Thamar) with type, address, "browse" pages → *maps to our Organizations + orgType taxonomy*
- **Financing SERVICES catalog** (URL `/en/services/145`; the fund-order API field is `service: {id, name}` — **services, not products** — owner ruling DP-22) attached to a provider → *maps to FinancierService (serviceKind FINANCING|ACCREDITATION)*
- **E-wallets as providers** (جيب، موبايل موني) with services (Payroll mass payouts) → *orgType EWALLET (exists in our schema, unused)*
- **Service taxonomy** — financing + Takaful insurance (التأمين التكافلي) + entertainment top-ups → *we adopt FINANCING/LOGISTICS/INSURANCE/SERVICE lines; entertainment is out of scope (B2C retail, not our model)*
- **Education center** (courses, lessons, durations), **success stories**, **news** → *deferred content layer (DP-9)*
- **Financing application wizard** (3 steps: profile-review+consent → 22-field activity/financing form →
  review) with per-request **status history + provider notes** (`fund_order_statuses`), ID/KYC stored
  ONCE at account level (requests reference `account {id,name}` only — validates our single-entry rule)
  → *maps to User additive profile (DP-14) + FinancingRequest v3 typed columns + universal
  AccountDocument vault (DP-27) + RequirementSubmission checklist (DP-24)*
- **Their status flow starts `under-review` AT THE AGGREGATOR before the provider studies the
  file** → *v5 turns this passive behavior into our enforced PLATFORM VERIFICATION GATE (DP-23) —
  "incomplete or incorrect requests must not be sent … the essence of the platform's operation" (owner).*

## 1. The six flows mapped against our actual code

| # | Flow | Status | Evidence (what exists / what's missing) |
|---|---|---|---|
| 1 | **B2C direct purchase** — browse → product → RFQ → quote → accept → deal → commission → delivery → review | **EXISTS** | catalog/product views, RFQ engine + product-prefill, quotes, accept→convert, commission+payouts engine, SHIPPED/DELIVERED statuses, /api/reviews route |
| 2 | **Super-Cart** — ONE RFQ, N lines of mixed type (product+service+financing+logistics+insurance), per-line routing to provider types, consolidated quotes, accept best per line, multi-party deal, per-line commission | **PARTIAL** | EXISTS: RfqLine model, seller matching (computeEligibleSellers), multi-seller Orders (one order, many sellers), per-item commission math. MISSING: line `lineType`, provider-type routing pools, per-line quote/accept, consolidated comparison UI |
| 3 | **Applicant → Financier** (financing service) — apply → **platform gate verifies** → forwarded → financier reviews → offer → accept → disbursement/repayment tracking → success fee | **MISSING** | No financier domain yet. FinancierService + FinancingRequest v3 (gate machine) + offers/agreements/events/fees per FINANCIER_SCHEMA v5.0. Disbursement/repayment = **event tracking only** (D-002); success fee invoiced externally |
| 4 | **Qualification & Accreditation (MAIN — owner ruling DP-26)** — financier's accreditation service defines acceptance requirements (CRUD) → company selects the financier → completes missing requirements (vault-aware) → **platform gate verifies** → forwarded → financier grants → ACCREDITED + validity → RFQ participation unlock + auto-pass on the financier's other services → renewal/revocation | **MISSING** | AccreditationRequest + the SAME requirements engine + the SAME gate (FINANCIER_SCHEMA §3.13, §3.5–§3.6). Uploads infra exists (media pipeline) |
| 5 | **Customer → Financing → Supplier** — financing at checkout, financier pays supplier, customer repays financier, platform commission + origination fee | **MISSING** | Needs checkout integration + **track-only ledger** (DP-6 ruling: platform RECORDS wallet events, never holds funds) |
| 6 | **Supplier → Supplier** (B2B sourcing) — Supplier A as buyer posts RFQ → B quotes → deal → commission | **EXISTS ~95%** | RFQ creation is not role-restricted; SELLER users with orgs can already post RFQs; commission on conversion exists. Small UX allowance only. **The financier vendor-quotes capability (receive quotes from accredited vendors, relay customer requests) rides THIS engine — zero new tables (DP-26)** |

## 2. The architecture decision that makes all 6 flows one system

**One RFQ backbone, polymorphic lines, typed provider pools:**
```
RFQ (the Super-Cart)
 ├─ line 1: lineType=PRODUCT    → routed to SELLER pool        (exists)
 ├─ line 2: lineType=SERVICE    → routed to SERVICE_PROVIDER pool
 ├─ line 3: lineType=FINANCING  → routed to FINANCIER pool     (BANK/MFI/EWALLET orgs)
 ├─ line 4: lineType=LOGISTICS  → routed to LOGISTICS pool
 └─ line 5: lineType=INSURANCE → routed to INSURANCE pool
Each provider quotes ONLY its line → buyer accepts best per line
→ multi-party Deal (Order already supports multi-seller items)
→ per-line commission (engine exists)
```
Standalone financing/accreditation applications (Flows 3, 4 & 5) share one requirements-checked,
gate-governed core: `FinancingRequest`/`AccreditationRequest` → `RequirementSubmission` checklist
→ **PLATFORM GATE** → financier decision — with `targetType = WORKING_CAPITAL | QUOTE | ORDER |
RFQ_LINE` linking financing to commerce objects, and `multiGroupId` sibling groups implementing
exclusive/multi-financier routing (DP-25).

## 3. Phased roadmap — what to implement FIRST, and why

| Phase | What | Flows | Why this order |
|---|---|---|---|
| **P0 — INFRA** | DB recovery runbook + reseed + server (FIN-0) | all | Everything is down (verified). Prerequisite for any work. |
| **P1 — FINANCIER CORE: services + requirements engine + THE GATE** | FinancierProfile/Branch, FinancierService (both kinds), ConditionTemplate library (GENERAL+FINANCIER), ServiceRequirement composer, RequirementSubmission, AccountDocument vault, FinancingRequest v3 + AccreditationRequest gate machines, offers/agreements/events/fees; financier console `?view=financier` (incl. requirements composer); admin gate console + institutions + fees | foundation for 2,3,4,5 | The gate is the essence of the platform (owner) — it must exist before ANY request flows. FINANCIER_PLAN v2.0 FIN-0…FIN-10 detail applies. |
| **P2 — FINANCING VERTICAL** | Flow 3 end-to-end polish: seller org applies for working-capital service → gate → forwarded → offer → accept → tracked disbursement/repayment events → success fee invoiced | **3 done** | Fastest complete revenue vertical on the core. No checkout changes, no D-002 amendment needed. |
| **P3 — SUPER-CART** | `RfqLine.lineType` + provider pools + per-line quotes/accept + consolidated comparison + multi-party deals + per-line commission | **2 done** (signature) | The platform's signature. Financing lines light up because P1/P2 exist. Biggest refactor → after core is stable. |
| **P4 — CUSTOMER FINANCING** | Flow 5: checkout financing application → gate → financier approval → **track-only ledger** of disbursement/repayment (no custody) → commission + origination fee | **5 done** | Needs DP-6 ruling first. Rides on P1 core. |
| **P5 — ACCREDITATION POLISH** | Flow 4 tail: accreditation fee accrual (FinancingFee type ACCREDITATION), auto-pass across services, renewal reminders, RFQ-unlock enforcement surfaces, accredited-vendor directory for the vendor-quotes relay | **4 done** | Rides on P1 core (the request machinery ships in P1 — the owner made accreditation a MAIN service, not a later phase). |
| **P6 — POLISH** | Flow 6 UX allowance (seller nav → RFQs), education center + success stories (competitor-inspired, if approved DP-9), full regression + docs | 6 verified | Last-mile. |

**Model deltas vs v4 plan stack** (full model = `team/FINANCIER_SCHEMA.md` **v5.0**):
18 models, ZERO Json. Highlights: **FinancierService** (DP-22 — serviceKind
FINANCING|ACCREDITATION replaces FinancingProduct + AccreditationProgram), **the requirements
engine** (ConditionTemplate GENERAL/FINANCIER + ConditionOption + ServiceRequirement +
RequirementSubmission — DP-24), **the platform gate** (UNDER_PLATFORM_REVIEW →
RETURNED_FOR_COMPLETION | FORWARDED_TO_FINANCIER on both request types — DP-23), **universal
AccountDocument + RequestAttachment** (DP-27), **AccreditationRequest** with grant-on-request +
RFQ unlock + auto-pass (DP-26), **multiGroupId sibling routing** (DP-25 — FinancingRequestInvite
deleted), FinancingOffer + Installments, FinancingAgreement (frozen offer — DP-20),
FinancingEvent (track-only), FinancingFee (SUCCESS|ORIGINATION|ACCREDITATION), additive User
applicant-profile scalars (DP-14).
- `FinancingRequest.targetType: WORKING_CAPITAL | QUOTE | ORDER | RFQ_LINE` (Flow 3 + super-cart line)
- `RfqLine.lineType: PRODUCT | SERVICE | FINANCING | LOGISTICS | INSURANCE` (P3)
- orgType taxonomy extended in code: + `LOGISTICS | INSURANCE | SERVICE_PROVIDER` (String column — code-only change, no migration)

## 4. Approval points (v3 — spans DP-1…DP-28; full list in FINANCIER_SCHEMA §10 / FINANCIER_PLAN §0)

| # | Decision | Recommendation |
|---|---|---|
| DP-1 | Financier identity = org + membership (no new global role) | keep |
| DP-2 | Success fee 0.75% (0–5% configurable), accrued → invoiced externally → admin marks PAID | keep |
| DP-3 | Service categories v1 = WORKING_CAPITAL + INVOICE_FINANCING + PO_FINANCING (+ taxonomy slots) | amended |
| DP-5 | DB recovery runbook approval (data already lost; reseed = demo) | keep |
| **DP-6** | **Flow-5 "wallet" = TRACK-ONLY ledger** — platform records disbursement/repayment events reported by financiers; NEVER holds funds. Amends D-002 wording from "never tracks" to "tracks but never holds" — or we drop wallet language entirely | **needs ruling before P4** |
| **DP-7** | orgType taxonomy += LOGISTICS / INSURANCE / SERVICE_PROVIDER (Super-Cart pools) | recommend yes |
| **DP-8** | Phase order P0→P6 as tabled above (accreditation request machinery moved INTO P1 per owner ruling; P5 keeps only its polish) | confirm or reorder |
| **DP-9** | Education center + success stories (competitor-inspired) in scope? | recommend defer to P6 tail |
| DP-13 | Individual applicants: `FinancingRequest.organizationId` nullable | **recommend YES** |
| DP-14 | Additive `User` applicant-profile scalar columns (12 nullable, NO Json); single-entry rule; B2C unaffected | **recommend YES** |
| DP-15 | Status history + notes via existing AuditLog + Notification substrate | **recommend YES** |
| DP-16 | No geo lookup tables in v1 — free strings + normalized coverage matching | **recommend YES** |
| DP-17 | Financier ratings (`is_rating`) + branch-level request routing | **recommend defer to v2** |
| DP-18 | **Zero-JSON doctrine for the financier domain** | **YES — owner-set** |
| DP-19 | **One storage subsystem** (`mediaId → MediaAsset`) | **YES — owner-set** |
| DP-20 | `FinancingAgreement` references the accepted frozen offer — no snapshot | **recommend YES** |
| **DP-22** *(new)* | **Services, not products** — `FinancierService` (serviceKind FINANCING\|ACCREDITATION); competitor API field is `service` | **YES — owner-set** |
| **DP-23** *(new)* | **Platform verification gate = essence of the platform** — no request reaches a financier without platform verification of ALL required conditions; incomplete/incorrect → RETURNED; financier inbox structurally excludes un-forwarded requests | **YES — owner-set** |
| **DP-24** *(new)* | **Requirements engine** — GENERAL platform library + FINANCIER-private templates; 8 typed kinds; per-service attachment; per-request verification; flexible/easy/comprehensive management UIs | **YES — owner-set** |
| **DP-25** *(new)* | **Multi-financier routing = sibling requests sharing `multiGroupId`** (invite-table design rejected) | **recommend YES** |
| **DP-26** *(new)* | **Accreditation as a MAIN service** — serviceKind=ACCREDITATION + AccreditationRequest; grant-on-request; RFQ unlock; auto-pass; vendor-quotes relay rides the RFQ engine (zero new tables) | **YES — owner-set** |
| **DP-27** *(new)* | **Universal document management** — AccountDocument for ALL users + orgs, verified once, reused everywhere | **YES — owner-set** |
| **DP-28** *(new)* | v4's DP-4 open-to-matching distribution SUPERSEDED/deferred — v1 requests are service-scoped | **recommend DEFER** |

## 5. Guardrails (unchanged)

D-001/D-002/D-003 intact in every phase: platform orchestrates, verifies, matches, records,
invoiced fees; never lends, never holds funds, never merchant of record; no SaaS multi-tenancy.
All financing money moves directly applicant⇄financier / financier⇄supplier. **The platform gate
verifies but never decides credit** — credit decisions belong to financiers, on fully-verified
files only.

**Status: AWAITING OWNER APPROVAL — reply "approved" or per-DP adjustments (e.g. "DP-2 → 1.5%, DP-6 yes, DP-9 defer").**
Decision list now spans **DP-1…DP-28** (DP-18/19/22/23/24/26/27 already owner-set by rulings).
After approval: board updated → P0 dispatches → the loop runs phases to completion without stopping (escalations only).
