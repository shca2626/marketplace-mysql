# Murabaha Checkout — Precondition Review Artifact (lastplan v5 §10.9, C4)

**Status: IMPLEMENTATION-GATED.** This document records the transaction
sequence this platform implements, the evidence it retains, and the late-fee
policy, as the review basis required by lastplan v5 §10.9 before any checkout
code ships. Qualified legal + Sharia sign-off must be recorded below before
production enablement; the demo deployment ships the flow behind the
documented sequence only.

## 1. Hard preconditions (per the plan)

1. ✅ **Minimum lender workflow complete and E2E-verified** — request →
   review → offer → agreement execution (e-signature evidence package, §10.4,
   incl. hash fail-closed + TOTP step-up) → disbursement confirmation
   (§10.5, rail reference + FX snapshot) → installment collection (§10.8
   waterfall allocation + reversal + reconciliation + statements with
   aging/NPL). Verified in commit c976a08.
2. ✅ (this document) **Transaction sequence reviewed** — who purchases the
   goods, when ownership and risk transfer, how the resale occurs, evidence
   retained, cancellation/default handling — §2 below.
3. ✅ (this document) **Late-fee policy** — text, cap, calculation — §3 below.

## 2. The transaction sequence as implemented

| Step | Actor | Action | Ownership / risk | Evidence retained |
|---|---|---|---|---|
| 1 | Buyer | Checkout selects **Finance it (Murabaha)**; pre-qualification KYC L2+ enforced (identity-docs-verified accounts only) | — | Order `paymentStatus=AWAITING_PAYMENT`, financing request `targetType=ORDER`, audit `MURABAHA_CHECKOUT_STARTED` |
| 2 | Buyer | Financing request auto-created against the routed financier service(s) and SUBMITTED to the platform gate (R-4 stays intact) | — | FinancingRequest (FR-number), gate trail |
| 3 | Platform | Gate review/forward (existing §5.1 flow — unchanged) | — | Gate audit rows |
| 4 | Financier | Composes a Murabaha offer (cost + disclosed mark-up, tenor, installment schedule) and sends it | — | FinancingOffer + frozen installments |
| 5 | Buyer | Accepts the offer → agreement born; **e-signature execution** binds the exact contract template version + sha256 with consent + TOTP step-up | — | FinancingAgreement (AGR-number), ESignatureExecution evidence package |
| 6 | Financier | **Purchases the goods** (disbursement to the seller(s) on the buyer's behalf) — confirmed with payment-rail reference + FX snapshot | **Ownership + risk transfer to the FINANCIER at disbursement** | DisbursementRecord (rail, reference, FX), FinancingEvent DISBURSEMENT |
| 7 | Platform | Order transitions `paymentStatus → FUNDED` (never PAID) and fulfillment unlocks for sellers | Resale to buyer in progress | Order.paymentStatus=FUNDED + financingAgreementId link; seller notification |
| 8 | Buyer | Pays installments to the financier per the schedule (§10.8 ledger: receive → allocate → reverse → reconcile) | **Ownership + risk transfer to the BUYER as installments are paid per the agreement's terms** | InstallmentPayment/Allocation ledger, statements, aging/NPL |
| 9 | Financier | Reports settlement → agreement COMPLETED | Buyer owns outright | Agreement status trail + audit |

**Cancellation:** before disbursement (step 6) the buyer or financier may
cancel — the order returns to standard payment (clean fallback), nothing is
owed. After disbursement, cancellation follows the agreement's terms (the
financier repossesses/resells per the contract); the platform records the
outcome on the agreement (DEFAULTED/CANCELLED) and the order's money
dimension reflects the final resolution.

**Default:** aging computed from ALLOCATED state (§10.8); NPL at 90+ days.
The platform never moves financing money (D-002) — it records the evidence
chain.

**Key invariant asserted in E2E:** `FUNDED ≠ buyer-obligation-cleared` — a
FUNDED order still carries outstanding installments on the financing ledger
until the agreement settles.

## 3. Late-fee policy (reviewed basis)

- **Text (template clause):** "A late fee of {lateFeePercent}% per month of
  the overdue installment amount applies to installments unpaid {graceDays}
  days past their due date, capped in aggregate at {lateFeeCap}% of the
  original financed amount. Late fees never compound."
- **Cap:** aggregate late fees ≤ **10%** of the original financed amount
  (configurable per financier in the contract template).
- **Calculation:** per-installment, on the outstanding amount only (never on
  paid principal), computed from the ALLOCATED ledger state (§10.8) — the
  same base as aging/NPL. Recorded as `FinancingEvent {type: LATE_FEE}` by
  the financier (track-only, D-002).
- Grace period: **7 days** (configurable per template).

## 4. Sign-off

| Role | Name | Date | Signature |
|---|---|---|---|
| Legal counsel | _pending_ | | |
| Sharia supervisory board | _pending_ | | |

> Until both rows are signed, the Murabaha checkout method operates in
> DEMO/STAGING mode only (the flag `financingGeneral.murabahaCheckoutEnabled`
> gates it; disabled by default).
