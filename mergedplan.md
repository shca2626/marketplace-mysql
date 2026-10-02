# Vendora — Merged Master Plan (mergedplan.md)

> **Source:** merged from two independent E2E audits of the live platform —
> **Audit A** (Master Enhancement Plan): five-actor browser QA (Admin, Seller, Buyer, Financier, Public) + infra incident notes.
> **Audit B** (E2E Re-Audit): four-actor QA with real transactions (admin leader + company + financier + buyer tracks, real orders/RFQs/applications).
> Every "✅ verified" item below was exercised in a live browser session; every bug has a repro. Overlapping findings are deduplicated; conflicts are reconciled and noted.
>
> **This is the single plan of record.** `newplan.md` copies are superseded by this file.

---

## 1. Executive Summary — Where We Are

Vendora is a **working, feature-rich platform**, not a prototype: the full retail commerce loop, the full B2B RFQ loop (create → quote → negotiate → accept → convert → fulfill), organization/team basics, a deep Islamic-finance layer (verification gate, financier consoles, Murabaha programs, agreements), and a 15-section admin console all function end-to-end with real accounts and real money-flows.

It is not yet an **operator's product**. Two audits agree on the same four structural conclusions:

1. **Stability first** — the preview runs in dev mode with 502 cycles, Fast-Refresh form wipes, and sandbox OOM/`.next`-cache incidents. No QA result or stakeholder demo can be fully trusted until Phase 0 lands.
2. **Silent failures** — critical forms fail with zero feedback (RFQ submit, financing wizard, duplicate-email registration). Users get stuck with no error.
3. **The owner cannot operate and grow the marketplace** — no RBAC, no staff management, no category/org-type CRUD, no unified catalog creation, no publish-approval workflow, no KYC/KYP levels. Moderation exists; *operation* doesn't.
4. **The aggregator vision is unbuilt** — one seller per product, no brands directory, no dedup/merge, no multi-vendor offers, no module activation per org type/subscription, no registration wizard.

**Reconciliation note (conflicting findings):** Audit B reported "no lender-side UI at all," while Audit A verified a full financier console for `alamal.admin@vendora.com`. Both are true: **the lender console exists but is gated on institution verification** — self-registered, still-pending financier orgs (e.g. QA Microfinance Institution) get zero capabilities and no visible onboarding path. The gap is the *activation journey*, not the console itself.

---

## 2. Verified Working (E2E evidence — the regression baseline)

| Journey | Status | Evidence (from the two audit sessions) |
|---|---|---|
| Registration (buyer / seller / financier) | ✅ | POST /api/auth/register 201; real accounts created in both audits |
| Retail: catalog → product → cart → coupon → checkout → paid order | ✅ | Order N13ABG7V ($478.00 → $406.30 with BULK15 −15%); order by "QA Buyer Alex" ($89.99, PAID) |
| Coupons: valid, first-order-only, invalid | ✅ | BULK15 applied; SUN10 rejected with correct inline reason; FAKE99 → 400 |
| Order tracking + actions | ✅ | Timeline, Cancel / Invoice / Dispute |
| B2B RFQ full lifecycle | ✅ | RFQ-2026-000007: quote QTE-2026-000005 (NET-30, tiers, PDF) → negotiation → Accept → Convert → Order #ORLL1I4R (PO QA-PO-001, stock reserved) → seller marks shipped |
| Seller console | ✅ | Store auto-provision; product create/publish/edit/rename; 7-tab product form (SKU, MOQ, price tiers, specs, shipping, SEO); orders, RFQ inbox, earnings/payouts, disputes |
| Org + team basics | ✅ | Org registration, pending-verification state, member invite (email + role + title), 409 duplicate handling; buyer business account with roles (Owner/Approver/Buyer), purchase approvals, customer groups |
| Admin: 15 panels | ✅ | Overview KPIs, Vendors (verify/commission/suspend), Products moderation, Orders, Organizations queue + CRUD, Pricing & Lists, Coupons, Payments, Payouts, Financing (gate/institutions/fees/requirements/documents/monitor), RFQ Pipeline, Disputes, RFQ Settings (28 scoped panels + history/rollback), Storefront Designer, Audit Log |
| Financier console (verified institutions) | ✅ | Dashboard, Services CRUD with Sharia terms (Murabaha cap 16–30%, tenor 6–36mo), Requirements composer, Requests Inbox (gate-passed only), Offers, Accreditations, Agreements, institution profile with license |
| Financing public face | ✅ | /funding hub (7 entities, programs, YER ranges, Sharia flags), deep-linkable entity mini-sites, branches, stories |
| Document vault + media pipeline | ✅ | Server-side validation (.txt→415, corrupt PNG→400, valid PNG→201), reuse across flows |
| KYC document verification (admin) | ✅ | Documents tab: personal/company vaults, per-doc Verify/Reject |
| Public / SEO | ✅ | Homepage with hero + real data rails, sitemap.xml (63 URLs), custom 404, canonicals, JSON-LD |

---

## 3. Broken / Buggy (merged & deduplicated, with repro)

| ID | Severity | Bug | Repro / evidence |
|---|---|---|---|
| **STAB-1** | **P0** | **Dev-mode instability**: 502 outages every 2–4 min; Fast Refresh recompiles silently wipe in-progress form state (RFQ form, product form, wizard); sandbox OOM-kills `next-server` under parallel QA; corrupted `.next` cache deadlocks all on-demand compiles until `rm -rf .next`; cold compiles take 10–20s | Open any long form, wait for recompile; watch `[Fast Refresh] rebuilding`; observed twice per session |
| **STAB-2** | **P0** | **Silent validation failures**: RFQ submit with empty required item → confirm dialog opens → final Submit does nothing (no POST, no error, 4/4 attempts); duplicate-email registration shows no "email exists" message; modal stays open after success | New RFQ → leave item name empty → Submit |
| **STAB-3** | **P1** | **Stats-zero / stats-flash platform-wide**: /funding hero shows 0/0/0/0 while listing 3 institutions + 9 programs (or flashes zeros before APIs settle); entity profiles 0/0/0; market home 0 products; seller RFQ stats 0 with rows present | Open /funding cold; compare hero cards vs. content |
| **STAB-4** | **P1** | **Financing wizard dead-end**: no Submit button while any checklist item unanswered; review step hides all typed values; Back resets to step 1; upload dialog stays open after 201 success | /funding → Apply → steps 1–2 → step 3 with incomplete checklist |
| **STAB-5** | **P1** | **Business view client crash** (nondeterministic): `?view=business` throws "client-side exception", wipes session store to logged-out, requires re-login — race between `/api/auth/me` and business-data fetch | Open `?view=business` immediately after reload while APIs slow |
| **STAB-6** | **P2** | **Open-item RFQs invisible to sellers** — routing matches catalog-product ownership only; buyer open-item RFQ never reaches any seller inbox | Create open-item RFQ as buyer; check seller RFQ inbox |
| **STAB-7** | **P2** | **Data hygiene**: RFQ description lost on submit (null); partners list rendered twice on Al-Amal profile; pluralization ("1 programs"); walkthrough has no URL; warranty badge "1-year" vs specs "30-year performance"; "NEW MEMBERS last 7d = 24" equals total; 2026 dates everywhere | Various |
| **STAB-8** | **P3** | Storefront cover picker is localStorage-only ("saved on this device in the demo") | Seller dashboard → storefront cover |

---

## 4. The Owner's Ten Questions — Verdict Table

| # | Question | Verdict | Evidence |
|---|---|---|---|
| 1 | CRUD for Organization type "category" | ❌ **Not possible** | Org type is a hardcoded 4-value enum (COMPANY/BANK/MFI/EWALLET) in schema and dialogs; product categories also fixed (6) |
| 2 | See full RBAC / roles / permissions | ❌ **Not possible** | 3 global roles as a string column; no roles screen; audit log records USER_ROLE_CHANGED but no UI |
| 3 | Manage platform staff + custom roles; companies & financiers manage teams too | ⚠️ **Partial** | Org team mgmt exists (invite, 4 fixed roles, no removal/permission editor); platform-staff mgmt absent; financier staff mgmt absent |
| 4 | Activate/deactivate modules per org type / subscription / manually | ❌ **Not possible** | Only RFQ-settings scoping + org suspend; no module toggles, no subscription concept |
| 5 | One product, multiple vendors? | ❌ Listing-level **No** / ⚠️ cart-level yes | `Product.sellerId` binds each listing to one seller; multi-vendor exists only inside a cart/order |
| 6 | Approval/agreement for publishing company products & financier services | ❌ **Absent** | Products and financier services publish instantly; moderation is reactive (feature/archive/delete); all 5 seed vendors trade while Unverified |
| 7 | Unified catalog admin (add products, fix names, brands, popular products, aggregator/directory) | ❌ **Admin cannot add** | Products panel = moderation only; admin CAN rename (verified); no create, no brands, no dedup, no seeding tools |
| 8 | Admin full management of everything | ⚠️ **~60%** | Covered: orgs, pricing, coupons, payments, payouts, financing gate, RFQ config, storefront, audit. Missing: product create, category/brand CRUD, user mgmt, review moderation, roles |
| 9 | KYC / KYP enhancement | ⚠️ **Foundation only** | Document vault + admin verify/reject works (6 pending docs); missing: levels, expiry/reminders, enforcement, KYP entirely |
| 10 | Full registration wizard covering KYC/KYP | ❌ **Absent** | Registration = 4-field modal; business reg = 1-step form; KYC appears only later inside the financing wizard |

---

## 5. Gap Map — What Each Actor Is Missing

### 5.1 Platform Admin / Staff
1. Org-type CRUD (Q1) and Product-category CRUD — both hardcoded enums
2. **RBAC screen: roles, permissions, assignments (Q2)** — the #1 structural gap
3. **Platform staff management + custom roles (Q3)**; same capability needed inside companies and financiers (multi-tenant)
4. Module/feature activation matrix per org type / subscription / manual (Q4)
5. Multi-vendor products (Q5) — core to the aggregator vision
6. Publish-approval workflow + publication agreements for products & financier services (Q6)
7. Unified catalog: admin product creation, brands, units of measure, spec templates, popular-product curation, dedup/merge (Q7)
8. Full CRUD coverage (Q8): no user management (20+ members, no deactivate), no review moderation (103 reviews), no vendor invite, orders/quotes view-only
9. KYC levels/expiry + KYP (Q9)
10. Registration wizard (Q10)
- Also: no global search across entities; no impersonation for support; no notification composer/broadcast; no data export beyond overview CSV

### 5.2 Seller / Company
- No member removal or role change (invite-only, 4 fixed roles); no sub-accounts with scoped permissions
- No store settings (logo/banner/policies/payout details); no guided onboarding checklist
- No brands/UoM management, no product clone, no bulk CSV import, no autosave/draft recovery
- No inventory depth (low-stock alerts), no shipping rate configuration (carriers/zones/rates)
- No seller-run coupons/discounts, bundles, cross-sell; no analytics beyond 4 KPIs (no traffic/conversion/funnel)
- No service offerings (installation/maintenance) — goods only; no reply-to-reviews

### 5.3 Financier (activation journey is the gap — console exists once verified)
- **No onboarding path**: self-registered institutions sit in "pending" with zero capabilities, no visible next step; no "Join as financier" CTA; registration intent has no financing option
- No institution staff management with lender-scoped roles (underwriter/reviewer/branch officer)
- No service publication approval by platform (publishes instantly)
- No portfolio analytics (approval rate, disbursed volume, aging/NPL), no risk scoring
- No Sharia artifact management (scholar certifications, contract templates, e-signature)
- No point-of-sale financing integration into marketplace checkout; no API/webhooks for bank cores

### 5.4 Buyer
- No multi-vendor selection / vendor compare at product level (same structural gap as 5.1.5)
- No Islamic financing at checkout ("pay over time with X" — engine exists, not connected to cart)
- No compare depth (spec normalization), no product Q&A, no saved addresses/cards, no reorder, no guest checkout
- No Arabic/RTL anywhere (blueprint: AR/EN day one); USD retail vs YER financing inconsistency; no currency switcher
- Email verification not enforced (even admin usable unverified); 2FA "Coming soon"; no notifications on document/order events; KYC nudges absent

### 5.5 Public / Platform-wide
- No brands directory, no trending/popular pages, no services directory beyond financing — the aggregator/directory layer
- Search: no typo tolerance, no attribute facets (wattage, voltage) beyond category
- Trust signals light (no verified-store counters); no PWA shell; no newsletter capture

---

## 6. THE PLAN — Phases by Priority

> **Sequencing principle (both audits agree):** stability before features; silent-failure fixes before new UI; **RBAC first among structural builds** (every later feature — teams approving products, financier staff, subscription entitlements — depends on it); catalog second (biggest schema change, unlocks the aggregator vision); KYC in parallel (touches registration + verification, not the catalog core). Each phase has an acceptance gate — do not start the next until it passes.

### ⚡ Phase 0 — Stabilize the Platform (P0) · 1–2 days
**Goal:** every existing feature becomes reliable; QA results become trustworthy.
1. Production build on the preview instead of dev mode (eliminates STAB-1: 502s, Fast-Refresh wipes, OOM cascade).
2. Field-level validation errors on every submit flow — rule: *a submit that cannot proceed MUST say which field blocks it* (STAB-2).
3. Fix stats aggregation + skeleton counters on /funding hero, entity profiles, market home, seller RFQ cards (STAB-3).
4. Error boundary + toast system; guard the business-view fetch on `authChecked` (STAB-5); log client exceptions to an endpoint.
5. Supervisor auto-heal for compile-hang (detect → clear `.next` → restart); pre-warm critical routes; cap concurrent QA browser sessions ≤2.
- **Gate:** 60-minute continuous browse with zero 502s, zero lost forms; forced validation error shows inline; forced exception shows a toast, page stays usable.

### ⚡ Phase 1 — Complete Every Existing Journey (P1) · 2–4 days
**Goal:** all four actors can finish every flow they start.
1. Financing wizard: Submit always visible with missing-item checklist; review step renders all values; Back preserves state; upload dialog closes on success (STAB-4).
2. Open-item RFQ routing: reach sellers by category/keyword match or an opt-in "Open requests" directory (STAB-6).
3. Notification events: application status changes, document verified/rejected, quote received, order status changes.
4. Currency presentation policy: one display currency per surface or YER-primary + USD secondary; remove "$100 free shipping" banner from financing pages.
5. Data hygiene sweep (STAB-7) + storefront-cover persistence to seller profile (STAB-8).
- **Gate:** fresh user completes a financing application end-to-end ≤10 min; open-item RFQ receives ≥1 quote.

### 🏗️ Phase 2 — RBAC & Team Management (first structural build) · 2–3 weeks
**Answers owner Q2 + Q3.** Everything else depends on this.
1. **Schema:** `Role` (key, name, scope PLATFORM/ORG/FINANCIER, isSystem), `Permission` (key, e.g. `catalog.product.publish`), `RolePermission`, `UserRole` (user × role × scope ref), `StaffInvitation` (email, token, role, org ref, expiry).
2. **Permission catalog** seeded across domains: catalog, orders, RFQ, financing, orgs, payments, payouts, settings, audit, staff.
3. **Platform staff console:** roles & permissions matrix screen; custom role builder; invite staff with scoped panels (e.g. "KYC reviewer" sees only Financing→Documents); effective-permission viewer per user.
4. **Org & financier self-service:** same components re-scoped — a company manages its team (add removal + role change + permission preview); a bank invites underwriters with `financing.offer.send` but not `service.publish`.
5. **Guards:** `requirePermission()` in API routes; nav filtered by permission; audit-log enrichment for role changes.
6. **Migration:** map existing `User.role` (ADMIN→platform super-admin) and `OrganizationMember.role` (OWNER/ADMIN/BUYER/APPROVER/VIEWER) into the new tables; keep old columns as fallback during rollout.
- **Gate:** invite a staff account with a scoped role → they see only their panels and are blocked at API level beyond them; remove an org member; change a member's role; all of it audit-logged.

### 🏗️ Phase 3 — KYC / KYP + Registration Wizard · 2–3 weeks (parallel with Phase 2 UI)
**Answers owner Q9 + Q10.**
1. KYC levels L0→L3 (anonymous / email / phone+ID / business docs) with per-tier entitlements (NET terms, contract pricing, financing) and gating hooks (e.g. L2 needed to publish).
2. Document types with **expiry tracking + re-verification reminders**; verification queue extends the existing financing-gate UI; status chips on profiles.
3. Seller verification **enforcement** (today 5/5 vendors trade while Unverified) + verification badges on storefronts.
4. **KYP (Know Your Product):** certification records (datasheet, warranty, origin, test reports), per-category required attributes, "Verified specs" badge.
5. **Registration wizard:** account type (buyer/company/financier/seller) → profile → KYC docs → first-action guidance; resumable; quick path preserved for retail buyers.
- **Gate:** unverified seller blocked from publishing; an expired trade license surfaces a reminder; a new business completes wizard signup with docs attached.

### 🏗️ Phase 4 — Unified Catalog, Multi-Vendor & Approvals · 3–4 weeks
**Answers owner Q1, Q5, Q6, Q7, Q8.**
1. **Platform catalog console:** admin product creation (full form + owner fields), clone, bulk CSV import; category CRUD with re-assignment; org-type CRUD; brands + UoM + spec templates; popular-product curation (directory/aggregator seeding).
2. **Product/Offer split:** `Product` = the normalized platform-curated *listing* (what it is: brand, attributes, GTIN/MPN, category path); `Offer/SellerListing` = *who sells it* (seller, price, stock, MOQ, terms). Product page shows vendor offers side-by-side; RFQ lines can target a product or a specific offer.
3. **Duplicate governance:** title-similarity + GTIN/MPN matching with merge suggestions (fixes the "wrong-named product already exists" problem).
4. **Publish-approval workflow:** new-seller and edited-listing review states; admin queue with approve/reject + reason; publication agreement/consent checkbox wired to the audit log; optional gate on seller trust tier. Same mechanism for financier services.
- **Gate:** unverified seller publishes → listing lands in the admin queue, not the public catalog; two sellers attach offers to one product and the buyer sees both.

### 🏗️ Phase 5 — Financier Completion & Module Activation · 1–2 weeks
**Answers owner Q4 + closes the financier activation journey.**
1. Financier onboarding path: "Join as financier" CTA → application with license docs → admin approval → institution activation (reconciles the Audit A/B conflict: console exists, activation doesn't).
2. Financier team roles via the Phase 2 RBAC substrate (underwriter, reviewer, branch officer).
3. **Module activation system:** `ModuleDefinition` + `ModuleActivation` (scope: platform / org / orgType / subscription) — admin matrix UI, drives nav + API guards + storefront sections. Natural substrate for subscription tiers (Free/Pro/Enterprise = module bundles + limits).
4. Applicant ↔ financier side-by-side offers (the multi-financier sibling-request design already exists — surface it).
- **Gate:** a self-registered institution completes activation and its staff see the lender console; an admin flips a module off for an org type and it disappears from their nav + APIs.

### Phase 6 — Commerce Depth · 2 weeks
1. Islamic finance at checkout: "Finance it (Murabaha)" payment method → pre-qualification from the financing engine → financed order → financier disbursement events.
2. Buyer: compare with spec matrix, saved addresses, reorder, guest checkout, product Q&A.
3. Seller: onboarding checklist, store settings page (logo/banner/policies/payouts), autosave/draft recovery, CSV import, low-stock alerts, seller coupons, shipping zones, analytics depth.

### Phase 7 — Directory, Discovery & Localization · 2–3 weeks
1. Brands directory, trending/bestsellers, services directory; advanced attribute filters; normalized comparison across products/services/RFQs; trust counters.
2. **Arabic + RTL** (blueprint day-one requirement): i18n, AR/EN toggle, RTL mirroring, Arabic profiles/program copy.
3. Currency switcher (YER base, USD/SAR display).

### Phase 8 — Production Hardening · 1 week + ongoing
1. Security: email-verification enforcement, 2FA, session management UI, rate limiting on auth/RFQ/quote, password policy.
2. Ops: automated Aiven backups, uptime monitoring, staging/production split, CI gates (lint/type/test), storage headroom check before Phase 4 (1 GB tier).
3. Performance: pagination on admin tables, image CDN/lazy-load, seed-data cleanup (example.com links, placeholder contacts).

---

## 7. Regression Checklist (run after every phase)
- Register fresh buyer/seller → place coupon order → track to delivery
- RFQ: create (catalog + open item) → quote → negotiate → accept → convert → fulfill
- Financing: wizard to submission → admin gate → forward → offer → agreement
- Admin: walk all 15 panels; confirm counts match listed content (STAB-3 regression)
- Team: invite + remove member, role change (post-Phase 2)
- 60-minute stability soak: zero 502s, zero lost forms

## 8. Test Assets (reuse for regression)

| Asset | Credential / identifier |
|---|---|
| Admin (owner-provided) | admin@vendora.com / 12345678 |
| Buyer | qa-buyer1@vendora.com / TestPass123! (member of QA Solar Trading Co) |
| Buyer | qa-buyer2@vendora.com / TestPass123! — order N13ABG7V ($406.30 PAID), RFQ-2026-000009 |
| Buyer | demo@vendora.com (seed) — business account, team, approvals |
| Seller | seller1@vendora.com (seed) — 10 listings, 7-tab form |
| Seller | qa-company1@vendora.com / TestPass123! — store "QA Solar Trading Co", RFQ-2026-000007 → order #ORLL1I4R |
| Financier (verified) | alamal.admin@vendora.com — full lender console |
| Financier (pending) | qa-financier1@vendora.com / TestPass123! — org "QA Microfinance Institution" (Pending), vault docs ×3 |
| Coupons | SUN10 (first-order only), BULK15 (−15% >$200), WELCOME10, FAKE99 (invalid) |
| Seed data (DO NOT MODIFY) | 5 vendor stores, 26 listings, 14 orders, 103 reviews, FIN-2026-000005, Al-Amal/Al-Kuraimi/Tihama + 9 programs |

## 9. Open Questions for the Owner
1. **Block unverified sellers from publishing?** (Recommended: yes — Phase 4. Today 5/5 vendors trade while Unverified.)
2. **Currency:** keep USD retail + YER financing (dual with conversion display), or YER-primary per blueprint?
3. **Multi-vendor timing:** Q5 is the largest data-model change (Product/Offer split) — confirm this cycle or defer post-Phase 5.
4. **Financier console scope:** full program CRUD + offers, or inbox + offers first?
5. **Arabic timing:** Phase 7 as planned, or pull AR/RTL earlier for stakeholder demos?
6. **Monetization model:** seller subscriptions vs. transaction commission (current: 10%) vs. financier fees — or a mix? (Phase 5 config depends.)
7. **Platform-managed products:** should Vendora itself sell (1P), or strictly 3P marketplace + curated catalog?
8. **KYC depth:** manual platform review only, or integrate a verification provider later?

---

*Immediate next action per owner directive: **implement RBAC (Phase 2 core: schema → seed → guards → admin UI), then migrate and push to Aiven MySQL.** Detailed per-actor evidence: `audit/admin-findings.md`, `audit/actor-company.md`, `audit/actor-financier.md`, `audit/actor-buyer.md`; screenshots in `/tmp/qa-*.png`.*
