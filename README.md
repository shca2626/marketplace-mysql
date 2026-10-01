# Vendora — Multi-Vendor B2B Marketplace + Financier Platform

> **A production-grade, self-contained Next.js 16 application**: B2C direct checkout + B2B
> RFQ/quoting/purchased-order commerce + an institutional **financing & accreditation module**
> (financier consoles, platform verification gate, offers → agreements → fees), backed by
> **Prisma + MySQL (Aiven cloud)** with a fully seeded demo dataset.

| | |
|---|---|
| **Stack** | Next.js 16 (App Router) · React 19 · TypeScript 5 (strict) · Tailwind CSS 4 · shadcn/ui (New York) · Prisma 6 + MySQL (Aiven) · Zustand · react-hook-form + Zod · Recharts · pdf-lib · sharp |
| **Size** | ~75,000 lines of TS/TSX in `src/` · **50 Prisma models** · **148 API route files (~160 endpoints)** |
| **Runs from clone** | `bun install && bunx prisma generate && bun run dev` — point `DATABASE_URL` in `.env` at the managed MySQL service and the app boots with the full demo dataset (users, orgs, products, orders, RFQs, financing requests). |
| **Docs** | Full engineering documentation suite in [`team/docs/`](./team/docs) (domain model/ERD, use cases, API contract, 21 ADRs, design system, data dictionary, test plan, ops runbook, security/threat model) + an OpenAPI 3.1 spec with 149 live paths / 194 operations. |

---

## 1. What this project is

**Vendora** is a multi-vendor marketplace that grew through three layers, all live in this codebase:

1. **B2C commerce core** — shared catalog, search/filters, cart + save-for-later, coupons,
   server-authoritative checkout (stock decrement in a DB transaction), order lifecycle
   (`PENDING → CONFIRMED → PAID → SHIPPED → DELIVERED` / `CANCELLED`), reviews, favorites,
   seller storefronts, seller KPI dashboard, admin analytics + CSV exports.
2. **B2B RFQ layer** — organizations with members/roles, buyer companies raise multi-line
   **RFQs**, vendors answer with **quotes** (line pricing, validity countdown), quotes are
   accepted → converted to orders at contract prices; **price lists** (customer-group scoped,
   quantity ladders), **approval requests** for out-of-policy pricing, recurring RFQs,
   order disputes, payment authorization/capture and seller payout generation.
3. **Financier module** (the newest major feature, `FIN-1…FIN-10`) — financial institutions
   (banks, microfinance, Islamic banks…) publish **financing services** on the platform;
   business buyers apply through a **3-step wizard** with a **universal documents vault**;
   every application passes a **transactional platform verification gate** before it is
   forwarded to the chosen financier(s); financiers issue **offers** (with installment
   schedules) which become **agreements** (with lifecycle events and fee accrual);
   separately, financiers grant **accreditations** to businesses.

The UI is a **single-route SPA** served at `/` (see *Architecture* below) with role-aware
navigation (Buyer / Seller / Admin / Financier), dark mode, and full mobile responsiveness.

---

## 2. Quick start (5 minutes)

### Prerequisites

- **Bun** ≥ 1.3 (the runtime used in dev and for seed scripts; `npm`/`pnpm` also work for `next` scripts)
- Node.js ≥ 20 (for tooling compatibility)

### Steps

```bash
git clone https://github.com/shca2626/marketplace-mysql.git vendora
cd vendora

bun install                 # install dependencies
bunx prisma generate        # generate the Prisma client (required after every schema.prisma edit)

bun run dev                 # http://localhost:3000  (dev log: dev.log)
```

That's it — the database is the managed Aiven MySQL service (`DATABASE_URL` in `.env`),
and the media store (`uploads/`) is committed, so the app boots with the full demo dataset.

> **Production build**: `bun run build && bun run start` (standalone output in `.next/standalone`).
> Before starting in production you **must** set `AUTH_SECRET` (≥ 32 chars) — see §4.

### Demo accounts (all seeded in the committed database)

| Account | Password | Role / what to try |
|---|---|---|
| `admin@vendora.com` | `admin1234` | **ADMIN** — analytics, organizations verification, pricing, RFQ console, disputes, payments/payouts, **financing gate review console**, requirements library, audit log |
| `seller1@vendora.com` … `seller5@vendora.com` | `seller1234` | **SELLER** — product CRUD, order fulfillment, earnings, RFQ inbox + quoting, storefront |
| `demo@vendora.com` | `demo1234` | **BUYER** (retail path) — catalog, cart, checkout, orders, reviews, favorites |
| `riley@vendora.com`, `casey@vendora.com` | `demo1234` | **BUYER + org members** — B2B path: RFQs, quotes, contract pricing, financing console, documents vault, agreements |
| `maya@example.com`, `leo@example.com`, `sofia@example.com`, `jamal@example.com`, `nina@example.com` | `demo1234` | extra buyers |
| `alamal.admin@vendora.com` | `financier1234` | **FINANCIER** (Al-Amal Microfinance Bank) — financier console: inbox of forwarded requests, offers, agreements, accreditations |
| `kuraimi.admin@vendora.com` | `financier1234` | **FINANCIER** (Al-Kuraimi Islamic Microfinance Bank) — second institution to test multi-financier routing |

Seeded business data: 3 organizations (Acme Trading = buyer company; Al-Amal + Al-Kuraimi =
financiers, `ACTIVE`), 26 products across 6 categories, 14 orders, 5 RFQs with quotes,
54 financing requests, financing offers/agreements (including one `REPORTED_FUNDED` with
a `DISBURSEMENT` event and accrued fees), accreditation grants, 19 audit-log entries,
notifications, hero banner slides.

### Re-seeding from scratch (optional)

```bash
rm db/custom.db && touch db/custom.db   # nuke the DB file
bunx prisma db push                     # recreate schema
bun run db:seed                         # core demo dataset  (prisma/seed.ts)
bun run db:seed:b2b                     # B2B orgs/pricelists/rfqs (scripts/seed-b2b.ts)
bun run scripts/seed-financing.ts        # financier profiles, services, requests
bun run scripts/add-admin.ts             # (re)create admin@vendora.com
```

Other maintenance scripts live in [`scripts/`](./scripts) — `db-status.ts` (DB health/counts),
`cleanup-b2b.ts`, `cleanup-uploads.ts`, `seed-settings.ts`, `verify-b2b.sh`.

---

## 3. Repository layout

```
├── prisma/
│   ├── schema.prisma          # 50 models — the single source of truth for data
│   └── seed.ts                # core demo seed (users, categories, products, orders, reviews)
├── db/                       # media/reference assets (images.json, static-images/…)
├── uploads/                   # live media store (COMMITTED — referenced by MediaAsset rows)
│   └── 2026/09/<sha8>-<rand6>.{thumb|medium|large|full}.webp
├── src/
│   ├── app/
│   │   ├── page.tsx           # THE route — mounts the SPA client
│   │   ├── layout.tsx, globals.css
│   │   └── api/               # 148 route.ts files (REST API, see §7)
│   ├── components/
│   │   ├── marketplace/       # SPA: header/nav, home, catalog, product, cart, checkout,
│   │   │                      # orders, seller view, admin view, b2b views, financier console,
│   │   │                      # financing console (applicant), auth modal, notifications bell…
│   │   ├── dashboards/        # dashboard shell, sidebar, nav-config (role-aware nav groups)
│   │   └── ui/                # shadcn/ui primitives (button, dialog, form, table, …)
│   ├── server/
│   │   ├── guards.ts          # auth guards: requireUser / requireRole / requireOrgRole …
│   │   └── modules/           # business-logic services per domain (rfq, financing, pricing,
│   │                          # organizations, approvals, payments, payouts, audit, …)
│   ├── lib/                   # cross-cutting infra (see §6)
│   ├── store/                 # Zustand stores (marketplace app state)
│   └── hooks/                 # use-api (fetcher), use-mobile, use-toast
├── scripts/                   # seed / ops / verification scripts
├── team/
│   ├── docs/                  # engineering documentation suite (see §9) + openapi.yaml
│   ├── DECISIONS.md           # decision log D-001…D-019 (design rulings, owner-approved)
│   ├── FINANCIER_SCHEMA.md   # financing module data spec v5.0
│   ├── FINANCIER_PLAN.md     # financing module implementation plan v2.0
│   └── PLATFORM_PLAN.md      # platform roadmap v3.0
├── examples/websocket/        # optional websocket mini-service reference (not used by default)
├── .env.example               # configuration template — copy to .env (see §4)
└── .env                       # NOT tracked (real credentials since 2026-09-28; repo is public)
```

---

## 4. Configuration

Configuration lives in `.env`, copied from the committed `.env.example` template
(`cp .env.example .env` — then set `DATABASE_URL` to the Aiven MySQL service URI).

> **Changed 2026-09-28 (PRODENV-1):** `.env` was previously committed on purpose (demo
> values only). Real provider credentials (Resend SMTP, remote MySQL) are configured now,
> so `.env` is **gitignored** — the repo is public and must never carry secrets.

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | *(required)* | Prisma MySQL datasource — the Aiven cloud service URI (`mysql://…?ssl-mode=REQUIRED`). This is the ONE and ONLY database for every environment. |
| `AUTH_SECRET` | *(dev fallback)* | HMAC secret signing the session cookie. **Required ≥ 32 chars in production** — boot fails fast otherwise (`src/lib/auth.ts`, SEC-01). Generate: `openssl rand -hex 32` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | `smtp.resend.com` / `465` / `resend` / *(api key)* | Resend SMTP for transactional mail (digests). `465` = implicit TLS; `587` auto-upgrades via STARTTLS. Unset ⇒ digest delivery falls back to console logging. |
| `SMTP_FROM` | `Vendora <onboarding@resend.dev>` | Sender address. Switch to your verified domain (e.g. `Vendora <no-reply@yourdomain.com>`) once verified in the Resend dashboard. |
| `RESEND_API_KEY` | — | Resend REST API key (kept for API-based tooling). |
| `STORAGE_DRIVER` | `local-disk` | Media storage adapter registry (`src/lib/storage/index.ts`). Only `local-disk` exists; S3/R2 adapters would register here. |
| `STORAGE_ROOT` | `./uploads` | Root directory for the media store. The committed `uploads/` folder must stay the root unless you also move the DB's `MediaAsset` files. |

No other services are required — no Redis, no queues, no external DB server. Caching is
in-process memory (`src/lib/cache.ts`, TTL + LRU-ish caps, documented in ADR-0019).

---

## 5. Data model (50 models)

Grouped by domain — full field-level documentation in [`team/docs/06-data-dictionary.md`](./team/docs/06-data-dictionary.md), ERDs in [`team/docs/01-domain-model.md`](./team/docs/01-domain-model.md).

| Domain | Models | Notes |
|---|---|---|
| **Identity & access** | `User`, `Organization`, `OrganizationMember` | Credentials auth (scrypt), roles `BUYER/SELLER/ADMIN`; org roles (`OWNER`, `MEMBER`, …) gate B2B actions. |
| **Catalog** | `Category`, `Product`, `ProductVariant`, `BannerSlide` | Product images/variants **mediaId → `MediaAsset`**. Two legacy JSON-in-text fields remain by design: `Product.images` (array of URLs) and `ProductVariant.options` (map) — parsed in `src/lib/serialize.ts`. |
| **Orders & payments** | `Order`, `OrderItem`, `Payment`, `Payout`, `Coupon` | Server-authoritative checkout transaction; payment auth/capture lifecycle; payout batch generation for sellers. |
| **Engagement** | `Review`, `Favorite`, `Notification`, `Dispute` | Notification rows power the header bell (with deep-links, e.g. financing → `?view=financing&request=<id>`). |
| **B2B pricing** | `CustomerGroup`, `PriceList`, `PriceListEntry` | Group-scoped price lists with quantity-ladder entries; resolved by `src/lib/pricing.ts` + `/api/pricing/resolve`. |
| **RFQ backbone** | `Rfq`, `RfqLine`, `Quote`, `QuoteLine`, `RfqMessage`, `ApprovalRequest`, `RecurringRfq`, `RfqSetting`, `SettingChange` | Multi-line RFQ → quotes (validity countdown) → accept → order at contract price; approvals for out-of-threshold pricing; admin-tunable RFQ settings with history + rollback. |
| **Media** | `MediaAsset` | sha256-deduplicated assets with 4 webp renditions (see §6). |
| **Financing** | `FinancierProfile`, `FinancierBranch`, `FinancierService`, `FinancierServiceAttribute`, `FinancierServiceCoverage`, `ConditionTemplate`, `ConditionOption`, `ServiceRequirement`, `RequirementSubmission`, `AccountDocument`, `RequestAttachment`, `FinancingRequest`, `FinancingOffer`, `FinancingOfferInstallment`, `FinancingAgreement`, `FinancingEvent`, `FinancingFee`, `AccreditationRequest` | 18 models implementing the financier module (see §6.4). |
| **Ops** | `AuditLog`, `Sequence`, `PlatformSetting` | Immutable audit trail; `Sequence` issues human-readable IDs (`FR-2026-000001`, `AGR-2026-000002`, …) inside create-transactions. |

### Governing data conventions (enforced in review, see ADR-0014/0017…0021)

1. **Zero JSON** in new domains — lists are child tables, addresses are typed scalars.
2. **Single entry** — every data point has exactly one home; everything else references it.
3. **Reuse the substrate** — new modules reuse `Organization`, `User`, `MediaAsset`,
   `Sequence`, `AuditLog`, `Notification` instead of adding parallel structures.
4. **String enums** — model status fields are plain `String` with documented value sets
   (state machines in `team/docs/01-domain-model.md` §state-machines).
5. **URL → file/path rule** — anything that can be represented as a `mediaId` reference to
   `MediaAsset` must be (the only exception grandfathered: `FinancierProfile.logoUrl`).

---

## 6. Architecture

### 6.1 Shape: one route, many views

Next.js App Router serves **one page** (`/`). `src/app/page.tsx` mounts
`marketplace-app.tsx`, a client component that renders the active *view* (home, catalog,
product, cart, checkout, orders, seller dashboard, admin console, B2B business view,
financing console, financier console…) driven by internal state + URL query params
(`?view=…`) — this is the ADR-0001 ruling (SPA over file-based routing) and it is why
deep links like `?view=financing&request=<id>` work.

```
Browser ── / (SPA shell) ──────────────────────────────► Next.js (port 3000)
   │                                                        │
   └─ fetch /api/** (cookie session, JSON)                   ├─ src/app/api/**/route.ts   (thin HTTP layer)
                                                             │     └─ src/server/modules/** (business services)
                                                             │           └─ src/lib/db.ts → Prisma → MySQL (Aiven, SSL)
                                                             └─ /api/media/[...key] → uploads/ (immutable cache)
```

### 6.2 Layering rules

- **`src/app/api/**/route.ts`** — parse/validate input (Zod), call a service, shape the
  HTTP response (`src/lib/http.ts`: `ok()`, `fail()`, standard error model). No business logic.
- **`src/server/modules/<domain>/service.ts`** — business logic, transactions, audit writes.
  Cross-module orchestration lives here too (e.g. financing gate reads organizations +
  requirements + submissions in one `prisma.$transaction`).
- **`src/server/guards.ts`** — every privileged route starts with `requireUser()` /
  `requireRole('ADMIN')` / `requireOrgRole(...)` which throw the standard 401/403 error.
- **`src/lib/**`** — cross-cutting utilities (auth, cache, pricing, formatting, CSV,
  rate-limit, storage, serialization). `src/lib/db.ts` exports the shared Prisma client.
- **Client state** — Zustand store (`src/store/marketplace.ts`) for cart/view/session;
  `src/hooks/use-api.ts` is the fetcher hook used by views.

### 6.3 Auth & sessions (custom, no NextAuth)

`src/lib/auth.ts`:
- Passwords: `scrypt` with per-user 16-byte salt, `salt:hash` hex format, `timingSafeEqual` compare.
- Sessions: HMAC-SHA256-signed token `{userId}.{expiry}..{sig}` in the `vendora_session`
  cookie, 30-day max age; `getSessionUser()` verifies signature + expiry on every request.
- Roles: `User.role` (`BUYER | SELLER | ADMIN`); B2B permissions additionally check
  `OrganizationMember.role` through guards.
- Rate-limit policies exist (`src/lib/rate-limit.ts`) — see the security doc for what is
  wired vs. planned.

### 6.4 Media pipeline (ADR-0018)

1. Upload via `POST /api/uploads` (multipart) → `sharp` produces **4 webp renditions**
   (`thumb/medium/large/full`).
2. Content is **sha256-deduplicated**; keys are `YYYY/MM/{sha8}-{rand6}` — date-bucketed,
   content-prefixed, collision-safe.
3. Files land in `STORAGE_ROOT` (default `./uploads`), rows in `MediaAsset`.
4. Served by `/api/media/[...key]` with **immutable** caching (keys never change content).
5. Path-traversal protected (`src/lib/storage/local-disk.ts` rejects `..`/absolute keys).

### 6.5 The financier module (FIN-1…FIN-10)

The flagship feature — read [`team/FINANCIER_SCHEMA.md`](./team/FINANCIER_SCHEMA.md) and
[`team/FINANCIER_PLAN.md`](./team/FINANCIER_PLAN.md) for the full spec. Key mechanics:

- **Platform verification gate (R-4)** — a financing or accreditation request cannot reach
  any financier until the platform admin verifies every required condition. Gate review is
  **transactional**: per-item verdicts + notes, completeness meter, *return* (with
  missing-items list surfaced to the applicant) or *forward* to the chosen financier(s).
  Financier inboxes structurally exclude un-forwarded requests.
- **Requirements engine (R-5)** — `ConditionTemplate`/`ConditionOption` (8 typed kinds:
  text, number, date, select, document, media, checkbox, url) maintained as GENERAL
  (platform-curated) or FINANCIER-specific libraries; attached per service; submitted and
  verified per request (`RequirementSubmission`).
- **Universal documents vault** — `AccountDocument` per organization; documents are reused
  across financing/accreditation requests (single-entry rule); admin verify queue with
  media preview.
- **Multi-financier sibling routing** — one request can target several institutions;
  sibling requests are linked; accepting one offer warns about/declines siblings.
- **Frozen-offer agreements** — `FinancingOffer` (+ installment schedule) → applicant
  accepts → `FinancingAgreement` snapshot; `FinancingEvent` lifecycle log
  (e.g. `REPORTED_FUNDED`, `DISBURSEMENT`); `FinancingFee` accrual (e.g. SUCCESS fee on
  funded agreements) with invoiced/paid states.
- **Sweep scheduling** — expired `SUBMITTED` requests are lazily swept to `EXPIRED` on
  read (no timers — ADR-0008 no-timer state machines).
- **Accreditation as a main service** — financiers grant time-boxed accreditations to
  businesses (`AccreditationRequest` → `ACCREDITED` with `validUntil`), surfaced as badges
  on the buyer side.

### 6.6 Cross-cutting ops

- **AuditLog** — every privileged mutation writes an immutable entry (actor, action,
  entity, before/after where relevant); admin console has a filterable audit tab.
- **Notification** — user-facing events; the header bell shows unread counts and
  deep-links into the relevant view.
- **Sequence** — transactional human-readable ID issuance (per-prefix, per-year counters).
- **Cache** — in-memory TTL cache with size caps (`src/lib/cache.ts`) for hot reads
  (catalog, settings). No external cache dependency.

---

## 7. API surface (148 route files, ~160 endpoints)

Full conventions (error model, status codes, pagination, auth/CSRF policy) in
[`team/docs/03-api-contract.md`](./team/docs/03-api-contract.md) and the machine-readable
[`team/docs/openapi.yaml`](./team/docs/openapi.yaml) (149 live paths / 194 operations).

Groups under `src/app/api/`:

| Prefix | What it covers |
|---|---|
| `auth/*` | login / logout / register / me / become-seller |
| `catalog`, `categories`, `home`, `products`, `sellers/[id]`, `favorites`, `reviews` | storefront reads + product CRUD (seller-scoped), bulk ops, CSV export |
| `cart` *(client-side store)* — `orders/*`, `coupons/validate` | checkout, order lifecycle, `orders/[id]/pay` |
| `organizations/*`, `pricing/resolve` | org management/members, contract price resolution |
| `rfqs/*`, `quotes/*`, `recurring-rfqs/*`, `rfq-config`, `approvals/*` | RFQ lifecycle, quoting, messaging, recurring profiles, approval decisions |
| `disputes/*`, `payments/*`, `seller/*` | dispute lifecycle, payment methods/auth/capture, seller stats/earnings/orders |
| `admin/*` | analytics/stats, organizations verification, vendors, products, orders, price-lists + entries, customer-groups, rfqs + rfq-settings (+history/rollback), quotes, disputes, payments (+capture/fail), payouts (+generate/preview/mark-paid), coupons, slides, settings, audit-logs, **financing/** (gate + verdicts, forward/return/start-review, institutions verify/suspend, fees + mark-invoiced/paid, conditions library, documents queue, submissions), `accreditation` ops |
| `financier/*` | financier console: profile, branches, services (+attributes/coverage), conditions (+options), requirements, inbox `requests` (forwarded-only) + open/decline, offers (+withdraw), agreements (+events, funding-status), accreditations (open/grant/reject/revoke) |
| `financing/*` | applicant side: public services discovery, 3-step wizard submissions, my-requests (+submit/resubmit/cancel), offers accept/decline, agreements, documents vault, accreditation status |
| `documents/*`, `uploads/*`, `media/[...key]` | documents vault CRUD, media upload, immutable media serving |
| `notifications/*`, `settings` | bell feed + mark-read, public settings (hero slides etc.) |

Typical endpoint anatomy (RFQ accept):

```
POST /api/quotes/[id]/accept
  → guards.requireUser() → org-role check
  → RfqService.acceptQuote(quoteId, orgId)   (transaction: validate quote validity,
      order + order items at quoted prices, RFQ → ACCEPTED, notifications, audit)
  → ok({ order })
```

---

## 8. Frontend conventions

- **shadcn/ui (New York) primitives** in `src/components/ui` — always reuse these instead
  of hand-rolling controls. Lucide icons only.
- **Role-aware dashboards** — `src/components/dashboards/nav-config.ts` defines nav groups
  per role (`BUYER_NAV`, `SELLER_NAV`, `ADMIN_NAV`, financier groups); the dashboard shell
  (`dashboard-layout.tsx`) renders sidebar + topbar; each console view composes sections.
- **Forms** — react-hook-form + Zod resolvers; server errors surface via sonner toasts.
- **Styling** — Tailwind 4 with CSS variables (oklch palette), dark mode via `next-themes`,
  motion via framer-motion (subtle hover/focus transitions). No blue/indigo primary.
- **Responsiveness & a11y** — mobile-first; 44px touch targets; semantic landmarks
  (`header/main/nav/footer`); sticky footer (`mt-auto` on a `min-h-screen flex flex-col`
  root); ARIA labels; `sr-only` text where needed. This is enforced QA (390px no-overflow
  checks are part of the regression protocol).
- **Charts** — Recharts (seller analytics, admin overview).

---

## 9. Documentation map

| Read | For |
|---|---|
| [`team/docs/README.md`](./team/docs/README.md) | index of the doc suite |
| [`team/docs/01-domain-model.md`](./team/docs/01-domain-model.md) | bounded contexts, 4 Mermaid ERDs, relationship inventory, **12 state machines** |
| [`team/docs/02-use-cases-user-stories.md`](./team/docs/02-use-cases-user-stories.md) | 8 actors, 47 use cases, 65 stories with ACs |
| [`team/docs/03-api-contract.md`](./team/docs/03-api-contract.md) + [`openapi.yaml`](./team/docs/openapi.yaml) | API conventions + full spec |
| [`team/docs/04-architecture-decision-records.md`](./team/docs/04-architecture-decision-records.md) | **ADR-0001…0021** — *why* things are the way they are |
| [`team/docs/05-wireframes-design-system.md`](./team/docs/05-wireframes-design-system.md) | design tokens, component inventory, wireframes |
| [`team/docs/06-data-dictionary.md`](./team/docs/06-data-dictionary.md) | every field of every model (authority for names/types) |
| [`team/docs/07-test-plan-acceptance-criteria.md`](./team/docs/07-test-plan-acceptance-criteria.md) | state-machine transition tables, 97 ACs, invariants |
| [`team/docs/08-deployment-ops-runbook.md`](./team/docs/08-deployment-ops-runbook.md) | topology, env vars, DB ops, incident matrix |
| [`team/docs/09-security-threat-model.md`](./team/docs/09-security-threat-model.md) | trust levels, authz matrix, STRIDE, secrets, PII, money-integrity invariants |
| [`team/DECISIONS.md`](./team/DECISIONS.md) | decision log D-001…D-019 |
| [`team/FINANCIER_SCHEMA.md`](./team/FINANCIER_SCHEMA.md) / [`team/FINANCIER_PLAN.md`](./team/FINANCIER_PLAN.md) / [`team/PLATFORM_PLAN.md`](./team/PLATFORM_PLAN.md) | financing module spec/plan + platform roadmap |

**Quality status (as of the financing module sign-off)**: the full regression protocol —
8 financier flows (discovery, wizard, gate incl. return/forward, financier inbox,
accreditation grant, vault, agreements→funding, multi-financier compare) + core commerce
flows (home/catalog/cart/checkout, RFQs, admin console, notifications) — passed E2E via
headless-browser automation, with responsive (390px) and console-error checks clean.
There is **no unit-test suite on disk** (see ADR on test strategy and doc 07 for the
honest current-state assessment); treat the docs' state-machine tables as the contract.

---

## 10. Development workflow

```bash
bun run dev            # dev server on :3000, log teed to dev.log
bun run lint           # ESLint (next/core-web-vitals + custom rules) — keep it green
bun run db:push        # apply schema.prisma to MySQL (destructive sync — careful, it is the production DB)
bunx prisma generate   # after ANY schema.prisma change
bun run db:seed        # re-seed core demo data
```

Workflow rules that kept this codebase sane (please keep following them):

1. **Change the schema → `prisma generate` → `db:push`** — never edit `db/custom.db` by hand.
2. **New domain? Follow the governing conventions** (§5): child tables over JSON,
   `mediaId` over URL strings, reuse `Sequence`/`AuditLog`/`Notification`.
3. **Business logic goes in `src/server/modules`** — routes stay thin.
4. **Every privileged mutation writes an AuditLog entry** and, where user-relevant, a
   Notification.
5. **Money is `Float`** (a deliberate portability compromise — see data dictionary
   TD-17; cent-rounding helpers in `src/lib/format.ts`).
6. **Commit convention**: `AREA-NN: imperative summary — details` (e.g. `FIN-7: admin financing tab — …`).

---

## 11. Notes for a new developer

- **Database**: the runtime database is the managed **Aiven cloud MySQL 8.4** service wired
  through `DATABASE_URL` (SSL required). The project was originally built on
  MySQL/MariaDB, briefly held a SQLite phase for sandbox portability (D-018/FIN-0 era),
  and has now returned to managed MySQL for good — schema pushed with `prisma db push`,
  data migrated from the previous local store.
- **This repository was built with an autonomous agent loop** (plan → approve → implement
  → verify sprints). The loop's internal artifacts (worklog, task board, sprint plan,
  QA screenshots) are **deliberately excluded** from this repo; the *engineering output*
  of that process (code, docs suite, decision log) is what you see here.
- **What's intentionally NOT here**: CI pipelines, unit tests on disk, Docker files,
  cloud deployment configs. Doc 08 (ops runbook) describes the deployment topology and
  the gaps to close for a real launch (managed DB, backups, secrets vault, CDN, HTTPS at edge).
- **`uploads/` and `db/images*.json` are committed on purpose** (demo media). The real
  `.env` (with live Aiven credentials) is **gitignored** — the repo is public and must never
  carry secrets.

---

*Vendora · built 2026 · Next.js 16 / React 19 / TypeScript / Prisma + MySQL (Aiven)*
