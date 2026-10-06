# AUDIT-TENANT-a — Account-Flow Inventory (Tenant-Isolation Audit, Step 1)

**Task ID:** AUDIT-TENANT-a · **Date:** 2026-10 (post UX-FIN-1, post Phase 12) · **Mode:** READ-ONLY — no code changed.
**Scope:** Every registration, upgrade, invitation, and account-activation flow on the VENDORA marketplace, with the exact DB records written, the initial role/membership/status/verification state, pre- vs post-admin-approval visibility, retry/duplicate/logout/re-login behavior, and the org-resolution guard chains of each org-scoped console.
**Method:** Direct source reading. Every claim carries a `file:line` citation. Ambiguities are marked **OPEN QUESTION**.

**Flow count: 12** (10 required by the task brief + 2 additional flows found: admin-side org creation, and email-verification / password-reset / session-kill account-activation adjuncts).

---

## 0. Cross-cutting foundations (apply to every flow)

### 0.1 Session cookie mechanics — `src/lib/auth.ts`

| Fact | Value | Citation |
|---|---|---|
| Cookie name | `vendora_session` (`SESSION_COOKIE`) | auth.ts:26 |
| Token format | `${userId}.${version}.${exp}.${sig}` HMAC-SHA256; legacy 3-part tokens resolve as version 0 | auth.ts:62-70, 72-92 |
| Expiry | 30 days (`MAX_AGE = 60*60*24*30`) | auth.ts:27 |
| Cookie flags | `httpOnly: true`, `sameSite: 'lax'`, `secure: NODE_ENV==='production'`, `path: '/'`, `maxAge: MAX_AGE` | auth.ts:270-276 |
| Registry | Every issued token gets a `SessionRegistry` row (`tokenHash`=SHA-256 of cookie, UA≤400, IP≤64, `mfaSatisfiedAt`, `revokedAt/revokedReason`) — insert is best-effort (`.catch`) | auth.ts:141-156, 277-281; schema.prisma:1431-1447 |
| Suspended users | Session stops resolving (`user.status === 'SUSPENDED'` → null) — effectively signed out everywhere | auth.ts:110-113 |
| Version epoch | `sessionVersion` mismatch kills the token (password reset, sign-out-everywhere, role grant/revoke) | auth.ts:114-116; rbac/service.ts:616, 673 |
| Single-session revoke | `revokeSessionByToken` sets `revokedAt` | auth.ts:158-165 |
| Logout | `POST /api/auth/logout` → revoke the registry row for THIS token (reason `LOGOUT`) then `clearSessionCookie()` (delete cookie) | logout/route.ts:12-13; auth.ts:285-288 |
| Sign out everywhere | `POST /api/auth/sign-out-everywhere` → `sessionVersion++` + all registry rows revoked (`ALL_SESSIONS`), atomic with audit | sign-out-everywhere/route.ts:27-48 |

### 0.2 `/api/auth/me` — session restore payload

`GET /api/auth/me` returns `{ user, applicant }` where `user = toSessionUser(user, buildSessionRbac(user))` (me/route.ts:45-50).
- It does **NOT** return a memberships list. Workspace/org selection is done by separate endpoints: `/api/organizations` (business console, organizations/service.ts:148-157) and `/api/financier/context` (financier console, financing/shared.ts:262-271).
- The user object *indirectly* leaks org ids via `modules.orgs: Record<orgId, moduleKeys[]>` built from **all** OrganizationMember rows regardless of org status (rbac/service.ts:155-169) — `isPlatformStaff` + `permissions` come from platform-scope (`organizationId=''`) UserRole rows only (rbac/service.ts:136-176).
- `applicant` = read-only User financing-profile scalars (me/route.ts:15-43).

### 0.3 Org-context guard chains (the tenant-isolation core)

| Console | How the org is resolved | Citation |
|---|---|---|
| **Financier** (`/api/financier/*`) | `requireFinancierContext(userId)` → `getFinancierContext`: candidate orgs = (a) OrganizationMember rows with role OWNER/ADMIN where org `status != 'SUSPENDED'` and (orgType ∈ BANK/MFI/EWALLET ∪ has FinancierProfile) **∪** (b) orgs reached via org-scoped `financier.*` UserRole rows. Active org = `fin_org` cookie **if it is in the candidate set**, else first membership (oldest). Then module gate `financier-console` (ORG→ORG_TYPE→PLATFORM). The cookie can ONLY be set by `POST /api/financier/context`, which validates the target against the caller's own memberships (403 otherwise). **Org never comes from a client parameter in data queries.** | financing/shared.ts:130-171, 223-256; context/route.ts:40-77 (validation at 54-58, cookie set 61-67) |
| **Seller** (`/api/seller/*`, products/offers) | Org resolved from the caller's `SellerProfile` by `ownerUserId` per call-site — `db.sellerProfile.findFirst({ where: { ownerUserId: user.id } })` — never a client parameter. Payout commission context, subscription ceiling, product count ceiling. | payouts/service.ts:98-113; products/route.ts:299-313; (manual §4.2 confirms per-call-site pattern) |
| **Business/buyer org** (`/api/organizations/*`) | `listMyOrganizations(userId)` — memberships of the session user only; `getOrganization` requires the caller be a member OR hold `orgs.view` platform permission (403 otherwise). Checkout attaches the **first ACTIVE membership** of the session user. | organizations/service.ts:148-157, 159-181; orders/route.ts:270-274 |
| **Admin** (`/api/admin/*`) | `requireAdmin(permission)` — platform-scope RBAC only; throws when called without a permission key (the Phase-6 "no ADMIN bypass" rule). | guards.ts:40-63 |
| Canonical membership predicate | `isActiveMembership` = member row ∧ user ACTIVE ∧ org ACTIVE — the ONE definition; org-scoped role assignment/revoke hard-requires it. | membership.ts:33-58; rbac/service.ts:588-597, 644-650 |

Flag (factual): the `fin_org` cookie is set WITHOUT the `secure` flag (context/route.ts:62-67), unlike `vendora_session` (auth.ts:273). It is `httpOnly`, `sameSite:'lax'`, `path:'/'`, `maxAge: 365d`. Low risk (org id only, membership-validated server-side on every read), but inconsistent with the session cookie hardening.

---

## 1. Individual buyer registration + login (phone-OTP fast path)

| Field | Detail |
|---|---|
| **UI entry** | `AuthModal`, register mode — 2-step wizard. Step 1 "Verify your number": phone + `/api/auth/otp/request` (purpose `REGISTER`) → 6-digit OTP → `/api/auth/otp/verify` → `otpToken`. Step 2 "Your details": name, password, optional email, optional invitation code, terms. Triggered from every `openAuth('register', …)` call site (market header, site header, seller view login redirect, etc.). |
| **Citations** | auth-modal.tsx:40-47 (design header), 162-211 (OTP request/verify), 339-475 (step 1), 478-745 (step 2), 598-641 (optional email), 643-679 (invitation code field), 213-281 (submit → POST /api/auth/register) |
| **API** | `POST /api/auth/register` (src/app/api/auth/register/route.ts); prerequisites `POST /api/auth/otp/request` + `POST /api/auth/otp/verify` (src/app/api/auth/otp/{request,verify}/route.ts; proofs verified by `verifyOtpProof` at register/route.ts:65) |
| **Guards on the route** | CSRF `assertSameOrigin` (register/route.ts:42), rate limit `register` 5/30 min/IP (rate-limit.ts:60; register/route.ts:44), zod schema (register/route.ts:22-37), Yemeni phone normalization 70/71/73/77/78 (register/route.ts:58-64), OTP proof (65-70), email uniqueness 409 (74-79), phone uniqueness 409 (81-87) |
| **DB records created** | ① `User` (tx, register/route.ts:95-107): `name`, `email`(nullable), `phone` (E.164 unique), `phoneVerifiedAt=now`, `kycLevel=1`, `password`=scrypt hash, `role` (BUYER or SELLER from intent), `merchantType`(nullable), `storeName` (`role==='SELLER' ? storeName‖`${name}'s Store` : null`), defaults `status='ACTIVE'`, `sessionVersion=0` (schema.prisma:40-41, 51, 92-95). ② If invitation: `UserRole` (+ `OrganizationMember` role VIEWER when org-scoped) — §8. ③ `AuditLog` `USER_REGISTERED` (136-144) + `ROLE_ASSIGNED` when invited (121-133). ④ `SessionRegistry` row via `setSessionCookie` (162-165; auth.ts:263-283). ⑤ Optional `EmailVerificationToken` + async mail (149-160). **No Organization, no OrganizationMember, no profiles.** |
| **Initial state** | User.status=ACTIVE, role=BUYER, kycLevel=1 (L1 = phone verified), no org/membership; personal-scope module set from PLATFORM chain (rbac/service.ts:160). |
| **Success destination** | `finish(user)`: `setUser` (zustand), close modal, toast; `if (afterAuth) navigate(afterAuth.view, afterAuth.params)` (auth-modal.tsx:141-159). With no `afterAuth` the user stays on the current SPA view. |
| **Before/after approval** | None — buyers are self-serve active immediately (manual §2.1). Marketplace browse/cart/checkout/RFQ/financing applications available at L1 (kycLevel gates: publishing L2, Murabaha checkout L2, business features L3 — manual §2.7). |
| **Retries / duplicates** | Phone taken → 409 "Sign in instead" (81-87); email taken → 409 (74-79); rate limit 5 registrations/30 min/IP (rate-limit.ts:60); OTP code single-use + per-phone/per-day caps in the OTP service (rate-limit.ts:73-74 comments). Failed submit leaves NO partial user (account + invited-role + audit rows commit atomically, register/route.ts:93-146). |
| **Login / re-login** | `POST /api/auth/login`: identifier = phone or email (login/route.ts:25-30, 63-65); suspended → 403 with explicit message + audit (83-96); MFA-enrolled accounts get the `mfaRequired:true` 401 challenge (99-128); stale pre-login token revoked (132); new session cookie + registry row with `mfaSatisfied` (134-138); rate limit 10/10 min/IP reset on success (42, 162). No pending state exists for a buyer — re-login restores the same L1 buyer. |

## 2. Individual registration with SELL intent ("Sell")

| Field | Detail |
|---|---|
| **UI entry** | Same AuthModal step 2 — "I want to…" RadioGroup: `Shop` (BUYER) vs `Sell` (SELLER); choosing Sell reveals the Store-name field. |
| **Citations** | auth-modal.tsx:505-527 (intent radio), 529-550 (store name), 255-267 (payload includes `role`, `storeName`) |
| **API** | Same `POST /api/auth/register` — schema accepts `role: z.enum(['BUYER','SELLER']).optional().default('BUYER')` and `storeName` (register/route.ts:28-29). |
| **DB records** | Identical to Flow 1 except: `User.role='SELLER'`, `User.storeName` set (register/route.ts:103, 105). **No Organization, no OrganizationMember, no SellerProfile are created at registration time.** |
| **Initial state / module access** | User.role=SELLER → seller console nav unlocks (seller-view gate `isSeller = user?.role === 'SELLER'`, seller-view.tsx:171, 356). Seller stats/earnings/products/orders APIs gated on `user.role !== 'SELLER'` → 403 (e.g. seller/profile/route.ts:45-46). |
| **Success destination** | Same as Flow 1. |
| **Before/after verification** | Selling is possible immediately (drafts open to every seller); PUBLISHING is gated: `assertSellerCanPublish` (kycLevel L2) → 400 (products/route.ts:258-264) and new/unestablished sellers route to `PENDING_REVIEW` via `sellerNeedsPublishReview` (products/route.ts:281-290). Verification itself is the admin `SellerProfile.verificationState` (§10.3). |
| **Retries / duplicates** | Same as Flow 1. |
| **⚠ Key finding** | The individual SELLER has **no org tenant until an admin acts**: `SellerProfile` (+ org + OWNER membership) is auto-provisioned defensively ONLY inside admin `setSellerVerification` (vendors/service.ts:274-293) or by the one-shot backfill `scripts/backfill-seller-orgs.ts:132-149`. Until then org-scoped seller features resolve `orgId=null` (payouts/service.ts:108-113 treats it as legacy per-user seller; products/route.ts:299-313 skips the subscription ceiling when no profile). The auto-provisioned org is created with `status: 'ACTIVE'` directly (vendors/service.ts:286) — it never passes through PENDING_VERIFICATION. See OPEN QUESTION Q1. |

## 3. Existing buyer → "Become a seller" upgrade

| Field | Detail |
|---|---|
| **UI entry** | Seller view (`?view=seller`) while `user.role !== 'SELLER'` — "Turn your passion into a store" upsell form (store name + optional bio); `openAuth('login', { view: 'seller' })` for signed-out users. |
| **Citations** | seller-view.tsx:342-353 (sign-in gate), 355-430 (upsell form), 305-331 (`becomeSeller` → POST /api/auth/become-seller) |
| **API** | `POST /api/auth/become-seller` (src/app/api/auth/become-seller/route.ts); body `{ storeName (2-60), storeBio? }` (schema 9-12) |
| **Guards** | CSRF (17); 401 when signed out (20-21); rate limit 5/10 min/user (23); **idempotent** — already-SELLER returns the current user 200 (26-29); admins/staff blocked from downgrading themselves: `role==='ADMIN'` OR any platform-scope UserRole → 403 (30-39) |
| **DB records** | `User.update` only: `role='SELLER'`, `storeName`, `storeBio` (50-57); `AuditLog` `USER_BECAME_SELLER` (59-66). **No org/profile/membership rows** (same tenant gap as Flow 2). |
| **Success destination** | Client `setUser(json.user)` — the seller console renders in place (seller-view.tsx:324). |
| **Pre/post** | Same gates as Flow 2 (L2 publish, PENDING_REVIEW for new sellers). No admin approval required to *become* a seller; verification is separate (§10.3). |
| **Retries** | Idempotent (26-29); rate-limited. |

## 4. Merchant/Dealer COMPANY registration (Buy / Sell / Both)

| Field | Detail |
|---|---|
| **UI entry** | `RegisterCompanyView` (`?view=register-company`), a 5-step resumable wizard (localStorage draft `register-company-draft`). Entry links: site header "Join as Merchant" (site-header.tsx:76-82), marketing `/sell` page CTA (src/app/(site)/sell/page.tsx:98), AuthModal register footer "Merchant/Dealer signup" (auth-modal.tsx:904-916), financier door cross-link (register-financier-view.tsx:540-549). |
| **Citations** | register-company-view.tsx:3-26 (wizard design), 75 (draft key), 439-483 (step 1 = POST /api/auth/register with `role:'BUYER'`, lines 461-471), 378-407 (already-owns-org check via GET /api/organizations), 429-437 (sign-out helper), 528-571 (final submit → POST /api/auth/register/company), 622-659 (success screen → navigate('business')) |
| **API chain** | Step 1 `POST /api/auth/register` (creates the owner as BUYER, signs the wizard in — abandoning leaves a usable buyer account); steps 2-4 KYB uploads `POST /api/documents` (vault `AccountDocument`s owned by the user, register-company-view.tsx:162); step 5 `POST /api/auth/register/company` (src/app/api/auth/register/company/route.ts) |
| **Guards on the company route** | CSRF (86); 401 when not signed in — "Create your owner account first (wizard step 1)" (89-95); rate limit `companyRegister` 5/30 min/**user** (97; rate-limit.ts:75); zod schema 27-41 (`intent ∈ SELL|BUY|BOTH`, `acceptsTerms: literal(true)`) |
| **Idempotency / duplicates** | Owning an org already → returns the existing org with `alreadyRegistered:true` (no error), applying the seller flip (111-138); 409 when the owned org is NOT a COMPANY (i.e. financier owner must use a separate account, 116-121); org slug uniquified `-2, -3…` (54-62) — **no duplicate-org-name guard** (names can repeat); one-owner rule = one org where `OrganizationMember.role='OWNER'` per user. |
| **DB records created** | In one transaction (143-184): ① `Organization`: `name=tradeName`, `slug`, `legalName`, `merchantType`, `orgType='COMPANY'`, **`status='PENDING_VERIFICATION'`** (line 151; schema default, schema.prisma:499), `registrationNumber`, `taxId`, `industry`, `billingAddress` (address+governorate), and `members: { create: { userId, role: 'OWNER' } }` (156). ② `AccountDocument.updateMany` — re-scopes the wizard's uploaded docIds to the new org, ownership-filtered `userId: user.id` (162-169). ③ `User.update`: `merchantType`; if `intent !== 'BUY'` and `user.role === 'BUYER'` → `role='SELLER'`, `storeName = input.storeName ?? input.tradeName` (173-181). Post-tx: ④ `AuditLog` `ORG_REGISTERED_MERCHANT` (186-202); ⑤ Notification `APPLICATION_RECEIVED` linkView `business` (204-211). **No SellerProfile is created** (verification state lives on it only once an admin sets it, §10.3). |
| **Success destination** | Success screen "Application received — pending verification" → CTA `navigate('business')` (open the business console) or back to marketplace (622-659). |
| **Before admin approval** | Business console renders with the org listed (`/api/organizations` returns ALL memberships regardless of org status — organizations/service.ts:148-157); OrgStatusCard shows the pending state (business-view.tsx:626-761). BUT the membership is not "active" (`isActiveMembership` false — org not ACTIVE, membership.ts:33-44), so: org-scoped role assignments are refused (rbac/service.ts:588-597), checkout does NOT attach the org (orders route filters `organization.status:'ACTIVE'`, orders/route.ts:270-274), approvals/credit/B2B pricing inert. Seller console (intent SELL/BOTH) usable for drafts; publishing gates of Flow 2 apply. |
| **After admin approval** | `PATCH /api/admin/organizations/[id]` with `status:'ACTIVE'` (guard `orgs.update`, admin/organizations/[id]/route.ts:17, 31): sets `verifiedAt=now` (organizations/service.ts:500-503), runs `recomputeOrgKycLevel` — org hits kycLevel 3 when a VERIFIED COMMERCIAL_REG/BUSINESS_LICENSE doc exists, which re-raises OWNER/ADMIN members' own user levels (organizations/service.ts:535-542); audit `ORG_VERIFIED` (544-553). Full B2B features unlock (approvals, NET terms, customer groups managed by admins). |
| **Retries / failed registration** | Draft persists per field change (341-357); resubmission is idempotent (above); failed submit toasts the server error and keeps state; rate limit 5/30 min/user. |
| **Logout / re-login mid-wizard** | Steps ≥2 need the step-1 session; a signed-in returning user with a draft is jumped back to the saved step after session resolution (327-338). Signing out offers "Create a fresh owner account" (429-437). |

## 5. Financial institution registration (Bank / MFI / E-wallet)

| Field | Detail |
|---|---|
| **UI entry** | `RegisterFinancierView` (`?view=register-financier`). Entry links: site header "Join as Financier" (site-header.tsx:83-88), `/funding` page CTA (site/funding/sections.tsx:522), AuthModal register footer "Financial institution" (auth-modal.tsx:918-927). |
| **Citations** | register-financier-view.tsx:3-12 (application-only design), 147-195 (submit), 216-260 (success screen → navigate('financier')), 360-437 (signed-in vs fresh-account contact sections), 118-127 (sign-out) |
| **API** | `POST /api/auth/register/financier` (src/app/api/auth/register/financier/route.ts) — schema 34-66: `legalName`, `legalNameEn?`, `orgType ∈ BANK|MFI|EWALLET`, license/CBY/governorate/website, contact person, and (only when signed out) `contactPhone` + `otpToken` + `password`. |
| **Guards** | CSRF (91); rate limit `financierRegister` 5/30 min/**IP** (94; rate-limit.ts:76); when signed out: phone OTP proof required (114-133), phone-taken 409 "Sign in first, then file the application" (134-140), email-taken 409 (141-146); **one-owner rule 409** for any existing OWNER membership — with org-type-aware messages (177-191). |
| **DB records created** | ① (signed-out only) `User`: contact name/phone/email, `phoneVerifiedAt=now`, `kycLevel=1`, scrypt password, **`role='BUYER'`** (147-157) + audit `USER_REGISTERED` via 'financier-door' (158-166) + session cookie (167-170). ② One transaction (199-224): `Organization` — `name=legalName`, `slug`, `legalName=legalNameEn‖legalName`, `orgType=input`, **`status='PENDING_VERIFICATION'`** (206), `website`, `billingAddress=governorate`, `notes` = license expiry + CBY registration + intended services (194-197), `members: { create: { userId: applicant, role: 'OWNER' } }` (210); nested `FinancierProfile` — `licenseNumber`, `regulator='Central Bank of Yemen'` (when license/CBY provided), `contactEmail`, `contactPhone`, `about=description` (211-219; schema.prisma:1540-1571). ③ Audit `ORG_REGISTERED_FINANCIER` with full metadata (226-244). ④ Notification `APPLICATION_RECEIVED` (246-253). |
| **Success destination** | Success screen "Application received — pending Vendora's review", CTA `navigate('financier')` = "Track application status" (UX-FIN-1 change; register-financier-view.tsx:244-247), explainer that the account "stays a buyer account until the institution is activated" (252-256). |
| **Before approval** | Applicant = plain BUYER (L1). Financier console reachable (membership OWNER of BANK/MFI/EWALLET org, not SUSPENDED — financing/shared.ts:130-144) but renders the `ActivationSection` tracker instead of tooling (financier-view.tsx:212-227; activation-section.tsx:6). Services are NOT public (public catalog lists only ACTIVE institutions — register/financier/route.ts:26-29). Buyer dashboard shows the amber pending banner (UX-FIN-1: `financier-pending-banner.tsx`); header menu entries carry pending chips. Institution staff cannot be invited into full roles yet (team management itself requires OWNER/ADMIN — works pre-approval, but the console UI is the activation tracker). |
| **After approval** | Admin `POST /api/admin/financing/institutions/[orgId]/verify` (guard `financing.institutions.manage`, verify/route.ts:11) → `adminSetInstitutionStatus(…,'VERIFY')`: org `status='ACTIVE'` + `verifiedAt` (if unset) + audit `INSTITUTION_VERIFIED` + notifications to all OWNER/ADMIN staff (financing/services.ts:982-1042). Full financier console unlocks (FinancierConsole), services publishable, institution appears in the public directory. |
| **Retries / duplicates** | 409 one-application-per-owner (177-191); slug uniquified; no org-name uniqueness; rate limit 5/30 min/IP. Re-login resumes the pending state (context re-derived every session from memberships; pending banner re-appears). |

## 6. Organization member management (COMPANY orgs — "invitation" is add-by-email, NO token)

| Field | Detail |
|---|---|
| **UI entry** | Business view "Team" section — add-member form (email, role select, job title); only shown when `detail.myRole ∈ {OWNER, ADMIN}` (business-view.tsx:192, 194-230). |
| **API** | `POST /api/organizations/[id]/members` (src/app/api/organizations/[id]/members/route.ts); service `addOrganizationMember` (organizations/service.ts:233-290). Also `PATCH /api/organizations/[id]` = owner/admin approval-threshold self-service (187-231); `GET /api/organizations/[id]` member-or-admin (159-181). |
| **Guards** | CSRF + `requireUser` (members/route.ts:17-21); **actor must be OWNER or ADMIN of THAT org** (organizations/service.ts:243-248); assigner cannot grant OWNER — `ASSIGNABLE_ROLES = ADMIN|BUYER|APPROVER|VIEWER` (organizations/service.ts:15, 238-241); seller-org subscription seat cap `maxUsers` → 402 (members/route.ts:30-41). |
| **DB records** | `OrganizationMember` only: `{ organizationId, userId, role, jobTitle }` (263-271) + audit `ORG_MEMBER_ADDED` (273-281). **No invitation row, no email sent.** |
| **Key behavior — no invitation token** | The invitee **must already have a Vendora account** with that email — unknown email → 404 "No Vendora account uses that email — ask them to register first, then add them." (organizations/service.ts:250-256). Duplicate membership → 409 (258-261). There is no OrganizationMember invitation lifecycle for plain COMPANY orgs — contrast with financier staff (§7) and platform staff (§8) which use `StaffInvitation`. |
| **Initial state for the new member** | Immediate membership (role as assigned, default BUYER). If org is ACTIVE and user ACTIVE → active membership immediately (`isActiveMembership`); no approval step. |
| **What the new member can do** | Business console for that org appears in their `/api/organizations` list; BUYER-role members at/above org `approvalThreshold` route purchases to approval (orders/route.ts:275-286); org-scoped RBAC roles assignable by admins only after the membership is active. |
| **Removal / role changes** | No self-service member removal route found for plain COMPANY orgs — member removal exists in the FINANCIER team surface (§7) and admin-side. **OPEN QUESTION Q4** (see §13). |
| **Retries** | Duplicate → 409; unknown user → 404; seat cap → 402. |

## 7. Financier staff invitations, roles, removal + institution switching

| Field | Detail |
|---|---|
| **UI entry** | Financier console → Team section (`src/components/marketplace/financier/team-section.tsx`); institution switcher in the console topbar (financier-view.tsx:63-77). |
| **API** | `GET/POST/PATCH/DELETE /api/financier/team` (src/app/api/financier/team/route.ts) → `src/server/modules/financing/team.ts` |
| **Guards** | `requireUser` per method (team/route.ts:17, 41, 75, 101); POST rate limit `financier-team:invite` (43); service gate `requireInstitutionAdmin` — caller must be OWNER/ADMIN of the ACTIVE-CONTEXT institution org (team.ts:60-72, which itself goes through `requireFinancierContext`, §0.3). |
| **Invite (POST)** | `inviteInstitutionStaff` (team.ts:140-209): email must be a **non-account** email (existing account → 409 "assign the role to them below instead", 156-159); not already a member (160-164); no open PENDING invite for that email+org (165-168); `roleKey ∈ {financier.admin, financier.underwriter, financier.reviewer, financier.branch-officer}` (20-25, 150-152). Creates `StaffInvitation`: `email`, `name?`, `roleId`, **`organizationId` = the institution org**, `tokenHash = SHA-256(rawToken)` (raw shown ONCE in the response, 170-184, 207), `status='PENDING'`, `invitedBy/invitedByName`, `expiresAt = +7d` (INVITE_TTL_MS, team.ts:17). Audit `INSTITUTION_STAFF_INVITED` (186-194). |
| **Acceptance** | The invitee registers through the normal phone-OTP door (`/api/auth/register`) **with the invitation code + an email that matches the invitation email** — `consumeInvitation(email, token)` (register/route.ts:89-91 → rbac/service.ts:924-949: tokenHash lookup, PENDING, email match, not expired, scope PLATFORM|ORG). Atomic grant at registration: `UserRole { userId, roleId, organizationId }` + `OrganizationMember { role: 'VIEWER' }` (register/route.ts:109-120) + audit `ROLE_ASSIGNED` (121-133). |
| **Resulting access** | The new staff member reaches the financier console via the org-scoped `financier.*` UserRole (financing/shared.ts:145-153) with exactly that role's permissions; the VIEWER membership is the structural hook (console gate = membership ∪ role path). They can appear in `listInstitutionTeam` with granular roles (team.ts:74-138). |
| **Role swap (PATCH)** | `setMemberRole` (team.ts:212-251): cannot change own role; OWNER protected; deletes all `financier.*` UserRoles for that member in the org then creates the new one; audit `INSTITUTION_STAFF_ROLE_CHANGED`. |
| **Remove (DELETE ?memberId=)** | `removeMember` (team.ts:254-282): not self, OWNER protected, transaction deletes org-scoped UserRoles + the membership; audit `INSTITUTION_STAFF_REMOVED`. |
| **Revoke invite (DELETE ?invitationId=)** | `revokeInstitutionInvitation` (team.ts:284-301): only PENDING, org-scoped check (invitation.organizationId === ctx org); sets `status='REVOKED'`; audit `INSTITUTION_STAFF_INVITATION_REVOKED`. |
| **Institution switching** | `POST /api/financier/context { organizationId }` (context/route.ts:40-77): target validated against the caller's own financier-membership set (403 "You are not staff of that institution", 54-58); sets `fin_org` cookie (httpOnly, lax, path /, 365d — no `secure` flag, see §0.3 flag). Every `/api/financier/*` call resolves the active org through the membership-validated cookie (financing/shared.ts:223-236). `GET /api/financier/context` returns `{ context, organizations, activeOrganizationId }` — the workspace list for multi-institution staff (FIN-013). |
| **Retries / duplicates** | Open-invite 409; already-member 409; expired invitations simply fail `consumeInvitation` (return null → registration proceeds WITHOUT the role, no error surfaced — see OPEN QUESTION Q3). |

## 8. Platform staff invitations, RBAC assignment, activation

| Field | Detail |
|---|---|
| **UI entry** | Admin console → Roles & Access tab (`?view=admin&tab=rbac`), sub-views Roles / Platform Staff / Invitations (src/components/marketplace/admin/rbac-tab.tsx:202, 510-514); "Invite staff" dialog (448-482) with copy-token action (498-505: "Registration consumes it automatically via the inviteToken field"). |
| **API** | `GET/POST /api/admin/rbac/invitations`, `DELETE /api/admin/rbac/invitations/[id]` (guards `staff.view|staff.invite|rbac.roles.view|rbac.manage` for GET; `staff.invite|rbac.manage` + **step-up MFA** for POST — invitations/route.ts:9-19, 29-37); assignments `GET/POST /api/admin/rbac/assignments`, `DELETE …/[id]` (`staff.manage|rbac.manage` + step-up — assignments/route.ts:39-43); roles/users endpoints under the same folder. |
| **Service** | `src/server/modules/rbac/service.ts` — `createInvitation` (837-894), `revokeInvitation` (896-916), `consumeInvitation` (924-949), `assignRole` (551-630), `revokeAssignment` (632-684), `listPlatformStaff` (698-750), `listInvitations` (826-835). |
| **Invite (platform scope)** | `createInvitation`: PLATFORM-scope roles only ("Invitations currently target platform roles only", 849); privilege bracketing — cannot invite with a role whose permissions exceed the actor's own (850-853, `ensureWithinBracket` 102-113); protected roles (platform.super-admin, org.owner) invisible/404 to non-super-admins (115-120, 851); email must NOT have an existing account (409, 855-858); one open PENDING invite per email (409, 859-862). Creates `StaffInvitation` with **`organizationId=''`** (platform scope), `tokenHash` (raw shown once), `status='PENDING'`, 7-day TTL (864-893; INVITE_TTL_MS line 52). Audit `STAFF_INVITED` in the same tx (881-889). |
| **Acceptance / activation** | Two paths: ① **At registration** — invitee registers via the phone-OTP door with the emailed raw token + matching email: `consumeInvitation` (register/route.ts:89-91) then atomic `UserRole { userId, roleId, organizationId:'' }` + audit `ROLE_ASSIGNED` (register/route.ts:109-133). The user keeps `User.role='BUYER'` (data only) — staff access derives purely from the assignment (rbac/service.ts:34-36). ② **Existing user** — admin `POST /api/admin/rbac/assignments` → `assignRole`: user must exist + not SUSPENDED (572); legacy ADMIN accounts only assignable by super-admins (575-577); ORG-scope assignments require ACTIVE membership via the canonical resolver (581-597); duplicate triple (userId,roleId,organizationId) → 409 (599-607); the grant bumps `sessionVersion` in the same tx so the user's live sessions re-auth with new permissions (609-627). |
| **Revocation** | `revokeAssignment`: last-active-owner invariant for `org.owner` seats (642-650, membership.ts:98-110); protected seats super-admin-only; privilege bracketing; tx = delete + `sessionVersion++` + audit `ROLE_REVOKED` (669-683). Invitation revoke: PENDING-only, sets REVOKED (896-916). |
| **Initial state / access** | A newly activated staff member: `User.role` unchanged (BUYER typically), `isPlatformStaff=true` in session (`buildSessionRbac`, rbac/service.ts:175), `permissions` = union of the role's permission keys (136-176); admin console nav appears. MFA hints `mfaRequired`/step-up apply to sensitive actions (guards.ts:170-205). |
| **Retries** | Duplicate invitation 409; duplicate assignment 409; expired token silently ignored at registration (consumeInvitation returns null). |

## 9. Existing users who later join or create ANOTHER organization (multi-org)

| Field | Detail |
|---|---|
| **Policy** | Multi-membership ALLOWED: `OrganizationMember.@@unique([organizationId, userId])` only — `userId` alone is not unique (schema.prisma:547). One OWNED org per user enforced at creation time (409). |
| **Create another org** | ① Self-serve `POST /api/organizations` (business console "register a business account" form — business-view.tsx:140-182) → `createOrganization` (organizations/service.ts:96-146): 409 when the user already holds ANY OWNER membership (107-115); creates `Organization` **status='PENDING_VERIFICATION'`** (schema default; service passes no status — schema.prisma:499) + OWNER membership; audit `ORG_CREATED` (135-143). ② Admin-created org (§11) can assign an owner who owns nothing else (checked, organizations/service.ts:371-382). ③ Company wizard/financier door 409s for existing owners (§4, §5). |
| **Join another org** | Added by that org's OWNER/ADMIN via email (§6 — requires an existing account, no invite token); or invited as financier staff of another institution (§7 — StaffInvitation with that org id; the user CAN hold `financier.*` roles in several institutions — the switcher exists exactly for this, FIN-013); or platform admins assign org-scoped roles (RBAC assignments, §8 — requires active membership first, so the admin must also add the membership via §6 or the org team route). |
| **Workspace selection** | Business view: client-side org picker over `/api/organizations` (business-view.tsx:117-131). Financier console: `fin_org` cookie switcher (§7). Checkout: server picks the first ACTIVE membership (orders/route.ts:270-274) — no buyer-org choice at checkout. |
| **Isolation** | Every org-scoped read/write goes through membership checks / the financier context / `sellerOrgId` stamping (manual §2.8; negative suite NEG-01..20 20/20 PASS). No conflict-of-interest guard on joining competing orgs (manual §2.8, §13 Q7) — documented gap. |
| **Retries** | 409 one-owner rule at creation only (a user who lost OWNER status could create a second org; memberships in many orgs are never limited). |

## 10. Account & organization status lifecycle (pending / approved / rejected / suspended / revoked / reactivated)

### 10.1 Organization lifecycle — `Organization.status ∈ PENDING_VERIFICATION | ACTIVE | SUSPENDED | REJECTED` (schema.prisma:499)

| Transition | Who / route | Effect |
|---|---|---|
| (created) PENDING_VERIFICATION | Self-serve doors (§4 §5 §9) | Membership rows exist but `isActiveMembership`=false; org invisible as ACTIVE counterparty |
| → ACTIVE (approve) | Admin `PATCH /api/admin/organizations/[id] {status:'ACTIVE'}` (guard `orgs.update`, admin/organizations/[id]/route.ts:17, 31) OR financier door `POST /api/admin/financing/institutions/[orgId]/verify` (guard `financing.institutions.manage`) | Sets `verifiedAt=now` (organizations/service.ts:500-503); runs `recomputeOrgKycLevel` → org kycLevel 3 with verified business doc, raising OWNER/ADMIN member user levels (535-542); audit `ORG_VERIFIED` (544-553) / `INSTITUTION_VERIFIED` (financing/services.ts:1010-1023) + staff notifications (1024-1042) |
| → SUSPENDED | Same PATCH / `POST …/suspend` | Org frozen: memberships inactive (isActiveMembership false), financier context excludes the org (financing/shared.ts:138, 158), services drop from the public directory (suspend/route.ts:7-9); audit `ORG_SUSPENDED`/`INSTITUTION_SUSPENDED` |
| → REJECTED | Same PATCH (schema enum includes REJECTED, admin/organizations/[id]/route.ts:17) | Financier console shows the REJECTED decline state (financier-view.tsx:216, activation-section.tsx:174-178) |
| → ACTIVE (reactivate) | PATCH back to ACTIVE (re-sets verifiedAt, organizations/service.ts:500-503) / `POST …/suspend?reactivate=true` (suspend/route.ts:20-21 → `adminSetInstitutionStatus(…,'REACTIVATE')`) | Audit `INSTITUTION_REACTIVATED`; staff notified |
| DELETE (revoked) | `DELETE /api/admin/organizations/[id]` (guard `orgs.update`) | 409 when the org has orders/RFQs/price lists/approvals — "Suspend it instead to preserve history" (organizations/service.ts:569-590); otherwise hard delete + audit `ORG_DELETED` (592-602) |

### 10.2 User lifecycle — `User.status ∈ ACTIVE | SUSPENDED` (schema.prisma:41)

| Transition | Who / route | Effect |
|---|---|---|
| → SUSPENDED (vendor/user) | Admin `PATCH /api/admin/vendors/[id] {action:'suspend', reason?}` (guard `vendors.verify`, admin/vendors/[id]/route.ts:23) → `applyVendorAction` (vendors/service.ts:192-201) | `status='SUSPENDED'` + `suspendedAt`; products hidden from public surfaces; **session stops resolving** (auth.ts:110-113) and login blocked 403 (login/route.ts:83-96); audit `VENDOR_SUSPENDED` + notification |
| → ACTIVE (reactivate) | Same route `{action:'reactivate'}` (vendors/service.ts:203-212) | Clears `suspendedAt`; sign-in restored; audit `VENDOR_REACTIVATED` + notification |
| verify / unverify (KYC-lite stamp) | Same route `{action:'verify'|'unverify'}` (vendors/service.ts:170-185) | `User.verifiedAt` — RFQ routing + trust badges; audit `VENDOR_VERIFIED`/`VENDOR_UNVERIFIED` |

### 10.3 Seller verification — `SellerProfile.verificationState ∈ UNVERIFIED | PENDING | VERIFIED | REJECTED` (schema.prisma:1064)

Admin `PATCH /api/admin/vendors/[id]/verification {state, note?}` (guard `vendors.verify`, admin/vendors/[id]/verification/route.ts:21-33) → `setSellerVerification` (vendors/service.ts:264-339): defensively auto-provisions org+profile+OWNER membership for legacy sellers (274-293 — org created **ACTIVE**), updates `verificationState`/`verificationNote`/`verifiedAt`, syncs legacy `User.verifiedAt` (306-309), audits `SELLER_VERIFICATION_SET`, notifies on VERIFIED. **Verification ≠ suspension** — an UNVERIFIED seller still trades (manual §2.5).

### 10.4 Session/credential lifecycle (revocation-adjacent)

`POST /api/auth/logout` (single-session revoke + cookie clear, logout/route.ts:12-13); `POST /api/auth/sign-out-everywhere` (epoch bump + all rows `ALL_SESSIONS`, sign-out-everywhere/route.ts:27-48); role grant/revoke bumps the epoch (rbac/service.ts:616, 673); password reset bumps (per AUTHSEC-1, `src/app/api/auth/{forgot,reset}-password`). **Re-login always resumes the true server state** — org status, memberships, profiles, RBAC are all re-derived from the DB (`buildSessionRbac`, `listFinancierMemberships`, `/api/organizations`), so pending/suspended states re-appear identically after logout+login.

## 11. (Additional flow) Admin-created organizations

`POST /api/admin/organizations` (guard `orgs.view` — admin/organizations/route.ts:51) → `adminCreateOrganization` (organizations/service.ts:309-422): any `orgType` incl. BANK/MFI/EWALLET; **status starts ACTIVE by default** ("Admin-created orgs are trusted", 334-339) with `verifiedAt` set (397); optional `ownerEmail` resolved to an existing account (404 otherwise, 361-370) with the one-owner rule checked (371-382); OWNER membership created in the same tx (401); audit `ORG_CREATED_ADMIN` (411-419). UI: admin console Organizations tab create dialog (`src/components/marketplace/admin/organizations-tab.tsx`). Note the permission asymmetry: creation is gated on `orgs.view`, not `orgs.update` (factual observation; the console gates the tab by permissions — see OPEN QUESTION Q5).

## 12. (Additional flow) Account-activation adjuncts: email verification, password reset

- **Email verification**: optional email at registration issues an `EmailVerificationToken` + mail with `/?view=verify-email&token=…` (register/route.ts:148-160); consumed by `POST /api/auth/verify-email/confirm` (route folder exists, view `verify-email` in the SPA View union, marketplace.ts:83). Sets `User.emailVerifiedAt` (serialized in `toSessionUser`, auth.ts:243).
- **Password reset**: `POST /api/auth/forgot-password` → `reset-password` views (`view=reset-password`, `resetVia phone|email` params, marketplace.ts:101-105) — AUTHSEC-1 epoch bump kills old sessions.

---

## 13. OPEN QUESTIONS (with what was found)

1. **Individual-seller org tenant gap.** Register-with-Sell-intent (Flow 2) and become-seller (Flow 3) set only `User.role='SELLER'`; the `SellerProfile`+`Organization`+OWNER membership are created lazily by admin verification (`setSellerVerification`, vendors/service.ts:274-293) or the one-shot `scripts/backfill-seller-orgs.ts` — and the auto-provisioned org is created `status:'ACTIVE'` (vendors/service.ts:286), skipping `PENDING_VERIFICATION` entirely. Until then, org-scoped paths treat the seller as `orgId=null` (payouts/service.ts:108-113, products/route.ts:299-313). Question for the tenant audit: is the intended invariant "every seller has an org tenant"? If yes, the self-registration paths don't enforce it at write time.
2. **`fin_org` cookie not `secure`-flagged** in production (context/route.ts:62-67) vs `vendora_session` (auth.ts:273). httpOnly+membership-validated on read mitigates; flagged for the security section of this audit.
3. **Expired/invalid invitation tokens are silently ignored at registration** — `consumeInvitation` returns null and registration proceeds with NO role and NO user-visible warning (register/route.ts:91; rbac/service.ts:940-942). Also the invitation is marked ACCEPTED *before* the user row is created (register/route.ts:91 vs tx at 94-146) — if the tx fails, the invitation is burned. Minor UX/robustness gap, no isolation impact.
4. **No self-service member removal/role-change route for plain COMPANY orgs** (only the financier team surface §7 and admin-side actions remove memberships; `assertNotLastActiveOwner` exists for the admin path, membership.ts:98-110). Whether a COMPANY OWNER/ADMIN can remove a staff member from the business console: **not found** — the UI shows members but I found no DELETE route under `/api/organizations/`. OPEN for the next audit step to confirm by E2E.
5. **Admin org creation uses `orgs.view` permission** (admin/organizations/route.ts:51) while every other org mutation uses `orgs.update` — asymmetry worth confirming as intentional (read-permission holders can create+activate orgs via API).
6. **`buildSessionRbac` module resolution fails OPEN** ("fail open (all on)" — rbac/service.ts:170-173) on module-service errors, while `requireModule` fails CLOSED on unknown keys (guards.ts:118-130). Both are documented in-code; the tenant audit should note the divergent failure modes (session payload optimistic, route gate strict).
7. **Conflict-of-interest**: no guard prevents one user holding staff roles in two competing selling/financing orgs (manual §2.8 documents this as a known accepted gap) — listed for completeness, not newly discovered here.

---

## 14. Summary matrix — flow × entry × API × records × pre-approval visibility

| # | Flow | UI entry (view) | API route(s) | Records written | State after flow | Pre-approval visibility | Approval step / approver |
|---|---|---|---|---|---|---|---|
| 1 | Individual buyer register + login | AuthModal (register) — any surface | POST /api/auth/register (+ /api/auth/otp/*) | User (BUYER, kycLevel 1, ACTIVE) + SessionRegistry + audit | Buyer, no org | n/a — instantly active | none |
| 2 | Individual register with Sell intent | AuthModal step 2 "Sell" | POST /api/auth/register (role=SELLER) | User (SELLER + storeName) | Seller, **no org/profile yet** | Seller console usable; publish gated L2 + PENDING_REVIEW | Seller verification via admin (SellerProfile) |
| 3 | Buyer → become-seller | ?view=seller upsell | POST /api/auth/become-seller | User.update → SELLER | same as #2 | same as #2 | same as #2 |
| 4 | Merchant/dealer company (Buy/Sell/Both) | ?view=register-company (5-step wizard) | POST /api/auth/register (step1) + POST /api/auth/register/company | Organization (COMPANY, PENDING_VERIFICATION) + OrganizationMember OWNER + doc re-scope + User flip (SELL/BOTH) + audit + notification | Owner of pending org (+seller when SELL/BOTH) | Business console + pending OrgStatusCard; org features inactive (isActiveMembership false); seller drafts ok | Admin PATCH org → ACTIVE (orgs.update) |
| 5 | Financier institution (Bank/MFI/E-wallet) | ?view=register-financier | POST /api/auth/register/financier (+optional user creation inside) | User (BUYER, new applicants) + Organization (BANK/MFI/EWALLET, PENDING_VERIFICATION) + Member OWNER + FinancierProfile + audit + notification | Buyer account owning a pending institution | Buyer dashboard + amber pending banner + ActivationSection tracker; services NOT public; console = tracker only | Admin verify (financing.institutions.manage) → ACTIVE |
| 6 | COMPANY org member add | ?view=business Team section | POST /api/organizations/[id]/members | OrganizationMember (ADMIN/BUYER/APPROVER/VIEWER) + audit | Immediate membership | Immediate (no approval); role active only while org+user ACTIVE | none (existing-account-only, no invite token) |
| 7 | Financier staff invite / swap / remove / switch | Financier console Team + switcher | /api/financier/team (GET/POST/PATCH/DELETE) + /api/financier/context (POST switch) | StaffInvitation (org-scoped, tokenHash, 7d) → at acceptance UserRole (financier.*) + OrganizationMember VIEWER; membership/UserRole deletes on removal; fin_org cookie on switch | Staff member of institution(s) | Console visible pre-approval (tracker); financier.* role grants console + permissions after org ACTIVE | Inviter = OWNER/ADMIN of the institution |
| 8 | Platform staff invite / RBAC assign / activation | Admin → Roles & Access (rbac tab) | /api/admin/rbac/invitations (+[id] DELETE), /api/admin/rbac/assignments (+[id]) | StaffInvitation (organizationId '', tokenHash, 7d) → UserRole (platform scope) at registration; UserRole + sessionVersion bump on assign/revoke | Platform staff (isPlatformStaff true), User.role stays BUYER | Admin console + permission-scoped surfaces immediately after grant/accept | Actor = staff.invite/rbac.manage holder (+ step-up MFA) |
| 9 | Join / create another org (multi-org) | Business console create form; invitations | POST /api/organizations; member-add; financier invites | Organization (+OWNER member) for creates; OrganizationMember / UserRole for joins | Multi-membership allowed; one OWNED org per user | New org pending like #4; joins active per target org | same as #4/#5 per org type |
| 10 | Status lifecycle (approve/reject/suspend/reactivate/delete) | Admin console (Organizations / Vendors / Financing→Institutions) | PATCH /api/admin/organizations/[id]; POST /api/admin/financing/institutions/[orgId]/{verify,suspend}; PATCH /api/admin/vendors/[id](/verification) | Organization.status/verifiedAt; User.status/suspendedAt/verifiedAt; SellerProfile.verificationState; audits + notifications; KYC recompute on activate | see §10 | SUSPENDED orgs: memberships inactive, financier context excludes, services unlisted; SUSPENDED users: session dead + login 403 | Admins (orgs.update / financing.institutions.manage / vendors.verify) |
| 11 | Admin-created organization | Admin console Organizations | POST /api/admin/organizations | Organization (+ optional OWNER member) — starts ACTIVE + verifiedAt | Trusted tenant immediately | n/a — active at birth | creator (orgs.view holder) |
| 12 | Email verification / password reset / session kill | ?view=verify-email / reset views; Settings→Security | /api/auth/verify-email/*, /api/auth/{forgot,reset}-password, /api/auth/sign-out-everywhere | EmailVerificationToken / PasswordResetToken / sessionVersion + SessionRegistry revocations | Verified-email account / fresh credentials / all sessions dead | n/a | self-service (token-bound) |

**END OF INVENTORY — AUDIT-TENANT-a step 1.** Next step for the tenant-isolation audit: negative cross-tenant probes per flow (org-scoped endpoints × wrong-org member), seeded from the guard chains documented in §0.3.
