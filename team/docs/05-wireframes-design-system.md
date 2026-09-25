# Vendora — Wireframes & Design System Specification

| | |
|---|---|
| **Version** | 1.1 — planned-financier surfaces (§5–§6) rebuilt to the v5.0 model (D-015/D-016: services · platform gate · requirements engine · universal vault · multi-financier siblings · accreditation as a main service) |
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
  Financing chips (PLANNED, v5 gate-first) map — request status: `DRAFT muted ·
  SUBMITTED/UNDER_PLATFORM_REVIEW amber · RETURNED_FOR_COMPLETION destructive ·
  FORWARDED_TO_FINANCIER primary-muted · UNDER_FINANCIER_REVIEW amber · OFFERED primary ·
  ACCEPTED success · DECLINED/EXPIRED destructive-muted · CANCELLED muted`;
  requirement chips (`RequirementSubmission`): `PENDING muted · SUBMITTED amber · VERIFIED success ·
  REJECTED destructive · WAIVED secondary`; document chips (`AccountDocument`): `PENDING amber ·
  VERIFIED success · REJECTED destructive`; accreditation mirrors the request set plus
  `ACCREDITED success · REVOKED destructive · EXPIRED destructive-muted`.

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

### 3.1 Gate-console specifics (PLANNED — W-GATE-QUEUE / W-GATE-REVIEW)
- The FORWARD button's **disabled state must be announced to screen readers**: `aria-disabled="true"`
  plus the reason ("3 of 5 required items verified — 1 SUBMITTED, 1 REJECTED item blocks"), never a
  bare `pointer-events: none` or a hidden button.
- **Verify / reject / waive actions require a confirmation step**; reject and waive open a dialog
  with a REQUIRED note input (`RequirementSubmission.decisionNote`) before the state change applies.
- **Checklist rows are keyboard-navigable** as a composite list: ↑/↓ move between requirement rows,
  Enter opens the row's action set, Esc closes; focus ring uses `--ring`; row status chip text is
  included in the row's accessible name (not color alone).

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
│ Recurring · Disputes · Org & members · **Financing &          │
│ Accreditation (PLANNED — §5.4)**                              │
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

## 5. Wireframes — PLANNED financier surfaces (v5.0)

Source: `team/FINANCIER_SCHEMA.md` **v5.0** + `team/FINANCIER_PLAN.md` **v2.0** (flows 1–8) —
the D-015/D-016 services · gate · requirements model. v5 invariants that shape every surface here:
- financiers offer **SERVICES**, not products — `FinancierService` with `serviceKind`
  FINANCING | ACCREDITATION (DP-22);
- **the PLATFORM VERIFICATION GATE is the essence of the platform** (DP-23): platform management
  verifies every requirement item BEFORE forwarding; incomplete/incorrect requests are RETURNED,
  never forwarded, and are structurally invisible to financier inbox queries (R-4);
- the flexible **REQUIREMENTS ENGINE** (DP-24): GENERAL platform library + financier-private
  conditions, 8 typed kinds (DOCUMENT / PROFILE_FIELD / DECLARATION / TEXT / NUMBER / DATE /
  SELECT / MULTI_SELECT), attached per service via `ServiceRequirement`, verified per request via
  `RequirementSubmission`;
- the **universal document vault** — `AccountDocument` for every user + org, verified once, reused
  by every request type (DP-27);
- **multi-financier routing** = sibling requests sharing `multiGroupId` (DP-25);
- **accreditation is a MAIN service** (DP-26) — gate → grant-on-request (`ACCREDITED` + `validUntil`),
  RFQ unlock, `autoPassAccredited` auto-pass on the financier's other services.

Superseded v4 concepts (gone from every wireframe below): `FinancingProduct`,
`FinancingRequestInvite`, product/distribution modes (`distributionMode`, DP-28-deferred),
`ApplicantDocument` (→ `AccountDocument`), `INFO_REQUESTED`, financier-side document verification.

Legend: `[btn]` button · `(tab)` tab · `>` nav item · `→` link/jump · `✱` required ·
`⚡ autoPassAccredited` · `⛔` blocked action. All ASCII is structural, not pixel-accurate.

### 5.1 W-WIZ-1 — Financing wizard · step 1: profile & consent review (`business` → Financing card, or a service page)
```
┌ Wizard · step 1: profile & consent review ─────────────────┐
│ target: Al-Amal Bank · "E-Loan" — FINANCING service        │
│         (serviceId locked from service page / picker)      │
│ multi-financier: [x] also apply to 2 more financiers →     │
│         sibling requests share multiGroupId (DP-25) —      │
│         one request per service, each checklist intact     │
│ steps: (1) Profile & consent  (2) Activity + checklist     │
│        (3) Review & submit                                 │
│ READ-ONLY personal block — from User, never copied (R-2):  │
│   name · email · phone/whatsapp · DOB · gender · marital   │
│   status · nationality · residence street/city/district ·  │
│   residenceType · identityType · identityNumber            │
│ document vault — AccountDocument, user scope (DP-27):      │
│   [ id_document.webp    ✓ VERIFIED   2 Mar  ]              │
│   [ bank-statement-06  ⚠ PENDING    1 d    ]               │
│   [ Manage documents → documents center (W-VAULT) ]        │
│ [ Edit profile → account settings ]   (single-entry escape │
│   hatch — there is no second profile copy)                 │
│ ☑ I approve the transfer of my personal data               │
│         → stamps FinancingRequest.consentAt at submit      │
│                                                [Continue]  │
└────────────────────────────────────────────────────────────┘
```

Rule: nothing here is stored again — the step renders `User` + the `AccountDocument` vault by
reference and stamps `FinancingRequest.consentAt` at submit. Vault-verified docs pre-satisfy
DOCUMENT checklist items in step 2 (R-2 — upload once, reuse everywhere).

### 5.2 W-WIZ-2 — Wizard · step 2: activity data & ask + REQUIREMENTS CHECKLIST
```
┌────────left — activity & ask (22 controls)─────────┬───────right — requirements checklist────────┐
│ ACTIVITY & ASK — the 22-control form               │ REQUIREMENTS CHECKLIST — service (7 items)  │
│ Activity: status NEW|EXISTING · category           │   ServiceRequirement rows in displayOrder;  │
│   (+ *Other free text) · name · description ·      │   per item: kind badge · ✱ required · per-  │
│   start date · address · city · district ·         │   service instructions                      │
│   location type OWNED|RENTED                       │ [DOC✱] Valid commercial registration        │
│ Underwriting: capital ₡ · own contribution ₡ ·     │    → pick verified vault doc / upload once  │
│   monthly installment capacity ₡ · previous        │ [PROFILE✱] Organization taxId → auto-eval ✓ │
│   financing (bool) · other income sources          │ [DECL✱] Data-truth declaration → ☑ assert   │
│ The ask: amount ₡ · currency · purpose · tenor mo  │ [NUM✱] Years in business → [ 5 ] (min/max)  │
│   (bounds validated vs service.amountMin/Max)      │ [DATE ] Trade-license issue date → [– – –]  │
│ Guarantee: type · status (+ *Other companions)     │ [SELECT ] Collateral class → (gold ▾)       │
│ Attachments: guarantee docs · studies · project    │ [MULTI ] Sectors → ☑retail ☐agri ☑tech      │
│   files → RequestAttachment (kind-tagged; each     │  legend: ✱ isRequired · answers typed by    │
│   file → AccountDocument → MediaAsset)             │  conditionType → RequirementSubmission rows │
│ Notes textarea · ☑ terms + privacy consent         │                                             │
└────────────────────────────────────────────────────┴─────────────────────────────────────────────┘
```

The left column writes typed `FinancingRequest` columns (the competitor-proven 22-control activity
form); the right column answers the service's checklist — one `RequirementSubmission` row per
`ServiceRequirement` (PENDING → SUBMITTED as answered). PROFILE_FIELD items auto-evaluate;
DOCUMENT items attach an `AccountDocument` from the vault (upload-once-then-attach);
SELECT/MULTI_SELECT choices come from `ConditionOption` rows (R-1 — never JSON blobs).

### 5.3 W-WIZ-3 — Wizard · step 3: review & submit → the gate, not the financier
```
┌ Wizard · step 3: review & submit ─────────────────────┐
│ Review & submit — everything by reference:            │
│  Personal (User) │ Activity │ Ask │ Guarantee │       │
│  checklist answers · vault attachments · consent ✓    │
│ multi-financier banner: 3 sibling requests will be    │
│  created (multiGroupId MG-2026-000317) — Al-Amal ·    │
│  Al-Kuraimi · Tadhamon                                │
│ [ Submit ]  → FR-2026-000042 (+ FR-…-043, FR-…-044)   │
│    → status SUBMITTED · consentAt stamped             │
│    → enters the PLATFORM VERIFICATION GATE queue      │
│    → "My financing requests" + applicant notification │
│  (financiers are NOT notified — the gate forwards     │
│   later, R-4; v4 invites/distribution are gone)       │
└───────────────────────────────────────────────────────┘
```

Submit assigns `FR-` numbers via `Sequence 'FIN'`, stamps `consentAt`, and routes every sibling to
the PLATFORM GATE queue (flow 4) — NOT to financiers. v4's invite/distribution step is gone
(DP-25 / DP-28).

### 5.4 W-MY-REQ — My financing requests & gate-aware request detail
```
┌ My financing requests — business view → Financing card ────────┐
│ stats tiles: in gate · returned · offered · accepted · closed  │
│ list cards: FR-… · service (financier · service name) · date · │
│   status chip · latest note                                    │
│ multi-group row: MG-2026-000317 · 3 siblings ·                 │
│   [ Compare → W-MULTI-COMPARE ]                                │
│ detail view:                                                   │
│  gate banner — PLATFORM GATE status chip +                     │
│    "3 of 5 required verified" + returnedReason (when           │
│    RETURNED_FOR_COMPLETION) + [ Edit & resubmit ]              │
│    (→ back to gate; untouched verified items kept)             │
│  per-requirement verdicts: title · kind · status chip          │
│    PENDING/SUBMITTED/VERIFIED/REJECTED/WAIVED ·                │
│    decisionNote (rejection / waiver reason)                    │
│  full request by reference · status timeline (AuditLog)        │
│  offers: amount · rate · tenor · validUntil ·                  │
│    [ Compare revisions ] · [ Accept ] · [ Decline ]            │
│ [ Cancel request ] (pre-acceptance only → CANCELLED)           │
└────────────────────────────────────────────────────────────────┘
```

Financier-side states become visible to the applicant only after `FORWARDED_TO_FINANCIER` — until
then the applicant tracks the gate. Resubmission after `RETURNED_FOR_COMPLETION` goes straight
back to `UNDER_PLATFORM_REVIEW` (verified items whose evidence was untouched are preserved —
FIN-3 documented behavior).

### 5.5 W-CONSOLE — Financier console (`?view=financier`, new SPA view — 5-registry lockstep)
```
┌ W-CONSOLE · financier console — ?view=financier ─────────────────┐
│ guard: OWNER/ADMIN member of a BANK|MFI|EWALLET org with an      │
│ ACTIVE FinancierProfile (org-gated; no new global role, DP-1)    │
│ sidebar: Dashboard · Services · Requests inbox · Accreditations  │
│   inbox · My offers · Vendor quotes · Profile                    │
│ Dashboard — inbox counts · live accreditations · offers pending  │
│ Services — FinancierService CRUD (serviceKind FINANCING |        │
│   ACCREDITATION) + traits + coverage + REQUIREMENTS COMPOSER     │
│   (→ W-REQ-COMPOSER)                                             │
│ Requests inbox — FORWARDED_TO_FINANCIER and later only:          │
│   pre-forward requests are structurally invisible (gate-         │
│   enforced query, R-4). Open → UNDER_FINANCIER_REVIEW.           │
│   detail: applicant refs · underwriting figures · checklist      │
│   verdicts (read-only — platform-verified) · RequestAttachment   │
│   list · [ Decline + note ]                                      │
│ offer composer — amount · rateType/rate% · fee · tenor ·         │
│   collateralRequired · validUntil · installment rows (no · due · │
│   amount — FinancingOfferInstallment) → [ Send offer ]           │
│   (request → OFFERED; revisions allowed)                         │
│ Accreditations inbox — forwarded programs · [ Grant → ACCREDITED │
│   + validUntil ] · [ Reject + note ] · [ Revoke + reason ]       │
│   (renewal = a NEW request)                                      │
│ Vendor quotes (B2B mirror) — create RFQ / invite accredited      │
│   vendors ("approved vendors" = orgs with a live accreditation   │
│   here) · relay customer quote requests — existing Rfq/Quote     │
│   engine, ZERO new tables                                        │
│ agreements — funding-events reporter (DISBURSEMENT / REPAYMENT   │
│   rows) — track-only, D-002                                      │
└──────────────────────────────────────────────────────────────────┘
```

v4's per-document verification queue is GONE — document + requirement verification is the platform's
job (the gate); the financier sees checklist verdicts read-only. v4 `Products` → `Services`;
`INFO_REQUESTED` is superseded by decline-with-note + the gate's `RETURNED_FOR_COMPLETION`.

### 5.6 W-DIRECTORY — Public financier directory + service page (DP-10)
```
┌ W-DIRECTORY · financier directory + service page (DP-10) ────────┐
│ directory cards: logo · Organization name (legalName) ·          │
│   institution type BANK|MFI|EWALLET · verified ✓ ·               │
│   branches/agents · FinancierProfile stats (views)               │
│ service page (per FinancierService, public):                     │
│   serviceKind chip (FINANCING | ACCREDITATION) · category chip   │
│   · amount range (amountMin/Max) · rate cap (rateMax) · tenor ·  │
│   sharia badge · features / eligibility bullets                  │
│   (FinancierServiceAttribute) · coverage chips (Coverage rows)   │
│   requirements preview — titles + required marks only            │
│   (labels; the full checklist renders in wizard step 2)          │
│ [ طلب تمويل "Apply for financing" ] → wizard (serviceId locked)  │
│ ACCREDITATION services → [ Request accreditation ] → same wizard │
│   IA, company applicants (gate + grant flow 8)                   │
└──────────────────────────────────────────────────────────────────┘
```

Every application targets exactly ONE service (`serviceId` required) — which is what keeps each
requirements checklist well-defined (R-4 / R-5).

### 5.7 W-REQ-COMPOSER — Financier console · service requirements composer (`?view=financier` → Services → edit)
```
┌────────service─────────┬───────attached requirements───────┬────────condition picker────────┐
│ SERVICE SUMMARY        │ ATTACHED REQUIREMENTS (7)         │ CONDITION PICKER               │
│ serviceKind:           │ ▲▼ drag · live reorder            │ [ search library … ⌕ ]         │
│   FINANCING            │ ──────────────────────            │ GENERAL library (12)           │
│ category:              │ 1 Valid commercial registration   │  ▸ commercial registration     │
│   WORKING_CAPITAL      │   DOCUMENT ✱ · GENERAL · [⚙]      │  ▸ 6-month bank statement      │
│ amounts: 99,996–100M   │ 2 6-month bank statement          │  ▸ national ID · tax card      │
│   (amountMin/Max YER)  │   DOCUMENT ✱ · GENERAL · [⚙]      │  pick → attach (config ←)      │
│ rate: MURABAHA_ANNUAL  │ 3 Account with us ≥ 6 months      │ ──────────────────             │
│   cap 30.000 %/yr      │   PROFILE_FIELD ✱ · PRIVATE       │ + CREATE PRIVATE               │
│ tenor: 6–36 · MONTHLY  │ 4 Guarantors on staff (≥2)        │ kind: [DOCUMENT ▾] (8)         │
│ fee: 0.75 % flat       │   MULTI_SELECT ✱ · PRIVATE ⚡      │ title: [____________]          │
│ status: ACTIVE         │ 5 Years in business               │ documentType / profileKey:     │
│ ──────────────         │   NUMBER · PRIVATE (optional)     │  [COMMERCIAL_REG ▾]            │
│ [ Edit terms → ]       │ 6 External audit report           │ options rows (SELECT /         │
│ (ACCREDITATION kind    │   DOCUMENT · GENERAL (opt.)       │   MULTI_SELECT only):          │
│   shows validity mo.   │ 7 Sharia board approval           │  [ value text … ] pos 0        │
│   + fee instead)       │   DECLARATION ✱ · PRIVATE ⚡       │  [ + add option row ]          │
│                        │ ──────────────────────            │ validityMonths: [ 3 ]          │
│                        │ [ + Attach from library ]         │ [ Save to my library ]         │
└────────────────────────┴───────────────────────────────────┴────────────────────────────────┘
```

Per-attachment config (⚙): `isRequired` toggle · per-service `instructions` override · validity
window · `autoPassAccredited`. Source badges: GENERAL (platform library, admin-curated) vs PRIVATE
(`ConditionTemplate` `scope = FINANCIER` — this org only, invisible to other financiers). The
composer is the owner's "flexible, easy, comprehensive" management interface (DP-24); the admin's
mirror of the picker manages the GENERAL library (admin tab → Requirements library).

### 5.8 W-GATE-QUEUE — Admin · platform verification gate queue (`?view=admin&tab=financing` → Review queue)
```
┌ W-GATE-QUEUE · admin review queue — ?view=admin&tab=financing · THE GATE (DP-23) ───────┐
│ filter chips: [ All 14 ] [ FIN 9 ] [ ACC 5 ] · status:                                  │
│   [ SUBMITTED ] [ UNDER_PLATFORM_REVIEW ] [                                             │
│   RETURNED_FOR_COMPLETION ] · [ claimed by me ]                                         │
│ bulk: [ Claim selected ] [ Export CSV ] · sort: oldest age                              │
│ │ ┌age ┬type┬service / applicant                 ┬status                  ┬items    ┐ │ │
│ │ ├    ┼    ┼                                    ┼                        ┼         ┤ │ │
│ │ │3d ⚠│FIN │E-Loan · Ali Mohammed (individual)  │UNDER_PLATFORM_REVIEW   │3 of 7 ✓ │ │ │
│ │ │1d  │ACC │Supplier qual. · Delta Trading org  │SUBMITTED               │0 of 5   │ │ │
│ │ │6h  │FIN │Working capital · Nova LLC (resub)  │RETURNED_FOR_COMPLETION │5 of 7   │ │ │
│ │ │20m │ACC │Vendor approval · Sana'a Tech (org) │UNDER_PLATFORM_REVIEW   │5 of 6 ✓ │ │ │
│ │ └    ┴    ┴                                    ┴                        ┴         ┘ │ │
│ row click → W-GATE-REVIEW (one review console per request)                              │
│ legend: FIN = FinancingRequest · ACC = AccreditationRequest ·                           │
│   age ⚠ = older than 2 days · items = required verified of total                        │
│ queue = statuses SUBMITTED / UNDER_PLATFORM_REVIEW /                                    │
│   RETURNED_FOR_COMPLETION (resubmissions come back here) —                              │
│   forwarded requests leave this queue forever                                           │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

Flow 4 — both request types in ONE queue (badges FIN / ACC). A financier can never reach anything
in this queue: inbox queries filter `FORWARDED_TO_FINANCIER` and later states only (R-4).

### 5.9 W-GATE-REVIEW — Admin · gate review console for ONE request (the heart of flow 4)
```
┌ W-GATE-REVIEW · admin gate review console — one request ───────────────────────────────────────┐
│ FR-2026-000042 · FINANCING (FIN badge) · submitted 2 d ago ·                                   │
│ claimed by admin@ · status UNDER_PLATFORM_REVIEW                                               │
│ applicant: Ali Mohammed — individual (organizationId null,                                     │
│ DP-13) · user since 2025 · identity verified ✓                                                 │
│   [ → jump to full profile ↗ ]  [ → vault (W-VAULT) ↗ ]                                        │
│ service: Al-Amal Bank · "E-Loan" (WORKING_CAPITAL) · ask                                       │
│ 2,500,000 YER (service range 99,996–100,000,000 ✓)                                             │
├─────────────────────────────────────────────────────┬──────────────────────────────────────────┤
│ REQUIREMENTS CHECKLIST — service (7 items)          │ ACTIVITY DATA — read-only (22 fields)    │
│ ✓ 1 [DOC ✱] Valid commercial registration           │ EXISTING · "Grocery store" · RETAIL      │
│     GENERAL · doc comm-reg.pdf → vault              │ start 2024-03-01 · OWNED premises        │
│     VERIFIED — admin@ · today 10:12                 │ address Old Sana'a · district Azal       │
│ ? 2 [DOC ✱] 6-month bank statement                  │ capital 1,200,000 · own 300,000          │
│     GENERAL · doc stmt-jun.pdf → vault              │ installment capacity 120,000/mo          │
│     ⚠ doc expires in 5 d (validityMonths)           │ prev financing: no · other income:       │
│     [SUBMITTED] [✓ Verify] [✗ Reject…] [◌ Waive…]   │   remittances                            │
│ ✗ 3 [NUM ✱] Years in business                       │ ASK 2,500,000 YER · purpose stock        │
│     PRIVATE · answer 3 (validationMin 5)            │ tenor 24 mo · guarantee GOLD avail.      │
│     REJECTED · note "below the 5-year minimum"      │ ─────────────────────────                │
│     → applicant re-supplies → SUBMITTED again       │ ATTACHMENTS — RequestAttachment          │
│ ~ 4 [DOC  ] External audit — optional               │ · guarantee-deed.pdf GUARANTEE_DOC       │
│     WAIVED · note "not applicable this cycle"       │ · feasibility-study.pdf STUDY            │
│ ✓ 5 [DECL ✱] Data-truth declaration — VERIFIED      │ · floor-plan.pdf PROJECT_FILE            │
│   6 [DATE ] Trade-license date — optional           │ each → AccountDocument → MediaAsset      │
│     PENDING (not supplied; never blocks)            │ [ open in applicant vault ↗ ]            │
│ ✓ 7 [MULTI_SEL ✱] Sectors served — VERIFIED         │                                          │
│     ☑ retail ☑ tech ☐ agriculture                   │                                          │
│ row actions: [✓ Verify] [✗ Reject…] [◌ Waive…] +    │                                          │
│   note field — REQUIRED on reject / waive           │                                          │
├─────────────────────────────────────────────────────┴──────────────────────────────────────────┤
│ FORWARD GATE: 3 of 5 required items VERIFIED — 2 items block                                   │
│   (bank statement SUBMITTED · years in business REJECTED)                                      │
│ [ ✗ RETURN TO APPLICANT … ] — aggregate reason REQUIRED                                        │
│ [ ▶ FORWARD ] ⛔ disabled — label shows "N of M required                                        │
│   items verified"; aria-disabled + reason announced (§3.1)                                     │
│ audit trail: every verify/reject/waive/return/forward →                                        │
│   AuditLog (UPPER_SNAKE actions) + applicant Notification                                      │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Header = applicant profile summary + jumps. Middle = the per-requirement verification console:
condition title + kind badge, applicant answer / attached document (link), status chip
PENDING / SUBMITTED / VERIFIED / REJECTED / WAIVED, verify/reject/waive buttons + note field
(note REQUIRED on reject/waive — `RequirementSubmission.decisionNote`). Right = the 22-field
activity form (read-only) + `RequestAttachment` list. Footer = RETURN (aggregate reason required) /
FORWARD — disabled until every required item is VERIFIED or WAIVED; the label shows
"N of M required items verified" and the disabled reason is announced to screen readers (§3.1).
Every gate action writes `AuditLog` + fires a Notification.

### 5.10 W-VAULT — Applicant · documents center — ALL users (`business` → Documents)
```
┌ W-VAULT · documents center — EVERY user & organization (DP-27) ─────────────────────────────┐
│ scope toggle: (●) personal — user scope    ( ) company —                                    │
│   organization scope (org members; org-scope docs serve B2B                                 │
│   + accreditation evidence)                                                                 │
│ upload dropzone: ⬆ drag & drop or browse · ≤ 6 × 8 MB ·                                     │
│   magic-byte validated · MediaAsset pipeline (sha256 dedupe                                 │
│   + renditions) · new doc → status PENDING · replace deactivates                            │
│ verify-state legend: ● PENDING (amber) · ● VERIFIED (success) ·                             │
│   ● REJECTED (destructive — platform note shown on card)                                    │
│ expiry: expiresAt chip warns inside a condition's                                           │
│   validityMonths window ("expires in 5 d")                                                  │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐                    │
│  │ NATIONAL_ID   │ │ COMMERCIAL_REG│ │ BANK_STATEMENT│ │ TAX_CARD      │                    │
│  │ national-id…  │ │ comm-reg-2025…│ │ stmt-jun.pdf  │ │ tax-card.pdf  │                    │
│  │ ✓ VERIFIED    │ │ ✓ VERIFIED    │ │ ⚠ PENDING     │ │ ✗ REJECTED    │                    │
│  │ issued 2024   │ │ exp 2027-03   │ │ uploaded 1 d  │ │ "blurry scan" │                    │
│  │ [ Replace ]   │ │ [ Replace ]   │ │ [ View ]      │ │ [ Replace ]   │                    │
│  └───────────────┘ └───────────────┘ └───────────────┘ └───────────────┘                    │
│ reuse rule (R-2 / DP-27): verified ONCE by the platform, then                               │
│   referenced by every RequirementSubmission + RequestAttachment                             │
│   — never re-uploaded per request · documentType from the closed                            │
│   set (NATIONAL_ID, COMMERCIAL_REG, BANK_STATEMENT, …)                                      │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

Flow 3 — the account-preparation surface, for EVERY user (buyers, sellers, financier staff,
applicants) and every org, not just financing applicants (DP-27). Document verification is done by
the platform ONCE per document; requests only reference.

### 5.11 W-MULTI-COMPARE — Applicant · multi-financier comparison (siblings sharing `multiGroupId`)
```
┌ W-MULTI-COMPARE · applicant — multi-financier comparison ────────────────────────────────────┐
│ group MG-2026-000317 · 3 sibling requests created by ONE wizard                              │
│ session (multiGroupId — DP-25) · one column per financier's                                  │
│ service · rows = latest SENT FinancingOffer per sibling (revisions                           │
│ compare inside each request — no snapshot table)                                             │
│ ┌sibling ↓   ┬ Al-Amal Bank — E-Loan   ┬ Al-Kuraimi — Working    ┬ Tadhamon — SME growth   ┐ │
│ ├            ┼                         ┼                         ┼                         ┤ │
│ │request     │ FR-2026-000042          │ FR-2026-000043          │ FR-2026-000044          │ │
│ │gate        │ ✓ passed Oct 1          │ ✓ passed Sep 30         │ ✓ passed Oct 1          │ │
│ │status      │ OFFERED                 │ OFFERED                 │ UNDER_FINANCIER_REVIEW  │ │
│ │amount      │ 2,450,000 YER           │ 2,500,000 YER           │ — no offer yet          │ │
│ │rate        │ MURABAHA 18 %/yr        │ FIXED 16.5 %/yr         │                         │ │
│ │tenor       │ 24 mo                   │ 30 mo                   │                         │ │
│ │monthly     │ ≈ 118,750               │ ≈ 104,625               │                         │ │
│ │validUntil  │ 2026-10-15              │ 2026-10-02 ⚠            │                         │ │
│ │action      │ [ ACCEPT ]              │ [ ACCEPT ]              │ [ Withdraw ]            │ │
│ └            ┴                         ┴                         ┴                         ┘ │
│ accepting one → the other siblings' SENT offers auto-DECLINE and                             │
│   their requests close · FinancingFee ACCRUED on the accepted                                │
│   request (success % × amount) · [ Withdraw ] cancels a sibling                              │
│   before any offer exists                                                                    │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

Flow 7 — offer comparison and tracking. Sibling requests share `multiGroupId` (one per financier's
service, created by one wizard session); each column shows that sibling's own gate + latest SENT
`FinancingOffer`; accepting one auto-declines the others' SENT offers.

### 5.12 W-ACCRED-STATUS — Applicant company · accreditation status card (`business` → Accreditation)
```
┌ W-ACCRED-STATUS · accreditation status card (company) ────────────────────┐
│ company: Delta Trading LLC · financier: Al-Kuraimi                        │
│ program: "Supplier Qualification" — FinancierService                      │
│   (serviceKind = ACCREDITATION) · request ACC-2026-000018                 │
│ stepper (status machine — FINANCIER_SCHEMA §5.2):                         │
│  SUBMITTED ✓ → UNDER_PLATFORM_REVIEW ✓ → FORWARDED_TO_FINANCIER           │
│  ✓ → UNDER_FINANCIER_REVIEW ✓ → [ ● ACCREDITED ]  (grant-on-              │
│ request, DP-26; validUntil passes → EXPIRED · revoke → REVOKED ·          │
│ renewal after either = a NEW request — one record per                     │
│ service + org, @@unique)                                                  │
│ granted 2026-09-12 · validUntil 2027-09-12 · countdown: 361 days          │
│   left (ACCREDITATION_EXPIRING reminder inside the 7-day window)          │
│ RFQ unlock: this org can send/receive RFQs with this financier ✓          │
│   (live-grant check)                                                      │
│ auto-pass: on this financier's other services, items with                 │
│   ServiceRequirement.autoPassAccredited = true auto-VERIFIED              │
│   (verifiedById = null — system; §5.3)                                    │
│ scope: "IT equipment suppliers" (scopeNotes)                              │
│ [ Request renewal ] (enabled after EXPIRED / REVOKED)                     │
│ history: ACC-2026-000011 granted 2025-09 → EXPIRED 2026-08-31             │
│   (renewed) · revocations: none (reason + revokedAt recorded)             │
└───────────────────────────────────────────────────────────────────────────┘
```

Flow 8 — accreditation as a MAIN service (DP-26). The card renders the shared status machine +
grant facts; one accreditation record per service + org (`@@unique`), so renew/revoke history is
the list of this org's requests for this program.

## 6. Planned surface inventory v5 (financier domain)

Flows = `FINANCIER_PLAN` v2.0 §4: (1) institution onboarding · (2) service & requirements setup ·
(3) applicant prepares the account (documents center) · (4) **THE PLATFORM VERIFICATION GATE** ·
(5) financing application wizard · (6) financier responds · (7) applicant awards & tracking ·
(8) accreditation.

| # | Surface | Where (D-004: `?view=` only) | Flow(s) | Wireframe |
|---|---|---|---|---|
| 1 | Financier directory + service page (public) | storefront view extension (DP-10) | 5, 8 | W-DIRECTORY |
| 2 | Financier console — dashboard | `?view=financier` (new view) | 6, 8 | W-CONSOLE |
| 3 | Services CRUD + requirements composer | `?view=financier` → Services | 2 | W-REQ-COMPOSER |
| 4 | Requests inbox (FORWARDED+ only) + detail | `?view=financier` → Requests inbox | 6 | W-CONSOLE |
| 5 | Offer composer + my offers | `?view=financier` → My offers | 6, 7 | W-CONSOLE |
| 6 | Accreditations inbox (grant/reject/revoke) | `?view=financier` → Accreditations | 8 | W-CONSOLE |
| 7 | Vendor quotes entry (RFQ/Quote mirror) | `?view=financier` → Vendor quotes | 8 (accredited vendors) | W-CONSOLE |
| 8 | Financier profile + branches | `?view=financier` → Profile | 1 | W-CONSOLE |
| 9 | Financing wizard (3 steps, incl. checklist) | Financing & Accreditation card / service page | 5 | W-WIZ-1/2/3 |
| 10 | My financing requests + gate-aware detail | business view → Financing & Accreditation card | 5, 7 | W-MY-REQ |
| 11 | Documents center (vault — ALL users + orgs) | business view → Documents | 3 | W-VAULT |
| 12 | Multi-financier comparison | my requests → multiGroupId group | 7 | W-MULTI-COMPARE |
| 13 | Accreditation status card | business view → Accreditation | 8 | W-ACCRED-STATUS |
| 14 | "Request financing" entry points | quote/order detail | 5 | → W-WIZ-1 |
| 15 | Platform verification gate queue | `?view=admin&tab=financing` → Review queue | 4 | W-GATE-QUEUE |
| 16 | Gate review console (one request) | admin → Review queue → open row | 4 | W-GATE-REVIEW |
| 17 | Institutions (verify/suspend financiers) | admin tab → Institutions | 1 | — (org-CRUD pattern) |
| 18 | Monitor (all requests/agreements) | admin tab → Monitor | 7 | — |
| 19 | Fees (ACCRUED → INVOICED → PAID) | admin tab → Fees | 7 | — (Payout mirror) |
| 20 | Requirements library (GENERAL ConditionTemplate CRUD) | admin tab → Requirements library | 2 | — (picker, admin side) |
| 21 | Financing settings (6 panels) | admin tab → Settings | all | — (existing settings rail) |

## 7. Rules for building new surfaces (checklist)
1. Consume semantic tokens only; both themes verified; accent comes from settings, never hardcoded.
2. Primitives from `src/components/ui` first; `max-h-96 overflow-y-auto .scrollbar-thin` for lists.
3. Every mutation → toast (sonner) + optimistic disabled state; every fetch → skeleton, never blank.
4. Status always a chip with the mapped semantic color (§1.1); dates locale-formatted; money with
   currency + 2 decimals from `Decimal` serialization.
5. Sticky footer (`min-h-screen flex flex-col` + `mt-auto`); 44px touch targets; keyboard path.
6. New view = extend `routing.ts` registry + role nav config + console/dashboard shell lockstep
   (5-file pattern in FINANCIER_PLAN v2.0 FIN-5).
7. Documents/uploads always via the MediaAsset pipeline (≤6×8MB, magic-byte validated) — never a
   parallel uploader.
