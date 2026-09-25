# Financier Module — Implementation Plan v2.0 (services · platform gate · requirements engine)

> **MASTER plan = `team/PLATFORM_PLAN.md` v3.0** (big picture, flows, phases P0–P6).
> **DATA MODEL = `team/FINANCIER_SCHEMA.md` v5.0** — rebuilt on five owner rulings:
> services-not-products (DP-22), the **platform verification gate as the essence of the
> platform** (DP-23), the flexible **requirements engine** general+specific (DP-24),
> **accreditation as a main service** (DP-26), and **universal document management** (DP-27).
> This file keeps the task breakdown (FIN-0…FIN-10) and integration detail. Approval is
> governed by the DP list — DP-1…DP-28 (DP-13..28 defined in FINANCIER_SCHEMA §10).
>
> The earlier domain sketch in this file is SUPERSEDED by FINANCIER_SCHEMA.md v5.0
> (18 models, ZERO Json columns).

---

## 0. Approval checklist — what you are agreeing to

| # | Decision | Recommendation |
|---|---|---|
| **DP-1** | Financier identity = Organization with `orgType` BANK/MFI/EWALLET + `FinancierProfile`; staff = org members (OWNER/ADMIN). No new global role. | **YES** |
| **DP-2** | Platform revenue = **success fee** on accepted offers (% of financed amount, default 0.75%, 0–5% configurable), accrued as `FinancingFee` rows, invoiced & collected **externally** (admin marks INVOICED/PAID). Platform never touches financing money. | **YES** |
| **DP-3** | Financing service categories v1: `WORKING_CAPITAL` + `INVOICE_FINANCING` + `PO_FINANCING` (+ market taxonomy slots). CREDIT_LINE deferred to v2. | **YES** |
| **DP-5** | Infrastructure recovery (DB down after host reset; runbook reseed = demo data only) | **YES — prerequisite** |
| **DP-13** | Individual applicants: `FinancingRequest.organizationId` nullable (null = individual/sole-proprietor) | **YES** |
| **DP-14** | Additive `User` applicant-profile columns (12 nullable scalars — single-entry rule) | **YES** |
| **DP-15** | Status notes via existing AuditLog + Notification substrate | **YES** |
| **DP-16** | No geo lookup tables v1 — free strings + normalized coverage matching | **YES** |
| **DP-17** | Financier ratings + branch routing | **defer to v2** |
| **DP-20** | Agreement references the frozen accepted offer — no snapshot | **YES** |
| **DP-22** *(owner-set)* | **Services, not products** — `FinancierService` (serviceKind FINANCING\|ACCREDITATION); competitor's own API field is `service` | **YES — owner-set** |
| **DP-23** *(owner-set)* | **Platform verification gate = essence of the platform** — every financing/accreditation request passes platform review; only fully-verified requests forwarded; incomplete/incorrect RETURNED with per-requirement notes; financier inbox structurally excludes un-forwarded requests | **YES — owner-set** |
| **DP-24** *(owner-set)* | **Requirements engine** — GENERAL platform library + FINANCIER-private templates; 8 typed kinds; per-service attachment; per-request `RequirementSubmission` verification; flexible/easy/comprehensive admin + financier management UIs | **YES — owner-set** |
| **DP-25** | **Multi-financier routing = sibling requests sharing `multiGroupId`** (invite-table design rejected — per-financier checklists) | **YES** |
| **DP-26** *(owner-set)* | **Accreditation as MAIN service** — `FinancierService(serviceKind=ACCREDITATION)` + `AccreditationRequest`; grant-on-request; RFQ unlock; auto-pass | **YES — owner-set** |
| **DP-27** *(owner-set)* | **Universal documents** — `AccountDocument` for ALL users + orgs, verified once, reused everywhere | **YES — owner-set** |
| **DP-28** | v4's open-to-matching distribution deferred — v1 requests are service-scoped | **DEFER** |

---

## 1. Verified current state

- Dev server + MySQL **both down** (host reset wiped user-space MariaDB; `.env` holds stale SQLite URL). Recovery runbook exists and is proven (FIN-0).
- `orgType` exists as a **String** column (default `COMPANY`, VarChar(16)) — BANK/MFI/EWALLET valid values enforced only in code (schema.prisma:232). No behavior attached beyond RFQ-settings scope resolution.
- Global roles only BUYER|SELLER|ADMIN; org member roles OWNER|ADMIN|BUYER|APPROVER|VIEWER. No FINANCIER role exists anywhere.
- Payment methods CARD|BANK_TRANSFER|INVOICE; Payout = platform→seller only. **No wallet/ledger exists — good, keeps D-002 structural.**
- Adding a new view = 5 registries in lockstep (View union, VIEWS set, param ser/de, CONSOLE/STOREFRONT sets, DASHBOARD_VIEWS). Admin tab = nav item + title + conditional (admin-view.tsx:50–63).
- Sequences: closed prefix union 'RFQ'|'QTE'|'DSP'|'PY' (add 'FIN'|'AGR'|'ACC' by editing the type).
- Workflow templates to mirror: approvals (guarded decide + no-self-approve + tx transitions), disputes (lifecycle + settings-driven windows + lazy sweeps), notifications (19 types, never-throw emit), audit (UPPER_SNAKE actions, swallow errors).
- Media pipeline: MediaAsset sha256-dedupe + webp renditions — the ONE storage subsystem (DP-19).

## 2. Vision — what the Financier module IS / IS NOT

**IS** (per D-001 orchestrator model + the owner's five rulings): a governed, quality-gated
connection marketplace for financing services. Financiers publish SERVICES (financing offers
and accreditation programs) with their acceptance requirements composed from a shared general
library plus their own private conditions. Individuals and companies apply to a service through
a 3-step wizard that reuses their account data and document vault. **THE PLATFORM VERIFIES EVERY
REQUEST against the service's full requirements checklist and forwards only complete, correct
requests to the financier** — this gate is the essence of the platform's operation. Financiers
review forwarded requests, send binding offers; applicants compare (within a request and across
multi-financier sibling groups) and accept; the platform tracks the agreement status and charges
the financier a success fee (invoiced externally). Accreditation works the same way and, once
granted, unlocks RFQ participation with that financier and auto-passes requirements on their
other services. Full audit, notifications, admin oversight.

**IS NOT** (hard non-negotiables): the platform never lends, never holds or moves financing
funds, never becomes a party to the financing contract, no wallets, no credit scoring, no
automated fee collection. Money flows **financier ⇄ applicant directly**; the platform only
orchestrates, verifies, records, and invoices its fee. The gate never blocks forever — RETURNED
requests carry exactly what is missing so the applicant can fix and resubmit.

## 3. Domain model — governed by FINANCIER_SCHEMA.md v5.0 (single-entry + zero-JSON doctrine)

```prisma
User (+12 additive nullable applicant-profile scalars — DP-14)      // personal data ONCE, no Json
AccountDocument       // UNIVERSAL vault: every user + org, mediaId → MediaAsset (DP-27)
RequestAttachment     // free request attachments → AccountDocument (loose-parent link)

FinancierProfile      // slim — identity on Organization (orgType BANK/MFI/EWALLET)
FinancierBranch       // agents & branches

FinancierService      // THE offering (DP-22): serviceKind FINANCING | ACCREDITATION
                      //   + category + amounts + rates + tenor + accreditationValidMonths
FinancierServiceAttribute / FinancierServiceCoverage   // text traits + coverage regions

ConditionTemplate    // requirements engine (DP-24): scope GENERAL | FINANCIER
ConditionOption      //   SELECT/MULTI_SELECT options (rows, not JSON)
ServiceRequirement   //   per-service attachment (required/order/instructions/autoPass)

FinancingRequest v3   // FR-YYYY-###### — service-scoped, PLATFORM GATE fields, multiGroupId
RequirementSubmission // per-request checklist row — the gate's verification unit (DP-23)
FinancingOffer (+Installment)            // financier bid + schedule rows
FinancingAgreement    // AGR- — references the FROZEN offer (DP-20)
FinancingEvent        // track-only money ledger (D-002)
FinancingFee          // platform revenue (mirrors Payout lifecycle)

AccreditationRequest // ACC-YYYY-###### — MAIN flow (DP-26): gate → grant-on-request
                      //   (ACCREDITED + validUntil + revocation), RFQ unlock, auto-pass
```
Every wizard field maps to EXACTLY ONE home — see FINANCIER_SCHEMA §7 (traceability proof);
requests never copy profile data (competitor's own `fund-order.account = {id,name}` validates).

Registry edits: `'FIN' | 'AGR' | 'ACC'` added to SequencePrefix union (sequences/service.ts:9); new
`financing` SectionDef in RFQ_SETTINGS_SECTIONS (registry.ts:136 — panels: general {enabled,
requestExpiryDays, maxOffersPerRequest, platformReviewRequired, autoForwardWhenAllVerified}, fees
{financierSuccessPercent, originationPercentCap}, requirements {allowFinancierCustomConditions,
defaultValidityMonths, maxRequirementsPerService}, documents {allowedTypes, maxSizeMb}, intake
{requireConsent, wizardEnabled}, accreditation {defaultValidMonths, allowMultiFinancier}) — admin
form/zod/history/rollback derive automatically.

## 4. End-to-end flows (8 — the gate is flow #4, the heart)

1. **Institution onboarding** — admin sets an Organization's orgType → BANK/MFI/EWALLET (existing
   admin org CRUD) → FinancierProfile created PENDING_REVIEW → admin verifies (license/regulator)
   → ACTIVE. Audit + notification.
2. **Service & requirements setup (the flexible management interface — DP-24)** — OWNER/ADMIN
   members of the financier org create `FinancierService` rows of either kind:
   - FINANCING services (category, amounts, rates, tenor, coverage, features).
   - ACCREDITATION programs (validity months, fee).
   - **Requirements composer**: pick conditions from the GENERAL library (searchable, typed),
   create their own private conditions (8 kinds, options as rows), attach to services with
   required/optional, ordering, per-service instructions, validity windows, auto-pass flags.
   Reorder live; deactivate without losing history.
3. **Applicant prepares the account (documents center — DP-27)** — any user/org manages their
   document vault: upload once (ID, commercial reg, tax card, bank statements…), platform verifies
   each doc once, expiry tracked. The wizard's checklist marks items satisfiable by already-
   verified docs — "completes any missing requirements **not already available in their profile**"
   (owner's words) — no re-uploads.
4. **THE PLATFORM VERIFICATION GATE (essence of the platform — DP-23)** — after submit, the
   request enters the admin gate queue. The gate console renders the applicant profile + the
   service's full requirements checklist (general + specific, clearly labeled) + submitted
   answers + attached documents. The admin verifies/rejects/waives each item (notes required on
   reject/waive), may return the whole request with an aggregate reason, and forwards ONLY when
   every required item is VERIFIED/WAIVED. **Incomplete or incorrect requests are structurally
   unable to reach a financier** (inbox queries exclude pre-forward states). Every action is
   audited + notified.
5. **Financing application (3-step wizard — competitor-proven IA, v5 edition)** — from a service
   page ("Apply for financing", `serviceId` set) or the Financing card (service picker; "apply to
   multiple financiers" → sibling requests sharing `multiGroupId` — DP-25):
   - **Step 1 — Profile & consent review**: profile + document vault render read-only with
     "Edit profile"/"Manage documents" jump-outs; consent checkbox → `consentAt`.
   - **Step 2 — Activity & ask + REQUIREMENTS CHECKLIST**: the 22-field activity form (typed
     `FinancingRequest` columns) + the service's checklist (answers typed per condition kind;
     DOCUMENT items attach from the vault or upload-once-then-attach; PROFILE_FIELD items
     auto-evaluate) → `RequirementSubmission` rows. `FR-` number assigned; status SUBMITTED.
   - **Step 3 — Review & submit**: everything by reference + terms → submit → gate queue (flow 4).
6. **Financier responds** — financier console inbox (only FORWARDED+ requests) → request detail
   (checklist verdicts included) → compose offer (rate/fee/tenor/validity + installment rows) →
   SENT. Request → OFFERED. Revisions allowed; decline with note.
7. **Applicant awards & tracking** — compare offers (revisions within a request; siblings across
   `multiGroupId` side-by-side) → ACCEPT one → siblings' offers auto-DECLINE, `FinancingFee`
   ACCRUED (fee % × amount), request → ACCEPTED, agreement created (AGR-). Financier reports
   funding status (REPORTED_FUNDED / REPORTED_SETTLED via events — no money on platform).
   Admin settles fees ACCRUED → INVOICED → PAID (mirrors Payout).
8. **Accreditation (MAIN — DP-26)** — company picks the financier's accreditation service →
   checklist (vault-aware) → submit → **gate (flow 4)** → forwarded → financier grants (ACCREDITED
   + validUntil) or rejects (note). Live grant: unlocks RFQ send/receive participation with that
   financier; auto-passes `autoPassAccredited` requirements on their other services; renewal =
   new request after expiry; revocation with reason (financier or platform). "Approved vendors"
   for the vendor-quotes capability = orgs with live accreditation at that financier.

## 5. Surfaces (D-004: single-route SPA, ?view= only)

- **`?view=financier`** (NEW console — 5-registry lockstep edit): guard = OWNER/ADMIN member of an
  org with financier orgType + ACTIVE profile. Sections:
  - **Dashboard** — inbox counts, live accreditations, offers pending.
  - **Services** — FINANCING + ACCREDITATION service CRUD w/ traits, coverage, and the
    **requirements composer** (general library picker + private condition builder + per-service
    checklist editor with ordering/required/instructions/autoPass) — "flexible, easy,
    comprehensive" (owner requirement).
  - **Requests inbox** — FORWARDED+ financing requests w/ checklist verdicts; open → UNDER_FINANCIER_REVIEW.
  - **Accreditations inbox** — forwarded accreditation requests; grant/reject/revoke.
  - **Offer composer + my offers** — installments grid, validity.
  - **Vendor quotes (B2B mirror)** — entry points to the existing RFQ engine for procurement
    quotes from accredited vendors + relaying customer requests (zero new tables — DP-26 note).
  - **Profile** — FinancierProfile + branches.
- **Applicant** — business-view gains a "Financing & Accreditation" Card (after ApprovalsCard):
  my requests/accreditations list + create; **services directory** (browse financier services →
  apply); request detail w/ gate status + per-requirement verdicts + offers compare + accept;
  **documents center** (vault CRUD — all users, DP-27); quote/order detail gain "Request
  financing" entry points.
- **Admin** — `?view=admin&tab=financing` (Finance nav group): sub-tabs:
  - **Review queue (THE GATE)** — SUBMITTED/UNDER_PLATFORM_REVIEW/RETURNED requests (financing +
    accreditation), checklist verify/reject/waive console, return/forward actions.
  - **Institutions** — verify/suspend financiers.
  - **Monitor** — all requests/agreements.
  - **Fees** — ACCRUED → INVOICED → PAID console.
  - **Requirements library** — GENERAL ConditionTemplate CRUD (+options) — the platform's shared
    conditions library management.
  - **Settings** — financing panels (§3).

## 6. API surface (conventions: requireUser/requireAdmin + service-level org guards, admin routes CSRF+rate-limited)

```
# Services & requirements (financier console)
GET    /api/financier/services                        list own services (+requirement counts)
POST   /api/financier/services                        create (serviceKind, category, terms…)
PATCH  /api/financier/services/[id]                   update / archive
GET    /api/financier/conditions                      own private + GENERAL library (searchable)
POST   /api/financier/conditions                      create private ConditionTemplate (+options)
PATCH  /api/financier/conditions/[id]                 update/deactivate (own scope only)
POST   /api/financier/services/[id]/requirements       attach template (required/order/instructions/autoPass)
PATCH  /api/financier/services/[id]/requirements/[reqId]  update ordering/config · deactivate
DELETE /api/financier/services/[id]/requirements/[reqId]  detach (submissions preserved)

# Applications (applicant)
GET    /api/financing/services                        public directory (ACTIVE services)
GET    /api/financing/services/[id]                   detail incl. composed requirements (labels only)
POST   /api/financing/requests                        create (serviceId, wizard payload, submissions)
GET    /api/financing/requests                        own (org) list + multiGroupId grouping
GET    /api/financing/requests/[id]                   detail: checklist verdicts + offers + status history
PATCH  /api/financing/requests/[id]                   cancel / resubmit-after-return (updates items)
POST   /api/financing/offers/[id]/accept              accept (siblings auto-decline, fee accrues)
POST   /api/financing/offers/[id]/decline             decline offer

# Accreditation (applicant companies)
POST   /api/accreditation/requests                    create (serviceId=ACCREDITATION kind)
GET    /api/accreditation/requests                    own org list
GET    /api/accreditation/requests/[id]               detail (checklist + decision)
GET    /api/accreditation/valid                       own org's live accreditations (RFQ-unlock check)

# Documents center (ALL users — DP-27)
GET    /api/documents                                 own vault (user + org-scope)
POST   /api/documents                                 upload → AccountDocument (MediaAsset-backed)
PATCH  /api/documents/[id]                            replace/deactivate (meta: title/issuedAt/expiresAt)

# Financier inbox (financier console)
GET    /api/financier/requests                        FORWARDED+ financing requests (gate-enforced query)
GET    /api/financier/requests/[id]                   detail incl. checklist verdicts
POST   /api/financier/requests/[id]/offers            submit offer (+installments)
POST   /api/financier/requests/[id]/decision          decline-with-note
POST   /api/financier/accreditations/[id]/decision     grant | reject | revoke (reason required)
PATCH  /api/financier/offers/[id]                     withdraw
POST   /api/financier/agreements/[id]/events          report funding/repayment events (track-only)

# Admin — the gate + governance
GET    /api/admin/financing/queue                     gate queue (both request types, filterable)
GET    /api/admin/financing/requests/[id]             full dossier (profile + checklist + docs)
POST   /api/admin/financing/requests/[id]/submissions/[sid]   verify | reject | waive (note required)
POST   /api/admin/financing/requests/[id]/return      return to applicant (aggregate reason)
POST   /api/admin/financing/requests/[id]/forward     forward — BLOCKED unless all required VERIFIED/WAIVED
GET    /api/admin/financing/institutions              list financiers
PATCH  /api/admin/financing/institutions/[id]        verify / suspend / reactivate
PATCH  /api/admin/financing/fees/[id]                mark invoiced / paid / waive
GET/POST/PATCH /api/admin/financing/conditions[...]   GENERAL library CRUD (the platform's shared conditions)
PATCH  /api/admin/documents/[id]                      verify / reject an AccountDocument (any user's)
```

## 7. Governance wiring

- **Notifications**: types per FINANCIER_SCHEMA §6 (PLATFORM_RETURNED_REQUEST / PLATFORM_FORWARDED_REQUEST /
  REQUIREMENT_VERIFIED / REQUIREMENT_REJECTED / DOCUMENT_VERIFIED / DOCUMENT_REJECTED /
  FINANCING_REQUEST_RECEIVED / ACCREDITATION_* / OFFER_* / FEE_*) + `linkView: 'financing' | 'financier'`
  in the union (notifications/service.ts:43) and bell client.
- **Audit**: every gate action + lifecycle transition (FINANCIER_SCHEMA §6 action list) —
  `AuditLog.metadata` Json NEVER used (R-1); `summary` text carries notes.
- **Expiry**: lazy sweep (mirrors `sweepDisputes` disputes.ts:491) — requests past expiresAt →
  EXPIRED; offers past validUntil → EXPIRED; accreditations past validUntil → EXPIRED (idempotent
  updateMany). Plus ACCREDITATION_EXPIRING reminder notifications (7-day window).

## 8. Task breakdown & schedule

| ID | Task | Scope (files) | Worker | Dep | Size | DoD |
|---|---|---|---|---|---|---|
| **FIN-0** | Infra recovery: run MariaDB runbook + fix stale `.env` → mysql URL + `db:push` + `db:seed` + dev server up | scripts/recovery, .env (lead-only) | **Lead** | — | S-M | `/api/products?limit=1` returns data · login 200 · server survives boundaries |
| **FIN-1** | Schema v5.0: 18 models (FINANCIER_SCHEMA §3) + `'FIN'/'AGR'/'ACC'` prefixes + `financing` settings registry group (6 panels) + additive User scalars + `db:push` + seeds (2 financier orgs w/ profiles, 2 services each incl. 1 ACCREDITATION program, GENERAL library ~10 templates, demo submissions incl. one request mid-gate) | prisma/schema.prisma (lead-gated), sequences/service.ts, rfq-settings/registry.ts, seeds | Dev | FIN-0 | M | push clean · seed shows financier orgs, services with requirements, a request in UNDER_PLATFORM_REVIEW · settings form renders new panels |
| **FIN-2** | Requirements engine + documents: ConditionTemplate/Option + ServiceRequirement services (scope guards: GENERAL admin-only, FINANCIER org-scoped), AccountDocument vault services (verify-once, expiry), RequestAttachment, RequirementSubmission lifecycle (incl. autoPass + PROFILE_FIELD auto-eval) | src/server/modules/financing/{conditions,documents,submissions}.ts (new) | Dev | FIN-1 | M-L | unit-level curl checks: composer attach/detach, vault upload+verify, submission state machine incl. autoPass |
| **FIN-3** | Request lifecycle services: FinancingRequest v3 + AccreditationRequest machines **with the GATE** (forward blocked unless all required VERIFIED/WAIVED — tx-guard), offers/accept/fee accrual, agreements/events, expiry sweeps, notification types + audit actions | src/server/modules/financing/{requests,accreditation,offers,agreements}.ts | Dev | FIN-2 | L | curl-level: every transition + guard (401/403, forward-blocked-with-missing-item, return→resubmit→forward happy path) |
| **FIN-4** | API routes per §6 conventions (financier/services+conditions+requirements, financing/requests+offers, accreditation, documents, financier inbox+decisions, admin gate queue+submissions+return/forward+institutions+fees+conditions+document-verify) | src/app/api/financing/*, financier/*, accreditation/*, documents/*, admin/financing/* | Dev | FIN-3 | M | all routes live; guards enforced; CSRF+rate-limit on admin routes; financier inbox CANNOT list pre-forward requests (negative test) |
| **FIN-5** | Financier console `?view=financier` (5-registry lockstep + sections: dashboard, **services + requirements composer**, inbox, accreditations inbox, offers, vendor-quotes entry, profile) | routing.ts, marketplace.ts, marketplace-app.tsx, nav-config.ts, financier-view.tsx (new) | Dev | FIN-4 | L | E2E: financier composes service requirements from library + private condition; sees FORWARDED request only after gate; sends offer; grants accreditation |
| **FIN-6** | Applicant surfaces: services directory, Financing & Accreditation card, **3-step wizard v5** (profile+vault review → activity+checklist → review), my-requests w/ multiGroupId compare, gate-status detail, documents center, quote/order entry points | business-view.tsx, financier public views, wizard components | Dev | FIN-5 | L | E2E: applicant completes wizard w/ vault-reuse, sees RETURNED + fixes + resubmits; accepts offer; accredited company sees RFQ unlock |
| **FIN-7** | Admin financing tab: **gate review console** (checklist verify/reject/waive, return/forward), institutions, monitor, fees, requirements library, settings | nav-config.ts, admin-view.tsx, admin/financing-tab.tsx (new) | Dev | FIN-6 | M | E2E: admin returns incomplete request (per-item notes visible to applicant); forwards complete one; financier receives ONLY then; fee ACCRUED→INVOICED→PAID |
| **FIN-8** | Governance polish: sweeps end-to-end (requests/offers/accreditations + EXPIRING reminders), notification bell routing, audit completeness check | modules/financing, notifications-bell.tsx | Dev | FIN-7 | S | expiry E2E + bell click-through E2E + audit table rows for every gate action |
| **FIN-9** | Full QA regression: all 8 flows + core regression (catalog, checkout, RFQ chain) via agent-browser | QA | **Tester** | FIN-8 | M | screenshots + worklog evidence; zero console errors; 390px responsive |
| **FIN-10** | Docs: team/docs/ suite refresh (01/02/03/05/06/07 + openapi) + whois.md + final worklog | docs | **Lead** | FIN-9 | S | updated docs committed |

**Serialization:** FIN-0→1→2→3→4 strictly serial (schema chain) · FIN-5→6→7 serial (nav/routing shared files) · FIN-8 can overlap FIN-6/7 with locks · one `db:push` at a time.

## 9. Risks & mitigations (from code recon + v5 design)

| Risk | Mitigation |
|---|---|
| `orgType` is a free String (no DB enum) | zod validation on all financier paths; admin UI restricts to 4 values |
| One org per OWNER (organizations/service.ts:107) | financier staff join as ADMIN members; documented in onboarding flow |
| `linkView` union closed + bell client | extend both in FIN-3, not FIN-5 (no late surprise) |
| 5-registry lockstep for new view | FIN-5 checklist derived from recon (exact files/lines listed) |
| Gate becomes a bottleneck (admin workload) | gate queue bulk actions; autoForwardWhenAllVerified setting; auto-evaluated PROFILE_FIELD items pre-check |
| Requirements explosion (options/conditions) | maxRequirementsPerService setting; searchable library; deactivation instead of delete (submissions preserved) |
| Composite uniques with nullable parent on RequirementSubmission | service-layer exactly-one-parent rule + integration checks in FIN-2 DoD |
| `Order.total` is Float vs Decimal elsewhere | financing math computed in Decimal from request/offer fields; format at edges |
| Host resets wipe MySQL + reaped processes | recovery runbook now FIN-0; double-fork pattern in runbook for server |
| DB already down, old data gone | DP-5: explicit owner approval — reseed = demo data only |

## 10. Non-goals (v1)

No lending, no wallets, no escrow, no credit scoring, no automated fee collection, no
CREDIT_LINE, no FX, no SaaS multi-tenancy. All financing money moves directly between applicant
and financier. **No open-broadcast distribution** (DP-28 — requests are service-scoped; multi-
financier = sibling groups). No automated gate bypass — the platform ALWAYS verifies (owner:
essence of the platform's operation); automation may only pre-fill verdicts, never skip review.

---

**Status: AWAITING OWNER APPROVAL (DP-1…DP-28 — DP-18/19/22/23/24/26/27 are already owner-set
rulings; DP-4 superseded by DP-28).**
On approval → TASK_BOARD updated → FIN-0 dispatched immediately → loop runs to FIN-10 without stopping.
