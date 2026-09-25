# Vendora — Wireframes & Design System Specification

| | |
|---|---|
| **Version** | 1.0 |
| **Date** | September 2026 |
| **Audience** | Engineers and designers building any Vendora surface (storefront, buyer/seller/admin consoles, planned financier UI) |
| **Ground truth** | `src/app/globals.css`, `src/app/layout.tsx`, `src/components/**` (49 shadcn primitives + marketplace composition), `src/lib/settings/schema.ts`, `src/components/marketplace/marketplace-app.tsx`. Every token named here exists in code; nothing is aspirational except sections marked **PLANNED** (financier UI). |

---

## 1. Design foundations

### 1.1 Color system (Tailwind v4 CSS-first, shadcn "New York" tokens)
- Token layer: `@theme inline` in `globals.css` exposes `--background, --foreground, --card(+foreground),
  --popover(+foreground), --primary(+foreground), --secondary(+foreground), --muted(+foreground),
  --accent(+foreground), --destructive, --border, --input, --ring, --chart-1..5` plus a full sidebar set
  (`--sidebar, --sidebar-foreground/primary/accent/border/ring`).
- Palettes are defined in **oklch** for `:root` (light) and `.dark`. Components must consume semantic
  tokens (`bg-background`, `text-muted-foreground`, `border-border`…) — never raw oklch values or
  one-off hexes.
- **Accent system (runtime)**: the admin picks any hex (or one of 8 curated `ACCENT_SWATCHES`) in
  Storefront Settings; `<StorefrontTheme />` bridges it live onto `--primary` with dark-mode
  adaptation (`src/components/marketplace/marketplace-app.tsx:120-124`). Legacy named presets
  (orange/emerald/rose/amber) normalize via `normalizeAccentHex`.
- Platform rule: **no indigo/blue as defaults**; accent is owner data, not code.
- Status color semantics (used by chips/badges everywhere):
  `success → primary/green tokens · warning → amber · destructive → --destructive · neutral → muted`.
  Financing status chips (PLANNED) map: `DRAFT muted · SUBMITTED/UNDER_REVIEW info/amber ·
  OFFERED primary · ACCEPTED success · DECLINED_ALL/EXPIRED destructive-muted · CANCELLED/WITHDRAWN muted ·
  INFO_REQUESTED amber`.

### 1.2 Typography
- Fonts: **Geist** (`--font-geist-sans`) + **Geist Mono** (`--font-geist-mono`) via `next/font/google`
  (`src/app/layout.tsx`). `<html lang="en" suppressHydrationWarning>`; no i18n/RTL today (threat-model
  privacy section notes the Arabic-market implication for future financier UI).

### 1.3 Radius, spacing, layout variables
- `--radius: 0.625rem` base with `sm/md/lg/xl` calc scale; admin preset maps
  sharp/compact/cozy/roomy → radius (settings `theme.radius`).
- Layout as data attributes driven by Storefront Settings: `[data-container]` page width,
  `[data-cols]` product-grid column count, `[data-hero-height]` banner height.

### 1.4 Dark mode
- next-themes `attribute="class"`, `defaultTheme="light"`, `enableSystem`,
  `disableTransitionOnChange`. Dark palette = `.dark` token overrides. Every new surface must look
  right in both modes (screenshots convention captures both).

### 1.5 Motion
- View transitions: framer-motion `AnimatePresence mode="wait"` on the SPA view swap
  (`marketplace-app.tsx:128-156`).
- Loading: `.skeleton-shimmer` (+ `@keyframes shimmer-sweep`, reduced-motion aware), Skeleton
  components from `src/components/ui`.
- Ambient: `.step-pulse` + `step-pulse-ring` (onboarding/steps), `.search-glow` (color-mix oklab on
  the search box), hover transitions via Tailwind `transition-colors`.
- Print: `.print-area` / `.no-print` (invoices, quotes PDF view).

### 1.6 Custom CSS utilities (do not reinvent)
`.scrollbar-thin` (styled scroll areas — required for `max-h-* overflow-y-auto` lists),
`.search-glow`, `.skeleton-shimmer`, `.step-pulse(-ring)`, `.print-area/.no-print`,
`body.has-buy-bar` (mobile bottom padding when a sticky buy bar is visible).

## 2. Component inventory

### 2.1 Primitives — `src/components/ui/` (49, shadcn)
accordion, alert, alert-dialog, aspect-ratio, avatar, badge, breadcrumb, button, calendar, card,
carousel, chart, checkbox, collapsible, command, context-menu, dialog, drawer, dropdown-menu, form,
hover-card, input-otp, input, label, menubar, navigation-menu, pagination, popover, progress,
radio-group, resizable, scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner,
switch, table, tabs, textarea, toast, toaster, toggle, toggle-group, tooltip.

Rules: build with these, not around them. Long lists (notifications, RFQ inbox, audit logs) use
`max-h-96 overflow-y-auto` + `.scrollbar-thin`. Feedback for every async action = sonner toasts.
Loading states = Skeleton/shimmer, never blank areas.

### 2.2 Composed marketplace components — `src/components/marketplace/`
- Shell & navigation: `header`, `footer`, `back-to-top`, `marketplace-app` (SPA root),
  `storefront-theme`, `notifications-bell`, `auth-modal`, `cart-drawer`, `search-box`,
  `hero-slider` (+ `slide-editor`), `compare-tray` + `compare-dialog` (product compare, max 4).
- Storefront views: `catalog-view`, `product-view`, `store-view`, `cart-view`, `checkout-view`,
  `orders-view`, `favorites-view`, `product-card`, `star-rating`, `quantity-input`,
  `invoice-dialog`.
- Consoles (with `dashboards/dashboard-layout.tsx` — sidebar + topbar + sticky footer,
  `SignInRequired` / `AccessDenied` shells): `admin-view` + `admin/` (overview, vendors, products,
  orders, organizations, pricing, coupons, payments, payouts, rfqs, disputes, audit, settings,
  + customer-groups/price-lists sections), `seller-view` + `seller/` (products `product-form/`
  with media/variants/attributes/bulk-import, earnings, orders, disputes, rfq-inbox),
  buyer pages in `dashboards/buyer-pages.tsx` + `dashboards/buyer-dashboard.tsx`
  (account, orders, favorites, rfqs `b2b/rfq-view`, business `b2b/business-view`
  with approvals/disputes/recurring cards).

### 2.3 Layout architecture (mandatory)
- Root wrapper: `min-h-screen flex flex-col`; `footer` uses `mt-auto` → sticky to viewport bottom on
  short pages, pushed naturally on long pages; safe-area respected on mobile.
- Storefront shell = header + view container + footer; Console shell = dashboard layout
  (collapsible sidebar nav per role, topbar with theme toggle + notifications, content area).
- Responsive breakpoints: mobile-first (`sm: md: lg: xl:`); touch targets ≥ 44px; mobile checkout
  uses the cart drawer + sticky buy bar (`body.has-buy-bar`).

## 3. Accessibility standards (all surfaces)
- Semantic landmarks (`header/nav/main/section/article/footer`), `sr-only` labels, descriptive alt
  text, keyboard path for every interaction (focus-visible ring via `--ring`), dialogs trap focus
  and close on Esc, form errors linked to inputs (react-hook-form + zod messages), contrast kept by
  consuming token pairs (never custom gray-on-gray), `prefers-reduced-motion` honored by the
  shimmer/pulse utilities.

## 4. Wireframes — existing surfaces

Legend: `[btn]` button, `(tab)` tab, `>` nav item. All ASCII is structural, not pixel-accurate.

### 4.1 Home (`?view=home`)
```
┌──────────────────────────────────────────────────────────────┐
│ header: logo · search-glow box ────── [Sign in] [Cart(2)] ☾  │
├──────────────────────────────────────────────────────────────┤
│ hero-slider (data-hero-height): eyebrow/title/subtitle        │
│ ┌─────────────────────────────────┐  [ctaLabel → ?view=…]     │
│ │ BannerSlide image               │                            │
│ └─────────────────────────────────┘                            │
│ category chips  ·  featured grid [data-cols] product-cards    │
│ ┌card─┐ ┌card─┐ ┌card─┐ ┌card─┐                                │
│ │img  │ │img  │ │img  │ │img  │  (rating★, price, +cart)      │
└─footer: mt-auto ─────────────────────────────────────────────┘
```

### 4.2 Catalog (`?view=catalog&q=&category=`)
```
│ toolbar: category select · price min/max · sort · [cols]      │
│ results: "N items" · skeleton-shimmer while loading           │
│ ┌ product-card grid, pagination ───────────────────────────── │
│ │ each card: image · title · ★4.5 · price · [Add] [♡][⇄]     │
│ (⇄ = add to compare-tray, max 4 → compare-dialog table)      │
```

### 4.3 Product detail (`?view=product&id=`)
```
│ gallery (aspect-ratio, full rendition) │ buy box:             │
│ variants: Size/Color selects            │ price (resolved     │
│ quantity-input                          │  price-list pipeline)│
│ ★ rating · reviews list · [♡ favorite]  │ [Add to cart][Buy]  │
│ specs/highlights tabs · seller store link · shipping policy   │
│ mobile: sticky bottom buy bar (body.has-buy-bar)              │
```

### 4.4 Checkout (`?view=checkout`)
```
│ steps: Address → Payment → Review                              │
│ address form (fullName/city/country/zip/phone)                 │
│ B2B extras (org context): poNumber · costCenter · paymentTerms│
│ payment methods: Card(simulated) | Bank transfer | Invoice(NET)│
│ coupon input · totals · [Place order] → orders-view            │
```

### 4.5 Orders (`?view=orders`)
```
│ list rows: items thumbnails · total · status chip · date       │
│ status flow: PENDING_PAYMENT→PAID→PROCESSING→SHIPPED→DELIVERED │
│ actions: [Pay] [Track] [Dispute] [Invoice .print-area]         │
│ dispute detail: reason select · description · seller response  │
│ escalation timer + outcome chips (refund/replace/…)            │
```

### 4.6 RFQ list & builder (`?view=rfqs`, new RFQ)
```
│ stats tiles (drafts/submitted/quoted/accepted)                 │
│ list: RFQ-2025-000123 · status chip · lines count · deadline    │
│ builder: line rows [product-picker | free text] qty target ₡   │
│ notes · expiresAt · [Submit] → sellers matched (computeElig…)  │
```

### 4.7 RFQ detail & quotes (`?view=rfqs&id=`)
```
│ header: number · status · deadline countdown · messages 🗨     │
│ lines table: product/variant · qty · target price · notes      │
│ quotes (cards, comparable): QTE-… seller · total · validUntil  │
│ per-line breakdown · [Accept] (siblings auto-DECLINE → RFQ    │
│ ACCEPTED) · admin: [Convert to order]                          │
```

### 4.8 Buyer business console (`?view=business`)
```
│ sidebar (dashboard-layout): Overview · RFQs · Approvals ·      │
│ Recurring · Disputes · Org & members · **Financing (PLANNED)**│
│ approvals card: PENDING requests → [Approve][Reject] w/ note   │
│ (requester never self-approves — enforced server-side)         │
```

### 4.9 Seller console (`?view=seller`)
```
│ sidebar: Products · Orders · Earnings · RFQ inbox · Disputes  │
│ products: table + product-form-dialog (tabs: Basics/Pricing/  │
│ Details/Media/Shipping/SEO) · variant editor · bulk import CSV │
│ media tab: uploads (drag ≤6×8MB) · sha256 dedupe notice        │
│ earnings: payout rows PY-… · gross/commission/net breakdown    │
```

### 4.10 Admin console (`?view=admin`)
```
│ sidebar (16 sections): Overview · Vendors · Products · Orders │
│ · Organizations · Pricing · Coupons · Payments · Payouts ·     │
│ RFQs · Disputes · Audit · Settings · Slides · Customer groups  │
│ · Price lists                                                  │
│ vendors: [Verify ✓][Suspend ⏸] commission % override            │
│ payouts: [Preview]→[Generate]→rows→[Mark paid] (state 409-safe)│
│ settings: storefront (theme hex/radius/cols) + RFQ settings    │
│ rail (7 groups, 22 panels, scoped, history + rollback)         │
```

## 5. Wireframes — PLANNED financier surfaces (source: FINANCIER_SCHEMA v4.0, FINANCIER_PLAN flows 1-7; competitor-proven IA)

### 5.1 Financing wizard — step 1: profile review + consent (`business` → Financing card)
```
┌ Wizard ──────────────────────────────────────────────┐
│ (1) Profile & consent  (2) Activity & amount  (3) Review │
├───────────────────────────────────────────────────────┤
│ READ-ONLY personal block (from User — no copy):        │
│  name · email · phone/whatsapp · DOB · gender ·        │
│  marital status · nationality · residence (street/    │
│  city/district) · residenceType · identityType/Number │
│ KYC documents (ApplicantDocument, user-scope):        │
│  [id_document.webp ✓ VERIFIED 2 Mar] [+ Upload once]  │
│ [Edit profile → account]  (single-entry escape hatch) │
│ ☑ I approve the transfer of my personal data          │
│                                        [Continue]     │
└───────────────────────────────────────────────────────┘
```
Rule: nothing here is stored again — the step renders `User` + user-scoped documents by reference
and stamps `FinancingRequest.consentAt` at submit.

### 5.2 Wizard — step 2: activity data & financing amount (22 controls)
```
┌ grouped sections ─────────────────────────────────────┐
│ Activity: status (new/existing) · type (category      │
│  select + *Other free text) · name · description ·    │
│  start date · address · city · district · location    │
│  type (owned/rented)                                  │
│ Underwriting: capital ₡ · own contribution ₡ · monthly │
│  installment capacity ₡ · previous financing (bool) ·  │
│  other income sources                                │
│ The ask: amount ₡ (YER) · currency · purpose ·        │
│  tenor months                                        │
│ Guarantee: type (enum + other) · status (enum+other) │
│ Attachments: [guarantee docs, studies, project files]  │
│  → uploaded via MediaAsset pipeline, linked as        │
│  ApplicantDocument (request-scope)                    │
│ Notes textarea · ☑ terms + privacy                    │
└───────────────────────────────────────────────────────┘
```
Money inputs: `Decimal(12,2)`, currency-suffixed, locale-formatted. Amount bounds validated
against the target product's `amountMin/amountMax` when `productId` is set.

### 5.3 Wizard — step 3: review & submit
```
│ Personal (by reference) │ Activity │ Financing │ Guarantee │
│ attachments list · consent stamp visible               │
│ [Submit] → FR-2026-000001 · status SUBMITTED →         │
│ "My financing requests" (business console) +           │
│ notification to applicant, invites to pool/selected   │
```

### 5.4 My financing requests (`?view=business` → Financing tab)
```
│ stats tiles: submitted / under review / offered /      │
│ accepted / closed                                      │
│ list cards: FR-… · activity name · provider/product    │
│ (when direct) · date · status chip · latest note       │
│ detail: full request (all sections by reference) ·     │
│ status timeline (AuditLog history + notes) · documents │
│ offers table w/ [Compare] · [Cancel request]           │
│ (pre-acceptance only → CANCELLED/WITHDRAWN)             │
```

### 5.5 Financier console (`?view=financier` — org-gated by membership)
```
│ sidebar: Inbox · My offers · Products · Profile ·     │
│ (P5) Accreditation programs                           │
│ inbox: distributed requests (coverage + ticket-range   │
│ match) · detail: applicant org/user (references) ·     │
│ underwriting figures · documents (verification queue:  │
│ [✓ Verify] [✗ Reject + note] per doc) ·                │
│ [Request info] (status INFO_REQUESTED) ·               │
│ offer composer: amount · rateType/rate% · fee · tenor  │
│ · collateralRequired · validUntil · installment rows   │
│ (no. · due date · amount — FinancingOfferInstallment)  │
│ → [Send offer] (request → OFFERED)                    │
│ agreements: funding events reporter (DISBURSEMENT/     │
│ REPAYMENT rows) — track-only, D-002                    │
```

### 5.6 Public financier directory + product page (`?view=` extension, DP-10)
```
│ directory cards: logo · org name · institution type · │
│ verified ✓ · branches/agents · stats (views)          │
│ product page: category chip · amount range · rate cap │
│ · tenor · sharia badge · features/conditions bullets   │
│ (trait child tables) · coverage chips · [طلب تمويل    │
│ "Apply for financing" → wizard w/ productId]          │
```

## 6. Rules for building new surfaces (checklist)
1. Consume semantic tokens only; both themes verified; accent comes from settings, never hardcoded.
2. Primitives from `src/components/ui` first; `max-h-96 overflow-y-auto .scrollbar-thin` for lists.
3. Every mutation → toast (sonner) + optimistic disabled state; every fetch → skeleton, never blank.
4. Status always a chip with the mapped semantic color (§1.1); dates locale-formatted; money with
   currency + 2 decimals from `Decimal` serialization.
5. Sticky footer (`min-h-screen flex flex-col` + `mt-auto`); 44px touch targets; keyboard path.
6. New view = extend `routing.ts` registry + role nav config + console/dashboard shell lockstep
   (5-file pattern in FINANCIER_PLAN FIN-4).
7. Documents/uploads always via the MediaAsset pipeline (≤6×8MB, magic-byte validated) — never a
   parallel uploader.
