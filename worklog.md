# Vendora Marketplace — Project Worklog

Multi-vendor marketplace built with Next.js 16 (App Router) + TypeScript + Prisma (SQLite) + Tailwind 4 + shadcn/ui.
Original request was a "Laravel marketplace"; sandbox mandates Next.js stack, so an equivalent full marketplace is built instead.

## Project Plan / Task IDs

- Task 1 (me): Init worklog — DONE
- Task 2-a (subagent, general-purpose): Collect ~30 product/category/hero images via image-search skill CLI, verify reachability, return JSON mapping
- Task 2-b (me): Prisma schema (User, Category, Product, Order, OrderItem, Review, Favorite) + `bun run db:push`
- Task 3 (me): Custom JWT cookie auth (node:crypto HMAC + scrypt) + API routes (auth, products, categories, orders, reviews, favorites, seller stats)
- Task 4 (me): Seed script (5 sellers, 1 demo buyer, 6 categories, 26 products, demo orders/reviews/favorites)
- Task 5 (me): Zustand store (cart persist, auth, view routing) + shared TS types
- Task 6 (me): SPA frontend (single `/` route, client-side views): header/footer, home, catalog w/ filters, product detail w/ gallery+reviews, cart, checkout, orders, favorites, seller dashboard (CRUD products, stats), auth modal
- Task 7 (me): Warm theme (burnt-orange primary, stone neutrals — NO blue/indigo) + dark mode via next-themes
- Task 8 (me): Lint + dev.log check
- Task 9 (me): agent-browser E2E QA + fixes
- Task 10 (me): webDevReview cron job every 15 minutes
- Task 11 (me): Final worklog update

## Architecture Decisions

- Single visible route `/` (SPA view switching via zustand) — sandbox constraint "user can only see /"
- All backend via API routes (no server actions) — per instructions
- Custom auth instead of NextAuth v4 (v4 compat risk on Next 16): httpOnly cookie `vendora_session`, HMAC-signed `userId.expiry.sig`, scrypt password hashing
- Product images stored as JSON string array in Prisma (SQLite lists not supported)
- Currency USD, formatted via Intl.NumberFormat
- Cart in zustand + localStorage persist; checkout requires login
- Demo accounts: demo@vendora.com / demo1234 (buyer), seller1..5@vendora.com / seller1234 (sellers)

## Status Log

- Project initialized: Next.js 16.1.1, React 19, Prisma 6, full shadcn/ui set, zustand, TanStack Query, next-themes, sonner available. Fresh scaffold page.tsx (to be replaced).

---
Task ID: 2-a
Agent: general-purpose (image collector)
Task: Collect product/hero images for Vendora marketplace via image-search skill

Work Log:
- Read worklog for context; invoked image-search skill and studied the `z-ai image-search` CLI docs
- Ran 29 product searches (gl=us, count 5-8, captions on) covering electronics (5), fashion (5), home (5), sports (4), beauty (3), handmade (4) — raw JSON saved to /home/z/my-project/db/search-results/
- Ran 8 additional hero/retry searches for weak results: re-searched action camera, perfume, desk lamp (x2 extra), hiking boots, canvas backpack + 2 extra hero queries
- Picked best per product by caption/quality/aspect (clean product shots, white/light backgrounds, no watermarks); avoided Alamy/Shutterstock-watermarked and text-heavy results
- Curl-verified every candidate (HTTP status + content-type); all final 29 URLs returned 200
- Wrote /home/z/my-project/db/images.json with exact required key structure (hero 3, electronics 5, fashion 5, home 5, sports 4, beauty 3, handmade 4 = 29 unique OSS URLs)
- Validated JSON parse + key counts + URL uniqueness; re-verified all 29 URLs from the written file (0 failures)
- Skipped image-generation per instructions (no AI hero needed)

Stage Summary:
- Result: /home/z/my-project/db/images.json — 29 verified OSS-hosted image URLs (z-cdn.chatglm.cn), structure matches spec exactly; all URLs reachable (HTTP 200, verified twice). Raw search JSON kept in db/search-results/ as backup for alternates. Ready for seed script (Task 4).

---
Task ID: 1-11 (main build)
Agent: Z.ai Code (orchestrator)
Task: Build "Vendora" multi-vendor marketplace (Next.js 16 equivalent of requested Laravel marketplace)

Work Log:
- Task 1: initialized this worklog; chose Next.js 16 + TS + Prisma/SQLite + Tailwind 4 + shadcn/ui (sandbox mandates; no PHP/Laravel available)
- Task 2-a: subagent collected 29 verified OSS-hosted product/hero image URLs into db/images.json (+ backup raw search results in db/search-results/); alternates curated to db/images-alt.json (8 extra gallery images, all curl-verified 200)
- Task 2-b: Prisma schema (User/Category/Product/Order/OrderItem/Review/Favorite, Review.verified for verified-purchase badge), db pushed, client generated
- Task 3: custom auth (HMAC-signed httpOnly cookie `vendora_session`, scrypt password hashing, node:crypto only) + 13 API route files: auth (register/login/logout/me/become-seller), categories, products (list w/ search+filters+sort+pagination, detail w/ reviews+related, create, update, delete-or-archive), orders (checkout w/ stock transaction, my orders, seller status advance PAID→PROCESSING→SHIPPED→DELIVERED), reviews (upsert + aggregate recompute + verified-purchase), favorites (toggle), seller orders + stats (KPIs, 14-day sales chart, top products)
- Task 4: seed script prisma/seed.ts — 11 users (demo buyer demo@vendora.com/demo1234, 5 sellers seller1..5@vendora.com/seller1234, 5 reviewers), 6 categories, 26 products (real descriptions, discounts, stock, sold counts), 77 reviews w/ recomputed aggregates, 14 orders spread over 14 days, 5 favorites
- Task 5: zustand store (view routing, auth, cart w/ localStorage persist, cartOpen, authModal w/ afterAuth redirect) + shared TS types + format helpers + useApi hook
- Task 6: full SPA in single `/` route: header (announcement, search, cart badge, user menu, category nav, mobile sheet), footer (trust badges, links, safe-area), home (hero w/ floating cards, categories, featured, trending, new arrivals, sell CTA), catalog (sidebar filters, price ranges, sort, pagination, mobile filter sheet, empty state), product detail (gallery, discount badge, stock, qty, add/buy/favorite, perks, seller card, description/reviews tabs, rating distribution, review form, related), cart page + drawer (free-shipping progress), checkout (shipping form, payment methods, success screen), orders (status timeline, expand, copy ID, write review CTA), favorites, account, seller dashboard (KPI cards, recharts revenue chart, top products, recent orders, product CRUD w/ dialog + sample images, orders w/ status advance, become-seller conversion flow), auth modal (login/register, role picker, demo creds quick-fill)
- Task 7: warm theme (burnt-orange primary oklch(0.63 0.185 42), stone/amber neutrals, NO blue/indigo) in light+dark, custom scrollbar CSS, selection styling
- Task 8: lint clean; dev.log clean
- Task 9: agent-browser E2E: home renders (VLM-verified), category filter, product detail, add-to-cart + badge, checkout auth-guard, demo login, order placement (order confirmed screen), orders timeline, review upsert (verified badge), become-seller flow, product publish → public visibility, search, dark mode + mobile 390px (VLM-verified), footer push on long pages + min-h-screen flex mechanism
- Fixed bugs found in QA: (1) CatalogView stale category state on param change while mounted → render-time state sync pattern; (2) SellerView tab stale on sellerTab param → controlled Tabs; (3) zustand persist hydration mismatch (cart badge) → skipHydration + explicit rehydrate in MarketplaceApp
- Task 10-11: this worklog update + webDevReview cron every 15 min

Stage Summary:
- Vendora marketplace is LIVE on port 3000, fully functional end-to-end: browse → search → product → cart → login → checkout → order history → review; seller can convert, publish products, manage orders/fulfillment, view stats
- Demo accounts: buyer demo@vendora.com / demo1234 (now upgraded to seller "Rivera Goods Co." during QA, still can buy); sellers seller1..5@vendora.com / seller1234
- Data: 27 products (incl. QA-created "Leather Desk Pad XL"), 14+1 orders, 77 reviews, 6 categories, 5 stores
- Known minor items for next phase (suggestions): order cancellation, real Stripe test integration, product image upload (currently URL/sample picker), seller store public page, infinite scroll or more pagination polish, order email confirmation simulation, admin analytics
