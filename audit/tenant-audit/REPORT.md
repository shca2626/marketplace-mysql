# Tenant-Isolation Audit — Consolidated Report

**Task ID:** TENANT-AUDIT-1 (main session + subagents AUDIT-TENANT-a/b/c)
**Date:** 2026-10-06 · **Tree:** commit `a818d74` (fixes) on top of `8bb24d9` (audit start)
**Scope:** platform-wide audit of account creation, onboarding, workspace selection, and tenant data isolation — every account type, every creation/upgrade path, every lifecycle state.

---

## 1. Executive verdict — the reported financier issue

**No private data was exposed. The report was an onboarding/navigation error, already fixed in UX-FIN-1 and now hardened further.**

Evidence (all file:line in `02-isolation-code-audit.md`):
- Pre-approval, `/api/financier/context` resolves ONLY the caller's own-membership institutions (`financing/shared.ts:126-166`) — a pending applicant sees their own application, never another institution's data.
- Every financier query scopes by the membership-derived `organizationId`; cross-institution reads are unreachable (verified live as TI-14: institution X staff → institution Y request = 403).
- Pending institutions cannot receive applications at all (first service forced `PENDING_REVIEW`, `financing/services.ts`).
- The "BUYER badge on a buyer dashboard" symptom was the documented design (financier access = org membership, not global role) plus missing UX affordances — fixed in UX-FIN-1 (tracker CTA, FINANCIER rail chip, amber banner, both headers).

## 2. Deliverables index

| Deliverable | Location |
|---|---|
| 1. Account-flow inventory (12 flows, all 10 required + 2 additional, file:line for every claim) | `audit/tenant-audit/01-flow-inventory.md` |
| 2. Data-visibility matrix | §3 below |
| 3. Root causes + data-exposure determination per finding | §4 below + the three sub-reports |
| 4. Routes, services, queries, caches, UI state changed | §5 below |
| 5. Negative tests added + actual results | §6 below + `audit/tenant-isolation-suite-2026-10-06.md` (18/18) + regression `audit/negative-suite-2026-10-06.md` (20/20) |
| 6. E2E results per account-creation path | §7 below + `qa/tenant-audit-e2e-{1,2,3}-*.png` |
| 7. Remaining risks, separated from verified fixes | §8 below |

## 3. Account / data-visibility matrix

**Legend:** ✓ = visible by design · ✗ = denied (verified) · — = not applicable

| Data class | Public | Individual buyer | Seller (own) | Company member (own org) | Financier staff (own institution) | Platform staff (RBAC) |
|---|---|---|---|---|---|---|
| Approved + published products / financing programs | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Other org's org profile / members | ✗ (403, TI-16/NEG-01) | ✗ | ✗ | ✗ | ✗ | ✓ (`orgs.view`) |
| Personal account data (own profile, orders, favorites) | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ (scoped) |
| Another buyer's orders / favorites / cart | ✗ | ✗ (TI-15) | ✗ | ✗ | ✗ | ✓ (`orders.view`) |
| Org-private data (own org) | ✗ | — | — | ✓ (role-scoped: identity-class docs denied to plain members — NEG-18) | — | ✓ |
| Seller-private operational data (offers, earnings, RFQ quotes received) | ✗ | — | ✓ (TI-12 gates non-sellers incl. legacy ADMIN w/o RBAC) | — | — | ✓ (`payouts.view`+) |
| Financier-private: applications dossiers | ✗ | ✗ | ✗ | ✗ (applicant side only) | ✓ **only after platform forward** (F-02/TI-04+05, R-4) | ✓ (`financing.gate.view`) |
| Financier-private: applicant vault documents | ✗ | own only | own only | own org docs (class-scoped) | ✓ **only on forwarded requests, own institution, ACTIVE org** (F-02/F-03) | ✓ (`financing.documents.verify`) |
| Financier-private: offers, agreements, statements, disbursements | ✗ | applicant chain only (TI-10 denies legacy admin) | ✗ | applicant chain only | ✓ own institution only, ACTIVE only (F-03/TI-06) | ✓ (`financing.gate.view`) |
| Pending application status | — | ✓ own tracker (TI-17) | — | ✓ own org status (H-4 banner + console) | ✓ own tracker (UX-FIN-1) | ✓ |
| Cross-tenant financing applications / documents | ✗ | ✗ (TI-14, NEG-19) | ✗ | ✗ | ✗ | ✓ |

**Lifecycle column (verified):** PENDING orgs/staff = read-own-application only + no mutations (F-05/TI-08); SUSPENDED orgs = list + by-id + mutation all denied (F-03/TI-06+07); REJECTED orgs = banner + console card, no operations; removed members lose access on the next request (TI-16); revoked platform roles die with the session version bump (NEG-06).

## 4. Confirmed root causes and whether data was exposed

| # | Severity | Root cause | Data exposed? | Fix |
|---|---|---|---|---|
| C-1 | CRITICAL (client) | Support-chat token/name persisted in localStorage survived logout — next browser user resumed the previous user's conversation | Conversation **content** inheritance risk on shared browsers; no server-side cross-tenant read (token-scoped to the visitor thread) | Shared `signOut()` helper (`src/lib/signout.ts`) on all 4 logout paths — chat, cart, company draft, seen-ids, active org cleared; **verified live** |
| H-1 | HIGH (client) | Cart/savedForLater/recentlyViewed never cleared on identity change | No data read; **order-consequence** risk (previous user's lines placed under the new login) | `clearUserCommerceState()` store action + identity-change check in `auth-modal.tsx finish()`; logout full-clear via signOut() |
| H-2 | HIGH (client) | `register-company-draft` restored for ANY next user | Previous applicant's legal name / registration no. / tax id / contacts prefilled another user's form (PII leak to same-browser users; submission itself was safe) | Draft keyed `register-company-draft:<userId>` + full sweep on sign-out |
| H-3 | HIGH | Checkout attributed orders to the FIRST active org (`findFirst`) | No cross-tenant read; **wrong-tenant attribution** for multi-org users (approvals/pricing attached to the unintended org) | Explicit `organizationId` in checkout payload, fail-fast server-side membership validation (403 foreign org), client passes the remembered active org |
| H-4 | HIGH (UX) | Merchant pending company invisible outside the business console (asymmetric with the financier fix) | No data exposure; onboarding confusion | New `OrgStatusBanner` (PENDING/REJECTED/SUSPENDED) on the buyer dashboard |
| F-04 | HIGH (server) | `acceptOffer` let ANY applicant-org member (incl. VIEWER) bind the company to a financing agreement + fee accrual | Same-tenant **unauthorized write** (binding financial obligation), not a read leak | Org-scoped offer acceptance requires OWNER/ADMIN/APPROVER membership (parity with the quote-acceptance policy) — TI-01/02 deny, TI-03 owner succeeds |
| F-01 | MEDIUM (server) | Legacy `User.role === 'ADMIN'` bypass survived at 14 sites despite the Phase-6 RBAC invariant | Latent only — no non-RBAC account holds role ADMIN today (registration writes BUYER/SELLER only); would grant full read of any tenant's agreements/statements/dossiers/documents if an ADMIN role were ever granted operationally | Every site replaced by explicit `userHasPlatformPermission` keys; TI-09..12 prove a role-ADMIN account without RBAC is denied everywhere |
| F-02 | MEDIUM (server) | Financier document scope ignored the R-4 platform gate — staff could read applicant documents attached to never-forwarded (DRAFT) requests, and forever after terminal statuses | **Conditional exposure**: target-institution staff could read applicant identity/financial documents pre-gate (requires knowing the document id; not listable) | `forwardedAt != null` filter + M2 ACTIVE membership predicate — TI-04 denies pre-forward, TI-05 opens exactly at forward |
| F-03 | MEDIUM (server) | Per-record financier guards omitted the M2 ACTIVE predicate — suspended institutions kept by-id detail/mutation access | Their OWN institution's in-flight records (no cross-tenant); lifecycle-enforcement gap | M2 predicate on all 11 guard sites (requests/offers/agreements/disbursements/installments/accreditation/conditions/services) — TI-06/07 |
| F-05 | LOW (server) | Pre-approval institutions retained full console write access server-side (activation gate was client-only) | Their own (empty) console data only | `createService` 403 for non-ACTIVE orgs + service-scoped guards ACTIVE-gated — TI-08 |
| M-3/Q2 | LOW | `fin_org` cookie survived logout; not secure-flagged | Pre-selection residue only (membership-validated on every read) | Cleared server-side on logout; `secure` in production |
| M-4/M-5/L-1/L-3 | LOW (UX) | Suspended institutions saw a misleading "not staff" screen; seller-intent registrants landed nowhere; seen-ids residue; site-header logout silent | No data exposure | SUSPENDED banner variant; register→`navigate('seller')`; swept on sign-out; toast + redirect |
| Q3/Q1/Q5/Q6/Q7 | OPEN (inventory) | Invitation marked ACCEPTED before the user-creation tx commits; individual sellers orgless until verification; admin org-create gated on `orgs.view`; `buildSessionRbac` module resolution fails open; no conflict-of-interest guard | No data exposure demonstrated | Documented as remaining risks (§8) |

## 5. What changed (files)

**Server-side authorization (13 files):**
`financing/shared.ts` (assertFinancierStaffOfService M2), `financing/offers.ts` (acceptOffer role gate F-04 + loadRequestForFinancier M2), `financing/requests.ts` (assertFinancierCanSee M2 + RBAC dossier), `financing/agreements.ts` (+ getAgreement RBAC), `financing/installments.ts` (agreementStatement RBAC + M2), `financing/disbursements.ts` (M2 ×2), `financing/accreditation.ts` (M2 + revoke RBAC), `financing/conditions.ts` (M2 + library RBAC), `financing/documents.ts` (softDelete RBAC), `financing/services.ts` (F-05 createService gate), `documents/access.ts` (F-02 forward gate + M2), `catalog/offers.ts` + `api/products/bulk` (catalog RBAC), `api/orders/route.ts` (H-3 explicit org), `api/documents/[id]`, `api/uploads/[id]`, `api/seller/earnings`, `api/admin/stats`, `api/admin/notifications/digest/run`, `api/financier/context` (Q2 secure), `api/financing/requests/[id]`, `api/financing/agreements/[id]/statement`, `lib/auth.ts` (clearWorkspaceCookies), `api/auth/logout` (M-3).

**Client-side state (11 files):**
`lib/signout.ts` (NEW — the one true sign-out), `store/marketplace.ts` (`clearUserCommerceState`), `marketplace/auth-modal.tsx` (identity-change hygiene + M-5 seller redirect), `marketplace/header.tsx`, `dashboards/dashboard-topbar.tsx`, `site/site-header.tsx` (L-3), `register/register-company-view.tsx` (H-2 user-keyed draft + shared signOut), `register/register-financier-view.tsx`, `dashboards/financier-pending-banner.tsx` (M-4 SUSPENDED), `dashboards/org-status-banner.tsx` (NEW — H-4), `dashboards/buyer-dashboard.tsx`, `marketplace/checkout-view.tsx` (H-3 org pass-through).

**Caches:** no cache-key changes were needed — the audited server caches (home aggregate, currency, facets, brands, module gates) hold only public payloads; scoped systems (rfq-settings, module gates) cache raw rows and resolve the caller's chain after the cache. No per-user data sits under a shared key (02-report §caches).

## 6. Negative tests — added and actual results

New suite `scripts/tenant-isolation-suite.ts` → `audit/tenant-isolation-suite-2026-10-06.md`: **18/18 PASS** (TI-01..TI-18, including positive controls and side-effect checks — zero orders/offers/services/documents mutated by denied requests). Regression: `scripts/negative-authz-suite.ts` → **20/20 PASS** (`audit/negative-suite-2026-10-06.md`). Combined 38/38.

Coverage per the required matrix: two unrelated buyers (TI-15), buyer-vs-seller (TI-12), two competing seller orgs (NEG-01/02 pattern, org-type COMPANY), user in multiple orgs (TI-13 checkout + TI-16 membership removal), two financial institutions (TI-14), financier role tiers (TI-01/02 member roles; TI-06/07 suspended staff), company applicant vs financier reviewer (TI-04/05), platform staff with different permission sets (NEG-06/07/10 + TI-09..12 legacy-role negative), pending/active/rejected/suspended/removed states (TI-08/17, TI-16, M-4 banner, NEG-06). Surfaces: registration (TI-08), dashboards (browser E2E), organizations (TI-16, NEG-01/02), memberships (NEG-07/11), offers (TI-01..03/07), orders (TI-13/15), financing applications (TI-04/05/10/14), documents (TI-04/05/11, NEG-13..20), settings/notifications/exports (guard-lint 301 zero drift + NEG suite).

## 7. E2E results (agent-browser, live on dev :3000)

| Path | Result | Evidence |
|---|---|---|
| Individual registration with Sell intent → seller console | **PASS** — lands on Seller Dashboard, store created, FINANCIER-era "stare at the same page" gap closed (M-5) | `qa/tenant-audit-e2e-1-seller-intent.png` |
| Logout state hygiene (chat token, name, active org, cart) | **PASS** — all cleared; next user inherits nothing (C-1/H-1) | live localStorage probe (all null post-logout) |
| Merchant company pending → buyer-dashboard banner → business console tracker | **PASS** — amber banner with honest copy + CTA → console shows "We're reviewing your business" (H-4) | `qa/tenant-audit-e2e-2-merchant-banner.png` |
| Merchant REJECTED variant | **PASS** — red "Business application was declined" banner | live snapshot |
| Financier pending (regression of UX-FIN-1 after M-4 changes) | **PASS** — amber institution banner + tracker CTA; no interference with the merchant banner (org-type split works) | `qa/tenant-audit-e2e-3-financier-banner.png` |
| Buyer registration + browse + cart (golden path) | **PASS** (previously verified rounds; re-confirmed home/market 200, zero page errors, zero 5xx) | dev.log |

Full pending→approved financier lifecycle incl. admin approval + console unlock was E2E-verified in UX-FIN-1 (qa/fix-financier-1..7). Approval mechanics for merchants/financiers/staff are additionally covered at API level by the 38 negative/regression cases above.

## 8. Remaining risks (explicitly NOT claimed fixed)

1. **Offer-acceptance threshold parity (design follow-up):** a BUYER-role member below the org threshold is now denied direct acceptance (strict policy) rather than routed through an `OFFER_ACCEPT` approval request the way quote acceptance is. The approval-type extension (schema + decideApproval branch + UI) is the natural next increment; current behavior fails closed, never open.
2. **Q3 invitation acceptance race:** org-invitation rows are marked ACCEPTED before the registration transaction commits; an invalid/expired token is silently ignored. Low risk (tokens are single-use hashes) but should be tightened to post-commit marking.
3. **Q1 orgless individual sellers:** individual Seller accounts carry no Organization tenant until admin verification lazily provisions one — org-scoped paths see `orgId=null` in the interim (documented in the System Manual).
4. **Q6 `buildSessionRbac` module resolution fails open** where `requireModule` fails closed — a module-list omission in the session builder would over-report (not grant) access; harmless today, worth aligning.
5. **No conflict-of-interest guard** on multi-org membership (known, documented, accepted deviation — manual §13/Q&A).
6. **Audit actorType labels** in `conditions.ts`/`disputes.ts` still derive from User.role for labeling only (not authorization).
7. **F-02 residual:** document scope now opens at forward and stays open for the lifetime of the request rows (agreed-file retention) — terminal-status expiry remains a policy decision (declined-before-offer requests keep the financier's read access to what was forwarded to them; nothing pre-forward).
8. **Admin-notification fan-out** (`role: 'ADMIN'` findMany for notifying platform admins in disputes/rfq) targets legacy ADMIN accounts rather than RBAC holders — delivery gap, not a data exposure.

## 9. Gates

- tsc: 172 errors == pre-existing baseline, **zero new** (git-stash A/B proven)
- eslint: zero problems on all 34 touched files
- guard:lint: 301 routes, zero unclassified/shadows/bare guards/unknown keys/drift/audit-atomicity drift
- dev.log: zero 5xx across the entire round (suites + browser E2E)
- Schema unchanged (no migration needed — `prisma migrate status` up to date with `0_init` baseline)
