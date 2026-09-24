# Vendora — PLATFORM COMPLETION PLAN v2.0 (BIG PICTURE — FOR OWNER APPROVAL)

> Master plan absorbing FINANCIER_PLAN v1.0 as **Phase 1 detail**.
> Evidence: full code recon (file:line) + owner's 6-flow spec + competitor analysis
> (ymp.ye — Yemen Microfinance Platform). **Nothing executes until you approve.**

---

## 0. What the competitor taught us (data-model inputs)

ymp.ye (منصة اليمن للتمويل الأصغر) is a microfinance aggregator. Relevant data structures:
- **Provider directory** — institutions (Al-Amal Bank, Al-Kuraimi, Al-Tadhamun, Thamar) with type, address, "browse" pages → *maps to our Organizations + orgType taxonomy*
- **Financing products catalog** — e.g. "ثمار طموحي" (working-capital product for small-business ideas) attached to a provider → *maps to FinancingProduct*
- **E-wallets as providers** (جيب، موبايل موني) with services (Payroll mass payouts) → *orgType EWALLET (exists in our schema, unused)*
- **Service taxonomy** — financing + Takaful insurance (التأمين التكافلي) + entertainment top-ups → *we adopt FINANCING/LOGISTICS/INSURANCE/SERVICE lines; entertainment is out of scope (B2C retail, not our model)*
- **Education center** (courses, lessons, durations), **success stories**, **news** → *deferred content layer (DP-9)*

## 1. The six flows mapped against our actual code

| # | Flow | Status | Evidence (what exists / what's missing) |
|---|---|---|---|
| 1 | **B2C direct purchase** — browse → product → RFQ → quote → accept → deal → commission → delivery → review | **EXISTS** | catalog/product views, RFQ engine + product-prefill, quotes, accept→convert, commission+payouts engine, SHIPPED/DELIVERED statuses, /api/reviews route |
| 2 | **Super-Cart** — ONE RFQ, N lines of mixed type (product+service+financing+logistics+insurance), per-line routing to provider types, consolidated quotes, accept best per line, multi-party deal, per-line commission | **PARTIAL** | EXISTS: RfqLine model, seller matching (computeEligibleSellers), multi-seller Orders (one order, many sellers), per-item commission math. MISSING: line `lineType`, provider-type routing pools, per-line quote/accept, consolidated comparison UI |
| 3 | **Supplier → Financier** (working capital) — apply → review → offer → accept → disbursement → repayment → origination fee | **MISSING** | No financier domain. Disbursement/repayment = **event tracking only** (D-002: external settlement); origination fee = invoiced externally |
| 4 | **Accreditation-as-a-Service** — financier-defined criteria (data), supplier docs, verification, accreditation fee, auto-pass on future financing | **MISSING** | Uploads infra exists (media pipeline); needs AccreditationProgram/SupplierAccreditation models |
| 5 | **Customer → Financing → Supplier** — financing at checkout, financier pays supplier, customer repays financier, platform commission + origination fee | **MISSING** | Needs checkout integration + **track-only ledger** (DP-6 ruling: platform RECORDS wallet events, never holds funds) |
| 6 | **Supplier → Supplier** (B2B sourcing) — Supplier A as buyer posts RFQ → B quotes → deal → commission | **EXISTS ~95%** | RFQ creation is not role-restricted; SELLER users with orgs can already post RFQs; commission on conversion exists. Small UX allowance only |

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

Standalone financing applications (Flows 3 & 5) are the same domain without the RFQ wrapper:
`FinancingRequest.targetType = WORKING_CAPITAL | QUOTE | ORDER` — Flow 3 = supplier org + WORKING_CAPITAL;
buyer-against-quote/order = the rest; Flow 5 = the same core wired into checkout.

## 3. Phased roadmap — what to implement FIRST, and why

| Phase | What | Flows | Why this order |
|---|---|---|---|
| **P0 — INFRA** | DB recovery runbook + reseed + server (FIN-0) | all | Everything is down (verified). Prerequisite for any work. |
| **P1 — FINANCIER CORE** | FinancierProfile, FinancingProduct, FinancingRequest (+WORKING_CAPITAL type), FinancingOffer, FinancingFee; financier console `?view=financier`; admin verification | foundation for 2,3,4,5 | Shared dependency of every missing flow. FINANCIER_PLAN v1 detail applies here (updated models below). |
| **P2 — SUPPLIER WORKING CAPITAL** | Flow 3 end-to-end: seller org applies → financier reviews → offer → accept → tracked disbursement/repayment events → origination fee | **3 done** | Fastest complete revenue vertical on the core. No checkout changes, no D-002 amendment needed. |
| **P3 — SUPER-CART** | `RfqLine.lineType` + provider pools + per-line quotes/accept + consolidated comparison + multi-party deals + per-line commission | **2 done** (signature) | The platform's signature. Financing lines light up because P1/P2 exist. Biggest refactor → after core is stable. |
| **P4 — CUSTOMER FINANCING** | Flow 5: checkout financing application → financier approval → **track-only ledger** of disbursement/repayment (no custody) → commission + origination fee | **5 done** | Needs DP-6 ruling first. Rides on P1 core. |
| **P5 — ACCREDITATION** | Flow 4: AccreditationProgram (criteria as data), SupplierAccreditation (docs → review → verified), accreditation fee, auto-pass flag on financing apps | **4 done** | Rides on P1 core + uploads infra. Independent — can swap with P4. |
| **P6 — POLISH** | Flow 6 UX allowance (seller nav → RFQs), education center + success stories (competitor-inspired, if approved DP-9), full regression + docs | 6 verified | Last-mile. |

**Model deltas vs FINANCIER_PLAN v1** (v1's 5 models carry over):
- `FinancingRequest.targetType: WORKING_CAPITAL | QUOTE | ORDER` (was QUOTE | ORDER) and applicant org may be a **supplier-owned org** (Flow 3)
- `RfqLine.lineType: PRODUCT | SERVICE | FINANCING | LOGISTICS | INSURANCE` (P3)
- New (P5): `AccreditationProgram { ownerId (financier/platform), criteria Json, feeAmount, status }`, `SupplierAccreditation { organizationId, programId, documents Json, status: APPLIED|UNDER_REVIEW|VERIFIED|REJECTED, verifiedAt, paidAt }`
- New (P4): `FinancingEvent { offerId, type: DISBURSEMENT|REPAYMENT|SETTLEMENT, occurredAt, reference, reportedById, note }` — **events only, no balances, no custody**
- orgType taxonomy extended in code: + `LOGISTICS | INSURANCE | SERVICE_PROVIDER` (String column — code-only change, no migration)

## 4. Approval points (v2 — supersedes v1's DP-1..5 where noted)

| # | Decision | Recommendation |
|---|---|---|
| DP-1 | Financier identity = org + membership (no new global role) | keep from v1 |
| DP-2 | Success fee 0.75% (0–5% configurable), accrued → invoiced externally → admin marks PAID | keep from v1 |
| DP-3 | Products v1 = INVOICE_FINANCING + PO_FINANCING + **WORKING_CAPITAL** (Flow 3 needs it) | amended |
| DP-4 | Distribution = open-to-matching (verified financiers in ticket range) | keep from v1 |
| DP-5 | DB recovery runbook approval (data already lost; reseed = demo) | keep from v1 |
| **DP-6** | **Flow-5 "wallet" = TRACK-ONLY ledger** — platform records disbursement/repayment events reported by financiers; NEVER holds funds. Amends D-002 wording from "never tracks" to "tracks but never holds" — or we drop wallet language entirely | **needs ruling before P4** |
| **DP-7** | orgType taxonomy += LOGISTICS / INSURANCE / SERVICE_PROVIDER (Super-Cart pools) | recommend yes |
| **DP-8** | Phase order P0→P6 as tabled above (P4/P5 swappable) | confirm or reorder |
| **DP-9** | Education center + success stories (competitor-inspired) in scope? | recommend defer to P6 tail |

## 5. Guardrails (unchanged)

D-001/D-002/D-003 intact in every phase: platform orchestrates, verifies, matches, records,
invoiced fees; never lends, never holds funds, never merchant of record; no SaaS multi-tenancy.
All financing money moves directly buyer⇄financier / financier⇄supplier.

**Status: AWAITING OWNER APPROVAL — reply "approved" or per-DP adjustments (e.g. "DP-2 → 1.5%, DP-6 yes, DP-9 defer").**
After approval: board updated → P0 dispatches → the loop runs phases to completion without stopping (escalations only).
