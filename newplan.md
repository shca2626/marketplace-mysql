# Vendora — Master Enhancement Plan (newplan.md)

> Generated after a full end-to-end, actor-based QA pass of the live platform (browser-automated, one actor at a time: Platform Admin, Seller, Buyer, Financier institution staff, Public visitor).
> **Method:** every "Verified working" item below was exercised in the browser on the running app (clicks, forms, real submissions), not assumed from code.
> **Scope of this document:** where the platform stands today, what is broken, what is missing per actor, and a prioritized roadmap for what to build next.

---

## 0. Executive Summary

Vendora is functionally deep for a marketplace of this stage: a real B2B commerce core (catalog, cart, checkout with 3 payment flows, orders, RFQ engine with negotiation and org approvals, payouts/commissions), a serious Islamic-finance layer (platform verification gate, financier consoles, Murabaha programs, agreements), and a well-organized admin console (15 sections). The E2E golden paths **work today**: an anonymous visitor can land, browse, and reach a financier entity profile; a buyer can order and apply for financing; a seller can list products and fulfill; a financier can publish Sharia programs; the platform admin can gate-keep everything.

What the platform **is not yet** is the *aggregator + directory + multi-tenant B2B/B2C/B2B2C operating system* the owner describes. The structural gaps are: **no RBAC/permission system** (3 hardcoded roles), **no platform-staff or granular team management**, **no multi-vendor products** (one seller per product), **no unified/platform-managed catalog** (admin cannot create products; no brands; no dedup), **no KYC/KYP** (a boolean "verified" stamp only), **no module/feature activation per organization type or subscription**, **no approval workflow for product/service publication**, and **a minimal registration form** (no wizard). These gaps are the roadmap.

**Verification note:** the QA session also surfaced real operational fragility (sandbox OOM kills, `.next` cache corruption that deadlocks all on-demand compilation) and two app-level defects (a transient client-side crash on the Business Account view; funding-hub stats flashing zeros before APIs settle). Details in §2.

---

## 1. Where We Are — Verified Working (E2E, this session)

### Platform (admin @ admin@vendora.com)
| Area | Verified capability |
|---|---|
| Auth | Login (email/password, scrypt), session cookies, role-based console entry |
| Overview | GMV $20.8K, orders 14, members 24, listings 26, reviews 103, revenue chart, orders-by-status |
| Vendors | Directory, search/filters, Verify / Commission / Suspend / Reactivate lifecycle |
| Products | Full moderation: Feature, Edit, Archive, Delete; sorting |
| Organizations | CRUD ("New organization"), pending-verification queue (activate/reject), member management, status tiles |
| Payments | Bank-transfer details config + capture queue; simulated card gateway |
| Payouts | Settlement batches, commission config |
| Financing | Verification gate (per-item verdicts, return/forward), Institutions (verify/suspend), Fees (mark invoiced/paid), Requirements library, Documents queue, Monitor |
| RFQ Engine | Pipeline, disputes resolution queue |
| RFQ Settings | **28 scoped panels** (platform default → per-org/category/region overrides) with change history + rollback |
| Storefront Designer | Site name/tagline, announcement bar, theme (colors, radius), hero slides management, sample picks |
| Audit Log | Filterable immutable trail of critical actions |

### Seller (seller1@vendora.com)
- Dashboard KPIs (revenue $4.4K, units 2,704, rating 4.4★, listings 10), payout status ($651 available / $3,413 in transit)
- Product form: **7 tabs** — Basics, Pricing & stock, Media, Variants, Details, Shipping, SEO (SKU, barcode, MOQ, price tiers, specs, highlights, dimensions, processing time, meta)
- Orders list with fulfillment statuses, addresses, tracking numbers
- RFQ inbox (respond to quote requests), Earnings/payout history, Disputes

### Buyer (demo@vendora.com)
- Catalog browsing, search suggestions, category filters, sorting
- Cart drawer (add/remove, totals) → checkout: address validation (ZIP enforced), **payment methods: card (simulated) / bank transfer / invoice terms**, promo code (SUN10), **order placed successfully E2E**
- RFQ: multi-line creation with product picker, quantities, target price, response deadline, recurring schedules, org on-behalf-of, confirmation dialog → submitted and listed
- Financing: services catalog (Murabaha/Takaful programs with YER ranges, rate caps, tenor, regions), **3-step application wizard** (service → activity & checklist → review), My Applications with gate statuses, Document Vault
- Business Account: org profile (NET-45, $75K credit limit), **team members with roles (Owner/Approver/Buyer) + add-member form**, purchase approvals ($500+ threshold), customer groups

### Financier (alamal.admin@vendora.com)
- Full console: Dashboard stats, **Services CRUD** (publish/unpublish, rich Sharia terms: Murabaha annual cap 16–30%, tenor 6–36mo, validity, program fee, requirements/regions/features/coverage), Requirements composer
- Requests Inbox (gate-passed only: FIN-2026-000004 awaiting review), Offers, Accreditations (1 live grant), Agreements
- Institution profile with license (CBY-BANK-0417) and org switcher

### Public / SEO
- Homepage with hero slider + real data rails; funding hub (**7 verified entities, 6 programs, 13 Sharia-compliant, 13 regions**), financier entity mini-sites (license, branches, programs, stories), `sitemap.xml` (63 URLs), custom 404, canonical product/store URLs, JSON-LD

---

## 2. Broken / Buggy (found this session — fix first)

| # | Severity | Issue | Repro / Evidence | Proposed fix |
|---|---|---|---|---|
| BUG-1 | High | **Client-side exception on `?view=business`** (nondeterministic): Business Account view crashed with "Application error: a client-side exception", the session store reset to logged-out, and required re-login. Appears related to a race between auth resolution (`/api/auth/me`) and the business-data fetch after a reload; once it fires it poisons the client store. | Opened `?view=business` right after page reload while APIs were slow → crash screen; second attempt after re-login rendered fine | Guard the business view data-fetch on `authChecked`; add an error boundary that doesn't wipe auth state; capture a stack trace (the boundary swallowed details) |
| BUG-2 | Medium | **Funding hub stats flash "0"** (0 entities / 0 programs / 0 Sharia) before the API responds, then correct numbers appear (7/6/13) | Load `/funding` on cold compile | Skeleton/placeholder counters instead of 0; render after fetch resolves |
| BUG-3 | Medium | **Storefront cover picker is localStorage-only** — seller "Storefront cover" explicitly says "Saved on this device in the demo — a full rollout will store it on your seller profile" | Seller dashboard → storefront cover section | Persist to SellerProfile/settings via API |
| BUG-4 | Low | Overview tile "NEW MEMBERS in last 7 days = 24" equals total member count (seed-data artifact — all users created "recently" in demo clock) | Admin → Overview | Cosmetic; consider date-bucketing or hiding when equal to total |
| BUG-5 | Low | Dates render in 2026 (sandbox clock + seed era). Already tracked by the 15-min QA cron as "wrong year date" | Throughout | Normalize display vs. DB era; align seed timestamps to a rolling "now" on reseed |
| OPS-1 | High | **Sandbox instability under concurrent QA**: kernel OOM-killed `next-server` (anon-rss 2.1GB vs 4GB total) when parallel browser agents + QA cron traffic + cold compiles coincide; after a crash the **`.next` cache can corrupt, deadlocking every on-demand route compile** (all uncached API routes hang forever at 0% CPU until `rm -rf .next`) | Observed twice this session; login API hung 30s+ until cache clear | (a) Supervisor auto-heals: detect "compile hang" (no log lines + pending requests) → clear `.next` and restart; (b) serialize QA browser sessions (never >2 concurrent); (c) cap Turbopack memory (already `turbopackMemoryLimit: 2048`) or raise sandbox RAM |
| OPS-2 | Medium | Dev-only: after server restart, first-hit compiles take 10–20s; several QA "errors" were just this warmup | Timings in session | Pre-warm critical routes after restart (`/`, `/market`, `/api/auth/me`, `/api/home`, `/api/financier/*`) |

---

## 3. Gap Analysis — What Each Actor Is Missing

> These are capabilities a real operator would expect and could not find. Items marked **[U]** map directly to the owner's example list.

### 3.1 Platform Admin / Staff **[U]**
1. **[U] Organizations type "category" CRUD** — org types (`COMPANY | BANK | MFI | EWALLET`) are a hardcoded enum in the schema. Admin cannot create/edit/retire org categories (e.g. "NGO", "Cooperative", "Supplier").
2. **[U] No RBAC / roles & permissions screen** — the system has exactly 3 global roles (`BUYER/SELLER/ADMIN`, a string column). No permission matrix, no custom roles, no "what can this role do" visibility anywhere.
3. **[U] No platform team/staff management** — cannot invite operators, assign scoped admin roles (e.g. "finance ops only", "catalog moderator only"), or see who did what beyond the audit log. The owner explicitly wants the same capability for companies and financiers (companies have a basic version, see 3.3).
4. **[U] No module/feature activation matrix** — no way to switch features on/off per org type, per subscription, or manually. RFQ Settings has per-org *behavior* overrides (good precedent), but there is no general "Modules" concept (e.g. disable Financings for COMPANY orgs, enable B2C for some).
5. **[U] No multi-vendor products** — `Product.sellerId` binds each listing to exactly one seller. No "same product, multiple company offers" (choose-by-vendor), which is core to the aggregator vision.
6. **[U] No publication approval & agreement workflows** — products go live the moment a seller publishes (moderation is reactive: feature/archive/delete). Financier services publish instantly too (no platform pre-approval, no T&C acceptance artifacts). Orgs DO have a verification queue — the pattern exists, it's just not applied to catalog/services.
7. **[U] No unified catalog / platform-managed products** — admin cannot CREATE a product, cannot manage brands, cannot normalize duplicate/wrong-named listings ("one company published a product with a wrong name that already exists" — today the only tool is manual edit per listing). No brands directory, no GTIN/MPN matching, no merge suggestions.
8. **[U] Admin CRUD coverage is partial** — can create orgs but not vendors (no "Add vendor"/invite), not products; orders/quotes/agreements are view-only (no edit/refund/resend invoice from console).
9. **[U] KYC/KYP are absent** — verification today = `verifiedAt` timestamp (KYC-lite). No document-driven KYC (license upload with expiry tracking, verification levels), no KYP (Know Your Product: certified specs, datasheets, warranty, origin) anywhere.
10. **[U] No registration wizard** — signup is a single form (name/email/password). No business-type branch, no document upload, no KYC/KYP steps, no "tell us about your company" funnel.

Additional admin-side gaps found by acting as the admin: no **global search** across entities from the console; no **impersonation/"view as" for support**; no **platform notification composer** (broadcast to all users); no **subscription/billing management**; no **data export/report builder** beyond CSV on overview; no **feature flags**.

### 3.2 Seller
- No company team management from the seller side (roles exist for BUYER orgs, but a seller's store staff cannot be invited/permissioned — no sub-accounts for staff)
- No store analytics beyond 4 KPIs (no traffic, conversion, funnel, search terms)
- No marketing tools: no seller-run coupons/discounts (coupons are platform-managed only), no bundles, no cross-sell
- No shipping/logistics configuration (no carriers, zones, rates tables — only flat fee + free-shipping flag per product)
- No Arabic/RTL interface; currency is display-only USD in commerce surfaces while financing shows YER (inconsistent)
- No comparison of own products vs. competitors; no price positioning insights
- No service-level offerings (installation, maintenance) — catalog is goods-only
- No reply-to-reviews tooling
- No CSV/PDF exports; no order edit (split shipment, partial refund)

### 3.3 Buyer
- No multi-vendor selection (same product from different sellers with price/delivery comparison) — same structural gap as 3.1.5
- Checkout lacks **Islamic financing at point-of-sale** (no "pay via Murabaha with Al-Amal" button tying the financing engine to the cart — the pieces exist separately but are not connected)
- No saved/multiple addresses; no guest checkout; no reorder button found in flows tested
- Comparison tray exists for products but is shallow (no spec matrix normalization); no services/RFQ comparison
- No Arabic/RTL; no currency switcher (YER/USD/SAR)
- KYC nudges absent (buyer profile fields exist — DOB, phone, etc. — but nothing prompts completion for higher trust tier)

### 3.4 Financier
- No institution **staff management with roles** (underwriter vs reviewer vs admin) — a bank cannot invite its own team members to the console **[U owner example]**
- No **service publication approval by platform** (financier publishes instantly; platform gate exists only for inbound applications)
- No portfolio analytics (approval rate, disbursed volume, aging/NPL, portfolio quality), no risk scoring on applicants
- No Sharia-compliance artifact management (scholar board certifications, contract templates library, e-signature)
- No point-of-sale financing integration into marketplace checkout
- No document templates for agreements; agreements track events but no templated contract generation
- No API/webhooks for bank core integration

### 3.5 Public / Platform-wide
- No **brands directory** ("shop by brand"), no popular/trending pages, no services directory beyond financing — the aggregator/directory layer **[U]**
- No Arabic language/RTL (Yemen market), no currency switcher
- Search: no typo tolerance/facets found; no attribute filters (wattage, voltage) beyond category
- No product comparison depth (spec normalization)
- No PWA/mobile app shell; no newsletter capture
- Trust signals light: no review-count badges, no "N verified stores" counters on home

---

## 4. Cross-Cutting Initiatives (design once, apply everywhere)

### A. RBAC & Team Management (platform + organizations + financiers) — the #1 structural gap
- **Schema:** `Role` (key, name, scope: PLATFORM/ORG/FINANCIER, isSystem), `Permission` (key, e.g. `catalog.product.publish`), `RolePermission`, `UserRole` (user × role × scope-Ref), `Invitation` (email, token, role, org ref, expiry).
- **Platform staff console:** invite operators with scoped roles; permission matrix UI; audit-log enrichment (role changes).
- **Org & financier self-service:** same components re-scoped (a bank invites underwriters with `financing.offer.send` but not `service.publish`).
- **Migration:** map existing `User.role` + `OrganizationMember.role` into the new tables; keep the old columns as computed/fallback during rollout.

### B. Unified Catalog & Multi-Vendor Products (the aggregator core)
- **Schema evolution:** split `Product` (the *listing*: what it is — normalized, platform-curated) from `Offer/SellerListing` (who sells it: seller, price, stock, MOQ, terms, fulfillment). Product gains `brandId`, `attributes` (typed spec JSON), `gtin/mpn`, `categoryPath`.
- **Platform catalog console:** admin CRUD for products/brands/categories; "create once, sellers attach offers" workflow; duplicate detection (title similarity + GTIN/MPN) with merge suggestions; moderation queue becomes *pre-approval* (configurable per category/seller trust tier).
- **Buyer-facing:** product page shows vendor offers side-by-side (price, lead time, rating, MOQ, location) with compare; RFQ lines can target a product (any vendor) or a specific offer.

### C. KYC / KYP Engine
- **KYC:** verification levels (L0 anonymous → L1 email → L2 phone+ID → L3 business docs), document types with **expiry & re-verification** (trade license, tax cert, ID), verification queue for admins (extends the existing financing gate UI), status chip on every profile, gating hooks (e.g. L2 needed to publish offers).
- **KYP (Know Your Product):** product certification records (datasheet, warranty, origin, test reports), "Verified specs" badge, per-category required attributes (wattage for panels, capacity for batteries), platform-curated and seller-contributed with review.
- **Registration wizard** on top: account type (buyer/personal, company, financier, seller) → profile → KYC docs → (seller: store & payout; company: invite team) → verified status. Progressive, resumable.

### D. Module & Feature Activation System
- `ModuleDefinition` (key, name, default-on), `ModuleActivation` (scope: platform/org/orgType/subscription, enabled, config JSON).
- Admin UI: module matrix (org type × module grid), per-org overrides; drives nav, API guards, and storefront sections. Natural substrate for **subscription tiers** later (Free/Pro/Enterprise = module bundles + limits).

### E. Approval & Agreement Workflows
- Generalize the existing org-verification-queue pattern into a workflow engine: `ApprovalWorkflow` (entity type, trigger, steps, approvers), `AgreementArtifact` (versioned T&C, acceptance records with timestamp+IP+user).
- Apply to: product publication, service publication, org onboarding, seller payout setup, data-policy acceptance at registration.

### F. Islamic Finance at Point of Sale
- Checkout payment method "Finance it (Murabaha)": pick program → pre-qualification from the financing engine (reuses gate) → financed order status → financier disbursement events; connects Agreements to Orders.

### G. Directory, Discovery & Comparison (aggregator UX)
- Brands directory pages; popular/trending/bestsellers; services directory; advanced attribute filters; normalized product comparison (spec matrix); RFQ comparison view; review platform trust counters.

### H. Localization & Currency
- Arabic + RTL (next-intl or equivalent), currency switcher (YER base, USD/SAR display), Yemen governorate-aware regions (already modeled in financing).

### I. Backend/API Hardening
- Bulk/async endpoints for admin ops; idempotency keys on order/quote creation; retry/backoff in SPA fetches (BUG-1 class of races); OpenAPI regeneration after each phase; rate-limit review for production.

### J. Data & Database
- Postgres-style JSON columns are TEXT today (MySQL) — formalize attribute schema + indexes; partition AuditLog by month; connection-pool sizing for production (Aiven tier upgrade when concurrent users grow); backups/snapshot policy for Aiven.

### K. Frontend/UX Polish
- Loading skeletons on all stat surfaces (BUG-2); error boundaries per console section; toasts for every mutation result; keyboard nav for tables; empty-state guidance everywhere (mostly present — keep standard).

---

## 5. Prioritized Roadmap

### Phase 0 — Stabilize (this week)
1. Fix BUG-1 (business view race) and BUG-2 (funding stats flash) — small, targeted.
2. OPS-1: supervisor auto-heal for compile-hang (detect + clear `.next` + restart); pre-warm routes on boot; cap concurrent QA browser sessions.
3. BUG-3 storefront cover persistence; BUG-5 date normalization sweep (already cron-tracked).

### Phase 1 — RBAC & Teams (2–3 weeks)
- Initiative **A** end-to-end: schema, platform staff console, org/financier self-service teams, invitations, permission-guarded API + nav. *(Answers owner probes #2, #3.)*

### Phase 2 — KYC/KYP & Onboarding Wizard (2–3 weeks, parallel with Phase 1 UI)
- Verification levels + document expiry; admin verification center; registration wizard per account type. *(Owner probes #9, #10.)*

### Phase 3 — Unified Catalog & Multi-Vendor (3–4 weeks)
- Product/Offer split; platform catalog CRUD + brands + categories; admin product creation; dedup/merge; pre-approval workflow option. *(Owner probes #1, #5, #6, #7, #8.)*

### Phase 4 — Modules, Subscriptions & Activation Matrix (1–2 weeks)
- Initiative **D**: module registry + admin matrix + guards. *(Owner probe #4.)*

### Phase 5 — Commerce Depth (2 weeks)
- Islamic finance at checkout (**F**); buyer addresses/guest checkout/reorder; seller analytics + seller coupons; shipping zones.

### Phase 6 — Directory, Comparison & Localization (2–3 weeks)
- Initiatives **G + H**: brands/trending/services directories, spec-normalized comparison, Arabic/RTL, currency switcher.

### Phase 7 — Scale & Ops (ongoing)
- Initiative **I + J**; Aiven tier review; backup policy; load test.

**Suggested sequencing rationale:** RBAC first because nearly every later feature (teams approving products, financier staff, subscription entitlements) depends on it. Catalog second because it's the biggest schema change and unlocks the aggregator vision. KYC can run in parallel since it touches registration + verification surfaces but not the catalog core.

---

## 6. Risks & Dependencies
- **Aiven tier (1 CPU / 1 GB storage)** — schema additions in Phases 1–3 add tables and indexes; storage headroom should be checked before Phase 3, upgrade when approaching 70%.
- **Migration discipline** — every phase needs a coordinated Prisma migration + seed update + openapi regen; keep the 15-min QA cron green as the gate.
- **No breaking the working core** — the platform's commerce/financing golden paths are verified working (§1); each phase must keep them green (regression checklist = the §1 table).
- **Sandbox resources** — heavy parallel browser QA can OOM the box (OPS-1); serialize deep QA passes.

## 7. Open Questions for the Owner
1. Subscription model: does Vendora monetize via seller subscriptions, transaction commission (current: 10% default), financier fees (current: program fees), or a mix? (Phase 4 config depends.)
2. Arabic-first or English-first at launch? (Affects Phase 6 priority.)
3. Should platform-managed products (Phase 3) also be sellable directly by Vendora itself (1P sales), or strictly 3P marketplace + curated catalog?
4. KYC depth: manual review by platform staff only, or integrate a verification provider later?
5. Financier SLA expectations (auto-expire applications?) for the gate and offer pipelines.

---

*Source artifacts: browser screenshots in `/tmp/qa-admin-*.png`, `/tmp/qa-public-*.png`; session logs `qa-admin`, `qa-seller`, `qa-buyer`, `qa-fin`, `qa-public`; infra incident notes in worklog.md (AIVEN-2, OPS sections). Test data created during QA: order by "QA Buyer Alex" (FlexTravel panel, $89.99, PAID), RFQ "QA-Buyer-Test RFQ for 450W panels" (submitted).*
