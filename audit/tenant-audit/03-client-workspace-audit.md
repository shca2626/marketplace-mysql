# AUDIT-TENANT-c — Client State, Workspace Selection & Post-Registration Destinations

- **Project:** VENDORA marketplace (`/home/z/my-project`, Next.js 16 App Router, SPA at `/market` driven by `navigate(view, params)`; zustand store `src/store/marketplace.ts`; admin console `?view=admin&tab=<key>`)
- **Agent:** read-only UX/state auditor (AUDIT-TENANT-c)
- **Scope:** client-side persistence, logout hygiene, account/workspace switching, post-registration destinations, stale-state matrix, browser caching, polling scoping. **No code changed.**
- **Context:** follows UX-FIN-1 (financier pre-approval UX fixes — worklog.md:1110-1133), which fixed the financier post-registration destination and the admin org-manage dialog. This audit checks the OTHER flows and the state layer underneath.

---

## 1. Zustand persist — what lives in the browser

### 1.1 The store slice

`src/store/marketplace.ts:174-424` — single `useMarketplace` store with `persist` middleware:

| Persisted? | Key / field | Evidence |
|---|---|---|
| **YES** | `vendora-store` → `cart`, `savedForLater`, `recentlyViewed`, `currencyPref` | marketplace.ts:412 (`name: 'vendora-store'`), marketplace.ts:414-419 (`partialize`) |
| no | `user`, `authChecked` (session restored per boot via `/api/auth/me`) | marketplace.ts:414-419 (excluded from partialize) |
| no | `view`, `params` (incl. `adminTab`) — URL is the source of truth | marketplace.ts:242-263 (`navigate` pushes `?view=…`); parseLocation on boot |
| no | `settings`, `slides` — "never persisted (server is truth)" | marketplace.ts:275-281 |
| n/a | favorites — server-side only, scoped by session `userId` | api/favorites/route.ts:15,45,53 |
| n/a | activeOrgId — NOT in the store at all (see §2) | — |

**Sensitive data cached client-side?** No. Documents, financing applications, financier data are never written to localStorage — they live only in component state behind `cache: 'no-store'` fetches (e.g. use-api.ts:21). The hydration write-gate (marketplace.ts:13-48) only protects cart serialization. The one genuinely *private* thing cached client-side is the **support-chat session** (§1.2 C-1).

### 1.2 Full inventory of localStorage keys

| Key | Contents | Cleared on logout? | Evidence |
|---|---|---|---|
| `vendora-store` | cart, savedForLater, recentlyViewed, currencyPref | **NO** | marketplace.ts:412-419 |
| `vendora_chat_token` / `vendora_chat_name` | support-chat session token + visitor name | **NO** | support-widget.tsx:25-26, 66-79 |
| `register-company-draft` | company wizard draft: owner name/phone/email, legal/trade name, registration no., tax id, industry, governorate, address, doc refs, store intent | **NO** | register-company-view.tsx:75, 297-325, 341-357 |
| `vendora_active_org` | last org chosen in the RFQ flow | **NO** | b2b/b2b-shared.tsx:118-135 |
| `vendora-notifications-seen` | `orderId:status` seen-keys for derived order toasts | **NO** | notifications-bell.tsx:54, 304-319 |
| `vendora_display_currency`, `vendora_fx_cache` | display currency + 10-min public FX cache | NO (benign prefs / public data) | currency-context.tsx:63-64, 118-175 |
| `vendora.console.sidebar.collapsed`, `theme`, `vendora-store-cover:<sellerId>` | UI preferences | NO (benign) | dashboard-sidebar.tsx:18; storefront-theme.tsx:78; store-covers.tsx:66 |
| (cookie) `fin_org` | active financier institution, httpOnly, **365 days** | **NO** — logout only deletes `vendora_session` | api/financier/context/route.ts:62-67; lib/auth.ts:285-288 |

Plus sessionStorage `rfq-prefill` (b2b-shared.tsx:139-159) — dies with the tab.

### 1.3 Logout flow trace (server + client)

1. **Server** — `POST /api/auth/logout` (api/auth/logout/route.ts:5-15): revokes the exact session registry row (`revokeSessionByToken`, auth.ts:158-165) then `clearSessionCookie()` (auth.ts:285-288, deletes `vendora_session` only). Correct and minimal.
2. **Client** — four logout call sites, all identical pattern:
   - market header: `fetch('/api/auth/logout'); setUser(null); navigate('home')` — header.tsx:102-106
   - dashboard topbar (all consoles incl. admin/financier): same — dashboard-topbar.tsx:62-66
   - marketing site header: `fetch(...); setUser(null)` — no navigation — site-header.tsx:141-148
   - "Not you? Sign out" inside both register doors: `fetch(...); setUser(null)` — register-financier-view.tsx:118-127; register-company-view.tsx:429-437

   **None of them** call `useMarketplace.persist.clearStorage()`, `localStorage.removeItem`, or reset cart/savedForLater/recentlyViewed (grep over `src/` finds zero `clearStorage`/store-reset calls anywhere). The `fin_org` cookie is not cleared either.

3. **Answer to the audit question — after logout, does the next login inherit the previous user's state?**
   - **cart + savedForLater: YES** (persisted + never cleared → first checkout by user B places user A's lines as B's order, checkout-view.tsx:308-337).
   - **recentlyViewed / currencyPref: YES** (cosmetic).
   - **view/admin tab: NO** — `view` is not persisted; in-SPA logout forces `navigate('home')` (header/topbar), which also wipes `params` incl. `adminTab`; a fresh page load boots from the URL. Site-header logout doesn't navigate, but its pages don't render `?view=` anyway.
   - **favorites / notifications / orders: NO** — server-side, scoped by session `userId` (api/favorites/route.ts:15,45,53; api/notifications/route.ts:6-10).
   - **active org: NOT inherited dangerously** — `vendora_active_org` is only honored if the id exists in the *new* user's org list (b2b-shared.tsx:123-126); same fail-safe for the `fin_org` cookie (financing/shared.tsx:223-236 — validated against `listFinancierMemberships(user.id)` before use).
   - **support chat: YES — worst case** (see C-1).
   - **register-company draft: YES** (see H-2).

---

## 2. Findings table

Severity scale: **CRITICAL** = cross-user state inheritance after logout/switch · **HIGH** = workspace confusion causing wrong-tenant calls/attribution · **MEDIUM** = stale state · **LOW** = polish.

| # | Sev | Finding | Evidence | Current behavior | Recommended fix |
|---|---|---|---|---|---|
| C-1 | **CRITICAL** | Support-chat session (`vendora_chat_token` + name) survives logout and is inherited by the next user on the same browser | support-widget.tsx:25-26 (keys), 53 (token bootstrapped from storage), 59-60 (name/phone prefill from *current* user), 66-79 (persist); no logout path removes it (§1.3) | User A chats with support (may paste order numbers, phones, business context). A logs out; B logs in on the same browser and opens the widget → **B sees A's entire conversation and continues A's thread** — prefilled with B's name, so support also mis-attributes the thread. This is cross-user *conversation content* inheritance. | On logout (all 4 call sites) remove `vendora_chat_token`/`vendora_chat_name`; better: clear them in a shared `signOut()` helper that also runs `useMarketplace.persist.clearStorage()` + the §1.2 key sweep. Optionally key the chat token per user id. |
| H-1 | **HIGH** | Cart / savedForLater / recentlyViewed inherited across users after logout→login | marketplace.ts:414-419 (persist slice); no clear in header.tsx:102-106, dashboard-topbar.tsx:62-66, site-header.tsx:141-148, register-*-view.tsx:429-437/118-127; checkout-view.tsx:308-337 posts the cart to `/api/orders` attributed to the session user | Cross-user commerce-state inheritance: B's first order silently contains A's lines (incl. vendor-offer lines with negotiated prices, marketplace.ts:295-336). Not sensitive data, but real order consequences and a classic shared-browser (office/kiosk) hazard. | On login (`finish()`, auth-modal.tsx:141-158) compare the incoming user id to the previous one; if it changed, `clearCart()` + drop `savedForLater`/`recentlyViewed`. (Keep the guest-cart-across-visits behavior when the identity is unchanged.) |
| H-2 | **HIGH** | Company-registration draft restores for ANY next user | register-company-view.tsx:75 (`register-company-draft`), 297-325 (restore), 341-357 (persist on every keystroke) | User B opening the Merchant/Dealer door on a browser where A abandoned the wizard gets **A's legal name, registration number, tax id, industry, governorate, address and contact email/phone pre-filled**. Mitigations already present: step jump requires being signed-in as the step-1 account (register-company-view.tsx:329-338) and docIds are ownership-filtered server-side (api/auth/register/company/route.ts:163-165), so the *submission* is safe — the leak is the form content. | Store the draft keyed by the step-1 owner id (`register-company-draft:<userId>`), and/or delete the draft on logout. |
| H-3 | **HIGH** | Checkout attributes orders to the FIRST active org — the user's chosen "active org" is ignored | api/orders/route.ts:268-288 (`findFirst({ userId, organization: { status: 'ACTIVE' } })` → `organizationId: orgId`); contrast rfq-view.tsx:262-265 + b2b-shared.tsx:118-135 (`vendora_active_org` honored for RFQs) and product-view.tsx:158-160 (same for RFQ-from-product) | A user in 2+ orgs (buyer org + staff elsewhere; the platform explicitly supports multi-org) cannot choose which org an order belongs to; it silently goes to whichever membership `findFirst` returns. The RFQ flow honors a remembered org, checkout doesn't — same user, two different "active org" notions. Approvals/contract pricing attach to a possibly unintended tenant. | Pass the active org id from the checkout (reuse `defaultActiveOrg()` on the org list) to `POST /api/orders`, and validate membership + ACTIVE server-side; or render an explicit org selector on checkout when >1 active membership. |
| H-4 | **HIGH** | Pending **company** application has no persistent trace on the buyer dashboard — asymmetric with the just-fixed financier flow | financier-pending-banner.tsx:37-46 (renders only for `PENDING_VERIFICATION`/`REJECTED` **financier** context); buyer-dashboard.tsx:214 (mounts only `FinancierPendingBanner`); the company applicant's only persistent affordance is account menu → "Business Account" (header.tsx:316-320) | A merchant applicant lands on the business console once (register-company CTA), sees the amber "We're reviewing your business" card (business-view.tsx:761-786) — good. But after they navigate away, the buyer dashboard/account overview shows **nothing** about their pending company (no banner, no card), exactly the pattern UX-FIN-1 just fixed for financiers. Rejected companies equally invisible (business-view.tsx:843-852 exists only inside the business console). | Generalize the pending banner into an org-status banner (financier AND merchant orgs) on the buyer dashboard; or add an OrgStatusCard summary to the account overview fed by `/api/organizations`. |
| M-1 | **MEDIUM** | No periodic revalidation of session/role/membership — server-side approvals require a reload | marketplace-app.tsx:119-144 (`/api/auth/me` once at boot, 3-retry only on transport errors); site-header.tsx:112-119 (once at mount); use-api.ts:37-50 (refetch only on url/skip change); the 45s poll covers only `/api/notifications` (notifications-bell.tsx:331-338) | Financier approval granted mid-session: the header's financier-context fetch (header.tsx:73-76) is stale — the amber "pending" chip stays after activation and the "(pending)" suffix on site-header.tsx:186 persists; the UX-FIN-1 E2E itself had to re-login to see the activated console (worklog.md:1128). Views that fetch on mount (FinancierView financier-view.tsx:147-150; BusinessView business-view.tsx:113-131) show fresh status once the user navigates there — only always-mounted chrome (header) is stale. | Poll `/api/auth/me` (or just `/api/financier/context` for staff) on an interval or on `visibilitychange`→visible; or refetch the header context when the notification poll sees a `VENDOR_STATUS`/`APPLICATION_RECEIVED`-adjacent event. |
| M-2 | **MEDIUM** | Three different, uncoordinated org-selection mechanisms | (1) RFQ/product flows: localStorage `vendora_active_org` via `defaultActiveOrg()` (b2b-shared.tsx:118-135; rfq-view.tsx:178-183, 262-265; product-view.tsx:158-160). (2) Business console: local `selectedId` state, defaults `orgs[0]`, ignores the remembered org and doesn't prefer ACTIVE (business-view.tsx:118-120, 422-433). (3) Financier console: server `fin_org` cookie (api/financier/context/route.ts:40-77) | The same user can have three different "active orgs" depending on surface; the business console forgets the selection on every mount. Not a security issue — every org-scoped API re-validates membership per request (api/organizations/[id]/route.ts:14; financing/shared.ts:242-256) — but it is workspace confusion. | Promote `activeOrgId` to the store (per-user keyed), have all three surfaces read/write it; keep server re-validation as is. |
| M-3 | **MEDIUM** | `fin_org` cookie (365d) not cleared on logout | api/financier/context/route.ts:62-67 (maxAge 1y); auth.ts:285-288 clears only `vendora_session` | Fail-safe (validated against the new user's memberships, financing/shared.tsx:223-236 — a stale cookie falls back to the new user's first institution) but on shared browsers the previous user's institution stays pre-selected for the next financier. | Clear `fin_org` in the logout route, or scope it `maxAge` shorter / per-session. |
| M-4 | **MEDIUM** | Org suspension / pending→rejected while logged in: UI only updates on next view mount; financier banner doesn't cover SUSPENDED | auth.ts:104-128 (session resolution checks only `user.status === 'SUSPENDED'`, not org status); financier-pending-banner.tsx:46 (only PENDING_VERIFICATION/REJECTED); financing/shared.ts:138,158 (SUSPENDED orgs are dropped from memberships) → financier-view.tsx:184-192 renders the generic "Financier staff access required" AccessDenied with no suspension explanation; business console SUSPENDED/REJECTED cards exist but only inside the console (business-view.tsx:833-852) | A suspended financier's console flips to a misleading "not staff" screen instead of "your institution is suspended"; a suspended/rejected merchant org gets no surface-level notice until they visit the business console. Server-side per-request gates are correct (services hidden from the marketplace when org ≠ ACTIVE, financing/services.ts:561,593,603). | Extend the financier banner's red variant to SUSPENDED, and have `FinancierView`/`SignInRequired` differentiate "suspended institution" from "not staff" (the context could return the suspended org with its status). |
| M-5 | **MEDIUM** | Buyer register with "Sell" intent lands nowhere useful | auth-modal.tsx:505-550 (intent radio `BUYER/SELLER` + store name), 141-158 (`finish` only navigates `afterAuth` — never set on register; all `openAuth('register')` calls pass no afterAuth, site-header.tsx:425) | A seller-intent registrant is auto-logged-in as SELLER (api/auth/register/route.ts:28,105,162) and left staring at the page they were on — no seller console, no onboarding, no "your store is live". | In `finish()`, navigate new sellers to `navigate('seller')` (mirroring `openAuth('login', { view: 'seller' })` used elsewhere, seller-view.tsx:348). |
| L-1 | LOW | `vendora-notifications-seen` keeps the previous user's `orderId:status` keys | notifications-bell.tsx:54, 304-319 | No content leak (opaque ids); new user's badge math uses their own ids. Dead weight only (capped at 200, line 315). | Clear on logout with the shared sign-out helper. |
| L-2 | LOW | Benign cross-user preference residue | currency-context.tsx:63-64; storefront-theme.tsx:78; dashboard-sidebar.tsx:18; store-covers.tsx:66 | Theme/currency/sidebar-collapse/cover picks persist across users — acceptable UX pattern. | None required (optionally reset display currency per user). |
| L-3 | LOW | Site-header logout leaves the user in place with no feedback | site-header.tsx:141-148 | Unlike the market header (navigate('home'), header.tsx:105), the marketing-page logout just closes the menu. | Toast "Signed out" + navigate to `/`. |

### Verified-clean (no findings)

- **No sensitive user/org/financier data in localStorage** — persist slice is cart-level only (marketplace.ts:414-419); documents/applications live server-side; vault media served through one-time proxies (per AUDIT-MANUAL-1).
- **No service workers** (`public/` = logo/robots/uploads only); **no `force-cache` / `next` revalidate tags on private data** — the only `Cache-Control: public` routes are public FX/currency/modules data (api/settings/currency/route.ts:11, api/fx/route.ts:12, api/modules/route.ts:14); every private fetch uses `cache: 'no-store'` (use-api.ts:21, marketplace-app.tsx:126,149).
- **Notification & chat polling are server-scoped, no client userId passed**: bell polls `/api/notifications?limit=20` every 45s (notifications-bell.tsx:331-338) and the server scopes by `getSessionUser().id` (api/notifications/route.ts:6-10); support-widget polls token-scoped visitor chat, 5s, visible-tab only (support-widget.tsx:121-134).
- **Institution switcher is cache-safe**: switching sets the httpOnly `fin_org` cookie then does a full `window.location.reload()` (financier-view.tsx:62-78) — no in-flight request or client cache survives; membership re-validated per request (financing/shared.ts:242-256; api/financier/context/route.ts:54-58 additionally 403s a non-staff target on switch).
- **`/api/auth/me`** returns the user + RBAC + per-org module map but **no membership list** (lib/auth.ts:194-257) — org lists come from `/api/organizations` (business console, rfq, register-company's owned-guard) and `/api/financier/context` (financier orgs). Sufficient for the current switchers; a global header-level workspace picker would need one merged endpoint.

---

## 3. Workspace-switch affordances (every one)

| Affordance | Location | What it switches | Where stored |
|---|---|---|---|
| Institution switcher (Select, multi-org staff only) | financier console topbar | active financier org → sets `fin_org` cookie + full reload | server cookie (365d) — financier-view.tsx:62-102 |
| Organization selector (Select, shown when `orgs.length > 1`) | business console ("Viewing …") | which org's status/members/groups the console displays | local component state only — business-view.tsx:416-434 |
| Org select in the RFQ create form | RFQ view | which org the RFQ is submitted for; remembered | localStorage `vendora_active_org` — rfq-view.tsx:262-265 |
| Org resolution when starting an RFQ from a product page | product view | pre-picks the remembered/first ACTIVE org for the RFQ form | `defaultActiveOrg()` — product-view.tsx:158-160 |
| Account menu (market header) | header.tsx:269-337 | *navigation between surfaces*, not org identity: Admin dashboard (ADMIN/staff), Seller dashboard (SELLER), My dashboard, Financier console (staff, with pending chip), My Orders, RFQs, Favorites, Business Account (module-gated), Account settings, Start selling | — |
| Account links (marketing site) | site-header.tsx:172-197 | same surface navigation incl. "Financier console (pending)" | — |

Note: there is **no single "switch workspace" affordance** — buyer→seller→financier→admin are separate menu destinations, and org identity is per-surface. Combined with M-2/M-3 this is coherent enough for single-org users, confusing for multi-context users.

---

## 4. Stale-state matrix

| Scenario | Store / persisted | Active view | Admin tab | Cart | Favorites | Status surfaces |
|---|---|---|---|---|---|---|
| **(a) logout → login as different user (same browser)** | `user` swapped via setUser; cart/savedForLater/recentlyViewed/currencyPref **inherited** (H-1); chat token **inherited** (C-1); company draft **restored** (H-2); `vendora_active_org`/`fin_org` carried but membership-validated (safe) | reset to `home` on market/console logout (header.tsx:105, dashboard-topbar.tsx:65); site-header logout doesn't navigate (L-3); URL is truth after reload | wiped with `params` on `navigate('home')`; not persisted | **inherited** | NOT inherited (server-side per userId, api/favorites/route.ts:15) | fresh per view mount |
| **(b) role/membership granted server-side (e.g. financier approval)** | `/api/auth/me` fetched **once** per boot (marketplace-app.tsx:119-144) — role badge, module gates (`moduleOn`, header.tsx:89-101) and the financier console entry stay stale until reload; header's `/api/financier/context` also mount-once (header.tsx:73-76) | unaffected | unaffected | unaffected | unaffected | FinancierView + BusinessView + buyer-dashboard banner refetch on mount → navigating there shows fresh status without re-login; the always-mounted header chip is the stale piece (M-1) |
| **(c) org suspended while logged in** | session survives (auth.ts:113 checks only user SUSPENDED); org drops out of financier memberships (financing/shared.ts:138,158) → console flips to generic "staff access required" AccessDenied (financier-view.tsx:184-192) with no suspension explanation (M-4) | unaffected | unaffected | unaffected | unaffected | business console shows the SUSPENDED card on next mount (business-view.tsx:833-841); server correctly hides financier services org-wide (financing/services.ts:561,593,603,662) |
| **(d) pending → rejected while logged in** | financier: banner has a red REJECTED variant + tracker CTA, header/site chips show REJECTED — but only after the owning component remounts (no polling) (financier-pending-banner.tsx:46-91; header.tsx:80-82,297-301) | unaffected | unaffected | unaffected | unaffected | financier ActivationSection shows decline state on view mount (financier-view.tsx:216-227); merchant orgs: REJECTED card only inside the business console (business-view.tsx:843-852), nothing elsewhere (H-4) |

---

## 5. Browser cache & service workers

- No service workers registered anywhere (`public/` contains no sw.js; no `navigator.serviceWorker` in `src/`).
- No `fetch(..., { cache: 'force-cache' })` and no Next `revalidateTag` usage on private data. The only HTTP-cached endpoints are public reference data with `Cache-Control: public, max-age=60, stale-while-revalidate=300` (settings/currency, fx, modules). All private traffic is `no-store` (use-api.ts:21).
- `getSessionContext` is per-request `cache()`d server-side (auth.ts:134) — request-scoped React cache, not a browser cache; role changes apply on the next request, in line with §4(b).

## 6. Notification / chat polling scoping

- **Bell**: `/api/notifications?limit=20` every 45s + `/api/orders` on open (notifications-bell.tsx:328-338, 350-355). No client userId is ever passed — the route resolves `getSessionUser().id` (api/notifications/route.ts:6-10). Read-marks POST ids only (notifications-bell.tsx:361-392). ✓
- **Support widget**: token-scoped visitor chat, 5s poll while open, visible tabs only (support-widget.tsx:121-134). The token is intentionally a visitor identity — which is exactly why C-1 matters. ✓ server-side; ✗ logout hygiene.

---

## 7. Destination map — flow → where the user lands → do they see THEIR OWN status?

| Flow | Success behavior | Landing surface | Shows their own status? |
|---|---|---|---|
| **Buyer register** (auth modal; site-header "Create account" site-header.tsx:425) | auto-login (api/auth/register/route.ts:162), toast only; `finish()` navigates only when `afterAuth` set — never on register (auth-modal.tsx:141-158) | stays on the current page | N/A (nothing pending for a plain buyer) — but no onboarding/welcome destination either |
| **Buyer register with "Sell" intent** (auth-modal.tsx:505-550 → role SELLER) | auto-login as SELLER, toast | stays on the current page — **seller console never opened** (M-5) | ✗ no seller onboarding/status trace |
| **register-company** (Merchant/Dealer door) | step 1 auto-creates + logs in the owner account (register-company-view.tsx:440-483); final submit clears draft, success screen "Application received — status: pending verification" (622-663) | CTA "Open the business console" → `navigate('business')` → OrgStatusCard amber "We're reviewing your business" (business-view.tsx:761-786) | ✓ inside the business console; ✗ **no persistent trace on the buyer dashboard** once they leave (H-4) |
| **register-financier** (institution door) | auto-login + success screen "Track application status" → `navigate('financier')` → ActivationSection tracker (register-financier-view.tsx:244-256; financier-view.tsx:216-227); banner on buyer dashboard + chips in both headers | financier view (pending tracker) | ✓✓ fully traced (UX-FIN-1) — banner (financier-pending-banner.tsx), business-console card (business-view.tsx:700-758), header chips (header.tsx:294-303, site-header.tsx:182-190) |
| **become-seller** (seller-view upsell, seller-view.tsx:305-331) | instant upgrade: `setUser(json.user)` + "Your storefront is live" toast; role flips in place | stays on `?view=seller` which now renders the full seller console | ✓ no pending state exists (self-serve, instant; vendor VERIFIED status is a later admin trust upgrade, not a gate) — but zero onboarding (LOW) |
| **Business-console self-serve org registration** (business-view.tsx:140-182) | org created PENDING, toast, console refetches | stays in business console, OrgStatusCard pending | ✓ |
| **verify-email / reset-password** (auth-views.tsx:545-602) | session synced from `/api/auth/me`, success screen | "Continue" → `navigate('account')` | ✓ (account console) |

**Flows that dump a specialized account onto the generic buyer surface with no status trace:** merchant company registration (pending approval) — *after leaving the business console* (H-4), and seller-intent self-registration (M-5). The financier flow — the one just fixed in UX-FIN-1 — is now the gold standard the other two should copy.

---

## 8. Recommended fix order

1. **C-1** shared `signOut()` helper: POST logout → `persist.clearStorage()` + remove `vendora_chat_token/name`, `register-company-draft`, `vendora-notifications-seen`, `vendora_active_org` + clear `fin_org` cookie server-side (fixes C-1, H-2 residue, L-1, M-3 in one place).
2. **H-1** cart ownership check on login (`finish()`).
3. **H-3** checkout org selection/`organizationId` pass-through with server validation.
4. **H-4** generalize the pending banner to merchant orgs.
5. **M-1/M-4** revalidate `/me` + financier context on interval/focus; SUSPENDED variant of the banner + explicit console messaging.
6. **M-2** single `activeOrgId` in the store; **M-5** seller-intent destination; **L-3** site-header logout feedback.

---

## RESOLUTION (follow-up round, 2026-10-07 — see REPORT.md §8)

- **M-1 FIXED** — always-mounted chrome revalidates: header `/api/financier/context` polls every 60s (visible tabs, useApi pollMs); `/api/auth/me` refetches on focus/visibilitychange with a 60s throttle in both marketplace-app (ADM-001 semantics preserved) and site-header.
- **M-2 FIXED** — business console now reads/writes the shared `vendora_active_org` memory via `defaultActiveOrg`/`rememberActiveOrg` (prefers ACTIVE orgs); two of the three active-org notions unified. Financier console keeps its server-validated institution cookie by design.
- **L-2** — benign preference residue, accepted (no action).
- Fix-order items 1–6 from §8 are all landed (C-1/H-1..H-4/M-3..M-5/L-1/L-3 in the previous round; M-1/M-2 + the OFFER_ACCEPT UX bridge now).
