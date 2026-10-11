# Tenant-Isolation Code Audit — 02-isolation-code-audit.md

- **Task ID:** AUDIT-TENANT-b
- **Agent:** read-only security auditor (subagent)
- **Date:** 2026-10-05 (post-Phase-12 tree, worklog UX-FIN-1 era)
- **Scope:** deep server-side tenant-isolation audit of the VENDORA marketplace (Next.js 16 App Router, Prisma + Aiven MySQL). 301 classified routes (`audit/route-classification.json`), guards in `src/server/guards.ts`, membership predicate in `src/server/membership.ts`.
- **Method:** read-only. Every claim below carries a `file:line` citation verified against the working tree at audit time. `bun scripts/check-guards.ts` was executed (read-only scan, no `--init`) to verify tooling. No code was changed.
- **Inputs:** `audit/route-classification.json` (301 routes), `audit/negative-suite-2026-10-05.md` (20/20 passing), `worklog.md` (UX-FIN-1, AUDIT-MANUAL-1, Phase 12 entries).

---

## Executive summary

The parameterized-route surface is, with one exception family, **well-guarded against cross-tenant access**: every audited `[id]`-style route resolves the record server-side first, then checks membership/ownership of the calling session before serializing. No route was found that queries by id alone and returns the row to an unrelated tenant. List queries are consistently scoped by the caller's org/owner context. Cache keys were audited and are all global-public payloads — the two scoped-resolution systems (rfq-settings, module gates) cache **raw rows** and resolve the caller's scope chain **after** the cache, so no per-user data sits under a shared key.

The issues found are: **one HIGH same-tenant privilege-escalation gap** (financing-offer acceptance bypasses the org approval-threshold machinery that quote acceptance and checkout enforce — any org member, even `VIEWER`, can bind the company), **three MEDIUM findings** (a surviving legacy `User.role === 'ADMIN'` bypass family that contradicts the Phase-6 invariant claimed in `guards.ts`; financier-scope vault-document access that ignores the R-4 platform gate and request lifecycle; org suspension not revoking financier by-id access because the M2 active-membership predicate is not applied in per-record guards), and **seven LOW hardening items**. No CRITICAL cross-tenant read/write was found.

**The reported financier-registration complaint ("applicant lands on a buyer dashboard / BUYER badge") was an onboarding/navigation defect, NOT a data exposure** — evidence in §5.

---

## 1. IDOR sweep — parameterized routes

From `audit/route-classification.json`: 133 routes carry dynamic segments; 47 of the 96 `AUTHENTICATED_USER` routes and 46 `MANUAL_REVIEW` routes (and 48 `PLATFORM_PRIVILEGED`, covered by `requireAdmin(permission)` — see §1.4) are in scope. Sweep method: for each route, read the handler and the service function it delegates to; verify the chain *fetch by id → tenant/ownership check → 403/404 → serialize*.

### 1.1 `/api/financier/*` (offers, agreements, requests, disbursements, risk-assessments, payments, analytics, team, esign, contracts, services, conditions, requirements, accreditations, limits, reconciliations, branches, profile, context)

All by-id handlers guard through one of four service-level predicates — each re-derives the tenant from the record, never from the URL:

| Predicate | Location | Check performed |
|---|---|---|
| `assertFinancierCanSee` | `src/server/modules/financing/requests.ts:1000-1015` | request forwarded (`forwardedAt != null` or visible status, 404 otherwise) **and** caller is OWNER/ADMIN member of `request.service.financierProfile.organizationId` (403) |
| `loadRequestForFinancier` | `src/server/modules/financing/offers.ts:129-147` | same two checks; used by create/send/withdraw/update-draft offers |
| `assertFinancierAgreementAccess` / `loadAgreementForFinancier` | `src/server/modules/financing/agreements.ts:186-191`, `disbursements.ts:156-186` | OWNER/ADMIN membership of the agreement's financier org (via the `offer.request.service.financierProfile.organizationId` chain) |
| `assertFinancierStaffOfService` | `src/server/modules/financing/shared.ts:277-313` | fetches service → OWNER/ADMIN membership of the profile's org (404 unknown / 403 non-staff) |

Verified route-by-route (handler → service guard):

- `requests/[id]` GET, `/open`, `/decline` → `financierGetRequest` / `financierOpenReview` / `financierDeclineRequest` → `assertFinancierCanSee` (`requests.ts:1033, 1066, 1098`). ✔
- `offers` GET (?requestId=), POST; `[id]/withdraw` → `financierGetRequest` pre-check (`app/api/financier/offers/route.ts:20-22`), `createOffer`→`loadRequestForFinancier` (`offers.ts:190`), `sendOffer` (`offers.ts:259`), `withdrawOffer` (`offers.ts:325`), `updateOfferDraft` (`offers.ts:376`). ✔
- `agreements/[id]` GET, `/events` POST, `/funding-status` POST → `getAgreement` (`agreements.ts:227-249` — financier membership OR `assertApplicantActor`), `addFinancingEvent`/`updateAgreementStatus`/`reportFundingStatus` (`agreements.ts:274, 350, 385` → `assertFinancierAgreementAccess`). ✔ (see F-01 for the `viewer.role === 'ADMIN'` bypass branch at `agreements.ts:236`)
- `disbursements` GET, `[id]/confirm`, `[id]/cancel` → `listDisbursements` scoped `where: { agreement: { offer: { request: { service: { financierProfile: { organizationId } } } } } }` (`disbursements.ts:191-201`); `confirmDisbursement`/`cancelDisbursement` → `loadForFinancier` (`disbursements.ts:299, 406`). ✔
- `payments` GET, `[id]/allocate`, `[id]/reverse` → `listPayments` double-guarded (`installments.ts:557-580`: agreement-guard via `loadAgreementForFinancier` **or** staff check on the ctx org), `allocatePayment` (`installments.ts:343`), `reversePayment` (`installments.ts:464`), `getPayment` (`installments.ts:549`). ✔
- `reconciliations` GET, `[id]/resolve` → org-scoped list (`installments.ts:851-898`), `resolveDiscrepancy` → membership of the reconciliation's agreement chain (`installments.ts:810`). ✔
- `risk-assessments` GET/POST → `requireFinancierContext` + `assertFinancierCanSee` (`app/api/financier/risk-assessments/route.ts:14, 17` → `risk.ts:480`). ✔
- `analytics/overview`, `analytics/export` → `portfolioOverview(financierOrgId)` / `exportAnalyticsCsv(financierOrgId)` with every query scoped by `service.financierProfile.organizationId` (`analytics.ts:206-251, 465-514`). ✔ (see F-06 for a count-only pre-forward leak)
- `team` GET/POST/PATCH/DELETE → `requireInstitutionAdmin` (context + OWNER/ADMIN, `team.ts:60-72`); `revokeInstitutionInvitation` checks `invitation.organizationId !== ctx.organizationId` → 404 (`team.ts:287`). ✔
- `esign/executions` GET → `listExecutions(financierOrgId)` org-scoped (`esign.ts:402`); buyer-side execution context/signature is creator/org-member gated with **creator-only signing** (`esign.ts:189-199, 243-248`). ✔
- `contracts` GET/POST, `[id]` PUT, `/activate`, `/retire` → `assertTemplateStaffAccess` + explicit `existing.financierProfileId !== profile.id → 403` ownership re-check (`contracts.ts:197-203, 248-254, 293-299`). ✔
- `services/[id]` GET/PATCH/DELETE, `/attributes`, `/coverage` → `assertFinancierStaffOfService` (`services.ts:245, 309, 372, 399, 431`). ✔
- `conditions/[id]` PATCH/DELETE, `/options` POST/DELETE → `assertTemplateAccess` (GENERAL → `financing.requirements.manage` RBAC; FINANCIER → OWNER/ADMIN of the owning org; `conditions.ts:403-419`); cross-org template attach refused (`conditions.ts:480-482`). ✔
- `requirements/[id]` PATCH/DELETE → `assertFinancierStaffOfService` on the parent service (`conditions.ts:554, 593`). ✔
- `accreditations/[id]` GET, `/open`, `/grant`, `/reject`, `/revoke` → `assertFinancierAccreditationAccess` (`accreditation.ts:783-800`, applied at `805, 840`); REVOKE has a platform-admin alternative path (`accreditation.ts:944-947`) — see F-01. ✔
- `context` GET/POST → `listFinancierMemberships` (the caller's own memberships only; POST switch: `organizations.find(o => o.id === target)` else 403 "You are not staff of that institution", `app/api/financier/context/route.ts:54-58`). ✔ — no way to set the active org to a non-member org.
- `profile`, `risk-config`, `limits`, `branches`, `sharia/certifications/[id]` → all via `requireFinancierContext`/`requireInstitutionAdmin` + profile-scoped queries (`shared.ts:242-256`, `limits.ts:103-108`, `team.ts:60`). ✔

**Structural note (R-4):** the financier inbox is query-level excluded — `financierInbox` (`requests.ts:965-997`) and `financierAccreditationInbox` (`accreditation.ts:755-781`) only ever return `FORWARDED_TO_FINANCIER`+ states or rows with `forwardedAt` set. A financier literally cannot *list* a request the platform has not forwarded. (See F-02 for the document-level hole in this boundary.)

### 1.2 `/api/financing/*` (applicant side)

- `requests/[id]` GET → `getFinancingRequestDetail` → `assertApplicantActor` (creator or member of the applicant org, `requests.ts:819` → `shared.ts:330-337`). `POST /cancel`, `/resubmit`, `/submit` → `assertApplicantActor` (`requests.ts:532-568, 493-532, 413-493` paths; status-machine checks prevent post-forward applicant mutations). ✔
- `requests/[id]/offers/[offerId]/accept|decline` → `acceptOffer`/`declineOffer` → `assertApplicantActor` (`offers.ts:540, 652`). Ownership verified; **but** `assertApplicantActor` accepts *any* member of the applicant org regardless of role — see **F-04 (HIGH)**.
- `agreements/[id]` GET, `/contract` GET, `/statement` GET, `/sign` POST → `getAgreement` (financier-or-applicant), contract rendering reuses the same guard chain, `agreementStatement` (applicant-only per the route's own pre-check `app/api/financing/agreements/[id]/statement/route.ts:16-29` + service `installments.ts:602-621`), `executeSignature` is **creator-only** (`esign.ts:243-248`) + step-up-MFA + hash fail-closed. ✔
- `agreements` GET, `requests` GET lists → `listMyAgreements` / `listMyFinancingRequests` scoped by `createdById` OR the caller's own org memberships (`agreements.ts:196-214`, `requests.ts:750-787`). ✔
- `murabaha/prequalify`, `services`, `services/[id]` → personal-scope or public-ACTIVE-only (`murabaha.ts:31-83`, `services.ts:653-683` — non-ACTIVE → 409). ✔

### 1.3 Other priority families

- `/api/organizations/[id]` GET/PATCH, `/members` POST → `getOrganization` (member or `orgs.view` RBAC, `organizations/service.ts:159-181`), `updateApprovalThreshold` (OWNER/ADMIN or `orgs.update`, `service.ts:187-199`), `addOrganizationMember` (actor must be OWNER/ADMIN **of that org**, `service.ts:243-248`). Cross-tenant approvals are the negative-suite-covered path (NEG-01..NEG-05, all PASS). ✔
- `/api/orders/[id]` GET/PATCH, `/pay`, `/refund` → buyer (`order.buyerId === user.id`), participating seller (`items.some(i => i.sellerId === user.id)`), or `orders.view`/`orders.update` RBAC (`app/api/orders/[id]/route.ts:44-48, 154-156`); seller-scoped serialization `serializeOrder(order, sellerId)` hides other sellers' economics. Checkout POST routes the org approval threshold (`app/api/orders/route.ts:277`). ✔
- `/api/quotes/[id]/*` accept/convert/decline/withdraw → `respondToQuote` (requester-only, `rfq/service.ts:1274`), `convertQuoteToOrder` (requester or `rfq.pipeline.view`, `service.ts:1801-1803`), `withdrawQuote` (owning seller or RBAC, `service.ts:1711-1713`); `/pdf` (requester / issuing seller / RBAC, `app/api/quotes/[id]/pdf/route.ts:66-71`). ✔
- `/api/rfqs/[id]` GET/PATCH, `/messages`, `/quotes` → `getRfq` visibility matrix (owner / RBAC / line-seller / involved seller / open-board) with **competitor-quote filtering** for sellers (`service.ts:678`, filter at `685-687`) and review-state filtering for buyers (`689-691`); transitions RBAC-resolved (`service.ts:745-753`); messages thread-gated. ✔
- `/api/documents/[id]` PATCH/DELETE, `/access` POST → `updateAccountDocument` (uploader-only, `financing/documents.ts:316`), DELETE ownership-first then reference counting (`app/api/documents/[id]/route.ts:99-107`), `/access` → `issueVaultUrl` re-authorizing through `canAccessAccountDocument` (§1.5). ✔ (ADMIN-role bypass on DELETE — F-01.)
- `/api/vault/[documentId]` GET → session re-auth + HMAC one-time URL + **re-authorization through the 6.8 matrix inside `consumeVaultUrl`** + audit (`app/api/vault/[documentId]/route.ts:6-16, 31-32`). NEG-13..NEG-17 all PASS. ✔
- `/api/seller/*` (orders, earnings, stats, profile, subscription) → every query scoped `sellerId: user.id` (`app/api/seller/orders/route.ts:20-27`, `stats/route.ts:21-46`, `earnings` → `sellerEarnings(user.id)`). ✔
- `/api/approvals/[id]/decide` → `decideApproval`: membership of the approval's org with `APPROVAL_ROLES`, own-request refusal, status machine (`approvals/service.ts:261-275`); NEG-03/04/05 PASS. ✔
- `/api/admin/organizations/[id]` PATCH/DELETE → `requireAdmin('orgs.update')` (`app/api/admin/organizations/[id]/route.ts:31, 54`). ✔
- `/api/accreditation/requests/[id]/*`, `/api/disputes/[id]/*`, `/api/certifications/[id]`, `/api/recurring-rfqs/[id]/*`, `/api/uploads/[id]`, `/api/refunds/[id]/cancel`, `/api/products/[id]/*` → applicant-actor / party-or-RBAC / ownership checks verified (`accreditation.ts:618-666`, `rfq/disputes.ts:262-271, 317-329`, `kyc/certifications.ts` via `updateProductCertification(user.id, …)`, `rfq/recurring.ts:240-243` with RBAC admin at `263-330`, `catalog/offers.ts:222-225, 253-256`). ✔ (uploads DELETE + catalog offers have ADMIN-role bypasses — F-01.)

### 1.4 PLATFORM_PRIVILEGED by-id routes (admin model)

48 dynamic admin routes (`/api/admin/...`) all gate through `requireAdmin(permission)` with explicit keys (classification lists all 133 with non-empty `permissionKeys`). Platform staff reading any tenant's record by id is the **accepted platform-administration model**, not an isolation violation; the RBAC permission (e.g. `payouts.view`) is the boundary. Verified examples: `/api/admin/payouts/[id]` (`payouts.view`), `/api/admin/financing/institutions/[orgId]` (`financing.institutions.manage`), `/api/admin/kyc/cases/[id]` (`financing.documents.verify`).

### 1.5 Sweep verdict

**No IDOR found.** Every parameterized non-admin route resolves ownership/tenancy server-side after fetching by id; none trust the URL param for authorization. The deviations found are predicate-quality issues (F-01/F-02/F-03/F-04), not missing checks.

---

## 2. Missing tenant/owner filters in list queries

Audited every `findMany` behind a scoped console/dashboard/export/notifications surface:

- Financier consoles: `financierInbox` (`requests.ts:972-982`), `listFinancierAgreements` (`agreements.ts:217-225`), `listDisbursements` (`disbursements.ts:191-201`), `listPayments` (`installments.ts:571-578`), `listReconciliations` (`installments.ts:855-881`), `portfolioOverview` (`analytics.ts:206-251`), `listTemplates` (`contracts.ts:117-125`), `listLimits` (`limits.ts:103-111`), `listInstitutionTeam` (`team.ts:74-97` — members, `userRole` and `staffInvitation` all `where organizationId = ctx.organizationId`), `listOwnServices` (`services.ts:231-239`), `sharia listCertifications` (`sharia.ts:131`). **All org-scoped.** ✔
- Applicant/buyer: `listMyFinancingRequests` (`requests.ts:754-764` — `createdById` OR own-org ids), `listMyAgreements` (`agreements.ts:197-208`), `listAccountDocuments` (personal: `userId`; org: after `assertOrgMember`, `financing/documents.ts:236-253`), `listNotifications` (`notifications/service.ts:227-234`, `userId`), `/api/kyc/cases` (`document: { userId: user.id }`, `app/api/kyc/cases/route.ts:17-19`), `listMySchedules` (`rfq/recurring.ts:249-251`). ✔
- Seller: `seller/orders`, `seller/stats`, `sellerEarnings` — all `sellerId: user.id` (§1.3). ✔
- Admin lists are deliberately platform-wide behind RBAC permissions. ✔
- Two **aggregate** leaks, not row leaks: analytics funnel counts pre-forward requests (F-06), and the risk engine's cross-institution applicant-history aggregate (F-07).

**Verdict: no unscoped `findMany` serving another tenant's rows.**

---

## 3. Incorrect joins crossing organizations

- Org detail `getOrganization` includes `members` + `groups` of the requested org, but only **after** the membership/admin gate (`organizations/service.ts:164-181`) — NEG-01 PASS confirms behavior.
- Financier chains (`agreement → offer → request → service → financierProfile → organization`) are used *only* to derive the owning tenant for the guard — never as an unfiltered include.
- `listInstitutionTeam` joins `userRole`/`staffInvitation` by `ctx.organizationId` (`team.ts:83-91`).
- No cross-org include found on any console surface. **Verdict: clean.** (The only cross-tenant *data flow* is the intentional risk-history aggregate, F-07.)

---

## 4. Cache-key audit

All server-side caching (`grep 'cached('`, `'use cache'` — none of the latter exists; the Next `use cache` directive is not used):

| Cache | Key | Payload scope | Tenant-safe? |
|---|---|---|---|
| home aggregate | `home:v2` (`app/api/home/route.ts:82`) | public catalog rows | ✔ — **per-user favorites computed outside the cache** (`route.ts:87-93`, `favoriteIdsFor(session?.id, …)`) |
| spec facets | `facets:{slug}:v1` (`catalog/facets.ts:191`) | public product specs | ✔ |
| brands directory | `brands-directory:v1` (`app/api/brands/route.ts:15`) | public | ✔ |
| storefront settings / slides | `settings:storefront:v1`, `settings:slides:v1` (`lib/settings/server.ts:25, 57`) | global platform config | ✔ |
| rfq-settings rows | `rfq-settings:rows:v1` (`settings/service.ts:118-128`) | **raw rows for ALL scopes** | ✔ — the scope chain is resolved **post-cache in JS** with the caller's ctx (`resolvePanel`, `service.ts:134-149`), so org A's overrides can never be served under org B's resolution |
| module-gate state | `globalThis.__vendoraModuleStateCache` (`modules/service.ts:208-219`) | raw definitions + `scopeType\|scopeId` override map | ✔ — per-context resolution happens in `resolveModuleState(ctx)` (`service.ts:102-142`) after the cached raw load |
| currency | module-level 60s cache (`currency/service.ts:52, 174-208`) | public rate payload | ✔ |
| condition-template labels | request-local `Map` (`settings/service.ts:390-395`) | per-call memo | ✔ |

**Verdict: no per-user or per-org payload is cached under a shared key.** The two scope-sensitive systems were specifically architected to cache raw data and resolve scope per request. Remaining (documented, accepted) limitation: the cache is in-process memory — the multi-instance/Redis swap is noted in `lib/cache.ts:4-6`.

---

## 5. The reported financier issue — evidence verdict

**Question:** pre-approval (institution `PENDING_VERIFICATION`), can the applicant read ANY financier-private data — their own or another institution's?

**Trace:**

1. `GET /api/financier/context` (`app/api/financier/context/route.ts:16-32`) requires only a session (`requireUser`), then resolves `listFinancierContextOrgs(user.id)` → `listFinancierMemberships` (`shared.ts:130-171`): the caller's own OWNER/ADMIN memberships in BANK/MFI/EWALLET orgs (or orgs carrying a `financierProfile`), excluding only `SUSPENDED` orgs. A PENDING institution therefore gets a context with `organizationStatus: 'PENDING_VERIFICATION'` (`shared.ts:229-235`) — **by design**, so the pending-application tracker can render.
2. The console's activation gate is **client-side**: `financier-view.tsx:212-227` — `orgStatus === 'PENDING_VERIFICATION' || 'REJECTED'` renders `ActivationSection` (status timeline, submitted facts, license documents — the applicant's **own** submission) *instead of* `FinancierConsole`.
3. Server-side, `requireFinancierContext` (`shared.ts:242-256`) checks membership + the `financier-console` module gate — it does **not** check `organizationStatus`. So the org-scoped console APIs remain callable pre-approval (F-05, LOW): the institution's staff can manage their **own** services, team, contracts, risk-config while pending.
4. **Cross-institution reachability: none.** Every financier query derives `financierOrgId`/`organizationId` from the caller's own membership (`getFinancierContext` → `chosen.id` from `listFinancierMemberships(userId)`, `shared.ts:223-236`) and scopes every where-clause by it (§1.1, §2). The POST org-switcher refuses non-memberships (`financier/context/route.ts:55-58`). A pre-approval applicant therefore sees, at most, **their own institution's (empty) pipeline** — no other institution's requests, offers, agreements, portfolio, underwriting notes, or applicant documents. Newly-created institutions also cannot appear in other applicants' financing flows: their first service is forced to `PENDING_REVIEW` (`services.ts:257-263`) and public detail 409s non-ACTIVE services (`services.ts:662-665`).

**Conclusion:** the reported "financier sees buyer dashboard after registration" was an **onboarding/navigation error** (success CTA navigated to the buyer surface; sidebar rendered the global role chip "buyer" — both fixed in task UX-FIN-1, worklog lines 1111-1133), **not a data exposure**. Pre-approval the console shows the applicant's own submission tracker only, and no financier-private data of any other institution is reachable through the console bootstrap or its APIs. The residual server-side gap (pending orgs keep write access to their own console data) is filed as F-05.

---

## 6. Unauthorized response shapes

- `requireUser` 401: `{"error":"Please sign in first"}` (`guards.ts:30`) — no data.
- `requireAdmin` 403 body names the required permission (`guards.ts:56-58`); `requireAdminAny` lists the accepted keys (`guards.ts:84-88`); `requireModule` 403 includes `module` key + code (`guards.ts:118-143`). **Assessment: acceptable** — this enumerates the platform's permission/module taxonomy to authenticated users but leaks no tenant data, no record contents, and no per-tenant existence facts. It is the standard "actionable denial" trade-off.
- Existence-oracle nuance: `assertFinancierCanSee` returns **404** for not-yet-forwarded requests but **403** for forwarded requests of another org (`requests.ts:1004-1014`) — an authenticated financier can distinguish "no such request" from "exists but not forwarded/mine". Same-shaped behavior in `loadRequestForFinancier` (`offers.ts:138`). Counts as minor existence info; the negative suite accepts 403/404 interchangeably (NEG-01..05). LOW, folded into F-08.
- `documents/[id]` DELETE deliberately checks ownership **before** reference counting so reference counts are never leaked about a document the caller doesn't own (`app/api/documents/[id]/route.ts:99-101`). Good practice.

## 7. Side effects from unauthorized requests

Automated sweep (two passes, first per-file, then per-handler-function) over all 301 `route.ts` files matching any write (`recordAudit*`, `emitNotification*`, `db.*.create/update/delete/upsert/updateMany/deleteMany/createMany`, `$transaction`) occurring **before** the first auth call in the same handler: **0 hits.** Guard calls (`requireUser/requireAdmin/requireModule/getSessionUser/getSessionContext/consumeVaultUrl`) always precede writes. Read-path sweeps (`sweepFinancing` at `requests.ts:1137-1159`, `sweepAccreditations` at `accreditation.ts:976+`) run only inside already-authorized service calls, are single-flight-guarded and idempotent conditional `updateMany`s. The KYC webhook (PUBLIC by design, HMAC is the auth) writes its `KycWebhookEvent` row **after** signature validation per the 12-a E2E; unauthenticated deliveries are logged with provider key + IP only (`worklog` lines 1052-1053). **Verdict: clean.**

## 8. Route-classification coverage + tooling

- `scripts/check-guards.ts` exists and enforces 6 independent failure conditions (unclassified entry points, local `requireAdmin` shadows, bare calls, unknown permission keys, declaration↔code drift, audit-atomicity drift) — `scripts/check-guards.ts:7-14`.
- **Executed now (read-only):** `bun scripts/check-guards.ts` → `Guard-lint: 301 routes scanned … ✓ zero unclassified, zero shadows, zero bare guards, zero unknown keys, zero drift, zero audit-atomicity drift` (34 sensitive actions across 685 source files).
- Classification metadata: all 301 routes present; **all 46 `MANUAL_REVIEW` entries carry non-empty `notes`; all 133 `PLATFORM_PRIVILEGED` entries carry non-empty `permissionKeys`; no non-standard keys.** One notes drift: `/api/uploads/[id]` notes say "ownership checked … or catalog permission" but the code checks the legacy `user.role !== 'ADMIN'` (`app/api/uploads/[id]/route.ts:23`) — see F-01/F-11.

---

## Findings

### F-04 — HIGH — Financing offer acceptance bypasses the org approval gate; any applicant-org member can bind the company

- **Where:** `src/server/modules/financing/offers.ts:512-547` (`acceptOffer` → `assertApplicantActor`), predicate `src/server/modules/financing/shared.ts:318-336`.
- **What:** `isApplicantActor` passes for **any** member of the applicant org — `organizationMember.findFirst({ userId, organizationId })` with no role and no status filter. `acceptOffer` then creates the `FinancingAgreement`, freezes the offer, and accrues the platform success fee (`offers.ts:565-590`) with no approval-threshold check.
- **Contrast (the platform's own documented model):** RFQ quote acceptance routes through `needsApproval(...)` + `createQuoteAcceptApprovalRequest` when the member role + `organization.approvalThreshold` require it (`rfq/service.ts:1288-1326`), and cart checkout does the same (`app/api/orders/route.ts:277-316`, `PENDING_APPROVAL` orders). Financing is the outlier.
- **Attacker:** a `VIEWER`-role member of a buying org (added by any org admin for read-only visibility) accepts a high-value Murabaha offer on an org-scoped request while the approvers are unaware.
- **Data exposed:** not a read leak — an unauthorized **same-tenant write** that creates a binding financial obligation + fee accrual. Response shape: `{ offer: FinancingOfferDTO, agreementId }` (`offers.ts:639`).
- **Fix:** in `acceptOffer`, resolve the caller's membership like `respondToQuote` does and route `needsApproval`-triggering acceptances through `createApprovalRequest` (type `OFFER_ACCEPT` or extend the approvals service), or restrict org-scoped request acceptance to OWNER/ADMIN/APPROVER members.

### F-01 — MEDIUM — Legacy `User.role === 'ADMIN'` authorization bypass survives in the service/route layer, contradicting the guards.ts Phase-6 invariant

- **Where (the bypass sites):**
  - `src/server/modules/financing/agreements.ts:236` (`getAgreement` — `viewer.role !== 'ADMIN'` skips both the financier and applicant checks → any agreement)
  - `src/server/modules/financing/installments.ts:607` (`agreementStatement` — same bypass → any tenant's statement with full payment history)
  - `src/server/modules/financing/requests.ts:818` (`getFinancingRequestDetail` — `isAdmin = actorRole === 'ADMIN'` skips `assertApplicantActor` → any applicant's dossier)
  - `src/server/modules/financing/accreditation.ts:944-947` (`decideAccreditation` REVOKE — `admin.role !== 'ADMIN'` as the only alternative to financier staff)
  - `src/app/api/documents/[id]/route.ts:105, 126` + `src/server/modules/financing/documents.ts:358` (soft delete any vault document)
  - `src/app/api/uploads/[id]/route.ts:23` (delete any media asset)
  - `src/server/modules/financing/conditions.ts:196` (`listVisibleConditionTemplates` ADMIN branch)
  - `src/server/modules/catalog/offers.ts:154` (`user.role !== 'SELLER' && user.role !== 'ADMIN'` — ADMIN treated as seller for offer writes)
  - seller earnings gate `app/api/seller/earnings/route.ts` (`role !== 'SELLER' && role !== 'ADMIN'`)
- **Why it matters:** `guards.ts:11-16` states the legacy `User.role === 'ADMIN'` bypass is GONE and `requireAdmin` is RBAC-only; the access resolver for documents even says "no legacy ADMIN bypass remains" (`documents/access.ts:54`). These sites are reachable from `AUTHENTICATED_USER` routes with only `requireUser`, so the RBAC layer never runs.
- **Attacker:** any account whose `User.role` column is `ADMIN`. Today that is only seeded admin accounts (registration creates `BUYER`, become-seller `SELLER` — no route writes `role: 'ADMIN'`), which also hold `platform.super-admin`, so there is **no current exploitation path for a normal tenant user** — this is an invariant violation + latent privilege if an ADMIN role is ever granted operationally (or a seed/restore drift).
- **Data exposed if triggered:** any tenant's agreements, statements, financing dossiers, vault documents (soft-deleted), media assets — full read.
- **Fix:** replace each site with `userHasPlatformPermission(userId, '<key>')` (e.g. `financing.documents.verify`, `catalog.products.moderate`) or delete the bypass branch; add a guard-lint rule flagging `role === 'ADMIN'`/`role !== 'ADMIN'` comparisons in `src/server` and `src/app/api`.

### F-02 — MEDIUM — Financier-scope vault-document access ignores the R-4 platform gate and the request lifecycle

- **Where:** `src/server/modules/documents/access.ts:85-137` (`isDocumentInFinancierScope`), reached from `canAccessAccountDocument` (`access.ts:69`) used by `getAccountDocument` (`financing/documents.ts:302`), `issueVaultUrl` and `consumeVaultUrl` (the `/api/documents/[id]/access` + `/api/vault/[documentId]` chain).
- **What:** the predicate resolves the requests backing a document via `requirementSubmission` and `requestAttachment` rows, then grants access if the caller is OWNER/ADMIN of **any** financier org behind those requests. It never checks `forwardedAt`/status of the backing request. Checklists are generated at request **creation** (`submissions.ts:719-749`) and documents are attached while the request is `DRAFT` (`answerSubmission`, `submissions.ts:402`), so:
  1. the target institution's staff can read the applicant's identity/financial documents **before the platform gate has verified or forwarded anything** — defeating the stated R-4 boundary ("a financier literally cannot list a request the platform has not forwarded", `requests.ts:961-963`); and
  2. access persists **indefinitely after DECLINED/CANCELLED/EXPIRED** requests (submission rows survive, R-2), long after any review relationship ended.
- **Also:** the membership lookup (`access.ts:128-135`) omits the user/org `ACTIVE` status halves of the M2 predicate, unlike the sibling ORG_MEMBER branch which correctly uses `isActiveMembership` (`access.ts:62`).
- **Attacker:** OWNER/ADMIN of institution X; an applicant drafts (never submits) a financing request targeting X's service and attaches a bank statement → X's staff fetch the document via `/api/documents/[id]` / one-time vault URL while the platform has seen nothing.
- **Data exposed:** the document bytes + metadata (any sensitivity class — the FINANCIER_SCOPE branch returns `sensitivity` but allows regardless, `access.ts:69-71`). Response shape: the full `AccountDocumentDTO` or the streamed file.
- **Fix:** in `isDocumentInFinancierScope`, filter the backing requests to `{ forwardedAt: { not: null } }` (or `status in FINANCIER_VISIBLE_STATUSES`) and use the `isActiveMembership` predicate for the staff check; optionally also expire scope on terminal statuses by policy decision.

### F-03 — MEDIUM — Suspending a financier org does not revoke by-id access (M2 predicate not applied in per-record guards)

- **Where:** `assertFinancierCanSee` (`requests.ts:1007-1013`), `loadRequestForFinancier` (`offers.ts:139-147`), `assertFinancierAgreementAccess` (`agreements.ts:187-190`), `loadForFinancier`/`loadAgreementForFinancier` (`disbursements.ts:139-151, 177-184`), `assertFinancierAgreementAccess` uses in installments (`installments.ts:343, 464, 549, 567, 810`), `assertFinancierStaffOfService` (`shared.ts:295-301`), `assertFinancierAccreditationAccess` (`accreditation.ts:792-799`), `assertTemplateAccess` (`conditions.ts:415-417`).
- **What:** all of these check only `organizationMember.findFirst({ userId, organizationId, role in OWNER/ADMIN })` — no `organization.status`/`user.status` (the canonical M2 predicate is `membership.ts:33-44`). Console **lists** are protected because `requireFinancierContext` resolves through `listFinancierMemberships`, which excludes `SUSPENDED` orgs (`shared.ts:138`), so list endpoints 403 — but the **by-id detail/mutation endpoints** above keep working for staff of a suspended institution (they don't call `requireFinancierContext`).
- **Attacker:** staff of a financier org the platform just suspended (e.g. pending investigation) continue to read request dossiers, record payments, confirm disbursements, and mutate services/templates via direct IDs.
- **Data exposed:** their own institution's in-flight records (cross-tenant unaffected) — a lifecycle-enforcement gap, not an isolation break.
- **Fix:** add `organization: { status: 'ACTIVE' }, user: { status: 'ACTIVE' }` to those membership lookups (or make every financier by-id route call `requireFinancierContext` first, which also fixes F-10).

### F-05 — LOW — Pre-approval institutions keep full console API access server-side (activation gate is client-only)

- **Where:** `requireFinancierContext` (`shared.ts:242-256` — no `organizationStatus` check); client gate `financier-view.tsx:212-227`; tracker data = own submission (`ActivationSection`, `components/marketplace/financier/activation-section.tsx`).
- **What:** while `PENDING_VERIFICATION`, the institution's OWNER/ADMIN can still call every org-scoped financier API (create services, invite staff, set risk-config, contracts — all `requireFinancierContext`-gated routes in §1.1). The client renders the activation journey instead. Partially by design (FIN-001 auto-provision, `shared.ts:187-214`), but the "renders an activation-status screen instead of the full tooling" intent (`shared.ts:111-114`) is not enforced server-side.
- **Data exposed:** the institution's **own** rows only (newly-provisioned = empty pipeline + own profile/team). Cross-institution: none (§5).
- **Fix:** 403 in `requireFinancierContext` unless `organizationStatus === 'ACTIVE'`, keeping a dedicated read-only pending-tracker endpoint for the ActivationSection.

### F-06 — LOW — Analytics funnel counts pre-forward requests

- **Where:** `analytics.ts:218-226` — `requestsReceived` counts `status: { not: 'DRAFT' }` (includes `SUBMITTED`, `UNDER_PLATFORM_REVIEW`, `RETURNED_FOR_COMPLETION`) and is exported in the CSV (`analytics.ts:475`).
- **Attacker/data:** an institution learns aggregate application volume targeting its services before the platform forwards anything (counts only — details remain R-4-protected). Inconsistent with the inbox's structural exclusion.
- **Fix:** count `forwardedAt: { not: null }` (or visible statuses) for the funnel metric.

### F-07 — LOW — Risk factor discloses cross-institution applicant history aggregates

- **Where:** `summarizeApplicantHistory` (`analytics.ts:542-576`) queries the applicant's agreements with **all** institutions; surfaced to the computing financier in the factor note `"N prior agreement(s): X completed, Y defaulted, Z with 90+ day arrears"` (`risk.ts:296-312`).
- **Assessment:** bureau-style aggregate, no counterparty identity or amounts, only for forwarded requests — plausibly intended. Should be an explicit, documented policy (and ideally a consent flag on the applicant profile).
- **Fix:** document/consent-gate the cross-institution factor, or restrict factor 5 to same-institution history.

### F-08 — LOW — Denial bodies enumerate capability names; 403/404 splits reveal record existence

- **Where:** `guards.ts:56-58, 84-88` (permission names), `guards.ts:118-143` (module keys), `requests.ts:1004-1014` (404 pre-forward vs 403 forwarded-other-org).
- **Assessment:** acceptable (actionable denials; no tenant data). Optional hardening: uniform 404-for-invisible in financier guards.

### F-09 — LOW — Unguarded exported `getConditionTemplate`

- **Where:** `conditions.ts:230-237` fetches any template by id with no scope check. Currently only invoked post-guard (`conditions.ts:446, 458` inside option mutations that run `assertTemplateAccess` first) — a latent hazard if ever routed directly.
- **Fix:** add `assertTemplateAccess` (needs an actor param) or un-export / make it private.

### F-10 — LOW — Financier by-id routes skip the `financier-console` module gate

- **Where:** `/api/financier/requests/[id]*`, `/offers/[id]/withdraw`, `/agreements/[id]*`, `/services/[id]*`, `/conditions/[id]*`, `/requirements/[id]`, `/accreditations/[id]*`, `/team` call only `requireUser` (grep table in §1.1) — the module gate runs only inside `requireFinancierContext` on the list endpoints.
- **What:** an admin flipping `financier-console` OFF for an org removes the console and all lists, but by-id endpoints remain reachable by direct URL.
- **Fix:** call `requireFinancierContext` (or `requireModule('financier-console', ctx)`) in those handlers — same change as F-03.

### F-11 — LOW — Classification-notes drift on the ADMIN-role bypass sites

- **Where:** `audit/route-classification.json` `/api/uploads/[id]` notes ("or catalog permission") vs code `user.role !== 'ADMIN'` (`uploads/[id]/route.ts:23`); same pattern noted for `/api/documents/[id]`.
- **Fix:** correct the notes when F-01 lands (the notes describe the intended RBAC state, the code lags).

---

## Verdict table

| # | Finding | Severity | Data actually exposed? | Minimal fix |
|---|---|---|---|---|
| F-04 | Offer acceptance: any org member binds the company (no approval gate) | **HIGH** | Same-tenant write: agreement + fee accrual created by a VIEWER (`{ offer, agreementId }`) | Route `acceptOffer` through the org approval-threshold machinery |
| F-01 | Legacy `User.role==='ADMIN'` bypass family (9 sites) | MEDIUM | If triggered: any tenant's agreements/statements/dossiers/docs (full read/write-delete) — currently only seeded admins hold the role | Replace with RBAC `userHasPlatformPermission` checks; lint rule |
| F-02 | Financier document scope ignores R-4 gate + lifecycle | MEDIUM | Applicant vault document bytes/metadata readable by target institution pre-forward and post-terminal | Add `forwardedAt != null` (+ M2 predicate) to `isDocumentInFinancierScope` |
| F-03 | Org suspension doesn't revoke by-id financier access | MEDIUM | Own institution's in-flight records keep flowing to suspended staff | Apply M2 predicate (user/org ACTIVE) in per-record guards |
| F-05 | Pre-approval console access is client-gated only | LOW | Own (empty) institution data; no cross-institution | Enforce org status in `requireFinancierContext` |
| F-06 | Funnel counts pre-forward requests | LOW | Aggregate counts only | Count forwarded only |
| F-07 | Cross-institution applicant history in risk note | LOW | Aggregates only (counts) | Policy decision / consent flag |
| F-08 | Denial bodies + 403/404 existence oracle | LOW | Capability names; record existence bit | Optional: uniform 404s |
| F-09 | Unguarded exported `getConditionTemplate` | LOW | None today (internal-only callers) | Add guard / un-export |
| F-10 | By-id financier routes bypass module gate | LOW | Module-off org's staff reach records by direct ID | Add `requireFinancierContext` |
| F-11 | Classification notes vs ADMIN-role code drift | LOW | None | Update notes with F-01 fix |

**Counts:** CRITICAL **0** · HIGH **1** · MEDIUM **3** · LOW **7**.

## Explicit answer — "did the financier-registration report expose private data?"

**No.** Evidence: the pre-approval console bootstrap (`/api/financier/context`, `shared.ts:223-236`) returns only the caller's own institution context + org list (`listFinancierMemberships`, `shared.ts:130-171`); the pre-approval screen is the applicant's own activation tracker (client gate `financier-view.tsx:212-227`); every financier data query is scoped by the caller's own membership-derived `organizationId` (§1.1, §2) with no cross-institution path (org switcher refuses non-memberships, `financier/context/route.ts:55-58`); and a pending institution cannot even receive applications (first service forced to `PENDING_REVIEW`, `services.ts:257-263`; public detail 409 for non-ACTIVE, `services.ts:662-665`). The reported symptom (buyer dashboard + "buyer" badge post-registration) was a navigation/labeling defect, fixed as UX-FIN-1 (worklog lines 1111-1133). The only related server-side gap is F-05 (pending org keeps **its own** console write access), which exposes no other tenant's data.

---

## RESOLUTION (follow-up round, 2026-10-07 — see REPORT.md §8)

- **F-06 FIXED** — funnel `requestsReceived` counts `forwardedAt != null` only (analytics.ts).
- **F-07 FIXED** — applicant-history factor is consent-scoped (`request.consentAt`): without consent only the assessing institution's agreements aggregate; the note names the scope. `risk.ts`, `summarizeApplicantHistory(institutionOrgId?)`.
- **F-08 FIXED** — uniform 404: `assertFinancierCanSee` + `loadRequestForFinancier` no longer split 403/404 (existence oracle removed). fin3-smoke A8g updated accordingly.
- **F-09 FIXED** — `getConditionTemplate` un-exported (internal-only).
- **F-10** — already fixed with F-03.
- **F-11 FIXED** — uploads/[id] classification notes updated to post-F-01 reality.
- **RISK-6 FIXED** — actorType labels: conditions.ts template CRUD → 'ADMIN' (RBAC-gated fact), disputes.ts → acting principal ('USER'/'SELLER'), never derived from User.role.
- **RISK-7 FIXED** — document scope closes on terminal financing requests (DECLINED/CANCELLED/EXPIRED) unless an agreement exists; accreditation closes on REJECTED/EXPIRED/REVOKED/CANCELLED. `documents/access.ts`.
- **RISK-8 FIXED** — `listPlatformPermissionHolders()` replaces the three `role:'ADMIN'` fan-out sites (disputes ×2, rfq quote-review) with RBAC permission holders.
- **OFFER_ACCEPT (REPORT §8.1) IMPLEMENTED** — full approval-type extension: schema + migration `20261006090000_offer_accept_approval`, service branches, applicant chip + approver card UI. TI-02..TI-02e + fin3-smoke 75/75 + browser E2E golden path green.
