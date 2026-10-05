# Vendora — Formal Response to the Prisma Schema Audit

**Document:** `answer4audit.md`
**Responds to:** *“Vendora Prisma Schema — Architecture, Security and Completeness Review”* (`evaulate-scheema.md`)
**Respondent:** Vendora engineering (codebase owner)
**Date:** Phase 5 complete — HEAD `0de243d` on `origin/main`
**Evidence base:** the full working tree, not just `prisma/schema.prisma`

---

## 0. Framing — the audit's own caveat, and ours

The review opens with an honest disclaimer that we want to quote back, because it is the key to reading everything below:

> *"This is a schema-only review. I have not inspected the API, authorization middleware, migrations, jobs, or UI, so I cannot confirm whether some risks are already mitigated in code."*

That is exactly right, and it is exactly where this response comes in. Vendora is a **three-layer enforcement stack**:

| Layer | Responsibility | Where it lives |
|---|---|---|
| **Route boundary** | Value domains, CSRF, rate limits, payload shape | `zod` schemas at the top of every `src/app/api/**/route.ts` |
| **Service layer** | Authorization, tenant scope, state machines, workflow rules | `src/server/modules/**` (guards, membership asserts, transition tables) |
| **Database** | Structural integrity, relations, uniqueness, indexes | `prisma/schema.prisma` |

The audit evaluated **one of the three layers** and correctly identified what that layer alone cannot guarantee. That is a legitimate and useful review technique — the schema *is* the last line of defense and should be judged on what it would catch if the layers above it failed. Our response therefore grades every finding on that same axis:

- ✅ **Handled** — already mitigated in code; the schema-only view couldn't see it. Evidence cited.
- 🟡 **Partially valid** — partly handled; the residue is real and we own it.
- 🔴 **Valid** — accepted finding, not mitigated anywhere; scheduled with a concrete plan.
- ℹ️ **Design decision** — deliberate, documented trade-off; we explain the reasoning and the conditions under which we'd revisit it.

One more note on method: the reviewer states the schema "describes rules in comments that are not enforced" — several of those comments explicitly say *"service-enforced"* or *"loose FK — keeps composite unique simple on MySQL"* (e.g. `UserRole.organizationId`, `Rfq.sourceRecurringId`, `AccreditationRequest` renewal). Those are not aspirational comments; they are pointers to the enforcing code, which we cite below.

---

## 1. RBAC

### 1.1 Legacy `User.role = ADMIN` is a major privilege bypass — 🟡 Partially valid (deliberate break-glass; migration ~97% complete; one real defect found)

**What's true:** `User.role === 'ADMIN'` bypasses permission checks. That is documented in the schema header itself: *"ADMIN is an implicit super-admin bypass everywhere … staff users keep role=BUYER and gain console access purely through role assignments."*

**What the schema-only view missed:** this is not an unmanaged legacy leak — it is the documented migration path, and it is nearly finished:

- `src/server/guards.ts` — `requireAdmin(permission?)` is a **dual-mode gate**: legacy `ADMIN` still passes (break-glass), while every other caller is checked against platform-scope RBAC roles via `userHasPlatformPermission()`.
- **110 route handlers** across `src/app/api/**` now call `requireAdmin('<permission.key>')` with an explicit key (`vendors.verify`, `payouts.manage`, `financing.gate.review`, `catalog.products.moderate`, `payments.capture`, `disputes.resolve`, `whatsapp.manage`, `modules.manage`, `rbac.*`, …). A sweep shows only **one** production route still calling bare legacy `requireAdmin()` (`src/app/api/quotes/[id]/review/route.ts`).
- Break-glass is not silent: `rbac/service.ts` hides legacy ADMIN accounts and protected-role holders from non-super-admin staff lists (RBACSEC-1), only super-admins may attach further roles to an ADMIN account, and every privileged action lands in `AuditLog`.
- The reviewer's suggested test — *"a user with no platform assignment cannot reach privileged APIs"* — is precisely what the Phase 2/5 E2E gates exercised: a staff user with `financier.*` org roles but no platform assignment gets 403 on every `/api/admin/*` route; only the granted domains open.

**Self-found defect (we report it before you do):** while gathering this evidence we found that three files define a **local** `async function requireAdmin()` (no parameters, legacy-role check only) and then call it with a permission key — `src/app/api/admin/slides/route.ts`, `src/app/api/admin/slides/[id]/route.ts`, `src/app/api/admin/settings/route.ts`. Because the local function shadows the import, `requireAdmin('storefront.manage')` silently degrades to the legacy check on those routes. It **fails closed** (it is more restrictive, not less — no privilege is exposed), but it breaks the RBAC migration for storefront staff. **Fix queued:** delete the local shadows and import the guard (one-line change × 3, next session — the user has frozen code changes for this review cycle).

**Remaining accepted risk:** the bypass exists until the day we flip it off. The end-state (already designed) is: `requireAdmin()` without a permission key becomes an error at audit-time, and the break-glass account becomes a separately-controlled, audited, 2FA-protected super-admin seat. We accept the reviewer's recommendation as written and it is scheduled for the Phase 6 hardening pass.

---

### 1.2 Role scope and organization scope not enforced by the DB — 🟡 Partially valid (the DB can't do it on MySQL; the service layer does)

**What's true:** `UserRole.organizationId` is a string with `""` for platform scope and no `Organization` relation. A schema-only reviewer cannot see scope discipline. And they are right that the DB itself permits nonsense rows.

**What the code enforces on every write** (`src/server/modules/rbac/service.ts`):

- **Role creation/update** (`createRole`/`updateRole`): permissions are validated against the scope's catalog — `ALL_PLATFORM_PERMISSIONS` vs `ALL_ORG_PERMISSIONS`; mixing throws (`"Permissions not valid for this scope: …"`).
- **Assignment** (`assignRole`, lines ~544–610): an `ORG`-scope role **requires** an `organizationId`, and the org row must **exist** (404 otherwise); a `PLATFORM`-scope role is pinned to `organizationId = ""` — an ORG role cannot be assigned at platform scope or vice versa. Duplicate assignments are rejected (409) by the composite unique. Suspension, protected roles, and privilege bracketing are all checked before the write.
- **The magic empty string:** we keep `""` rather than a relation for one reason, documented in the schema: it keeps `@@unique([userId, roleId, organizationId])` a real composite unique on MySQL, which a nullable FK column would break (MySQL unique indexes allow multiple NULLs — the same nuance the reviewer correctly cites in §6). The trade-off is deliberate: we chose "queryable, unique-able, and validated in one place" over "nullable and relation-enforced."

**What we accept:** assigning an ORG role to a user who is not a member of that organization is currently allowed in `assignRole` (the org must exist, but membership is not required). This is intentional for the onboarding path (financier staff are invited and receive the role + membership in the same flow) but it is a real gap for direct admin assignment, and the reviewer's recommendation to validate membership at write time is correct — scheduled. Negative integration tests (per their §4 recommendation) are also accepted — see §4 below.

---

### 1.3 Organization member roles are strings, not permission assignments — ℹ️ Design decision (documented dual-model)

This is accurately observed and **deliberate**. The schema header and `financing/shared.ts` (DP-1) document the model:

- `OrganizationMember.role` (`OWNER | ADMIN | BUYER | APPROVER | VIEWER`) is a **closed, code-defined capability set** for *organizational* actions: who can decide approvals (`APPROVAL_ROLES` in `approvals/service.ts`), who reaches the financier console (`listFinancierMemberships`: `OWNER`/`ADMIN` of BANK/MFI/EWALLET orgs), who triggers the approval threshold (BUYER), who merely watches (VIEWER).
- `UserRole`/`Role`/`Permission` is the **platform RBAC system** for staff.
- The two systems meet in exactly one place, by design: Phase 5 financier **team roles** (underwriter/reviewer/branch officer) are org-scoped `financier.*` RBAC roles whose assignment flow *also* creates an `OrganizationMember` row — so org membership is the identity substrate, and granular permissions ride on top.

So the answer to "which system is authoritative" is: **org membership is authoritative for org access; RBAC permissions are authoritative for what you can do once inside.** No API mixes the two representations for the same decision — the reviewer's actual risk condition ("different APIs make decisions from different role representations") is the invariant we hold, and it's testable by grep: org-role string comparisons appear only in `approvals`, `organizations`, and `financing/shared` membership resolvers, never as a substitute for a permission key.

---

### 1.4 "Cannot self-approve" not enforced — ✅ Handled (service-enforced, exactly as the schema comment says)

`src/server/modules/approvals/service.ts`, `decideApproval()`:

```ts
if (request.requesterId === decider.id)
  throw new ApprovalServiceError('You cannot approve your own request — ask another approver', 403)

const membership = await db.organizationMember.findUnique({
  where: { organizationId_userId: { organizationId: request.organizationId, userId: decider.id } },
})
if (!membership || !(APPROVAL_ROLES).includes(membership.role))
  throw new ApprovalServiceError('Only organization owners, admins and approvers can decide', 403)
```

The reviewer asked for (a) no self-approval, (b) decision-maker is an **active member** at decision time with (c) required authority — all three are the pre-write check, plus status re-validation (`already PENDING`), plus per-type re-checks (order still `PENDING_APPROVAL`, quote still `SENT` and unexpired) before any transition, all inside a transaction. Also enforced on the notification side: `notifyApprovers` explicitly excludes the requester from the approver fan-out.

---

### 1.5 Role lifecycle and invitation controls — 🟡 Partially valid (strong parts + accepted gaps)

**What's already there:**

- **Assignment audit trail:** every grant/revoke writes `ROLE_ASSIGNED` / `ROLE_REVOKED` to `AuditLog` with actor, role, scope and org — an append-only record (see §16 for the append-only proof).
- **Session invalidation on change:** `assignRole`/`revokeAssignment` bump `User.sessionVersion`, instantly killing the affected user's existing session tokens (`lib/auth.ts` validates the epoch on every request — AUTHSEC-1).
- **Invitations:** email is normalized (`trim().toLowerCase()`) and regex-validated at creation; `consumeInvitation()` accepts **only** when the token row is `PENDING`, unexpired, **and `invitation.email === email.toLowerCase()` of the registering account** — the email-binding the reviewer asked for. Tokens are `randomBytes(24).toString('hex')` (192-bit), single-use, TTL-bound, revocable, and an open invitation for the same email is rejected (409) so there's exactly one live path per mailbox.
- **Privilege bracketing (RBACSEC-1):** staff cannot create/edit/grant/invite with any role whose permission set exceeds their own — nobody hands out more access than they hold; protected roles (`platform.super-admin`, `org.owner`) are invisible and untouchable (404-masked) for non-super-admins.

**What we accept as valid gaps:**

1. `StaffInvitation.token` is stored in **plaintext**. Mitigations: 192-bit entropy, short TTL, single-use, email-bound, DB-read required to exploit. But hashing it (like we already do for `PasswordResetToken` / `EmailVerificationToken` / `OtpCode`, all `tokenHash`-pattern) is cheap and correct — scheduled.
2. No explicit `revokedAt`/expiry on `UserRole` rows — revocation is a hard delete + audit row. A soft-lifecycle (`status`, `revokedAt`, `revokedById`) would preserve in-place history; the trade-off (unique key semantics, resolver complexity) is why we chose delete-plus-audit. The reviewer's "append-only audit trail" already exists (see above); the lifecycle columns are a reasonable P2 addition.
3. `FinancingOffer`-style conditional permissions ("may manage only this vendor's catalog") — correctly out of scope today; the org-scope bracketing is the substrate, resource-level ACLs are a future phase.

---

## 2. Multi-vendor support

### 2.1 Vendors are users, not first-class tenants — ℹ️ Design decision (current scale) + 🔴 Valid for the stated future

Accurate observation of a deliberate Phase 1–5 scope decision. Sellers today are `User` records with seller-specific profile fields (`storeName`, `storeBio`, `storeCover`, `commissionRate`, `status`/`suspendedAt` lifecycle, `verifiedAt` platform verification). What exists around them: platform verification (KYC-lite + full `AccountDocument` KYC pipeline shared with buyers), suspension lifecycle, commission override, payout graph, publish-approval workflow, and `ProductOffer` as the multi-vendor layer on shared catalog identity (`Product`).

The moment vendors need **multiple staff accounts, branches, or ownership transfer**, a first-class seller-org entity is required. Notably, the substrate for it already exists: `Organization` + `OrganizationMember` + org-scoped RBAC roles are proven (that's exactly how financier institutions work — Phase 5 shipped underwriter/reviewer/branch-officer roles on an org). The migration path is therefore additive: a `SellerOrganization` linkage on `Product.sellerId`/`ProductOffer.sellerId` is a Phase 6+ work item, consciously deferred until multi-staff vendors are a real requirement rather than schema speculation.

---

### 2.2 The offer is not consistently represented in orders and quotes — 🟡 Partially valid

Point by point against the live code:

- **`OrderItem.offerId` is a scalar, no relation — deliberate.** The schema comment documents it: *"loose snapshot ref; offers archive but never hard-delete."* A hard FK with cascade semantics is wrong for an immutable historical record (an archived offer must not take its order items with it, and `onDelete: SetNull` would erase the evidence). The checkout writes it from a server-side validated offer row (`src/app/api/orders/route.ts` lines ~105–132: offer must be ACTIVE, belong to the product, seller must be the offer's seller, stock checked on the offer) and snapshots `title`, `image`, `price`, `sellerId` at purchase time.
- **`OrderItem.sellerId` has no relation — same snapshot rationale.** It is set **server-authoritatively** at checkout: `sellerId: offer ? offer.sellerId : p.sellerId` — never trusted from the client payload.
- **`QuoteLine` has no `offerId` — valid, accepted as a gap.** Quotes today are issued per-seller against the seller's own products (`"You can only quote your own products"` — `rfq/service.ts` line ~880), and the RFQ line's offer targeting (`RfqLine.offerId`, which *is* a real relation) informs routing. Carrying `offerId` onto `QuoteLine` is a small, correct Phase 6 addition; we accept it.
- **`Quote.sellerId` scalar, single-seller quotes — accurate.** Multi-seller RFQs are answered by multiple single-seller quotes (competing), and conversion creates one order with per-item `sellerId` (which is how payouts resolve per-seller shares). A single quote spanning multiple sellers is a model change we haven't needed; if buyer behavior asks for it, it arrives with the suborder work (§2.3).
- **"Cannot reliably prove which offer was quoted, sold, and paid out" — overstated for orders/payouts.** The chain offer→order-item→payout is materialized in data: `OrderItem.offerId` (checkout-validated), `OrderItem.payoutId → Payout` (settled share), `Payout.sellerId` (which the settlement query filters on — see §2.5). The weak link is specifically quote lines, acknowledged above.

---

### 2.3 Multi-vendor orders lack fulfillment boundaries — 🔴 Valid (scheduled, Phase 6)

Fully accepted. One global `Order.status` and one shipping address cannot represent per-seller dispatch, tracking, or partial cancellation once we enable true mixed-seller carts. Today the product is honest about this: a cart can mix sellers, and the buyer sees per-item seller attribution, but fulfillment is single-status. The planned shape is the reviewer's second option — **parent order + per-seller fulfillment suborders** — which also cleanly carries `OrderItem.sellerId` (already present per-item) into operational status. This is the headline item of the Phase 6 "Commerce Depth" plan already agreed with the owner (worklog: *"Phase 6 — Commerce Depth (multi-vendor timing already resolved by Phase 4's Product/Offer split …)"*).

---

### 2.4 Inventory is not a safe transaction system — 🟡 Partially valid (one real gap accepted)

**What's already handled:**

- **Authoritative stock per context is defined and enforced:** base product → `Product.stock`; variant purchase → `ProductVariant.stock` is authoritative with `Product.stock` tracking the total (comment documents the contract); offer purchase → `ProductOffer.stock` is authoritative (checkout path). The checkout validates the right bucket for the line type before anything writes.
- **All mutations are inside the order-creation transaction** (`db.$transaction`), with restock-on-cancel/restock-on-approval-reject mirroring the decrements (approvals service lines ~319–341).
- **`Product.stock @default(10)` — fair cosmetic hit, accepted.** Legacy seeding convenience; variants and offers already default to `0`. Changing a column default is a trivial schema touch we'll bundle with the decimal migration (§3) to avoid a gratuitous `db push` cycle.

**What we accept as a real gap:** the decrement is `stock: { decrement: qty }` guarded by a **pre-transaction** availability check. Under two concurrent checkouts for the last unit, both pre-checks can pass. The fix is exactly the reviewer's "atomic conditional decrement" and is a one-line change per bucket:

```ts
const ok = await tx.product.updateMany({
  where: { id, stock: { gte: qty } },   // conditional guard INSIDE the tx
  data:  { stock: { decrement: qty }, soldCount: { increment: qty } },
})
if (ok.count === 0) throw new Error('Insufficient stock')
```

Same treatment for the variant and offer paths. **Scheduled as P0-companion for the next code session** (it was frozen for this review at the user's instruction). Reservations/movements ledger remains P1 (it matters the moment backorders or multi-warehouse appear).

---

### 2.5 Payout integrity — 🟡 Partially valid (mostly enforced; one concurrency edge accepted)

The reviewer's four sub-risks, against `src/server/modules/payouts/service.ts`:

1. **"Item's sellerId matches the payout's seller" — ✅ enforced by construction.** The settlement query selects items `where: { sellerId, payoutId: null, order: { status: { not: 'CANCELLED' }, payment: { status: 'SUCCEEDED' } } }`. A payout literally cannot contain another seller's item — the filter *is* the match guarantee.
2. **"Payment succeeded before payout" — ✅ same query predicate.** Only `SUCCEEDED` payments' items are settleable; `PENDING`/`FAILED`/`CANCELLED` payments and `CANCELLED` orders are excluded.
3. **"Not already included in a concurrent payout" — 🟡 partially.** Items are re-selected inside the transaction (`payoutId: null`) and the `updateMany` stamps `payoutId` — but the `updateMany`'s `where` filters only by id-set, not by `payoutId: null`, so a theoretical second concurrent generate for the same seller could re-stamp items already claimed by the first. Practical exposure is near-zero (single admin surface, sub-second window, Prisma's default tx isolation serializes the row locks), but the reviewer is technically right and the fix is trivial: add `payoutId: null` to the `updateMany` filter and treat `count !== items.length` as a retry. **Accepted, queued with §2.4.**
4. **"Amount matches settled line items" — ✅ by construction.** `gross/commission/net` are computed **from the re-selected rows inside the transaction** (`Math.round(...*100)/100`), the commission rate is snapshotted on the payout row, and cancellation releases items back to unsettled in a transaction (`cancelPayout`). Reproducibility: every stamped item carries `payoutId`; the payout is re-derivable from its items at any time.

---

## 3. Money as `Float` — 🔴 Valid (the single most substantive finding; accepted with a migration plan)

We agree with this one outright, including the currency-consistency corollary. Facts on the ground:

- Every money field is `Float` (MySQL `DOUBLE` via Prisma). We are not going to argue that 53-bit mantissas make this safe at current volumes — the reviewer's standard is the right one: **money is DECIMAL(15,2) or it isn't done.**
- Current mitigations (why nothing is observably wrong today): every monetary write/aggregate passes through explicit 2-decimal rounding (`Math.round(x * 100) / 100` in `lib/pricing.ts`, payouts, financing fees, offers' fee accrual); the platform is effectively **single-currency per domain** at this stage (marketplace USD, financing YER per-service), so no cross-currency math exists yet; commission/fee percents are snapshotted at accrual (`FinancingFee.percentApplied`, `Payout.commissionRate`) exactly per the reviewer's "never recalculate history" rule.
- Currency fields: `Quote.currency`, `Payment.currency`, `PriceList.currency`, `FinancierService.currency`, `FinancingRequest/FinancingOffer.currency` exist; `Product`/`ProductOffer`/`Order`/`OrderItem` lack them — true, consistent with single-currency MVP.

**Accepted plan (P0 of the next schema-touching session, bundled so we run one migration cycle):** convert all money columns to `Decimal @db.Decimal(15,2)`; add `currency` (defaulting per domain) to `Product`, `ProductOffer`, `Order`, `OrderItem`; fix `Product.stock` default → `0` in the same push; round-trip-verify with a reconciliation script (sum of payouts per seller vs sum of stamped items). We deliberately did **not** rush this mid-phase: it touches 20+ models and every money-touching service, and doing it bundled-and-verified beats doing it piecemeal.

---

## 4. Cross-tenant relationships — ✅ Handled in the service layer (the "RFQ gold standard"), with the test-gap honestly conceded

The reviewer lists eight concrete cross-tenant risks. Here is each one's enforcing code (all in `src/server/modules/`):

| Audit risk | Enforcing check (file · behavior) |
|---|---|
| Financing request org ≠ creator's org | `financing/requests.ts` §create — membership assert (403) before create, both single and multi-financier paths |
| Accreditation submitter not an org member | `financing/accreditation.ts` — `organizationMember.findFirst` required before create |
| `AccountDocument` user/org mismatch | `financing/documents.ts` — org-scoped upload requires `assertOrgMember`; **read** requires owner **or** org-member **or** admin (three-way check) |
| Request attachment → foreign document | Attachments are created only through request APIs that first run `assertApplicantActor`; the DOCUMENT answer path additionally re-validates ownership at attach time (below) |
| Requirement submission attaches another tenant's doc | `financing/submissions.ts` `validateAnswer` DOCUMENT case — *"That document belongs to another user or organization"* (403) unless `doc.userId === ctx.userId` or `doc.organizationId === ctx.organizationId`; plus REJECTED-status, type-match and freshness checks |
| RFQ references an org the requester isn't in | `rfq/service.ts` — `"You are not a member of that organization"` (403) on create |
| Approval requester not a member | ApprovalRequests are created **inside the checkout transaction from the session user's own membership**; the decider must be a member with authority at decision time (§1.4) |
| Order item's seller unchecked vs product/offer | `api/orders/route.ts` — offer lines validated (offer → product, ACTIVE, stock) and `sellerId` assigned **server-side** from the offer/product, never from the payload; quote conversion (`rfq/service.ts` §convert) sets `sellerId: l.product.sellerId` from the quoted line |

On top of these, the module gates (`requireModule`) resolve the requesting **user's org chains** so a module flipped off for an org type disappears from a member's APIs (Phase 5 Gate B, E2E-verified both directions).

**What we concede:** these are service-layer invariants, so their safety depends on every future writer going through the services — the reviewer's "treat tenant scope as a required authorization input to every read and write" is the standing code-review rule here, but it is enforced by convention, not by types. Two hardening items are therefore accepted: (a) **negative integration tests** for the cross-tenant matrix (one org's member vs another org's records across the eight rows above) — scheduled as a test-suite starter despite the project's no-test-scripts constraint applying to feature work, security tests are the exception the owner has approved in principle; (b) where MySQL permits, composite uniqueness to make invalid combinations unwritable (e.g. `RequirementSubmission` service-consistency, §6).

---

## 5. Accreditation renewal blocked by the unique constraint — ℹ️ Design decision (the reviewer's own Option A), with an accepted upgrade path

This is the finding we can answer most precisely, because the code implements **exactly one of the two options the reviewer proposed**:

> *"Decide whether the intended model is: (a) One permanent record per service/organization, updated and renewed in place; or (b) Multiple historical requests, with at most one active."*

We chose **(a)**, and the schema comment says so: *"one accreditation per financier-program per org; renewals after terminal states (service-enforced)."* The enforcement (`financing/accreditation.ts` §create):

```ts
const existing = await db.accreditationRequest.findUnique({
  where: { serviceId_organizationId: { serviceId, organizationId } },
})
if (existing && !ACCREDITATION_TERMINAL.includes(existing.status)) {
  throw new FinancingError(`An accreditation request for this program already exists (${existing.number} — ${existing.status})`, 409)
}
if (existing) {
  // Renewal after a terminal state: the NEW request supersedes the old row
  // (the DB unique forbids a second row). History survives in AuditLog.
  await db.accreditationRequest.delete({ where: { id: existing.id } })
  await recordAudit({ action: 'ACCREDITATION_RENEWED', metadata: { previousStatus: existing.status, … } })
}
```

So there is **no deadlock**: renewal is allowed after any terminal state (`ACCREDITED | REJECTED | EXPIRED | REVOKED | CANCELLED`), implemented as *supersede* — the terminal row is retired with a full `ACCREDITATION_RENEWED` audit entry carrying its prior status, and the new request starts clean. This was deliberate for a business reason: an accreditation **grant** is not an append-only event stream — it's a per-program *state* of the org ("accredited by financier X on program Y until Z"), which is what `autoPassAccredited` (DP-26), the live-grant check (`status === 'ACCREDITED' && validUntil > now`), and the storefront trust badges consume.

**The honest trade-off we accept:** supersede deletes the terminal row, and `RequirementSubmission` cascades with it — the request-level history survives in `AuditLog` (who decided what, when, why, with the previous status), but the *checklist-level* detail of the superseded application does not survive in queryable tables. If the regulator-facing requirement becomes "full application history retained as rows," the upgrade path is the reviewer's option (b) via MySQL 8's generated-column trick — a nullable `active_pair_key` = `IF(status IN (active-states), CONCAT(serviceId,':',organizationId), NULL)` with a unique index (multiple NULLs permitted), dropping the hard `@@unique`. It's a contained migration because all reads already go through status-aware queries. **Scheduled as P2** unless the financing domain's compliance requirements pull it forward.

---

## 6. Requirement submissions can be attached inconsistently — ✅ Handled by construction (with one DB-hardening concession)

- **Exactly-one-parent:** submissions are never created from client payloads. They are minted **server-side** by `generateChecklist()` at submit/resubmit time, with the parent discriminator being *which function ran* — `createMany` with `financingRequestId` XOR `accreditationRequestId` from the typed parent context (`submissions.ts` §checklist: `...(parentType === 'FINANCING' ? { financingRequestId: parentId } : { accreditationRequestId: parentId })`). There is no API that accepts both fields. Both-null is impossible because the checklist generator throws without a parent; both-set is impossible because the object literal sets exactly one.
- **MySQL NULL-in-unique nuance:** the reviewer is right that the two `@@unique` constraints alone wouldn't stop it — they exist for the *per-requirement uniqueness within one parent*, not for XOR enforcement. The XOR is a service invariant (above). We accept the suggestion to harden at DB level where cheap.
- **Service consistency (submission's requirement belongs to the parent's service):** guaranteed by construction — the checklist is generated from `ServiceRequirement where serviceId = parentRequest.serviceId`; a submission cannot reference a requirement of a different service because it's created inside that service's checklist. All later mutations load the submission **through its parent** and re-assert `assertApplicantActor` (§submissions `answerSubmission`).
- **Document ownership at attach:** enforced — see §4 table row 5, including type-match to `ConditionTemplate.documentType` and expiry freshness.
- **Common-parent refactor:** noted as an option; the two flows already share `RequirementSubmission`, `ServiceRequirement`, `ConditionTemplate`, the gate logic (`assertGateComplete`), and the auto-pass engine — the remaining duplication is one nullable FK pair, which we consider acceptable versus a polymorphic parent table's cost on MySQL.

---

## 7. Financing service and workflow constraints — ✅ Largely handled (state machines + ownership checks are all in code)

Each "comment or assumption" from the audit, with its enforcement:

| Rule | Enforcement |
|---|---|
| Financing request uses a FINANCING service | `assertServiceApplicable()` — `"That service is an accreditation program — use the accreditation flow"` (400) + `status === 'ACTIVE'` + amount within `amountMin/Max` |
| Accreditation request uses an ACCREDITATION service | `createAccreditationRequest()` — `"That service is a financing offer — use the financing flow"` + ACTIVE check, re-checked at submit |
| Service belongs to an eligible, active financier | Financier services are reachable only through `FinancierProfile.organizationId` (org of type BANK/MFI/EWALLET, not suspended) — the console context (`requireFinancierContext`) enforces membership + non-suspended org; Phase 5 adds the org **activation gate** (`PENDING_VERIFICATION` orgs get an activation screen, not the console — E2E-verified) |
| Financing offer issued by the financier owning the service | `loadRequestForFinancier()` — requester must be OWNER/ADMIN member of **the service's financier org**, and the request must have passed the platform gate (`forwardedAt != null`, else 404-masked) |
| Accepted offer corresponds to the request | `acceptOffer()` — offer is loaded with its request, applicant-actor asserted, `status === 'SENT'`, validity window checked, request in offerable states |
| No multiple accepted offers / agreements | `acceptOfferCore()` inside one transaction: accepted offer frozen, **all other SENT offers on the request auto-declined**, sibling-group offers auto-declined, request closed — plus the structural backstop `FinancingAgreement.offerId @unique` |
| Installments reconcile | `validateInstallments()` — positive amounts, no duplicate installment numbers, strictly ascending due dates; offer amounts/tenor bounds validated |
| Decision transitions with actor/when/why | `FINANCING_TRANSITIONS` and `ACCREDITATION_TRANSITIONS` tables drive every status change (`canTransition()` — invalid pairs 409); decisions carry `decidedBy/decidedAt/decisionNote`, revocations **require** a reason, platform gate carries reviewer/note/returned-reason, and every transition audit-logs |

The "decision metadata lives on the offer, not the request" observation is accurate and deliberate (DP-20): the request is the *application*, the offer is the *terms*, the agreement is the *contract*. The request's financier-side state machine (`FORWARDED_TO_FINANCIER → UNDER_FINANCIER_REVIEW → OFFERED → ACCEPTED/DECLINED`) is what the inbox consumes.

---

## 8. State fields are plain strings — ℹ️ Design decision (validated at the boundary), with the CHECK-constraint concession

Accurate, and deliberate — documented in the schema header: *"statuses are string enums validated in TS/zod"* and in `financing/shared.ts`: *"Status unions (String columns + TS unions + zod — no DB enums)."*

**Why:** the project's DB workflow is `prisma db push` against Aiven MySQL 8.4 (schema/DB sync per the header). Prisma `enum`s on MySQL map to native ENUM columns whose value-set changes are among the most painful migrations in that workflow; string columns + exhaustive TS unions (`type FinancingRequestStatus = 'DRAFT' | 'SUBMITTED' | …`) + `z.enum([...])` at every route boundary give the same writer-side guarantee with one deployment artifact instead of two.

**The guarantee today:** no route writes a status that isn't in its zod schema; services re-assert transitions. Invalid values can't enter through the app.

**What we accept:** the reviewer's point is about *defense in depth* — a rogue writer (script, future bug, manual SQL) can write `"PAID1"`. The MySQL answer is CHECK constraints or native ENUMs applied via a migration SQL file alongside the push workflow. We accept adding CHECK constraints for the critical state machines (order, payment, payout, financing/accreditation status columns) **in the same bundled migration as the decimal work (§3)** — one downtime window, one verification pass.

---

## 9. No durable workflow event history — 🟡 Partially valid (generic + domain timestamps exist; per-domain event tables accepted as P1/P2)

**What exists today:** `AuditLog` is genuinely append-only in code — a repo-wide search for `auditLog.update|delete|deleteMany` returns **zero** call sites; 46 files emit `recordAudit` with **124 distinct action codes** covering org verification, RBAC grants/revokes, module flips, payout generation/payment, financing gate decisions, offer acceptance, product publish decisions, approval decisions, recurring spawns, settings changes. Plus `SettingChange` — a dedicated append-only field-level history with rollback chains (`rollbackOfId`), which is exactly the "domain-specific workflow events" pattern for the settings domain. Plus per-domain transition timestamps (`submittedAt/forwardedAt/returnedAt/decidedAt/revokedAt/…`) with actor and note columns on the entities themselves.

**What we accept:** the reviewer's standard — "current status + a few timestamps" is not a full event history for **order/payment state changes and dispute resolution**, where reconstruction currently requires joining AuditLog metadata. Per-domain event tables (`OrderStatusEvent`, `PaymentEvent`, `DisputeEvent`) are agreed and scheduled P1 (orders/payments, alongside the refund work §10) and P2 (the rest).

---

## 10. Order, payment, refund, dispute coverage — 🟡 Mixed (three valid accepts; two already-handled)

- **`Order.status` defaults to `PAID` — valid, cosmetic.** Every creation path sets status explicitly (`PENDING_APPROVAL` / `PAID` / `PENDING_PAYMENT` / `PROCESSING`); the default never fires from application code. But a default that contradicts the state machine is a landmine for future writers. **Accepted:** change default to `PENDING_PAYMENT` in the bundled migration.
- **`Payment.orderId` unique (one payment per order) — valid within current scope, accepted for the future.** The payment model is deliberately single-settlement-per-order: CARD settles inline (simulated gateway), BANK_TRANSFER parks then captures, INVOICE rides NET-terms. There are no retries/refunds/chargebacks in the product yet — the platform hasn't taken a real gateway. When it does, the model becomes `PaymentAttempt` rows + a settlement view, per the reviewer's structure. **Scheduled with Phase 6.**
- **No refund/chargeback lifecycle — valid, accepted.** Dispute outcomes can record `FULL_REFUND/PARTIAL_REFUND` and the resolution strips seller verification, but there is no money-moving refund execution — honestly, there is no money-mover yet (no live gateway). The refund ledger ships together with real payment integration, not before it (building refund execution against a simulated gateway is negative-value work).
- **"Dispute seller not proven to supply an item on that order" — already handled.** `rfq/disputes.ts`: the seller set is derived from the order's actual items (`sellerIds = [...new Set(order.items.map(i => i.sellerId))]`) and the dispute's seller must be in it (`"That seller did not supply any item on this order"`); duplicate open disputes per (order, seller) are blocked. The schema can't show this; the code requires it.
- **`Review.verified` not tied to a fulfilled order item — handled at the purchase level.** `api/reviews/route.ts`: verified is computed from an actual `orderItem.findFirst({ productId, order: { buyerId } })` — a real purchase check at write time, re-computed on edit. Per-item fulfillment linkage will strengthen naturally once delivery states exist (§2.3).

---

## 11. Pricing rules integrity — ✅ Mostly handled (scope validation + deterministic resolution), one accepted micro-gap

- **Invalid scope combinations — handled.** `price-lists/service.ts` `validateTarget()`: ORG scope requires an existing organization (404 otherwise); GROUP requires an existing group; CHANNEL is explicitly refused until the B2B2C phase; anything else rejected. An ORG list without an org is unwritable through the API.
- **Overlapping lists / tie-breaking — deterministic and documented.** The resolver (`pricing/resolver.ts`) sorts `scopeRank(ORG) > (GROUP) > (CHANNEL)`, then `priority DESC`, then `createdAt ASC` — a total order; first list with a matching ladder entry wins, and the winning `priceListId` is recorded on the resolved price for auditability. The ladder itself picks the highest applicable `minQuantity` step. The rules are written in the module header, matching the reviewer's "define deterministic priority" ask.
- **Date ranges:** resolution filters `startsAt ≤ now < endsAt` (nulls open-ended). Creation-side validation of `endsAt > startsAt` is the accepted micro-gap — trivially added to the zod schema next touch.
- **Default group uniqueness — handled in service:** the default group cannot be deleted, cannot be un-defaulted without a replacement ("The platform needs a default group"), and reference-checked deletes (price lists, group links block deletion).
- **Currency per entry — accepted:** entries inherit the list's currency (documented); with single-currency MVP this is invisible; resolves with §3's currency columns.

---

## 12. Recurring RFQs — ✅ Handled (the exact idempotency mechanism the reviewer asked for exists in code)

This one we can answer with the reviewer's own words: *"Add a recurring-run record with a unique schedule/run key and a transaction-safe idempotency mechanism."*

**The atomic claim exists** (`rfq/recurring.ts`, due-spawn loop):

```ts
// ── Atomic claim (compare-and-set on nextRunAt) ──
// Two concurrent sweeps can both see this row as due; only the one that
// pushes nextRunAt forward first wins the spawn — the loser's updateMany
// matches 0 rows and skips.
const claimed = await db.recurringRfq.updateMany({
  where: { id: s.id, active: true, nextRunAt: s.nextRunAt },   // CAS guard
  data: { nextRunAt: new Date(now + cycleMs), previewNotifiedAt: null },
})
if (claimed.count === 0) continue
```

The schedule row **is** the run-record: `lastRunAt`, `runCount`, `lastRfqId`, `emptyCycles` (consecutive unproductive runs with auto-pause via `autoCancelEmptyCycles`), `previewNotifiedAt` (heads-up dedupe). The spawned RFQ carries `sourceRecurringId` and is created through the **normal** `createRfq()` (MOQ caps, variant validation, per-org daily caps all re-applied — no bypass of commercial rules). Timezone behavior: cycles are interval-based (`WEEKLY/BIWEEKLY/MONTHLY/QUARTERLY/CUSTOM days`), anchored to the previous run — no DST edge cases.

**JSON-in-text for lines/recipients — deliberate snapshot semantics:** the schedule stores the buyer's *frozen intent* (what to re-request), re-validated on every spawn through the real creation path; it's not a query surface. Normalizing to `RecurringLine` tables buys nothing the spawn path doesn't already enforce. Accepted as-is.

---

## 13. Module activation is configuration, not entitlement — ✅ Handled as built (it is exactly the entitlement substrate it claims to be)

The reviewer's checklist against the implementation (`modules/service.ts` + `requireModule`):

- **"Whether APIs are disabled when a module is off" — the core ask — ✅.** `requireModule()` gates 12 API route groups (`rfq`, `financing-hub`, `financier-console`, `b2b-orgs`, …). Crucially, Phase 5 closed the semantic gap the schema can't show: personal-scope modules resolve through the **union of the user's org chains** (`userModuleState`) — so flipping `financing-hub` off for `ORG_TYPE: COMPANY` removes it from an org member's nav *and* returns `403 MODULE_DISABLED` from their APIs. E2E-verified both directions (worklog: Gate B).
- **Valid scope combinations — ✅.** `setActivation` validates `scopeType ∈ {PLATFORM, ORG_TYPE, ORG}` and `scopeId ∈ {COMPANY, BANK, MFI, EWALLET}` for org-type scope; the resolution chain is fixed and tested (ORG > ORG_TYPE > PLATFORM > default).
- **Core modules non-disableable — ✅.** `setActivation` refuses with 409 (`"… is a core module and cannot be deactivated."`), and the admin UI hides the switch — the exact split the schema comment promises ("the API refuses").
- **Admins/operators bypass — deliberate:** module flips steer the market (storefront/buyers/sellers/financiers), not the operators; the guard comments this explicitly.
- **Unknown keys fail open — deliberate and documented** (`return state[moduleKey] ?? true`): a typo'd module key must not take the marketplace down; the matrix is seeded and id-listed.
- **Subscription limits / seat counts / plan billing — not built, by design and by plan.** The schema header says precisely this: *"the substrate for subscription tiers (a tier = a bundle of enabled modules + limits)"*. Monetization modeling is a pending owner decision (worklog, Phase 6 notes). The reviewer's "treat it as a centralized entitlement service" is a fair description of where this goes when billing arrives; today it is a complete *activation* system, which is what Phase 5 specified.

---

## 14. Sensitive data protection — 🟡 Mixed: OTP flows are strong; token hashing + creds encryption accepted

**Already strong (evidence):**

- **OTP:** SHA-256 hashed at rest, 5-minute TTL, single-use burn (`consumedAt`), attempt-capped (5 then burn), 60-second resend cooldown, **daily per-phone cap + hourly per-IP cap** (`lib/rate-limit`), issuance IP logged for forensics, **constant-time compare**, opportunistic purge of dead codes. This matches the reviewer's rate-limiting requirement exactly.
- **Password storage:** scrypt (N=16384 default), 64-byte, `timingSafeEqual`; sessions are HMAC-signed stateless tokens with an epoch (`sessionVersion`) that password resets and role changes invalidate; cookies `Secure` in production; reset/verification tokens stored **hashed** (`tokenHash` pattern — proving the team already applies the hash-at-rest pattern where it matters most).
- **KYC documents:** magic-byte sniffing (content-type cannot lie), image-only pipeline (PDFs rejected with a clear 415 until the vault grows PDF support), size caps (panel-configurable + hard ceiling), expiry validation at upload, `documentType` allowlist from settings, dedupe by SHA-256, list/read access behind the three-way owner/org-member/admin check (§4), status workflow with reviewer + note, soft-delete, and a KYC level engine that recomputes trust levels from verified evidence only.
- **WhatsApp message bodies:** every outbound row is retained as the audit/delivery ledger (the model's documented purpose) — which is the *reason* retention rules are needed, addressed below.

**Accepted as valid:**

1. `WhatsAppSender.credsJson` (Baileys session credentials) is plaintext-at-rest — the schema itself marks it *"encrypted-at-rest candidate"*. Plan: envelope encryption (AES-256-GCM per-sender, key from env/KMS) — **P1**, lands with the WhatsApp hardening pass.
2. `StaffInvitation.token` + `pairingCode` plaintext — hashing invitations is scheduled (§1.5); the pairing code is short-lived and only useful while physically holding the target SIM, but hashing-on-store + TTL discipline is still right.
3. **Retention/access-log rules for identity documents and message bodies** — accepted; a retention policy (expiry sweep for OTP rows exists already as the pattern to copy) + document access logging are P2 compliance work.
4. Private-document serving — see §15, the one place we disagree with our own current design enough to have scheduled a change.

*Operational note, for transparency:* the screenshot shared alongside this review shows the admin WhatsApp pairing modal failing with *"WhatsApp service unreachable (fetch failed)"* — that is the Baileys mini-service not running in the sandbox at that moment (graceful degradation: sender saved, status stays `PENDING_PAIRING`, clear error surfaced). It is an environment/ops matter, not a schema or code defect — and it demonstrates the failure path behaves.

---

## 15. Media ownership and visibility — 🟡 One honest gap accepted (capability-URL serving of vault documents)

**What's handled:** uploads are magic-sniffed, size-capped, SHA-256-deduped into `MediaAsset` with rendition variants; **deletes are reference-checked** (the schema comment's promise — products' images are scanned before an asset is removable); the upload route is authenticated + rate-limited; `AccountDocument`-level access is the three-way check (§4). Cross-user asset "references" in the dedupe case are not a leak: two users uploading identical bytes share one immutable *asset* row, but each owns a separate `AccountDocument` (ownership, type, status, review) — the access-controlled entity is the document, not the bytes. And there is no API that lets you attach an arbitrary existing `mediaId` — documents are created from *your* multipart upload only.

**The gap we own:** `/api/media/[...key]` serves stored renditions as **public-read with immutable caching** — the right design for storefront imagery (content-derived keys, CDN-friendly), but vault documents are served through the same public capability-URL path. Keys embed the content hash (practically unguessable), the pipeline is image-only, and listing/attacking them requires the key — but "unguessable URL" is not "authorization," and for national-ID-class documents the standard must be the latter. **Accepted and scheduled (P1):** split serving — public renditions stay on the immutable path; `AccountDocument`-backed media moves behind an authorization-checked route (owner/org-member/admin, same three-way rule as the document rows) with short-lived signed URLs and no public cache.

`ProductCertification.mediaId` as a scalar: accurate — it follows the `User.image` URL pattern (mediaId holds the vault key, `url` holds external links); admin-verified, soft-deleted, expiry-aware. Converting it to a real `MediaAsset` relation is a trivial P2 tidy-up bundled with the next schema pass.

---

## 16. Audit and compliance coverage — 🟡 Partially valid

**What's already true:** `AuditLog` is append-only in code (zero update/delete call sites — verified by repo-wide search); coverage is broad (124 action codes across 46 files: org lifecycle, RBAC, modules, payouts, payments, financing gate, publishing, approvals, recurring, settings); the admin Audit Log console is permission-gated (`audit.view`); `SettingChange` is the domain-specific append-only history with rollback chains; per-entity legal acceptance exists where it's contractually load-bearing today: `FinancingRequest.consentAt` / `AccreditationRequest.consentAt` (data-transfer consent enforced at submit — the gate refuses without it), and `Product.publicationAgreedAt + publicationAgreementVersion` (seller accepted the Publication Agreement, also audit-logged) — both snapshot the *version*, per the reviewer's consent-versioning principle.

**Accepted:** (a) a generic per-user legal-acceptance ledger (terms/privacy per version, per user, with timestamps) — `LegalDocument` already carries versions, the acceptance rows are the missing half — P2; (b) DB-level immutability (triggers/permissions denying UPDATE/DELETE on the audit table) as defense-in-depth — noted for the bundled migration; (c) the "every sensitive action logged" claim is a living checklist, and the cross-tenant negative tests (§4) will include log-emission assertions.

---

## Missing/underdeveloped platform areas — triage of the list

Honest triage (✅ exists · 🔜 scheduled phase · ⏭️ consciously deferred):

| Area | Status | Note |
|---|---|---|
| Cart & checkout idempotency | ⏭️/🔜 | Cart is client-side by design (no server cart model); checkout idempotency keys: accepted, Phase 6 |
| Inventory reservations & movement history | 🔜 P1 | With §2.4's atomic decrement; ledger when backorders exist |
| Seller shipments/tracking/fulfillment | 🔜 Phase 6 | Headline item (§2.3) |
| Returns, refunds, payment attempts, chargebacks | 🔜 Phase 6 | With real gateway integration (§10) |
| Payout destinations & transfer references | 🔜 Phase 6 | With banking rails |
| Order-item tax/discount/shipping snapshots | 🟡 | Item price/title/image/variant snapshotted; coupon + shipping totals on the order; per-item tax snapshots: Phase 6 |
| Address book | 🟡 | Autofill exists (last order + org billing JSON, used by quote→order); model-form address book: P2 |
| Vendor staff & business-level seller permissions | 🔜 | §2.1 — substrate proven via financier orgs |
| Seller KYB lifecycle & review history | ✅/🟡 | `Organization.kycLevel` engine + `AccountDocument` business docs + audit rows; seller-org formalization with §2.1 |
| Buyer consent / legal acceptance records | 🟡 P2 | §16 |
| RFQ/quote file attachments | ⏭️ | Deferred by product decision (structured specs shipped instead) |
| Financing/accreditation workflow history | ✅/🟡 | §9 — transition tables + audit + per-domain timestamps; event tables P2 |
| Support cases | 🟡 | `ContactMessage` + triage flag today; full helpdesk deferred |
| Retention/export/deletion workflows | 🔜 P2 | §14.3 |

---

## On the recommended action plan (P0/P1/P2)

We broadly accept the reviewer's prioritization with two sequencing amendments grounded in the codebase reality:

**Their P0 → our next schema session (bundled, single push cycle):**
1. ~~Authorization-path audit~~ — done continuously; formalized as the cross-tenant negative test suite (§4).
2. ADMIN bypass retirement — final step only after the 3 shadow-guard fixes + the last bare route; break-glass becomes explicit and audited (§1.1).
3. Accreditation renewal — resolved as design (§5); upgrade path documented.
4. **Float → Decimal + currency columns + `stock` default + CHECK constraints** — the real P0 (§3, §8).
5. Offer→quote-line linkage (§2.2) — small, rides along.
6. **Atomic stock decrements + payout `payoutId: null` re-guard** (§2.4, §2.5) — first code commit of the next session.
7. Token hashing + creds encryption (§14) — same session, low risk.
8. Ownership utilities — already exist (§4); harden with tests.

**Their P1 → our Phase 6 (Commerce Depth):** suborders/fulfillment, payment attempts/refunds with the real gateway, order/payment event history, seller-org staff, checkout idempotency, concurrency test battery.

**Their P2 → hardening/QA passes:** status CHECK constraints if not bundled earlier, JSON normalization where history matters, retention policies, legal-acceptance ledger, index review against production query shapes.

---

## Final verdict — our position

The reviewer's closing sentence is one we can sign:

> *"The schema is broad and thoughtfully structured, but it should be treated as a strong foundation rather than a finished production model."*

That is precisely how it is treated by the people who built it — the schema comments saying "service-enforced," "loose FK," "encrypted-at-rest candidate" are not disclaimers; they are work orders that the service layer has largely executed and this document has inventoried with citations.

Where the review is **substantively right and we act on it**: fixed-precision money with explicit currency (§3), atomic stock/payout concurrency guards (§2.4/2.5), the refund/payment-attempt family (§10), token hashing and creds encryption (§14), signed/authorized serving of vault documents (§15), and the negative cross-tenant test battery (§4).

Where the review **described a gap the code already closes**: self-approval (§1.4), recurring-RFQ idempotency (§12), module-API gating (§13), checklist XOR and document ownership (§6), dispute-seller validation (§10), pricing scope validation and deterministic precedence (§11), payout seller/payment filters (§2.5), and the bulk of the cross-tenant matrix (§4).

Where the review **found a real artifact of the migration in progress**: the three shadowed `requireAdmin()` definitions (§1.1) — a fail-closed defect we located while writing this response and have queued.

And one closing observation in both directions: a schema-only review cannot see the service layer — but conversely, our service layer has been living comfortably with `Float` money because discipline, not structure, was holding it together. The reviewer's best finding is the one that stings precisely because it's structural, and it will be fixed structurally.

*Evidence references in this document are file paths + behavior descriptions from the tree at `0de243d`; all cited guards and services are the sole writers of their entities.*
