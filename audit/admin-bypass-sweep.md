# ADMIN bypass removal — full-codebase sweep artifact (Phase 6, 6.2.5)

Companion to commit(s) implementing lastplan v5 §6.2. The guards
(`requireAdmin`, `requireAdminAny`, `requireModule`) no longer honor
`User.role === 'ADMIN'`; authorization is RBAC-only. The platform owner
operates through the protected `platform.super-admin` role (seeded onto
legacy admin accounts by `scripts/seed-rbac.ts`, step 3).

## Authorization facts — REPLACED with permission checks

| Site | Old fact | New check |
|---|---|---|
| `src/server/guards.ts` | `role === 'ADMIN'` bypass in all three guards; bare `requireAdmin()` allowed | bypass removed; `requireAdmin(key)` REQUIRED, throws without a key |
| `src/server/modules/rbac/service.ts` `getActorContext` / `buildSessionRbac` | ADMIN shortcut → all permissions | assignments only; super-admin via `platform.super-admin` role |
| `src/lib/auth.ts` `toSessionUser` | ADMIN → implicit permissions/staff | RBAC payload only; `role` stays a display badge |
| `src/app/api/admin/slides/route.ts`, `slides/[id]/route.ts`, `admin/settings/route.ts` | local `requireAdmin()` shadows (RBAC-broken) | shadows deleted; `requireAdmin('storefront.manage')` from `@/server/guards` |
| `src/app/api/quotes/[id]/review/route.ts` | bare `requireAdmin()` | `requireAdmin('rfq.quotes.review')` (new catalog key) |
| `src/app/api/organizations/[id]/route.ts` | `role === 'ADMIN'` viewer/threshold flags | `orgs.view` / `orgs.update` |
| `src/app/api/uploads/route.ts` | SELLER-or-ADMIN upload; ADMIN sees all media | `catalog.products.update` / `catalog.products.view` |
| `src/app/api/products/export/route.ts` | SELLER-or-ADMIN; scope=all for ADMIN | `catalog.products.view` |
| `src/app/api/orders/[id]/route.ts` | ADMIN view/fulfill override | `orders.view` / `orders.update` |
| `src/app/api/products/route.ts` | ADMIN draft visibility / create / publish bypass | `catalog.products.view` / `.create` / `.moderate` |
| `src/app/api/products/[id]/route.ts` | ADMIN edit/delete/offer/CAN_SPEND checks | `catalog.products.view` / `.update` / `.delete` / `.moderate` |
| `src/app/api/quotes/[id]/pdf/route.ts` | ADMIN download | `rfq.pipeline.view` |
| `src/server/modules/rfq/service.ts` (7 sites) | ADMIN view/respond/review/convert/withdraw | `rfq.pipeline.view` / `rfq.quotes.review` |
| `src/server/modules/rfq/disputes.ts` (7 sites) | ADMIN dispute overrides + resolve | `disputes.view` / `disputes.resolve` |
| `src/server/modules/rfq/recurring.ts` (4 sites) | ADMIN schedule override | `rfq.pipeline.view` |
| `src/server/modules/financing/conditions.ts` (2 sites) | GENERAL library ADMIN-only | `financing.requirements.manage` |
| `src/server/modules/financing/offers.ts` | FEE notification routed to `role: 'ADMIN'` users | holders of `financing.fees.manage` or `platform.super-admin` |
| `src/server/modules/kyc/service.ts` `assertSellerCanPublish` | ADMIN publish override | `catalog.products.moderate` |
| `src/app/api/auth/become-seller/route.ts` | ADMIN cannot become seller | any platform-scope assignment (or legacy badge) blocks the downgrade |

## ALLOWLISTED — not authorization facts (with reason)

| Site | Kind | Reason |
|---|---|---|
| `src/lib/auth.ts` `toSessionUser` role mapping (`ADMIN` badge) | display | SessionUser.role feeds UI badges/labels only; no guard reads it |
| `src/app/api/auth/become-seller/route.ts` (the *block* itself) | product-safety rule | prevents staff self-downgrade; block now keyed on RBAC assignment |
| `src/server/modules/rfq/disputes.ts` `actorType: actor.role === 'ADMIN' ? 'ADMIN' : 'USER'` | audit label | Audit-trail display metadata; actors are authenticated above |
| `src/server/modules/financing/conditions.ts` `actorType` labels | audit label | same |
| `src/server/modules/rbac/service.ts` `assignRole` (ADMIN target protection), `searchUsers` (ADMIN hidden from non-super-admins), `listPlatformStaff` visibility filters | UI/privacy hardening | Owner-account protection + protected-role invisibility (RBACSEC-1); the *power* comes from assignments |
| `src/lib/rbac-catalog.ts` | comments/seed data | catalog text |
| `src/components/**` (`admin-view.tsx`, `header.tsx`, `site-header.tsx`, `rbac-tab.tsx`, `financier-view.tsx`, `b2b-shared.tsx`, `disputes.tsx`, `buyer-profile-security.tsx`) | display conditionals | Console/badge visibility only. Console gating already keys on `isPlatformStaff` (RBAC-derived). Server APIs enforce real authorization. |
| `mini-services/**` | non-route service | The WhatsApp mini-service has no authorization surface (channel ops, single purpose, port-isolated) — scheduled for classification in 6.1.4's widened lint once its endpoints grow beyond pairing/health |

## Bootstrap + recovery

- `scripts/seed-rbac.ts` step 3: legacy `User.role='ADMIN'` accounts receive
  the protected `platform.super-admin` assignment (idempotent).
- Break-glass (6.2.3): dedicated account = `platform.super-admin` holder with
  `User.isBreakGlass = true` → every login writes `BREAK_GLASS_LOGIN` audit +
  console alert. MFA-enforced via the 6.7.4 derivation (super-admin carries
  `rbac.manage` & co → required).
- Rollback: re-apply the previous commit (documented; expires with the release
  train — the rollback restores the bypass ONLY until the next deploy).
