# Vendora — Multi-Page Architecture & Design Proposal

> **Status:** Proposal for review — **no code has been modified.**
> **Author:** Z.ai Code · **Date:** Oct 2025
> **Scope:** Restructure the platform from a single-page marketplace experience into a true multi-page website (separate pages, not an SPA) that presents the full scope of Vendora's activity.

---

## 1. Problem Statement

Today, everything the visitor can see lives on a single route (`/`). The landing experience is 100% commerce: hero banner slider, category grid, featured products, trending, new arrivals. A first-time visitor reasonably concludes: *"Vendora is a solar equipment shop."*

In reality the marketplace is **one pillar** of the platform. Already built and live in the backend — but invisible or buried:

| Already built (hidden behind `?view=` links) | Where it lives today |
| --- | --- |
| Solar equipment marketplace (26 products, 6 categories, 5 branded sellers, cart, checkout, reviews, favorites, compare) | `/?view=catalog`, `/?view=product&id=…` |
| Seller & vendor system (storefronts, listings, earnings, payouts, disputes) | `/?view=seller`, `/?view=store&id=…` |
| B2B procurement engine (RFQs, quotes, recurring RFQs, approvals, price lists, customer groups, organizations) | `/?view=rfqs`, `/?view=business` |
| **Funding / financing module** (funding entities such as Alaqla & Kuraimi, financing requests, offers, agreements, accreditation, entity console, admin financing gate) | `/?view=financing`, `/?view=financier` |
| Admin console, notifications, buyer dashboard | `/?view=admin`, `/?view=account` |

**Consequences of the current structure**
- The platform's identity (energy commerce + funding) is never communicated at first glance.
- The financing module — a major differentiator — has **no public home**, so funders and fund-seekers cannot discover it.
- URLs are query-param driven (`/?view=product&id=…`) — poor for sharing, SEO, and analytics.
- Navigation mixes public storefront with internal consoles on one route.

**What the user has mandated**
1. **Homepage** — assembled from sections of the other pages, so a visitor instantly understands the whole platform.
2. **Market** — the marketplace exactly as it exists today.
3. **Funding entities** — a public page presenting the funding side.
4. **About us.**
5. **Contact us.**
6. Additional pages proposed by us, delivered as **separate server-rendered pages — explicitly not an SPA.**

---

## 2. Platform Vision & Positioning

**Vendora is the renewable-energy platform:** the place where individuals, farms, and businesses **buy solar equipment**, **procure in bulk**, and **get their projects funded** — all under one roof.

One-line positioning for the homepage hero:

> *"From sunlight to savings: shop it, procure it, fund it."*

Three pillars (each maps to one primary page / area):

| Pillar | Page | One-line promise |
| --- | --- | --- |
| ① **Shop** | `/market` | Engineer-reviewed solar panels, batteries, inverters & submersible pumps — from vetted sellers. |
| ② **Buy as a business** | `/market` (B2B area) | RFQs, quotes, recurring procurement, and organization price lists. |
| ③ **Fund** | `/funding` | Verified funding entities and financing programs for your solar project. |

---

## 3. Proposed Information Architecture (Site Map)

```
vendora ─ public website (multi-page, server-rendered)
│
├── /                          Homepage  → composite: sections from every page
│
├── /market                    The marketplace (current experience, relocated)
│     ├── ?category=…&q=…      Catalog (Phase 1: existing query-param system)
│     ├── /product/[id]        Product detail page          (Phase 2 — real URL)
│     ├── /store/[id]          Seller public storefront      (Phase 2 — real URL)
│     └── /category/[slug]      Category landing page         (Phase 2 — real URL)
│
├── /funding                   Funding entities (public)
│     ├── /apply               Financing request wizard (authenticated)
│     └── /entities/[id]       Funding-entity public profile (Phase 3)
│
├── /about                     About us
│
├── /contact                   Contact us
│
├── (proposed additions)
│     ├── /how-it-works        How the platform works end-to-end (3 pillars)
│     ├── /solutions           Use-case landing pages (Home / Farm / Business)
│     ├── /sell                "Sell on Vendora" — seller onboarding landing
│     ├── /insights            Guides, news & solar learning center (blog)
│     ├── /faq                 Frequently asked questions
│     └── /legal/terms · /legal/privacy
│
└── (console area — authenticated, no public chrome, unchanged behavior)
      ├── /dashboard           Buyer dashboard (account, orders, favorites)
      ├── /dashboard/rfqs      B2B RFQ inbox
      ├── /dashboard/business  Organization & business account
      ├── /dashboard/financing My funding requests (existing financing wizard)
      ├── /seller              Seller console
      ├── /financier           Funding-entity console
      └── /admin               Platform administration
```

**Routing principle (user requirement):** every box above is a **real Next.js App Router route** with its own server-rendered page, own URL, own metadata — real page navigations via `<Link>`, natural browser back/forward, shareable/SEO-friendly links. No single-route view-switching SPA shell for the public site. (Internal consoles keep their existing tab-based layout *inside* their own section, which is a familiar dashboard pattern, not part of the public website.)

### URL migration map (existing → new)

| Old (query-param SPA) | New |
| --- | --- |
| `/` | `/` (new composite homepage) |
| `/?view=home` | `/market` |
| `/?view=catalog&category=solar-pumps&q=…` | `/market?category=solar-pumps&q=…` (Phase 1) → `/market/category/solar-pumps` (Phase 2) |
| `/?view=product&id=…` | `/market/product/…` (Phase 2) |
| `/?view=store&id=…` | `/market/store/…` (Phase 2) |
| `/?view=cart` / `checkout` | `/market?view=cart` / `checkout` (Phase 1, unchanged UX) |
| `/?view=rfqs` / `business` | `/dashboard/rfqs` / `/dashboard/business` |
| `/?view=financing` | `/dashboard/financing` |
| `/?view=financier` | `/financier` |
| `/?view=seller` / `admin` / `account`… | `/seller` / `/admin` / `/dashboard`… |

All old URLs must **301-redirect** (middleware rewrite table) so no existing link, bookmark, or Google-indexed URL breaks.

---

## 4. Global Elements (shared across all public pages)

### 4.1 Site header (new — replaces the shopping-only header on non-market pages)

```
┌──────────────────────────────────────────────────────────────────────┐
│ [announcement bar — admin-controlled, as today]                        │
├──────────────────────────────────────────────────────────────────────┤
│ ☀ Vendora    Home  Market  Funding  About  Contact     🔍 🌙  [Sign in] │
│              ─────  (active page underline)             🛒 (badge)    │
└──────────────────────────────────────────────────────────────────────┘
```
- Sticky, blurred backdrop (as today), 44px+ touch targets, keyboard accessible.
- **Cart badge stays site-wide** (cart already persists in local storage, so it is available on every page).
- Sign in → auth modal (existing component); when signed in → avatar dropdown with dashboard links (role-aware, existing logic).
- Mobile: hamburger **Sheet** listing the five primary pages + account/cart; primary nav targets ≥44px.

### 4.2 Market header (inside `/market/*` only)
The current marketplace header — search box, category dropdown, cart — remains exactly as-is inside the market section, stacked under a slim site-nav strip so the user can always jump back to `/`, `/funding`, `/about`, `/contact`:

```
│ Vendora   Home  [Market]  Funding  About  Contact                 │ ← site strip
│ 🔍 Search solar gear…      [categories ▾]              🛒  👤       │ ← market bar
```

### 4.3 Footer (new — platform-wide, sticky to bottom)

```
┌──────────────────────────────────────────────────────────────────────┐
│  Vendora — Solar energy, procured and funded.                         │
│                                                                        │
│  PLATFORM        MARKET            FUNDING          COMPANY           │
│  Home            All products      Funding entities  About us          │
│  How it works    Solar panels      How to apply      Contact us        │
│  Solutions       Batteries         Eligibility       Careers*          │
│                  Inverters …        FAQ*             —                 │
│                                                                        │
│  ACCOUNT: Sign in · Buyer dashboard · Seller console                   │
│  📣 Newsletter — monthly solar insights, no spam        [social icons] │
├──────────────────────────────────────────────────────────────────────┤
│  © 2025 Vendora · Terms · Privacy · Language: EN                       │
└──────────────────────────────────────────────────────────────────────┘
```
- `mt-auto` inside a `min-h-screen flex flex-col` root → footer always sits at the bottom on short pages and is pushed down naturally on long pages.
- Footer links double as an SEO footer silo (each page reachable in ≤2 clicks from anywhere).

### 4.4 Breadcrumbs
On every non-home page: `Home › Market › Solar Pumps › DeepFlow 1.5HP` — with `Breadcrumb/JSON-LD`.

---

## 5. Tier-1 Page Specifications (the five mandated pages)

### 5.1 Homepage — `/`

**Purpose:** in five seconds, a visitor understands: *Vendora = shop + procure + fund solar.* Every section is a preview of a full page and hands off to it with a clear CTA.

**Sections (top → bottom):**

```
┌────────────────────────────────────────────────────────────────┐
│ S1  HERO — platform-level statement                             │
│     "Solar energy — bought, procured and funded in one place"   │
│     [Shop the market →]   [Get funding →]   [How it works]      │
│     trust row: ✔ 26 products  ✔ 5 vetted sellers  ✔ 2 funding   │
│       entities  ✔ engineer-reviewed gear                        │
├────────────────────────────────────────────────────────────────┤
│ S2  THE THREE PILLARS (identity strip)                          │
│     [🛒 Shop]        [🏢 Buy for business]      [🏦 Fund]        │
│     panels, batteries  RFQs, quotes, price lists  entities &    │
│     inverters, pumps   recurring procurement     programs        │
│     → /market         → /market#b2b             → /funding      │
├────────────────────────────────────────────────────────────────┤
│ S3  MARKET PREVIEW (section borrowed from the market page)      │
│     category tiles (6 solar categories) + 4–8 featured products │
│     carousel (reuse ProductCard)  → "Browse the full market →"   │
├────────────────────────────────────────────────────────────────┤
│ S4  FUNDING PREVIEW (section borrowed from the funding page)     │
│     "Meet the funding entities behind our projects"             │
│     entity logos/cards (Alaqla, Kuraimi, …) + 3-step mini       │
│     process + [See how funding works →]  [Apply now →]           │
├────────────────────────────────────────────────────────────────┤
│ S5  B2B PREVIEW                                                  │
│     "Buying for a farm or a company?" — RFQ card + recurring     │
│     procurement + organization price lists  → /market#b2b        │
├────────────────────────────────────────────────────────────────┤
│ S6  NUMBERS / TRUST BAR                                         │
│     products listed · sellers · funding entities · orders ·     │
│     categories served (live from existing APIs)                 │
├────────────────────────────────────────────────────────────────┤
│ S7  TESTIMONIALS — one buyer, one seller, one funded customer    │
├────────────────────────────────────────────────────────────────┤
│ S8  FINAL CTA + newsletter — dual button (market / funding)      │
└────────────────────────────────────────────────────────────────┘
```

**Composition rules**
- Every preview section uses the **same visual components as its target page** (same `ProductCard`, same entity card, same step graphics) so the homepage genuinely feels like "sections from different pages", and clicking through is visually continuous.
- Section header pattern: eyebrow label (MARKET / FUNDING / B2B), headline, one-line description, right-aligned "View all →".
- Hero banner system: reuse the existing admin-controlled `BannerSlide` slider, with platform-level slides (admin already has the slide editor).
- Above-the-fold rule: S1 + S2 visible together on a 1366×768 screen — the platform identity lands without scrolling.

**Data (all from existing APIs, no new backend):** `/api/home`, `/api/categories`, `/api/settings` (+ slides), `/api/financier/services` public projection (needs a lightweight public endpoint — see §8.3).

---

### 5.2 Market — `/market`

**Purpose:** the shopping experience exactly as it exists today — the SPA simply relocates here and its internal catalog/product/cart/checkout views continue to work (Phase 1), then get extracted to real URLs (Phase 2).

**What moves here unchanged:** hero slider, categories, catalog with filters/search/sort/pagination, product detail, seller storefronts, cart drawer + cart page, checkout, favorites, compare tray, recently viewed.

**What is added:** the slim site-nav strip on top (§4.2) and a small **B2B strip** (`/market#b2b`) between catalog sections: *"Buying in bulk? Send an RFQ instead"* → opens the existing RFQ flow (authenticated).

**URLs:** Phase 1 keeps `?view=`/`?category=`/`?q=` params *inside* `/market` (zero-risk move). Phase 2 extracts:
- `/market/category/solar-panels` … (6 SEO landing pages)
- `/market/product/<slug-or-id>`
- `/market/store/<seller-id>`

**SEO:** per-category metadata, `Product` JSON-LD with offers & aggregateRating (reviews already in DB), seller `Organization` JSON-LD.

---

### 5.3 Funding — `/funding`

**Purpose:** the public home of the financing side — present the funding entities, their programs, and the path to financing. Today this module has *no public face at all*; this page is the single biggest identity fix.

```
┌────────────────────────────────────────────────────────────────┐
│ HERO — "Fund your solar project with verified entities"          │
│        [Apply for funding →]  [Talk to us]                       │
├────────────────────────────────────────────────────────────────┤
│ HOW FUNDING WORKS (4 steps, from existing flow)                  │
│  1 Submit request  2 Platform review  3 Entity offer  4 Agreement│
│   (existing wizard)  (admin gate)     (existing offers) & funding│
├────────────────────────────────────────────────────────────────┤
│ FUNDING ENTITIES DIRECTORY                                       │
│  verified cards: logo, name, type (bank / financing co / fund),  │
│  active programs, coverage, "verified ✔" badge                   │
│  → each entity gets a profile page /funding/entities/[id]         │
├────────────────────────────────────────────────────────────────┤
│ FINANCING PROGRAMS (from existing financier services)            │
│  e.g. installment plans, equipment leasing, project financing —  │
│  card per program with eligibility summary + "Check eligibility" │
├────────────────────────────────────────────────────────────────┤
│ ELIGIBILITY & DOCUMENTS (from existing requirements library)     │
├────────────────────────────────────────────────────────────────┤
│ SUCCESS STORIES (funded projects — case-study cards)             │
├────────────────────────────────────────────────────────────────┤
│ FAQ (accordion, reuse) + FINAL CTA [Apply now]                   │
└────────────────────────────────────────────────────────────────┘
```

**Relationship to what exists:** the *authenticated* flows (buyer financing wizard, entity console, admin gate, offers, agreements, accreditation) stay as they are — they move to `/funding/apply` (wizard) and `/financier` (console). The public page is a new presentation layer over existing data: institutions (`Organization` records), financing services, and requirements.

**Data needed:** one new read-only public endpoint listing verified institutions + published programs (server-side rendered, cached). Everything else already exists.

---

### 5.4 About us — `/about`

| Section | Content |
| --- | --- |
| Hero | Mission statement + photo/illustration |
| Who we are | The story: why we built a solar platform for this market |
| Vision & mission | Two-column cards |
| Values | 4 value cards (transparency, engineering quality, partnership, impact) |
| By the numbers | Reuse the S6 stats component |
| Team | Founder/leadership grid (photo, name, role, one-liner) |
| Partners | Funding entities + seller brands (logos) |
| CTA | "Work with us" → `/contact` |

Content is static (server component, no client JS) — fastest page on the site, great for SEO/E-E-A-T.

---

### 5.5 Contact us — `/contact`

| Section | Content |
| --- | --- |
| Hero | "Talk to the Vendora team" |
| Channels grid | Sales & orders · Funding & financing · Seller support · Partnerships — each with email + hours |
| Contact form | Name, email, topic (dropdown: Order / Funding / Selling / Partnership / Other), message → API stores it & notifies (email via existing mailer) |
| Visit us | Address, hours, map placeholder |
| Quick links | FAQ, Track order, Funding FAQ, Seller onboarding |
| Social | Instagram · X · LinkedIn · WhatsApp |

**Validation & states:** inline field errors, submit spinner, success toast + confirmation state, rate-limited API (existing `rate-limit.ts`).

---

## 6. Tier-2 Pages (our proposals — to be scheduled after your approval)

| Page | Why we propose it | Phase |
| --- | --- | --- |
| `/how-it-works` | One page, three visual tracks (shop / procure / fund) — deepens the homepage pillars; best page to link from ads | 2 |
| `/solutions` (+ `/solutions/home`, `/farm`, `/business`) | Segment landing pages: home rooftop, agricultural pumping, commercial — each curates products + relevant funding programs | 3 |
| `/sell` | "Sell on Vendora" — converts equipment suppliers; mirrors the existing become-seller flow | 3 |
| `/insights` (+ `/insights/[slug]`) | Solar guides & platform news; content marketing + SEO engine | 4 |
| `/faq` | Deflect support tickets; feed the FAQ JSON-LD | 4 |
| `/legal/terms`, `/legal/privacy` | Required before any serious B2B/funding traffic | 4 |
| Custom 404 / 500 | Branded error pages with search + top links | 2 |
| Language: Arabic/RTL version | Optional — the funding entities and market suggest regional demand; needs your decision | 5 |

---

## 7. Technical Architecture

### 7.1 Rendering model — why this is *not* an SPA
- Every URL in §3 is a **distinct Next.js App Router page**, server-rendered (React Server Components), with small client islands only where interaction demands it (carousels, forms, cart button, theme toggle).
- Navigations between pages are real document navigations via `<Link>`; each route ships only its own JS; refresh-safe, shareable, crawlable.
- The existing Zustand store (cart, session) is intentionally kept *cross-page* (persisted) — that is shared state, not an SPA shell.

### 7.2 File structure

```
src/app/
├── (site)/                       ← public website chrome (site header/footer)
│   ├── layout.tsx
│   ├── page.tsx                  ← new composite homepage
│   ├── about/page.tsx
│   ├── contact/page.tsx
│   ├── funding/page.tsx
│   ├── funding/apply/page.tsx
│   ├── how-it-works/page.tsx · solutions/… · sell/… · insights/…
│   └── not-found.tsx
├── (market)/
│   ├── market/layout.tsx         ← site strip + market header/footer
│   └── market/page.tsx           ← relocated MarketplaceApp (Phase 1)
│       market/product/[id]/page.tsx   (Phase 2)
│       market/store/[id]/page.tsx     (Phase 2)
│       market/category/[slug]/page.tsx(Phase 2)
├── (console)/                    ← no public chrome (existing DashboardLayout)
│   ├── dashboard/{page,orders,rfqs,business,financing,favorites}
│   ├── seller/page.tsx · financier/page.tsx · admin/page.tsx
├── api/…                         ← unchanged
└── middleware.ts                 ← 301 redirect map from legacy ?view= URLs
```

### 7.3 Data & endpoints
- Reuse: `/api/home`, `/api/categories`, `/api/products`, `/api/settings` (+ slides), `/api/sellers`, auth endpoints.
- New (small, read-only): `GET /api/public/funding` (verified institutions + published programs + stats) for the homepage S4 and `/funding`; `POST /api/contact` for the contact form.
- Server components fetch internally (direct service calls, not HTTP), so pages stay fast and cacheable.

### 7.4 SEO
- `metadata` API per page (title, description, canonical, OG image per page).
- `sitemap.ts` (home, market, categories, products, stores, funding, about, contact) + `robots.ts`.
- JSON-LD: `Organization` (global), `WebSite` + `SearchAction`, `Product` + `Offer` + `AggregateRating`, `FAQPage`, `BreadcrumbList`.
- Clean URLs, no `?view=` in public sitemap.

### 7.5 Performance budget
- LCP < 2.5s on 3G for homepage and funding page (hero image preloaded, `next/image`).
- Static/ISR for about/contact/how-it-works; dynamic for market & funding lists.
- Lazy-load below-fold sections (existing pattern already proven on the current home view).

---

## 8. Migration Plan (phased, zero-downtime, reversible)

| Phase | Deliverables | Acceptance criteria |
| --- | --- | --- |
| **0 — Foundation** | New `(site)` layout: site header, footer, breadcrumbs, redirect middleware; homepage S1/S2/S6/S7/S8 (static parts) | Old URLs 301 correctly; homepage live; market untouched at `/` yet |
| **1 — Market relocation** | Move `MarketplaceApp` → `/market` (all `?view=` params keep working under `/market`); homepage gains S3 (market preview) + S4 (funding preview, static cards) + S5 (B2B) | Full shopping flow works on `/market`; cart persists across pages; no broken links |
| **2 — Real URLs for market** | `/market/product/[id]`, `/market/store/[id]`, `/market/category/[slug]` + product JSON-LD + 404 page | Every product reachable by clean URL; rich results valid |
| **3 — Funding page** | `/funding` public page + `/funding/apply` (existing wizard behind auth) + public endpoint + entity profile pages | Funding entities visible publicly; apply flow end-to-end |
| **4 — About / Contact / extras** | `/about`, `/contact` (+ `POST /api/contact`), how-it-works, sell, FAQ, legal, insights | All five mandated pages + proposals live |
| **5 — Polish** | Arabic/RTL decision, analytics events, SEO audit, Lighthouse ≥ 90 on all pages | Sign-off |

**What is explicitly NOT rebuilt:** seller/financier/admin consoles (relocated only), checkout & payments, RFQ engine, storage/media pipeline, auth (modal stays). This keeps risk low and reuses ~90% of existing code.

**Risks & mitigations**
- *Broken bookmarks/SEO* → middleware 301 table, exhaustive redirect tests.
- *Cart/session across pages* → already persisted in localStorage; verified in Phase 1 acceptance.
- *Dev-server instability* → migrate in small phases, verify with agent-browser after each.
- *Scope creep on funding page* → Phase 3 is presentation-only over existing data.

---

## 9. Design System Guidelines (continuity)

- **Stack:** existing Tailwind 4 + shadcn/ui (New York) + Lucide icons; no new UI framework.
- **Palette:** keep the current primary (amber/solar) family; market pages unchanged so returning shoppers feel at home. **No indigo/blue.**
- **Identity device:** a small "three pillars" glyph (sun / box / bank) used in header, footer, and section eyebrows — reinforces the platform story visually.
- **Typography/spacing:** existing scale; section rhythm 96px (desktop) / 64px (mobile).
- **Motion:** subtle framer-motion fade/slide on section reveal (existing pattern), `prefers-reduced-motion` respected.
- **Accessibility:** semantic landmarks (`header/main/footer/nav`), visible focus rings, AA contrast, alt text on all imagery, keyboard-navigable menus/carousels.
- **Responsive:** mobile-first; mobile nav Sheet; footer respects safe-area insets; touch targets ≥ 44px.
- **Sticky footer:** `min-h-screen flex flex-col` + `mt-auto` on every page layout.

---

## 10. Open Questions (need your input before Phase 0)

1. **Brand line on the homepage hero** — approve or edit: *"Solar energy — bought, procured and funded in one place."*
2. Should the **funding entities directory** show all institutions publicly, or only "featured/published" ones? (Admin today can verify/suspend institutions — we suggest showing verified-only.)
3. **Arabic / RTL** — should we plan it now (Phase 5) or defer?
4. **Contact channels** — which real emails/phone/WhatsApp should appear on `/contact`?
5. **Insights/blog** — do you want an editorial area, or keep it out of scope for now?

---

## 11. Approval Checklist

- [ ] Homepage section order (S1–S8) approved
- [ ] URL structure & redirects approved
- [ ] Funding page scope (public directory + apply hand-off) approved
- [ ] Tier-2 page list & phasing approved
- [ ] Open questions answered

**Upon approval, Phase 0 can start immediately** — beginning with the site header/footer and the new homepage, without touching a single line of the market's shopping flow.

---

*End of proposal — `pagedesign.md`. No code was modified.*
