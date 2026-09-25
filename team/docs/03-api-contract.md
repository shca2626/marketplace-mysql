# Vendora Platform API Contract — Conventions & Coverage

Companion to [`openapi.yaml`](./openapi.yaml) (OpenAPI 3.1.0). Everything here was verified by
reading every `route.ts` under `src/app/api/**` (88 route files). Audience: engineers adding or
consuming API surface. Last verified against the tree on this documentation round (task DOC-4).

---

## 1. Conventions

### 1.1 Base path and transport

- All endpoints live under **`/api/**`**, served by Next.js 16 App Router route handlers
  (`src/app/api/**/route.ts`). The only user-facing page route is `/` (SPA, `?view=`); the SPA
  calls these endpoints with `fetch`, credentials riding the session cookie.
- The app runs behind a **Caddy gateway** which preserves the browser `Host` header
  (`header_up Host {host}`), so `Origin` vs `Host` comparisons remain valid through the proxy.
  `servers.url` in the OpenAPI document is `/` (relative).
- Content type is JSON unless noted: `GET /api/products/export` (CSV / JSON attachment),
  `GET /api/quotes/{id}/pdf` (`application/pdf`), `GET /api/media/{key}` (image bytes),
  `POST /api/uploads` (`multipart/form-data`).

### 1.2 Session authentication

Custom cookie session (`src/lib/auth.ts`):

- Cookie name **`vendora_session`**; value `` `${userId}.${expMs}.${HMAC-SHA256}` `` —
  a signed, expiring, stateless token that is resolved against the `User` row at request time.
- Cookie flags: `httpOnly`, `sameSite=lax`, `secure` in production, `path=/`, max age
  `MAX_AGE` (30 days). Login and register set it; logout clears it.
- **Suspended accounts stop resolving**: `getSessionUser()` returns null for
  `status === 'SUSPENDED'`, effectively signing the account out everywhere.
- Two route-level guards (`src/server/guards.ts`):
  - `requireUser()` → `401 {"error":"Please sign in first"}`
  - `requireAdmin()` → `403 {"error":"Admin access required"}`
- Roles: `User.role` = `BUYER | SELLER | ADMIN`. Organization membership roles
  (`OrganizationMember.role` = `OWNER | ADMIN | BUYER | APPROVER | VIEWER`) are enforced inside
  service modules (organizations, approvals, RFQ visibility), not by a global guard.
- `GET /api/auth/me` is the session probe: it returns `200 {"user": null}` when unauthenticated —
  it never 401s.

### 1.3 Error model

Every error body is a single JSON object:

```json
{ "error": "human-readable message" }
```

- **Zod validation failures** return `400` with the **first issue message**
  (`parsed.error.issues[0]?.message`).
- **Service-layer errors** (e.g. `RfqServiceError`, `PaymentServiceError`, `PayoutServiceError`,
  `OrgServiceError`, `DisputeServiceError`, `CouponServiceError`, `GroupServiceError`,
  `PriceListServiceError`, `VendorServiceError`, `SettingsServiceError`,
  `ApprovalServiceError`, `RecurringServiceError`) carry their own HTTP status and message.
- Documented exceptions to the `{error}` shape (both admin-only zod-strict forms):
  - `PUT /api/admin/settings` on validation failure:
    `400 {"error":"Invalid settings","details":["fieldPath: message", ...]}`
  - `POST /api/admin/slides` / `PUT /api/admin/slides/{id}` on validation failure:
    `400 {"error":"Invalid slide","details":[...]}` (resp. `"Invalid slide update"`).
  - `POST /api/uploads` partial failure: `201 {assets:[...], errors:[{name,error}...]}` —
    mixed success; `422` when every file fails (see table below).

### 1.4 Status-code usage (verified examples)

| Code | Meaning | Real examples from the code |
|---|---|---|
| 400 | Validation / business rejection | `{"error":"Full name is required"}` (checkout zod) · `{"error":"Add at least one image before publishing (or save as draft)"}` (PUT product) · `{"error":"Only 3 left in stock for \"...\""}` · `{"error":"Percent adjustment must be between -90 and 500"}` |
| 401 | Unauthenticated | `{"error":"Please sign in first"}` (requireUser) · `{"error":"Invalid email or password"}` (login) · `{"error":"Unauthorized"}` (inline guards) |
| 403 | Forbidden (role / ownership / CSRF) | `{"error":"Admin access required"}` · `{"error":"You can only edit your own products"}` · `{"error":"Cross-site requests are not allowed"}` (+ `X-Reason: csrf:...` header) · `{"error":"This account has been suspended by the platform administrator. Contact support to resolve this."}` (login of suspended account) |
| 404 | Missing / not visible | `{"error":"Product not found"}` · `{"error":"Order not found"}` · `{"error":"Quote not found"}` · `{"error":"Store not found"}` (suspended sellers 404 on public surfaces) |
| 409 | State or uniqueness conflict | `{"error":"An account with this email already exists"}` (register) · `{"error":"This image is used by one of your products — remove it there first"}` (upload delete) · `{"error":"Cannot move from PROCESSING to DELIVERED"}` (fulfillment) · `{"error":"This order is awaiting payment — fulfillment unlocks once the payment is confirmed"}` |
| 405 | Method not used | `GET /api/products/bulk` → `{"error":"Use POST"}` (the only 405 in the tree) |
| 422 | Batch upload total failure | `POST /api/uploads` when every file fails processing: `{assets:[], errors:[{name,error}]}` — the only 422 in the codebase, and the only error body without `error` |
| 429 | Rate limited | `{"error":"Too many requests — slow down and try again shortly"}` + `Retry-After` header (seconds) |
| 500 | Unexpected server error | `{"error":"Failed to load products"}` · `{"error":"Checkout failed"}` — always logged via `console.error` first |
| 304 | Media conditional GET | `GET /api/media/{key}` honors `If-None-Match` against a strong ETag |

---

## 2. Pagination and list envelopes

Three list patterns exist — match the endpoint, there is no global standard:

| Pattern | Endpoints | Envelope |
|---|---|---|
| **page/limit** | `GET /api/products` (limit 1–48, default 24) | `{items, total, page, pages}` |
| | `GET /api/admin/orders` (limit 1–50, default 20) | `{total, page, pages, totals, orders}` |
| | `GET /api/admin/audit-logs` (pageSize 10–100, default 50) | `{logs, total, page, pageSize}` |
| | `GET /api/admin/payments`, `GET /api/admin/payouts`, `GET /api/admin/vendors` (limit default 20) | service envelopes with `page`/`limit` inputs |
| **limit/offset** | `GET /api/uploads` (limit 1–60, default 24; offset ≥ 0) | `{assets, total, limit, offset}` |
| **plain arrays** (no pagination) | `GET /api/orders`, `/api/rfqs`, `/api/rfqs/inbox`, `/api/favorites`, `GET /api/seller/orders` (take 50), `GET /api/notifications` (`limit` query, capped 50), admin lists for coupons / customer-groups / price-lists / organizations / rfqs / quotes / disputes / slides | `{<plural>: [...]}` |

Notes:

- `GET /api/products` computes `pages = max(1, ceil(total/limit))`; the `ids=` mode (max 20 ids,
  "recently viewed") keeps **caller order** and paginates in memory.
- `GET /api/seller/orders` caps at 50 rows (take 50, no paging parameters).
- Notification `limit` is a query param with service-side `Math.min(limit, 50)`.

---

## 3. CSRF policy (`assertSameOrigin`, `src/lib/http.ts`)

Because auth lives in a cookie, unsafe methods must not be triggerable cross-site.
`assertSameOrigin(req)` runs **before** auth in the routes that call it:

1. `Sec-Fetch-Site: cross-site` → 403 `{"error":"Cross-site requests are not allowed"}` with
   `X-Reason: csrf:cross-site fetch` (browser-set, unforgeable).
2. `Sec-Fetch-Site: same-origin` → pass.
3. Fallback: `Origin` host must match `Host` (or the `X-Forwarded-Host` chain). Requests without
   `Origin` (curl, server-to-server) pass — they cannot carry the victim's ambient cookie and
   are separately rate-limited.
4. GET/HEAD/OPTIONS always pass.

**Mutations that enforce CSRF today (verified):**

| Route | Method(s) |
|---|---|
| `/api/uploads` | POST |
| `/api/uploads/{id}` | DELETE |
| `/api/products/bulk` | POST |
| `/api/disputes`, `/api/disputes/{id}/cancel`, `/api/disputes/{id}/respond` | POST |
| `/api/admin/disputes/{id}/resolve` | POST |
| `/api/recurring-rfqs` | POST |
| `/api/recurring-rfqs/{id}` | PATCH, DELETE |
| `/api/recurring-rfqs/{id}/skip` | POST |
| `/api/quotes/{id}/review` | POST |
| `/api/admin/rfq-settings` | PUT, DELETE |
| `/api/admin/rfq-settings/history/rollback` | POST |
| `/api/admin/settings` | PUT |
| `/api/admin/slides` | POST |
| `/api/admin/slides/{id}` | PUT, DELETE |

**Known gaps (no assertSameOrigin — documented, accepted for now):**

- **Auth**: `POST /api/auth/login`, `/api/auth/register`, `/api/auth/logout`,
  `POST /api/auth/become-seller` (login/logout are classically CSRF-tolerant; register and
  become-seller are not).
- **Orders**: `POST /api/orders` (checkout), `PATCH /api/orders/{id]}`,
  `POST /api/orders/{id}/pay` — money-moving mutations without CSRF.
- **RFQ chain**: `POST /api/rfqs`, `PATCH /api/rfqs/{id}`, `POST /api/rfqs/{id}/messages`,
  `POST /api/rfqs/{id}/quotes`, and quote actions `accept / decline / withdraw / convert`
  (only admin `review` is covered).
- **Product single-row writes**: `POST /api/products`, `PUT|PATCH|DELETE /api/products/{id}`
  (bulk is covered), `GET /api/products/export` is a read.
- **Misc user mutations**: `POST /api/favorites`, `POST /api/reviews`,
  `POST /api/coupons/validate`, `POST /api/pricing/resolve`,
  `POST /api/approvals/{id}/decide`, `POST /api/organizations`,
  `PATCH /api/organizations/{id}`, `POST /api/organizations/{id}/members`,
  `POST /api/notifications/read`.
- **Admin CRUD**: coupons, customer-groups, price-lists (+entries), organizations, payments
  (config/capture/fail), payouts (config/generate/cancel/mark-paid), vendors — none call
  assertSameOrigin.

---

## 4. Rate-limit policies

Implementation: in-memory **sliding-window** limiter (`src/lib/rate-limit.ts`), keyed
`${bucket}:${subject ?? clientIp}` where `subject` is the user id where noted and `clientIp`
comes from `X-Forwarded-For` (Caddy). Single-process by design; the signature maps 1:1 onto a
Redis sorted-set for later scale-out. 429 body:
`{"error":"Too many requests — slow down and try again shortly"}` + `Retry-After` (seconds).
`resetRateLimit(key)` exists for post-success resets (unused today).

### 4.1 Named policies (`RATE_LIMITS`, single source of truth)

| Policy | Limit | Window | Subject | Wired where |
|---|---|---|---|---|
| `login` | 10 | 10 min | per IP | **NOT WIRED** (defined only — known gap) |
| `register` | 5 | 30 min | per IP | **NOT WIRED** (known gap) |
| `upload` | 30 | 10 min | per user | `POST /api/uploads` |
| `productWrite` | 60 | 10 min | per user | `POST /api/products/bulk` **only** — single create/update/delete routes are not wired despite the comment claiming "create/update/delete/bulk" |
| `review` | 10 | 60 min | per user | **NOT WIRED** (known gap — `POST /api/reviews` has no limiter call) |
| `order` | 20 | 10 min | per user | **NOT WIRED** (known gap) |
| `mediaRead` | 600 | 60 s | per IP | `GET /api/media/{key}` (called directly via `rateLimit`, not `enforceRateLimit`; 429 body has no JSON) |

### 4.2 Inline policies (defined at call sites)

| Bucket | Limit | Window | Route |
|---|---|---|---|
| `recurring:create` | 20 | 60 s | `POST /api/recurring-rfqs` |
| `recurring:patch` | 30 | 60 s | `PATCH /api/recurring-rfqs/{id}` |
| `recurring:delete` | 30 | 60 s | `DELETE /api/recurring-rfqs/{id}` |
| `recurring:skip` | 20 | 60 s | `POST /api/recurring-rfqs/{id}/skip` |
| `disputes:create` | 10 | 60 s | `POST /api/disputes` |
| `disputes:cancel` | 20 | 60 s | `POST /api/disputes/{id}/cancel` |
| `disputes:respond` | 20 | 60 s | `POST /api/disputes/{id}/respond` |
| `disputes:resolve` | 60 | 60 s | `POST /api/admin/disputes/{id}/resolve` |
| `quote:review` | 60 | 60 s | `POST /api/quotes/{id}/review` |
| `admin:rfq-settings` | 60 | 60 s | `PUT /api/admin/rfq-settings` |
| `admin:settings-rollback` | 30 | 60 s | `POST /api/admin/rfq-settings/history/rollback` |
| `admin:settings` | 20 | 60 s | `PUT /api/admin/settings` |
| `admin:slides` | 30 | 60 s | `POST /api/admin/slides`, `DELETE /api/admin/slides/{id}` |
| `admin:slides` | 60 | 60 s | `PUT /api/admin/slides/{id}` |

---

## 5. Coverage matrix — all 88 existing endpoints

Auth legend: **pub** = no auth (session optional), **user** = any signed-in user,
**seller** = SELLER or ADMIN, **admin** = ADMIN only, **role/org** = service-enforced
membership role. CSRF = `assertSameOrigin` on mutations (`-` = read-only endpoint, `NO` =
mutating without CSRF — see section 3).

| # | Endpoint | Methods | Auth | CSRF | Purpose |
|---|---|---|---|---|---|
| 1 | `/api` | GET | pub | - | Liveness ping ({"message":"Hello, world!"}) |
| 2 | `/api/admin/audit-logs` | GET | admin | - | Paginated platform audit trail (entityType/action/actorType filters) |
| 3 | `/api/admin/coupons` | GET, POST | admin | NO | List / create discount coupons |
| 4 | `/api/admin/coupons/{id}` | PATCH, DELETE | admin | NO | Update / delete a coupon |
| 5 | `/api/admin/customer-groups` | GET, POST | admin | NO | List / create B2B customer groups |
| 6 | `/api/admin/customer-groups/{id}` | PATCH, DELETE | admin | NO | Update / delete a customer group |
| 7 | `/api/admin/disputes` | GET | admin | - | Mediation queue with status filter |
| 8 | `/api/admin/disputes/{id}/resolve` | POST | admin | YES | Record the dispute outcome (outcome, note, amount) |
| 9 | `/api/admin/orders` | GET | admin | - | Order oversight console (q/status/paymentStatus, paging, roll-ups) |
| 10 | `/api/admin/organizations` | GET, POST | admin | NO | List all orgs / create on behalf of platform (incl. financier org types BANK/MFI/EWALLET) |
| 11 | `/api/admin/organizations/{id}` | PATCH, DELETE | admin | NO | Update profile/verification/credit/groups; delete orgs without history |
| 12 | `/api/admin/payments` | GET | admin | - | Settlement console (status/method/search filters, paging) |
| 13 | `/api/admin/payments/{id}/capture` | POST | admin | NO | Operator confirms money arrived (bank transfer / invoice) |
| 14 | `/api/admin/payments/{id}/fail` | POST | admin | NO | Operator could not verify the transfer |
| 15 | `/api/admin/payments/config` | GET, PUT | admin | NO | Bank-transfer details shown at checkout |
| 16 | `/api/admin/payouts` | GET | admin | - | Payout batch console with status totals |
| 17 | `/api/admin/payouts/{id}/cancel` | POST | admin | NO | Void a pending payout (items return to unsettled pool) |
| 18 | `/api/admin/payouts/{id}/mark-paid` | POST | admin | NO | Mark the payout wired; notify + audit |
| 19 | `/api/admin/payouts/config` | GET, PUT | admin | NO | Platform default commission percent (0–90) |
| 20 | `/api/admin/payouts/generate` | POST | admin | NO | Settle one vendor's paid unsettled items into a new batch |
| 21 | `/api/admin/payouts/preview` | GET | admin | - | Payout math preview per sellerId |
| 22 | `/api/admin/price-lists` | GET, POST | admin | NO | List / create price lists (ORG/GROUP/CHANNEL scope) |
| 23 | `/api/admin/price-lists/{id}` | GET, PATCH, DELETE | admin | NO | Price list detail (with ladder) / update / delete |
| 24 | `/api/admin/price-lists/{id}/entries` | PUT | admin | NO | Transactional full ladder replace (max 1000 entries) |
| 25 | `/api/admin/quotes` | GET | admin | - | Quote routing-review queue (status filter) |
| 26 | `/api/admin/rfq-settings` | GET, PUT, DELETE | admin | YES (PUT/DELETE) | Scoped RFQ settings: read effective + overrides; save panel; remove override |
| 27 | `/api/admin/rfq-settings/history` | GET | admin | - | Settings change log (key/scope/limit filters) |
| 28 | `/api/admin/rfq-settings/history/rollback` | POST | admin | YES | Roll back a logged change (itself logged + audited) |
| 29 | `/api/admin/rfqs` | GET | admin | - | Platform-wide RFQ monitor (status/search) |
| 30 | `/api/admin/settings` | GET, PUT | admin | YES (PUT) | Storefront settings document (zod-strict, details array on 400) |
| 31 | `/api/admin/slides` | GET, POST | admin | YES (POST) | All banner slides / create (append at end) |
| 32 | `/api/admin/slides/{id}` | PUT, DELETE | admin | YES | Field patches + move up/down reorder / delete |
| 33 | `/api/admin/stats` | GET | admin | - | Read-only analytics overview (totals, revenue/day, top sellers/categories) |
| 34 | `/api/admin/vendors` | GET | admin | - | Vendor directory with GMV, rating, verification, lifecycle |
| 35 | `/api/admin/vendors/{id}` | PATCH | admin | NO | Vendor lifecycle: verify / unverify / suspend / reactivate / set-commission |
| 36 | `/api/approvals` | GET | user | - | My org approval queue (approvers) or my requests (buyers) |
| 37 | `/api/approvals/{id}/decide` | POST | user (org OWNER/ADMIN/APPROVER) | NO | Approve / reject a pending request (+note) |
| 38 | `/api/auth/become-seller` | POST | user (BUYER) | NO | Upgrade to SELLER with storeName/storeBio (admins rejected) |
| 39 | `/api/auth/login` | POST | pub | NO | Email+password sign-in; sets session cookie |
| 40 | `/api/auth/logout` | POST | pub | NO | Clears the session cookie |
| 41 | `/api/auth/me` | GET | pub (returns user:null) | - | Session probe (never 401) |
| 42 | `/api/auth/register` | POST | pub | NO | Register BUYER/SELLER; sets session cookie |
| 43 | `/api/catalog` | GET | pub | - | Category attribute definitions for dynamic forms/filters |
| 44 | `/api/categories` | GET | pub | - | Categories with ACTIVE product counts + cover |
| 45 | `/api/coupons/validate` | POST | pub (401 only for firstOrderOnly anonymous) | NO | Display-only coupon preview (checkout re-validates) |
| 46 | `/api/disputes` | GET, POST | user | YES (POST) | My disputes (raised + against me) / open a dispute on an order |
| 47 | `/api/disputes/{id}/cancel` | POST | user (raising buyer) | YES | Withdraw own dispute (buyerCancelOwn setting) |
| 48 | `/api/disputes/{id}/respond` | POST | user (disputed seller) | YES | Seller posts their response |
| 49 | `/api/favorites` | GET, POST | user | NO | Wishlist list / toggle favorite |
| 50 | `/api/home` | GET | pub | - | Landing feed (featured/trending/new + stats) |
| 51 | `/api/media/{key}` | GET | pub (IP rate-limited) | - | Immutable rendition serving (ETag/304, immutable cache) |
| 52 | `/api/notifications` | GET | user | - | Bell feed + unreadCount (limit, capped 50) |
| 53 | `/api/notifications/read` | POST | user | NO | Mark one ({id}) or all ({all:true}) read |
| 54 | `/api/orders` | GET, POST | user | NO (gap) | Purchase history / checkout (approval routing, coupon, stock validation) |
| 55 | `/api/orders/{id}` | GET, PATCH | user (buyer or participating seller; admin sees all) | NO (gap) | Order detail / fulfillment advance or buyer cancel |
| 56 | `/api/orders/{id}/pay` | POST | user (buyer) | NO (gap) | Settle a PENDING_PAYMENT order (CARD instant, bank transfer with reference) |
| 57 | `/api/organizations` | GET, POST | user | NO | My business accounts / register one (requester = OWNER) |
| 58 | `/api/organizations/{id}` | GET, PATCH | user (member; PATCH needs org OWNER/ADMIN) | NO | Org detail with members/groups / set approval threshold |
| 59 | `/api/organizations/{id}/members` | POST | user (org OWNER/ADMIN) | NO | Add an existing user with a membership role |
| 60 | `/api/payments/methods` | GET | pub | - | Checkout methods (CARD simulated gateway, BANK_TRANSFER operator-settled) |
| 61 | `/api/pricing/resolve` | POST | user | NO | Resolve CONTRACT/GROUP/RETAIL unit prices for a buyer context |
| 62 | `/api/products` | GET (pub; mine/scope variants), POST (seller) | seller (POST) | NO (gap on POST) | Filtered/search/sorted/paged list / create (shared productFormSchema) |
| 63 | `/api/products/{id}` | GET (pub), PATCH (admin), PUT (owner/admin), DELETE (owner/admin) | mixed | NO (gap) | Detail + reviews + related / admin moderation / full update / delete-or-archive |
| 64 | `/api/products/bulk` | GET (405), POST (seller) | seller | YES | Bulk import (≤200 rows) / status / price adjust / delete (≤500 ids) |
| 65 | `/api/products/export` | GET | seller | - | Export own (admin: all) products as CSV or archived JSON |
| 66 | `/api/quotes/{id}/accept` | POST | user (requester) | NO (gap) | Accept an open quote; siblings auto-decline; org-approval routing |
| 67 | `/api/quotes/{id}/convert` | POST | user (requester) | NO (gap) | Convert ACCEPTED quote into a B2B invoiced order |
| 68 | `/api/quotes/{id}/decline` | POST | user (requester) | NO (gap) | Decline a quote (others stay open) |
| 69 | `/api/quotes/{id}/pdf` | GET | user (requester/admin/issuer) | - | Server-rendered A4 PDF quote document |
| 70 | `/api/quotes/{id}/review` | POST | admin | YES | Quote routing review (APPROVE releases, REJECT declines + note) |
| 71 | `/api/quotes/{id}/withdraw` | POST | user (issuing seller/admin) | NO (gap) | Pull an open SENT quote off the table |
| 72 | `/api/recurring-rfqs` | GET, POST | user | YES (POST) | My schedules (lazy-spawn nudge) / create from a line snapshot |
| 73 | `/api/recurring-rfqs/{id}` | PATCH, DELETE | user (owner) | YES | Pause / resume / permanently delete a schedule |
| 74 | `/api/recurring-rfqs/{id}/skip` | POST | user (owner) | YES | Push the next run out by one cycle |
| 75 | `/api/reviews` | POST | user | NO | Upsert review; verified-purchase badge; recomputes aggregates |
| 76 | `/api/rfq-config` | GET | pub | - | Public display flags (MOQ, tiers, stock, ratings, expiry, disputes, recurring) |
| 77 | `/api/rfqs` | GET, POST | user | NO (gap) | My RFQs (org filter) / create a draft with 1–50 lines |
| 78 | `/api/rfqs/{id}` | GET, PATCH | user (requester/admin/involved seller) | NO (gap) | RFQ detail with quotes / SUBMIT-CANCEL-REVIEW-REJECT transitions |
| 79 | `/api/rfqs/{id}/messages` | GET, POST | user (parties) | NO (gap) | Negotiation thread read / post (closed on terminal states) |
| 80 | `/api/rfqs/{id}/quotes` | POST | user (seller on own products / admin) | NO (gap) | Issue a quote against an RFQ |
| 81 | `/api/rfqs/inbox` | GET | user (seller; others get empty) | - | Seller inbox of open RFQs referencing my catalog |
| 82 | `/api/seller/earnings` | GET | seller | - | Settlement summary (pending revenue, commission, payout batches) |
| 83 | `/api/seller/orders` | GET | seller | - | Orders containing my products (take 50) |
| 84 | `/api/seller/stats` | GET | seller | - | Dashboard KPIs, sales-by-day, top products, payout summary |
| 85 | `/api/sellers/{id}` | GET | pub | - | Public storefront profile + category chips |
| 86 | `/api/settings` | GET | pub | - | Storefront settings + ACTIVE slides (cached, tag-busted) |
| 87 | `/api/uploads` | GET, POST | user (GET); seller (POST) | YES (POST) | Media library (limit/offset) / multipart image upload pipeline |
| 88 | `/api/uploads/{id}` | DELETE | user (owner/admin) | YES | Delete an asset (409 while referenced by products/orders) |

---

## 6. Planned endpoints — Financier domain (PLANNED, not implemented)

Source: `team/FINANCIER_SCHEMA.md` v4.0 (models §3, lifecycle §5, settings §6) and
`team/FINANCIER_PLAN.md` (FIN-3). Every path carries `x-planned: true` in `openapi.yaml`;
request bodies use FINANCIER_SCHEMA field names exactly. Schemas here are summary-level —
the full field-level truth lives in FINANCIER_SCHEMA.

| Endpoint | Methods | Actor | Purpose |
|---|---|---|---|
| `/api/financing/wizard` | GET | pub | Intake configuration for the 3-step wizard (enums, settings, document rules) |
| `/api/financing/requests` | GET, POST | user / applicant | List my requests (applicant or distributed-financier view) / submit wizard result |
| `/api/financing/requests/{id}` | GET, DELETE | parties | Request detail / cancel pre-acceptance |
| `/api/financing/requests/{id}/documents` | GET, POST | applicant | List / attach evidence (ApplicantDocument over MediaAsset) |
| `/api/financing/requests/{id}/offers` | GET, POST | applicant / financier staff | Compare offers / submit an offer with installment schedule |
| `/api/financing/offers/{id}` | PATCH | financier staff | Edit / withdraw offer; report funded-settled |
| `/api/financing/offers/{id}/accept` | POST | applicant | Accept one offer (siblings auto-decline, fee accrues, agreement created) |
| `/api/financing/offers/{id}/decline` | POST | applicant | Decline an offer |
| `/api/financing/agreements/{id}` | GET | parties | Agreement detail (frozen offer, installments, events, fees) |
| `/api/financing/agreements/{id}/events` | POST | financier staff | Report external money events (track-only ledger, D-002) |
| `/api/financing/fees` | GET, PATCH | admin | Commission accounting list / mark invoiced-paid-waived |
| `/api/financiers` | GET | pub | Public financier directory (DP-10) |
| `/api/financiers/{id}` | GET | pub | Public financier profile (branches, stats, contact) |
| `/api/financiers/{id}/products` | GET | pub | Financing product list (amounts, rates, tenor, coverage) |

Key request field names (submit wizard, `POST /api/financing/requests`): `activityStatus`,
`capitalAmount`, `monthlyInstallmentCapacity`, `previousFinancing`, `ownContributionAmount`,
`otherIncomeSources`, `activityCategory`, `activityStartDate`, `activityName`,
`activityAddress`, `activityCity`, `activityDistrict`, `activityDescription`,
`amountRequested`, `currency`, `purpose`, `tenorRequestedMonths`, `activityLocationType`,
`guaranteeType`, `guaranteeStatus`, `applicantNotes`, `consent` (+ `targetType`, `targetId`,
`productId`, `organizationId`, `distributionMode`).

Design notes binding these to the existing contract:

- Auth: same `cookieAuth` session; financier staff authorization via `OrganizationMember`
  roles on BANK/MFI/EWALLET organizations (no new global role — DP-1).
- Mutations are specified to follow the platform CSRF policy (assertSameOrigin) and the
  `{error}` error model.
- Numbers: requests `FR-YYYY-######` (Sequence `FIN`), agreements `AGR-YYYY-######`
  (Sequence `AGR`); offers stay id-addressed (DP-12).
- Money is never held on platform (D-002); fees accrue at acceptance and are marked PAID by
  an admin.

---

## 7. Versioning policy

**There is no API versioning today — by design.** One deployment serves the one SPA client
(`/?view=`); the API and UI ship together atomically.

Current rules:

1. **Additive changes only.** New endpoints, new optional request fields, and new response
   fields are safe. Removing or renaming fields, changing types, or changing status-code
   semantics requires a coordinated SPA + API release in the same deploy.
2. The OpenAPI document (`openapi.yaml`) is the contract snapshot; consumers of an endpoint
   must tolerate additional response fields (the serializers already evolve additively).
3. When an external (non-SPA) consumer appears, introduce `/api/v1/...` route nesting and
   freeze this contract as the v0 baseline. Until then, `info.version` in `openapi.yaml`
   tracks the documentation round (1.0.0 at DOC-4), not the deployed API.
4. Planned financing endpoints (section 6) will land under their own path prefixes; they do
   not alter any existing path.

---

## 8. Maintaining this contract

Process for any change that touches `src/app/api/**`:

1. **Read the route file** — do not document from memory. Confirm: exported methods
   (GET/POST/PUT/PATCH/DELETE), the zod request schema (field names, types, optionality,
   refinements), query params actually read from `req.nextUrl.searchParams`, the guard used
   (`requireUser` / `requireAdmin` / inline session check), whether `assertSameOrigin` /
   `enforceRateLimit` are called, and the response shape (or the service call that produces it).
2. **Update `openapi.yaml`**: path + method entry, summary, tags, `security`
   (omit / `cookieAuth`), parameters, requestBody schema, responses with the status codes the
   code actually returns. Planned-but-unimplemented endpoints go under the
   `Financing (planned)` tag with `x-planned: true` and summary-level schemas.
3. **Update this document's tables** in the same change: coverage matrix (section 5),
   CSRF list (section 3), rate limits (section 4), pagination envelopes (section 2).
4. **Validate the YAML** before committing:

   ```bash
   python3 -c "import yaml; yaml.safe_load(open('team/docs/openapi.yaml')); print('ok')"
   ```

   Watch for: unquoted scalars containing `: ` (quote them or use block scalars), flow-style
   tag lists containing colons (`tags: ['Admin: Quotes']`), and undefined `$ref`s.
5. When a planned endpoint is implemented, remove `x-planned: true`, move it out of the
   `Financing (planned)` tag into its real domain tag, and add a coverage-matrix row.
