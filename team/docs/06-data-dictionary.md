# Vendora — Data Dictionary

| | |
|---|---|
| **Version** | 1.0 |
| **Date** | September 2026 |
| **Audience** | Expert software engineers (Vendora core team) |
| **Part A source** | `prisma/schema.prisma` (32 models — the schema of record; every field below is transcribed from it, none invented, none dropped) |
| **Part B source** | `team/FINANCIER_SCHEMA.md` v4.0 §3 (17 planned models + additive `User` columns — **PLANNED — NOT IN DATABASE YET**) |
| **Companion** | `01-domain-model.md` (ER diagrams, relationship inventory, state machines) |

---

## 1. Conventions

- **Identifiers** — `String @id @default(cuid())` → MySQL `VARCHAR(191)` (Prisma default `String`
  length; no `@db.*` override on ids in this schema). No `@@map` anywhere: MySQL table names equal
  Prisma model names.
- **Timestamps** — `DateTime` → `DATETIME(3)`, stored UTC. `createdAt` via `@default(now())`;
  `updatedAt` via `@updatedAt` (Prisma-maintained).
- **Money** — Two regimes, deliberately:
  - `Decimal(12, 2)` (`@db.Decimal(12, 2)`) on B2B / settlement surfaces: `PriceListEntry.unitPrice`,
    `Organization.creditLimit/approvalThreshold`, `RfqLine.targetPrice`, all `Quote` totals,
    `QuoteLine.unitPrice`, `ApprovalRequest.amount`, `Dispute.amount`, `Payment.amount`,
    `Payout.grossAmount/commission/netAmount`, `Coupon.minSubtotal` (the one `Decimal(10, 2)`).
  - Legacy `Float` (→ `DOUBLE`) on retail surfaces: `Product.price/compareAtPrice/shippingFee`,
    `ProductVariant.price/compareAtPrice`, `Order.total`, `OrderItem.price`,
    `User.commissionRate`, `Payout.commissionRate` (rate snapshot, percent).
- **Enums are strings** — no native MySQL enums; every status/type column is `VARCHAR(n)` whose
  values are a TypeScript union validated at the boundary with zod. The full registry is §2.
- **Type mapping defaults** — `String` → `VARCHAR(191)`, `Int` → `INT`, `Float` → `DOUBLE`,
  `Boolean` → `TINYINT(1)`, `Json` → `JSON`, `DateTime` → `DATETIME(3)`; explicit `@db.VarChar(n)`,
  `@db.Text`, `@db.Decimal(p, s)` as annotated.
- **LEGACY-JSON** — fields storing JSON (either `Json` columns or JSON-in-`Text` strings) that are
  **frozen by owner doctrine (2026-09)**: keep working, do NOT extend, do NOT add new ones
  (DP-18). Financier domain has zero. Full inventory + eventual-normalization notes in the
  Appendix. The financier domain must not write `AuditLog.metadata` (R-1) — use `summary` text.
- **Referential actions** — explicit `onDelete: Cascade` is noted; otherwise Prisma defaults
  apply (Restrict for required, SetNull for optional).
- **Loose FKs** — plain string columns referencing another table's id without a DB constraint
  (enforced in service code). Marked *loose FK*.

---

## 2. Enum registry (read this first)

Values are verbatim from schema comments (`prisma/schema.prisma`) and, for Part B, from
FINANCIER_SCHEMA v4.0 §3–§4.

| Enum | Values | Used by |
|---|---|---|
| UserRole | `BUYER` \| `SELLER` \| `ADMIN` | `User.role` |
| UserStatus | `ACTIVE` \| `SUSPENDED` — platform-controlled vendor lifecycle | `User.status` |
| ProductStatus | `ACTIVE` \| `DRAFT` \| `ARCHIVED` | `Product.status` |
| OrderStatus | `PENDING_PAYMENT` \| `PENDING_APPROVAL` \| `PAID` \| `PROCESSING` \| `SHIPPED` \| `DELIVERED` \| `CANCELLED` | `Order.status` |
| OrderSourceType | `CART` \| `RFQ` | `Order.sourceType` |
| OrganizationType | `COMPANY` \| `BANK` \| `MFI` \| `EWALLET` — settings scope key | `Organization.orgType` |
| OrganizationStatus | `PENDING_VERIFICATION` \| `ACTIVE` \| `SUSPENDED` \| `REJECTED` | `Organization.status` |
| OrgMemberRole | `OWNER` \| `ADMIN` \| `BUYER` \| `APPROVER` \| `VIEWER` | `OrganizationMember.role` |
| PriceListScope | `ORG` \| `GROUP` \| `CHANNEL` (future) | `PriceList.scope` |
| PriceListStatus | `ACTIVE` \| `DRAFT` \| `ARCHIVED` | `PriceList.status` |
| RfqStatus | `DRAFT` \| `SUBMITTED` \| `UNDER_REVIEW` \| `QUOTED` \| `ACCEPTED` \| `REJECTED` \| `CANCELLED` \| `EXPIRED` \| `ORDERED` | `Rfq.status` |
| QuoteStatus | `DRAFT` \| `SENT` \| `PENDING_REVIEW` \| `ACCEPTED` \| `DECLINED` \| `REJECTED` \| `EXPIRED` \| `CONVERTED` \| `WITHDRAWN` | `Quote.status` |
| ApprovalType | `ORDER` \| `QUOTE_ACCEPT` | `ApprovalRequest.type` |
| ApprovalStatus | `PENDING` \| `APPROVED` \| `REJECTED` \| `CANCELLED` | `ApprovalRequest.status` |
| NotificationType | `RFQ_SUBMITTED_SELLER` \| `RFQ_QUOTE_RECEIVED` \| `RFQ_QUOTE_ACCEPTED` \| `RFQ_QUOTE_DECLINED` \| `RFQ_QUOTE_WITHDRAWN` \| `RFQ_QUOTE_CONVERTED` \| `RFQ_STATUS` \| `RFQ_MESSAGE` \| `APPROVAL_REQUESTED` \| `APPROVAL_DECIDED` | `Notification.type` |
| LinkView | `rfq` \| `orders` \| `business` \| `seller` — SPA destination view keys | `Notification.linkView`, `BannerSlide.ctaView` |
| DisputeReason | `NOT_AS_DESCRIBED` \| `DAMAGED` \| `LATE_DELIVERY` \| `WRONG_QUANTITY` \| `QUALITY_ISSUE` \| `PAYMENT_NOT_RECEIVED` \| `OTHER` | `Dispute.reason` |
| DisputeStatus | `OPEN` \| `SELLER_RESPONDED` \| `ESCALATED` \| `RESOLVED` \| `CLOSED` \| `CANCELLED` | `Dispute.status` |
| DisputeOutcome | `FULL_REFUND` \| `PARTIAL_REFUND` \| `REPLACEMENT` \| `REPAIR` \| `NO_ACTION` \| `SELLER_PENALTY` | `Dispute.outcome` |
| RecurringFrequency | `WEEKLY` \| `BIWEEKLY` \| `MONTHLY` \| `QUARTERLY` \| `CUSTOM` | `RecurringRfq.frequency` |
| PaymentMethod | `CARD` (simulated gateway) \| `BANK_TRANSFER` (manual, admin captures) \| `INVOICE` (NET-terms B2B) | `Payment.method` |
| PaymentStatus | `PENDING` \| `SUCCEEDED` \| `FAILED` \| `CANCELLED` | `Payment.status` |
| PayoutStatus | `PENDING` \| `PAID` \| `CANCELLED` | `Payout.status` |
| AuditActorType | `USER` \| `SELLER` \| `ADMIN` \| `SYSTEM` | `AuditLog.actorType` |
| RfqSettingScopeType | `PLATFORM` \| `ORG_TYPE` \| `ORG` \| `CATEGORY` \| `REGION` | `RfqSetting.scopeType`, `SettingChange.scopeType` |
| CurrencyCode | ISO-4217 string, default `USD` | `PriceList.currency`, `Quote.currency`, `Payment.currency` |
| AuditAction | Open vocabulary, e.g. `ORG_VERIFIED`, `RFQ_SUBMITTED`, `PRICELIST_UPDATED`, `QUOTE_APPROVED`, `QUOTE_REJECTED`, `PAYMENT_FAILED`, `PAYOUT_PAID`, `PAYOUT_CANCELLED` | `AuditLog.action` |

**Part B — planned enums (financier domain; PLANNED, NOT in database yet).**

| Enum | Values | Used by |
|---|---|---|
| UserGender (planned) | `MALE` \| `FEMALE` \| `OTHER` | `User.gender` |
| UserMaritalStatus (planned) | `SINGLE` \| `MARRIED` \| `DIVORCED` \| `WIDOWED` | `User.maritalStatus` |
| UserIdentityType (planned) | `NATIONAL_ID` \| `PASSPORT` \| `RESIDENCE_PERMIT` \| `OTHER` | `User.identityType` |
| ResidenceType (planned) | `OWNED` \| `RENTED` | `User.residenceType` |
| BranchKind | `BRANCH` \| `AGENT` \| `ATM` | `FinancierBranch.kind` |
| FinancingCategory | B2B trio: `WORKING_CAPITAL` \| `INVOICE_FINANCING` \| `PO_FINANCING`; competitor taxonomy: `INVESTMENT` \| `RURAL` \| `ENERGY` \| `HOUSING` \| `FISHERIES` \| `AGRICULTURAL` \| `SEASONAL` \| `EQUIPMENT` \| `OTHER` | `FinancingProduct.category` |
| FinancingSegment | `BUSINESS` \| `INDIVIDUAL` \| `BOTH` (DP-13) | `FinancingProduct.targetSegment` |
| FinancingProductStatus | `ACTIVE` \| `DRAFT` \| `ARCHIVED` | `FinancingProduct.status` |
| RateType | `MURABAHA_ANNUAL` \| `FIXED_ANNUAL` \| `FLAT_FEE` | `FinancingProduct.rateType`, `FinancingOffer.rateType` |
| RepaymentFrequency | `MONTHLY` \| `QUARTERLY` \| `LUMP_SUM` | `FinancingProduct.repaymentFrequency` |
| AttributeKind | `FEATURE` \| `ELIGIBILITY_CONDITION` | `FinancingProductAttribute.kind` |
| RequirementKind | `COLLATERAL_ACCEPTED` \| `DOCUMENT_REQUIRED` | `FinancingProductRequirement.kind` |
| FinancingTargetType | `WORKING_CAPITAL` \| `QUOTE` \| `ORDER` \| `RFQ_LINE` | `FinancingRequest.targetType` |
| ActivityStatus | `NEW` \| `EXISTING` | `FinancingRequest.activityStatus` |
| ActivityCategory | `INVESTMENT` \| `RURAL` \| `ENERGY` \| `HOUSING` \| `FISHERIES` \| `OTHER` (+ B2B trio & catalog extras) | `FinancingRequest.activityCategory` |
| LocationType | `OWNED` \| `RENTED` | `FinancingRequest.activityLocationType` (and planned `User.residenceType`) |
| GuaranteeType | `PERSONAL_GUARANTEE` \| `BANK_GUARANTEE` \| `GOLD` \| `COMMERCIAL` \| `MORTGAGE` \| `CONVERTIBLE_SECURITIES` \| `SELF_GUARANTEE` \| `OTHER` | `FinancingRequest.guaranteeType`, `FinancingOffer.collateralRequired`, `FinancingProductRequirement.value` (COLLATERAL_ACCEPTED) |
| GuaranteeStatus | `AVAILABLE` \| `PARTIALLY_AVAILABLE` \| `UNAVAILABLE` \| `OTHER` | `FinancingRequest.guaranteeStatus` |
| DistributionMode | `OPEN` \| `BUYER_SELECTED` | `FinancingRequest.distributionMode` |
| FinancingRequestStatus | `DRAFT` \| `SUBMITTED` \| `UNDER_REVIEW` \| `INFO_REQUESTED` \| `OFFERED` \| `ACCEPTED` \| `DECLINED_ALL` \| `EXPIRED` \| `CANCELLED` \| `WITHDRAWN` | `FinancingRequest.status` |
| ApplicantDocumentType | user-scope: `ID_DOCUMENT`; request-scope: `BUSINESS_LICENSE` \| `FINANCIAL_STATEMENT` \| `BANK_STATEMENT` \| `TAX_REGISTRATION` \| `PROPERTY_PROOF` \| `INVOICE` \| `PURCHASE_ORDER` \| `GUARANTEE_DOC` \| `FEASIBILITY_STUDY` \| `OTHER`; accreditation-scope: per `AccreditationCriterion` | `ApplicantDocument.type`, `FinancingProductRequirement.value` (DOCUMENT_REQUIRED) |
| ApplicantDocumentStatus | `PENDING` \| `VERIFIED` \| `REJECTED` | `ApplicantDocument.status` |
| FinancingOfferStatus | `DRAFT` \| `SENT` \| `ACCEPTED` \| `DECLINED` \| `EXPIRED` \| `WITHDRAWN` | `FinancingOffer.status` |
| FundingStatus | `PENDING` \| `REPORTED_FUNDED` \| `REPORTED_SETTLED` — financier-REPORTED external money events (D-002) | `FinancingAgreement.fundingStatus` |
| AgreementStatus | `ACTIVE` \| `COMPLETED` \| `DEFAULTED` \| `CANCELLED` | `FinancingAgreement.status` |
| FinancingEventType | `DISBURSEMENT` \| `REPAYMENT` \| `EARLY_SETTLEMENT` \| `LATE_FEE` \| `NOTE` | `FinancingEvent.type` |
| FinancingFeeType | `SUCCESS` \| `ORIGINATION` \| `ACCREDITATION` | `FinancingFee.type` |
| FinancingFeeStatus | `ACCRUED` \| `INVOICED` \| `PAID` \| `WAIVED` | `FinancingFee.status` |
| AccreditationCriterionKind | `REQUIRED_DOCUMENT` (value = ApplicantDocument.type) \| `MIN_TENURE_MONTHS` \| `MIN_MONTHLY_REVENUE` \| `MANUAL_CHECK` | `AccreditationCriterion.kind` |
| SupplierAccreditationStatus | `PENDING` \| `UNDER_REVIEW` \| `VERIFIED` \| `REJECTED` \| `EXPIRED` | `SupplierAccreditation.status` |
| Planned currency | ISO-4217, default `YER` | `FinancingProduct.currency`, `FinancingRequest.currency`, `FinancingOffer.currency` |
| Planned notification types | `FINANCING_REQUEST_RECEIVED`, `OFFER_RECEIVED`, `OFFER_ACCEPTED`, `OFFER_DECLINED`, `OFFER_WITHDRAWN`, `DOC_VERIFIED`, `DOC_REJECTED`, `FEE_ACCRUED`, `AGREEMENT_STATUS_CHANGED`, `FINANCING_STATUS_CHANGED`; `linkView` += `financing` | `Notification.type`, `Notification.linkView` |

---

# Part A — EXISTING models (source: `prisma/schema.prisma`)

Grouped by bounded context (see `01-domain-model.md` §1). "Null/default": `required` = NOT NULL
without default; `required, default X` = NOT NULL with DB default; `optional` = nullable.

## A.1 Identity & Access

### User

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| email | String @unique | VARCHAR(255) | required, unique | Login identity (email-based auth) |
| password | String | VARCHAR(255) | required | Hashed credential |
| name | String | VARCHAR(255) | required | Display name (single field — 4-part competitor names deliberately collapsed) |
| image | String? | VARCHAR(512) | optional | Avatar URL (MediaAsset-backed) |
| role | String @default("BUYER") | VARCHAR(16) | required, default BUYER | UserRole enum |
| status | String @default("ACTIVE") | VARCHAR(16) | required, default ACTIVE | UserStatus enum — platform-controlled vendor lifecycle |
| suspendedAt | DateTime? | DATETIME(3) | optional | Suspension timestamp |
| storeName | String? | VARCHAR(120) | optional | Seller storefront name |
| storeBio | String? | TEXT | optional | Seller storefront bio |
| commissionRate | Float? | DOUBLE | optional | Vendor payout commission override (percent); null = platform default |
| verifiedAt | DateTime? | DATETIME(3) | optional | Platform verification stamp (KYC-lite); enables routing auto-approve + distribution filters |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |
| updatedAt | DateTime @updatedAt | DATETIME(3) | required | Last update |

Relations (20 back-relations): `products`→Product, `orders`→Order, `reviews`→Review,
`favorites`→Favorite, `memberships`→OrganizationMember, `groups`→CustomerGroup (implicit m-n
"UserCustomerGroups"), `rfqs`→Rfq, `quotesIssued`→Quote ("QuoteCreatedBy"), `rfqMessages`→
RfqMessage ("RfqMessages"), `approvalsRequested`→ApprovalRequest ("ApprovalRequester"),
`approvalsDecided`→ApprovalRequest ("ApprovalDecider"), `notifications`→Notification
("Notifications"), `settingChanges`→SettingChange ("SettingChangeUser"), `disputesRaised`/
`disputesAgainst`/`disputesResolved`→Dispute, `recurringSchedules`→RecurringRfq,
`mediaAssets`→MediaAsset ("MediaAssets"), `paymentsCaptured`→Payment ("PaymentsCapturedBy"),
`payouts`→Payout ("PayoutSeller").

Indexes: `@@index([role])`.

## A.2 Catalog & Pricing

### Category

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| name | String | VARCHAR(120) | required | Category name |
| slug | String @unique | VARCHAR(120) | required, unique | URL handle |
| icon | String? | VARCHAR(64) | optional | Icon identifier |

Relations: `products`→Product. Indexes: unique `slug`.

### Product

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| title | String | VARCHAR(160) | required | Product title |
| description | String | TEXT | required | Full description |
| price | Float | DOUBLE | required | Retail list price (fallback of the pricing pipeline) |
| compareAtPrice | Float? | DOUBLE | optional | Strike-through reference price |
| images | String @default("[]") | TEXT | required, default "[]" | **LEGACY-JSON** — JSON string array of image URLs (references MediaAsset medium rendition) |
| categoryId | String | VARCHAR(191) | required | FK → Category.id |
| sellerId | String | VARCHAR(191) | required | FK → User.id (owning seller) |
| stock | Int @default(10) | INT | required, default 10 | Total units; with variants = sum of variant stock |
| soldCount | Int @default(0) | INT | required, default 0 | Units sold (moderation signal) |
| rating | Float @default(0) | DOUBLE | required, default 0 | Average review rating |
| reviewCount | Int @default(0) | INT | required, default 0 | Review count |
| featured | Boolean @default(false) | TINYINT(1) | required, default false | Featured flag |
| sku | String? | VARCHAR(64) | optional | Stock keeping unit |
| barcode | String? | VARCHAR(64) | optional | Product barcode |
| videoUrl | String? | VARCHAR(512) | optional | Product video URL |
| highlights | String? | TEXT | optional | **LEGACY-JSON** — JSON array of bullet strings (About this item) |
| specs | String? | TEXT | optional | **LEGACY-JSON** — JSON array of {label, value} (Specifications) |
| materials | String? | VARCHAR(500) | optional | Materials text (Details) |
| care | String? | VARCHAR(500) | optional | Care instructions |
| weightGrams | Int? | INT | optional | Shipping weight |
| lengthCm | Float? | DOUBLE | optional | Shipping dimension |
| widthCm | Float? | DOUBLE | optional | Shipping dimension |
| heightCm | Float? | DOUBLE | optional | Shipping dimension |
| processingDays | Int? | INT | optional | Handling time before dispatch |
| freeShipping | Boolean @default(false) | TINYINT(1) | required, default false | Free-shipping flag |
| shippingFee | Float? | DOUBLE | optional | Flat rate; ignored when freeShipping = true |
| shippingPolicy | String? | VARCHAR(1000) | optional | Shipping policy text |
| slug | String? @unique | VARCHAR(180) | optional, unique | SEO handle / future deep links |
| metaTitle | String? | VARCHAR(150) | optional | SEO title |
| metaDescription | String? | VARCHAR(320) | optional | SEO description |
| moq | Int? | INT | optional | Minimum order quantity enforced by RFQ commercial rules (null = none) |
| priceTiers | String? | TEXT | optional | **LEGACY-JSON** — JSON [{from,to,price}] quantity-break ladder applied in quotes |
| status | String @default("ACTIVE") | VARCHAR(16) | required, default ACTIVE | ProductStatus enum |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |
| updatedAt | DateTime @updatedAt | DATETIME(3) | required | Last update |

Relations: `category`→Category (N:1, Restrict), `seller`→User (N:1, Restrict), `reviews`,
`favorites`, `orderItems`, `priceListEntries`, `rfqLines`, `quoteLines`, `variants`.
Indexes: `[categoryId]`, `[sellerId, status]`, `[status, soldCount]`, `[featured]`; unique `slug`.

### ProductVariant

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| productId | String | VARCHAR(191) | required | FK → Product.id (Cascade) |
| name | String | VARCHAR(200) | required | Display label, e.g. M / Black |
| options | String | TEXT | required | **LEGACY-JSON** — JSON map Size → M, Color → Black |
| price | Float? | DOUBLE | optional | Null = inherit product price |
| compareAtPrice | Float? | DOUBLE | optional | Strike-through reference price |
| stock | Int @default(0) | INT | required, default 0 | Units in stock |
| sku | String? | VARCHAR(64) | optional | Variant SKU |
| position | Int @default(0) | INT | required, default 0 | Sort position |
| isActive | Boolean @default(true) | TINYINT(1) | required, default true | Soft-visibility flag |
| image | String? | VARCHAR(512) | optional | Uploaded-media variant image URL |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |

Relations: `product`→Product (N:1, Cascade). Indexes: `[productId, isActive]`.

### Review

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| productId | String | VARCHAR(191) | required | FK → Product.id (Cascade) |
| userId | String | VARCHAR(191) | required | FK → User.id |
| rating | Int | INT | required | Rating 1..5 |
| comment | String | TEXT | required | Review body |
| verified | Boolean @default(false) | TINYINT(1) | required, default false | Verified-purchase flag |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |

Relations: `product`→Product, `user`→User. Indexes: unique `[productId, userId]`, `[userId]`.

### Favorite

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| userId | String | VARCHAR(191) | required | FK → User.id |
| productId | String | VARCHAR(191) | required | FK → Product.id (Cascade) |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |

Relations: `user`→User, `product`→Product. Indexes: unique `[userId, productId]`.

### CustomerGroup

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| key | String @unique | VARCHAR(60) | required, unique | Stable group key (B2C segments / B2B tiers) |
| name | String | VARCHAR(120) | required | Display name |
| description | String? | TEXT | optional | Group description |
| priority | Int @default(0) | INT | required, default 0 | Higher wins when several groups apply |
| isDefault | Boolean @default(false) | TINYINT(1) | required, default false | Default group flag |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |

Relations: `users`→User (implicit m-n "UserCustomerGroups"), `organizations`→Organization
(implicit m-n "OrganizationCustomerGroups"), `priceLists`→PriceList. Indexes: `[isDefault]`.

### PriceList

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| name | String | VARCHAR(160) | required | List name |
| description | String? | TEXT | optional | List description |
| scope | String | VARCHAR(16) | required | PriceListScope enum — ORG \| GROUP \| CHANNEL |
| status | String @default("ACTIVE") | VARCHAR(16) | required, default ACTIVE | PriceListStatus enum |
| priority | Int @default(0) | INT | required, default 0 | Resolution priority |
| currency | String @default("USD") | VARCHAR(3) | required, default USD | ISO-4217 |
| startsAt | DateTime? | DATETIME(3) | optional | Validity window start |
| endsAt | DateTime? | DATETIME(3) | optional | Validity window end |
| organizationId | String? | VARCHAR(191) | optional | FK → Organization.id (Cascade) — ORG scope |
| customerGroupId | String? | VARCHAR(191) | optional | FK → CustomerGroup.id (Cascade) — GROUP scope |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |
| updatedAt | DateTime @updatedAt | DATETIME(3) | required | Last update |

Relations: `organization`→Organization, `customerGroup`→CustomerGroup, `entries`→
PriceListEntry. Indexes: `[status, scope]`, `[organizationId]`, `[customerGroupId]`.

### PriceListEntry

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| priceListId | String | VARCHAR(191) | required | FK → PriceList.id (Cascade) |
| productId | String | VARCHAR(191) | required | FK → Product.id (Cascade) |
| minQuantity | Int @default(1) | INT | required, default 1 | Ladder step: applies from this quantity up |
| unitPrice | Decimal | DECIMAL(12,2) | required | Contract unit price |

Relations: `priceList`→PriceList, `product`→Product. Indexes: unique
`[priceListId, productId, minQuantity]`, `[productId]`.

### Coupon

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| code | String @unique | VARCHAR(24) | required, unique | Redemption code |
| description | String | VARCHAR(160) | required | Admin-facing description |
| percentOff | Int | INT | required | Discount percent |
| minSubtotal | Decimal @default(0) | DECIMAL(10,2) | required, default 0 | Minimum qualifying subtotal |
| firstOrderOnly | Boolean @default(false) | TINYINT(1) | required, default false | Restrict to first order |
| active | Boolean @default(true) | TINYINT(1) | required, default true | Enabled flag |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |
| updatedAt | DateTime @updatedAt | DATETIME(3) | required | Last update |

Relations: none. Indexes: `[active]`.

## A.3 Order & Fulfillment

### Order

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| buyerId | String | VARCHAR(191) | required | FK → User.id |
| total | Float | DOUBLE | required | Order total (money snapshot at checkout) |
| status | String @default("PAID") | VARCHAR(16) | required, default PAID | OrderStatus enum |
| fullName | String | VARCHAR(120) | required | Shipping name |
| address | String | VARCHAR(255) | required | Shipping street address |
| city | String | VARCHAR(120) | required | Shipping city |
| country | String | VARCHAR(120) | required | Shipping country |
| zip | String | VARCHAR(32) | required | Postal code |
| phone | String? | VARCHAR(40) | optional | Contact phone |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |
| organizationId | String? | VARCHAR(191) | optional | FK → Organization.id (SetNull) — purchasing organization (B2B context) |
| poNumber | String? | VARCHAR(40) | optional | Buyer purchase-order reference |
| costCenter | String? | VARCHAR(60) | optional | Internal cost center |
| paymentTerms | String? | VARCHAR(24) | optional | e.g. NET-30; null = paid at checkout |
| sourceType | String? | VARCHAR(12) | optional | OrderSourceType enum — CART \| RFQ |
| sourceQuoteId | String? @unique | VARCHAR(191) | optional, unique | Loose FK → Quote.id — quote that produced this order |

Relations: `buyer`→User, `items`→OrderItem, `organization`→Organization, `approvalRequest`→
ApprovalRequest (1:1), `payment`→Payment (1:1), `disputes`→Dispute.
Indexes: `[buyerId, createdAt]`, `[status]`, `[organizationId]`.

### OrderItem

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| orderId | String | VARCHAR(191) | required | FK → Order.id (Cascade) |
| productId | String | VARCHAR(191) | required | FK → Product.id |
| sellerId | String | VARCHAR(191) | required | Denormalized seller (multi-seller split) |
| quantity | Int | INT | required | Units purchased |
| price | Float | DOUBLE | required | Unit price snapshot |
| title | String | VARCHAR(255) | required | Snapshot of product title at purchase time |
| image | String? | VARCHAR(512) | optional | Snapshot of first product image |
| variantId | String? | VARCHAR(191) | optional | Loose FK → ProductVariant.id (null = base product) |
| variantName | String? | VARCHAR(200) | optional | Snapshot of variant label at purchase time |
| payoutId | String? | VARCHAR(191) | optional | FK → Payout.id (SetNull) — set-once when this item's revenue was settled |

Relations: `order`→Order (Cascade), `product`→Product, `payout`→Payout.
Indexes: `[orderId]`, `[productId]`, `[sellerId]`, `[sellerId, payoutId]`.

## A.4 Negotiation (RFQ / Quote)

### Rfq

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| number | String @unique | VARCHAR(32) | required, unique | RFQ-YYYY-NNNNNN via Sequence 'RFQ' (D-006) |
| userId | String | VARCHAR(191) | required | FK → User.id (requester) |
| organizationId | String? | VARCHAR(191) | optional | FK → Organization.id (SetNull) — org context |
| title | String? | VARCHAR(160) | optional | Request title |
| description | String? | TEXT | optional | Request body |
| status | String @default("DRAFT") | VARCHAR(16) | required, default DRAFT | RfqStatus enum |
| submittedAt | DateTime? | DATETIME(3) | optional | Submission time |
| respondedAt | DateTime? | DATETIME(3) | optional | First response time |
| closedAt | DateTime? | DATETIME(3) | optional | Terminal time |
| expiresAt | DateTime? | DATETIME(3) | optional | RFQ deadline (expiry settings; null = no deadline) |
| extendedCount | Int @default(0) | INT | required, default 0 | Buyer extensions used against the max-extensions rule |
| sourceRecurringId | String? | VARCHAR(64) | optional | Loose FK → RecurringRfq.id — schedule that spawned this run |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |
| updatedAt | DateTime @updatedAt | DATETIME(3) | required | Last update |

Relations: `user`→User, `organization`→Organization, `lines`→RfqLine, `quotes`→Quote,
`messages`→RfqMessage. Indexes: `[userId, createdAt]`, `[organizationId]`, `[status, createdAt]`.

### RfqLine

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| rfqId | String | VARCHAR(191) | required | FK → Rfq.id (Cascade) |
| productId | String? | VARCHAR(191) | optional | FK → Product.id (SetNull); null = open/free item |
| productName | String | VARCHAR(200) | required | Snapshot title / free description |
| sku | String? | VARCHAR(80) | optional | Referenced SKU |
| variantId | String? | VARCHAR(64) | optional | Loose FK → ProductVariant.id (optional catalog variant) |
| variantName | String? | VARCHAR(160) | optional | Snapshot "Color: Black / Bundle: Duo" |
| quantity | Int | INT | required | Requested quantity |
| targetPrice | Decimal? | DECIMAL(12,2) | optional | Buyer's target unit price |
| notes | String? | TEXT | optional | Line notes |

Relations: `rfq`→Rfq (Cascade), `product`→Product, `quoteLines`→QuoteLine.
Indexes: `[rfqId]`, `[productId]`, `[variantId]`.

### Quote

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| number | String @unique | VARCHAR(32) | required, unique | QTE-YYYY-NNNNNN via Sequence 'QTE' |
| rfqId | String | VARCHAR(191) | required | FK → Rfq.id (Cascade) |
| createdById | String | VARCHAR(191) | required | FK → User.id — admin or seller who issued the quote |
| sellerId | String? | VARCHAR(191) | optional | Fulfilling seller (null = platform-facilitated) |
| status | String @default("SENT") | VARCHAR(16) | required, default SENT | QuoteStatus enum |
| currency | String @default("USD") | VARCHAR(3) | required, default USD | ISO-4217 |
| subtotal | Decimal | DECIMAL(12,2) | required | Lines subtotal |
| discountTotal | Decimal @default(0) | DECIMAL(12,2) | required, default 0 | Discount total |
| shippingTotal | Decimal @default(0) | DECIMAL(12,2) | required, default 0 | Shipping total |
| taxTotal | Decimal @default(0) | DECIMAL(12,2) | required, default 0 | Tax total |
| total | Decimal | DECIMAL(12,2) | required | Quote total |
| paymentTerms | String? | VARCHAR(24) | optional | e.g. NET-30 |
| validUntil | DateTime? | DATETIME(3) | optional | Validity window (lazy sweep expiry) |
| notes | String? | TEXT | optional | Quote notes |
| sentAt | DateTime? | DATETIME(3) | optional | Sent time |
| acceptedAt | DateTime? | DATETIME(3) | optional | Acceptance time |
| declinedAt | DateTime? | DATETIME(3) | optional | Decline time |
| convertedAt | DateTime? | DATETIME(3) | optional | Order-conversion time |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |
| updatedAt | DateTime @updatedAt | DATETIME(3) | required | Last update |

Relations: `rfq`→Rfq (Cascade), `createdBy`→User ("QuoteCreatedBy"), `lines`→QuoteLine,
`approvalRequests`→ApprovalRequest ("ApprovalQuote"). Indexes: `[rfqId]`, `[status]`.

### QuoteLine

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| quoteId | String | VARCHAR(191) | required | FK → Quote.id (Cascade) |
| rfqLineId | String? | VARCHAR(191) | optional | FK → RfqLine.id (SetNull) — answered line |
| productId | String | VARCHAR(191) | required | FK → Product.id |
| variantId | String? | VARCHAR(64) | optional | Loose FK → ProductVariant.id — mirrors the RFQ line |
| variantName | String? | VARCHAR(160) | optional | Snapshot at quote time |
| quantity | Int | INT | required | Quoted quantity |
| unitPrice | Decimal | DECIMAL(12,2) | required | Quoted unit price |

Relations: `quote`→Quote (Cascade), `rfqLine`→RfqLine, `product`→Product.
Indexes: `[quoteId]`, `[productId]`.

### RfqMessage

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| rfqId | String | VARCHAR(191) | required | FK → Rfq.id (Cascade) |
| authorId | String | VARCHAR(191) | required | FK → User.id — buyer, admin or involved seller |
| body | String | TEXT | required | Message body |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |

Relations: `rfq`→Rfq (Cascade), `author`→User ("RfqMessages"). Indexes: `[rfqId, createdAt]`.

### RecurringRfq

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| userId | String | VARCHAR(191) | required | FK → User.id (owner) |
| organizationId | String? | VARCHAR(64) | optional | Loose FK → Organization.id — org context for settings resolution |
| title | String? | VARCHAR(160) | optional | Schedule title |
| description | String? | TEXT | optional | Schedule description |
| frequency | String | VARCHAR(16) | required | RecurringFrequency enum |
| intervalDays | Int @default(0) | INT | required, default 0 | CUSTOM: every N days |
| lines | String | TEXT | required | **LEGACY-JSON** — JSON snapshot of line inputs [{productId, variantId, productName, quantity, targetPrice, notes}] |
| recipientIds | String? | TEXT | optional | **LEGACY-JSON** — JSON array of seller ids (keepSameRecipients) |
| active | Boolean @default(true) | TINYINT(1) | required, default true | Schedule enabled |
| pausedUntil | DateTime? | DATETIME(3) | optional | Pause window |
| lastRunAt | DateTime? | DATETIME(3) | optional | Last spawn time |
| nextRunAt | DateTime | DATETIME(3) | required | Next spawn due (lazy sweep, D-011) |
| previewNotifiedAt | DateTime? | DATETIME(3) | optional | notifyBeforeHours heads-up sent flag |
| emptyCycles | Int @default(0) | INT | required, default 0 | Consecutive spawned runs with zero quotes |
| runCount | Int @default(0) | INT | required, default 0 | Total spawned runs |
| lastRfqId | String? | VARCHAR(64) | optional | Loose FK → Rfq.id — most recently spawned RFQ |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |
| updatedAt | DateTime @updatedAt | DATETIME(3) | required | Last update |

Relations: `user`→User. Indexes: `[userId]`, `[active, nextRunAt]`.

## A.5 Organization & Approvals

### Organization

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| name | String | VARCHAR(160) | required | Display name |
| slug | String @unique | VARCHAR(180) | required, unique | URL handle |
| orgType | String @default("COMPANY") | VARCHAR(16) | required, default COMPANY | OrganizationType enum — settings scope key |
| legalName | String? | VARCHAR(200) | optional | Legal entity name |
| taxId | String? | VARCHAR(60) | optional | VAT / EIN |
| registrationNumber | String? | VARCHAR(60) | optional | Business registration number |
| industry | String? | VARCHAR(80) | optional | Industry sector |
| website | String? | VARCHAR(255) | optional | Website URL |
| billingAddress | Json? | JSON | optional | **LEGACY-JSON** — billing address document |
| status | String @default("PENDING_VERIFICATION") | VARCHAR(24) | required, default PENDING_VERIFICATION | OrganizationStatus enum |
| verifiedAt | DateTime? | DATETIME(3) | optional | Platform verification stamp |
| creditTermsDays | Int @default(0) | INT | required, default 0 | 0 = prepaid; 30 = NET-30 invoicing |
| creditLimit | Decimal @default(0) | DECIMAL(12,2) | required, default 0 | Credit limit |
| approvalThreshold | Decimal? | DECIMAL(12,2) | optional | Orders/quote-accepts at or above this total by BUYER-role members require org approval (null = off) |
| notes | String? | TEXT | optional | Internal notes |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |
| updatedAt | DateTime @updatedAt | DATETIME(3) | required | Last update |

Relations: `members`→OrganizationMember, `priceLists`→PriceList, `rfqs`→Rfq, `orders`→Order,
`groups`→CustomerGroup (implicit m-n "OrganizationCustomerGroups"), `approvalRequests`→
ApprovalRequest. Indexes: `[status]`, `[createdAt]`.

### OrganizationMember

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| organizationId | String | VARCHAR(191) | required | FK → Organization.id (Cascade) |
| userId | String | VARCHAR(191) | required | FK → User.id (Cascade) |
| role | String @default("BUYER") | VARCHAR(16) | required, default BUYER | OrgMemberRole enum |
| jobTitle | String? | VARCHAR(80) | optional | Member's job title |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |

Relations: `organization`→Organization (Cascade), `user`→User (Cascade).
Indexes: unique `[organizationId, userId]`, `[userId]`.

### ApprovalRequest

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| organizationId | String | VARCHAR(191) | required | FK → Organization.id (Cascade) |
| type | String | VARCHAR(16) | required | ApprovalType enum — ORDER \| QUOTE_ACCEPT |
| orderId | String? @unique | VARCHAR(191) | optional, unique | FK → Order.id (SetNull) — set for ORDER |
| quoteId | String? @unique | VARCHAR(191) | optional, unique | FK → Quote.id (SetNull) — set for QUOTE_ACCEPT |
| rfqId | String? | VARCHAR(191) | optional | Loose FK → Rfq.id — owning RFQ context (QUOTE_ACCEPT) |
| requesterId | String | VARCHAR(191) | required | FK → User.id — requesting member (never the decider) |
| amount | Decimal | DECIMAL(12,2) | required | Triggering amount (≥ approvalThreshold) |
| note | String? | VARCHAR(500) | optional | Requester's justification |
| status | String @default("PENDING") | VARCHAR(12) | required, default PENDING | ApprovalStatus enum |
| decidedById | String? | VARCHAR(191) | optional | FK → User.id (SetNull) — deciding member |
| decidedAt | DateTime? | DATETIME(3) | optional | Decision time |
| decisionNote | String? | VARCHAR(500) | optional | Decision note |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |

Relations: `organization`→Organization (Cascade), `order`→Order, `quote`→Quote
("ApprovalQuote"), `requester`→User ("ApprovalRequester"), `decidedBy`→User
("ApprovalDecider"). Indexes: `[organizationId, status]`, `[requesterId]`.

## A.6 Payments & Settlement

### Payment

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| orderId | String @unique | VARCHAR(191) | required, unique | FK → Order.id (Cascade) — 1:1 |
| method | String | VARCHAR(16) | required | PaymentMethod enum |
| status | String @default("PENDING") | VARCHAR(16) | required, default PENDING | PaymentStatus enum |
| amount | Decimal | DECIMAL(12,2) | required | Expected/settled amount |
| currency | String @default("USD") | VARCHAR(3) | required, default USD | ISO-4217 |
| reference | String? | VARCHAR(160) | optional | Buyer-supplied transfer reference / gateway txn id |
| instructions | String? | VARCHAR(600) | optional | Manual-payment instructions snapshot for the buyer |
| dueAt | DateTime? | DATETIME(3) | optional | INVOICE: NET-terms due date |
| paidAt | DateTime? | DATETIME(3) | optional | Success time |
| capturedById | String? | VARCHAR(191) | optional | FK → User.id (SetNull) — admin who captured |
| note | String? | VARCHAR(500) | optional | Admin note on capture / failure |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |
| updatedAt | DateTime @updatedAt | DATETIME(3) | required | Last update |

Relations: `order`→Order (1:1, Cascade), `capturedBy`→User ("PaymentsCapturedBy").
Indexes: `[status, createdAt]`, `[method, status]`.

### Payout

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| number | String @unique | VARCHAR(32) | required, unique | PY-YYYY-NNNNNN via Sequence 'PY' |
| sellerId | String | VARCHAR(191) | required | FK → User.id (settled seller) |
| periodStart | DateTime | DATETIME(3) | required | Settlement window start |
| periodEnd | DateTime | DATETIME(3) | required | Settlement window end |
| itemCount | Int @default(0) | INT | required, default 0 | Settled item count |
| grossAmount | Decimal @default(0) | DECIMAL(12,2) | required, default 0 | Σ item revenue |
| commissionRate | Float | DOUBLE | required | Percent actually applied (snapshot; override or platform default) |
| commission | Decimal @default(0) | DECIMAL(12,2) | required, default 0 | Commission amount |
| netAmount | Decimal @default(0) | DECIMAL(12,2) | required, default 0 | gross − commission (external transfer, D-002) |
| status | String @default("PENDING") | VARCHAR(12) | required, default PENDING | PayoutStatus enum |
| paidAt | DateTime? | DATETIME(3) | optional | Marked-paid time |
| note | String? | VARCHAR(500) | optional | Admin note |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |
| updatedAt | DateTime @updatedAt | DATETIME(3) | required | Last update |

Relations: `seller`→User ("PayoutSeller"), `items`→OrderItem.
Indexes: `[sellerId, status]`, `[status, createdAt]`.

## A.7 Disputes

### Dispute

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| number | String @unique | VARCHAR(32) | required, unique | DSP-YYYY-NNNNNN via Sequence 'DSP' |
| orderId | String | VARCHAR(191) | required | FK → Order.id (disputed order) |
| raisedById | String | VARCHAR(191) | required | FK → User.id — buyer (or admin acting for them) |
| sellerId | String | VARCHAR(191) | required | FK → User.id — the disputed seller |
| rfqId | String? | VARCHAR(64) | optional | Loose FK → Rfq.id — RFQ context when order came from a quote |
| reason | String | VARCHAR(32) | required | DisputeReason enum |
| description | String | TEXT | required | Claim details |
| amount | Decimal? | DECIMAL(12,2) | optional | Claimed amount (partial resolution support) |
| status | String @default("OPEN") | VARCHAR(16) | required, default OPEN | DisputeStatus enum |
| sellerResponse | String? | TEXT | optional | Seller's response body |
| sellerRespondedAt | DateTime? | DATETIME(3) | optional | Response time |
| escalateAt | DateTime? | DATETIME(3) | optional | autoEscalateDays deadline while unresolved |
| outcome | String? | VARCHAR(24) | optional | DisputeOutcome enum |
| resolutionNote | String? | TEXT | optional | Admin resolution note |
| resolvedById | String? | VARCHAR(191) | optional | FK → User.id (SetNull) — mediating admin |
| resolvedAt | DateTime? | DATETIME(3) | optional | Resolution time |
| closedAt | DateTime? | DATETIME(3) | optional | Closure time |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |
| updatedAt | DateTime @updatedAt | DATETIME(3) | required | Last update |

Relations: `order`→Order, `raisedBy`→User ("DisputeRaisedBy"), `seller`→User ("DisputeSeller"),
`resolvedBy`→User ("DisputeResolver"). Indexes: `[status, createdAt]`, `[raisedById]`,
`[sellerId]`, `[orderId]`.

## A.8 Media

### MediaAsset

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| key | String @unique | VARCHAR(180) | required, unique | Storage base key (no extension) |
| originalName | String | VARCHAR(255) | required | Uploaded file name |
| mime | String | VARCHAR(64) | required | MIME type |
| size | Int | INT | required | Byte size |
| width | Int? | INT | optional | Pixel width |
| height | Int? | INT | optional | Pixel height |
| sha256 | String @unique | VARCHAR(64) | required, unique | Content hash — dedupe key |
| variants | String? | TEXT | optional | **LEGACY-JSON** — JSON {thumb, medium, large, full} storage keys |
| uploadedById | String | VARCHAR(191) | required | FK → User.id (uploader) |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |

Relations: `uploadedBy`→User ("MediaAssets"). Indexes: `[uploadedById, createdAt]`.

## A.9 Notifications

### Notification

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| userId | String | VARCHAR(191) | required | FK → User.id (Cascade) — recipient |
| type | String | VARCHAR(32) | required | NotificationType enum |
| title | String | VARCHAR(160) | required | Feed title |
| body | String? | VARCHAR(400) | optional | Feed body |
| linkView | String | VARCHAR(32) | required | LinkView enum — SPA destination view |
| linkId | String? | VARCHAR(64) | optional | rfqId / orderId / approval context id |
| readAt | DateTime? | DATETIME(3) | optional | Read time (null = unread) |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |

Relations: `user`→User ("Notifications", Cascade). Indexes: `[userId, readAt]`,
`[userId, createdAt]`.

## A.10 Settings & Governance

### PlatformSetting

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| key | String @id | VARCHAR(64) PK | required | Setting key (e.g. `payouts`) |
| value | String | TEXT | required | **LEGACY-JSON** — JSON document |
| updatedAt | DateTime @updatedAt | DATETIME(3) | required | Last update |

Relations: none. Indexes: PK on `key`.

### RfqSetting

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| key | String | VARCHAR(64) | required | Panel key, e.g. "quoteRouting" |
| scopeType | String | VARCHAR(16) | required | RfqSettingScopeType enum |
| scopeId | String @default("") | VARCHAR(64) | required, default "" | "" at platform scope; otherwise org/type/category/region identifier |
| value | String | TEXT | required | **LEGACY-JSON** — JSON document of the panel's fields |
| updatedById | String? | VARCHAR(191) | optional | Loose FK → User.id — last editor (no relation declared) |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |
| updatedAt | DateTime @updatedAt | DATETIME(3) | required | Last update |

Relations: none (deliberately unlinked from SettingChange history). Indexes: unique
`[key, scopeType, scopeId]`, `[scopeType, scopeId]`.

### SettingChange

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| settingKey | String | VARCHAR(64) | required | Panel key (copy — survives override deletion) |
| scopeType | String | VARCHAR(16) | required | RfqSettingScopeType enum |
| scopeId | String @default("") | VARCHAR(64) | required, default "" | Scope identifier |
| field | String | VARCHAR(100) | required | Field path within the panel |
| oldValue | String? | TEXT | optional | Previous value |
| newValue | String? | TEXT | optional | New value |
| userId | String | VARCHAR(191) | required | FK → User.id — admin who changed it |
| rollbackOfId | String? | VARCHAR(64) | optional | Loose FK → SettingChange.id — set when this change reverts an earlier one |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |

Relations: `user`→User ("SettingChangeUser"). Indexes:
`[settingKey, scopeType, scopeId, createdAt]`.

### BannerSlide

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| eyebrow | String? | VARCHAR(120) | optional | Small kicker text |
| title | String? | VARCHAR(200) | optional | Slide title |
| subtitle | String? | VARCHAR(400) | optional | Slide subtitle |
| image | String | VARCHAR(512) | required | Slide image URL |
| ctaLabel | String? | VARCHAR(80) | optional | CTA label |
| ctaView | String? | VARCHAR(32) | optional | LinkView enum — SPA destination |
| ctaCategory | String? | VARCHAR(191) | optional | Category slug for catalog CTA |
| position | Int @default(0) | INT | required, default 0 | Sort position |
| active | Boolean @default(true) | TINYINT(1) | required, default true | Visibility flag |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |
| updatedAt | DateTime @updatedAt | DATETIME(3) | required | Last update |

Relations: none. Indexes: `[active, position]`.

## A.11 Platform substrate

### AuditLog

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| actorId | String? | VARCHAR(191) | optional | Loose FK → User.id — SYSTEM entries have no user |
| actorType | String | VARCHAR(16) | required | AuditActorType enum |
| action | String | VARCHAR(64) | required | AuditAction open vocabulary, e.g. ORG_VERIFIED |
| entityType | String | VARCHAR(48) | required | Polymorphic entity type |
| entityId | String? | VARCHAR(64) | optional | Polymorphic entity id |
| summary | String? | TEXT | optional | Human-readable summary (financier domain status notes live HERE, not in metadata — R-1) |
| metadata | Json? | JSON | optional | **LEGACY-JSON** — structured extras (frozen; financier domain must not use) |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |

Relations: none. Indexes: `[entityType, entityId]`, `[createdAt]`, `[actorType, action]`.

### Sequence

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| key | String @id | VARCHAR(32) PK | required | Sequence key: RFQ \| QTE \| DSP \| PY (planned: FIN, AGR) |
| value | Int @default(0) | INT | required, default 0 | Last issued number |

Relations: none. Indexes: PK on `key`.

---

# Part B — PLANNED financier models — **NOT IN DATABASE YET**

> Source: `team/FINANCIER_SCHEMA.md` v4.0 §3 (owner-gated; D-013). Zero Json columns in this
> entire domain (R-1/DP-18). Field names/types are verbatim from the v4.0 model blocks; Prisma
> type shown, MySQL per §1 conventions. **`onDelete` not annotated in v4.0 for several relations —
> marked "—".** Prisma would default these to Restrict (required) / SetNull (optional).

## B.1 User — additive applicant profile columns (the ONLY existing model whose columns change)

All 12 columns are nullable; B2C buyers unaffected until they apply for financing (DP-14).
Existing User fields and relations are unchanged (see A.1).

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| phone | String? @db.VarChar(40) | VARCHAR(40) | optional | Contact only — login stays email-based |
| whatsappNumber | String? @db.VarChar(40) | VARCHAR(40) | optional | WhatsApp contact |
| dateOfBirth | DateTime? | DATETIME(3) | optional | Applicant DOB |
| gender | String? @db.VarChar(16) | VARCHAR(16) | optional | UserGender enum |
| maritalStatus | String? @db.VarChar(16) | VARCHAR(16) | optional | UserMaritalStatus enum |
| nationality | String? @db.VarChar(64) | VARCHAR(64) | optional | Nationality |
| identityType | String? @db.VarChar(16) | VARCHAR(16) | optional | UserIdentityType enum |
| identityNumber | String? @db.VarChar(64) | VARCHAR(64) | optional | ID document number |
| residenceStreet | String? @db.VarChar(255) | VARCHAR(255) | optional | Residence street (typed scalars — v3 Json removed, R-1) |
| residenceCity | String? @db.VarChar(120) | VARCHAR(120) | optional | Residence city (string, DP-16 — no geo tables) |
| residenceDistrict | String? @db.VarChar(120) | VARCHAR(120) | optional | Residence district |
| residenceType | String? @db.VarChar(16) | VARCHAR(16) | optional | ResidenceType enum — OWNED \| RENTED |

Additive relations (pure Prisma back-relation declarations): `applicantDocuments`→
ApplicantDocument ("ApplicantDocuments"), `documentsReviewed`→ApplicantDocument
("ApplicantDocumentsReviewedBy"), `financingRequests`→FinancingRequest ("FinancingRequests"),
`financingOffers`→FinancingOffer ("FinancingOffers").

## B.2 FinancierProfile — slim: financing facts ONLY; identity lives on Organization

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| organizationId | String @unique | VARCHAR(191) | required, unique | FK → Organization.id (Cascade) — 1:1, the legal entity (BANK \| MFI \| EWALLET) |
| about | String? @db.Text | TEXT | optional | Public marketing text (About tab) |
| licenseNumber | String? @db.VarChar(80) | VARCHAR(80) | optional | Financial license number |
| regulator | String? @db.VarChar(120) | VARCHAR(120) | optional | Supervising regulator |
| logoUrl | String? @db.VarChar(512) | VARCHAR(512) | optional | MediaAsset-backed URL (existing pattern: User.image) |
| contactEmail | String? @db.VarChar(255) | VARCHAR(255) | optional | Public contact email |
| contactPhone | String? @db.VarChar(40) | VARCHAR(40) | optional | Public contact phone |
| minTicket | Decimal? @db.Decimal(12, 2) | DECIMAL(12,2) | optional | Routing hint; product-level ranges remain authoritative |
| maxTicket | Decimal? @db.Decimal(12, 2) | DECIMAL(12,2) | optional | Routing hint |
| viewCount | Int @default(0) | INT | required, default 0 | Public profile stats |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |
| updatedAt | DateTime @updatedAt | DATETIME(3) | required | Last update |

Relations: `organization`→Organization (1:1, Cascade), `branches`→FinancierBranch,
`products`→FinancingProduct. Indexes: `[organizationId]` (plus unique).

## B.3 FinancierBranch — typed address columns (no Json, no geo tables)

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| financierProfileId | String | VARCHAR(191) | required | FK → FinancierProfile.id (Cascade) |
| name | String @db.VarChar(160) | VARCHAR(160) | required | Branch/agent/ATM name |
| kind | String @default("BRANCH") @db.VarChar(16) | VARCHAR(16) | required, default BRANCH | BranchKind enum |
| street | String? @db.VarChar(255) | VARCHAR(255) | optional | Street address |
| city | String? @db.VarChar(120) | VARCHAR(120) | optional | City |
| district | String? @db.VarChar(120) | VARCHAR(120) | optional | District |
| latitude | Decimal? @db.Decimal(9, 6) | DECIMAL(9,6) | optional | Map pin |
| longitude | Decimal? @db.Decimal(9, 6) | DECIMAL(9,6) | optional | Map pin |
| phone | String? @db.VarChar(40) | VARCHAR(40) | optional | Branch phone |
| isActive | Boolean @default(true) | TINYINT(1) | required, default true | Visibility flag |
| position | Int @default(0) | INT | required, default 0 | Sort position |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |
| updatedAt | DateTime @updatedAt | DATETIME(3) | required | Last update |

Relations: `financierProfile`→FinancierProfile (Cascade). Indexes: `[financierProfileId, isActive]`.

## B.4 FinancingProduct + three trait child tables

### FinancingProduct

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| financierProfileId | String | VARCHAR(191) | required | FK → FinancierProfile.id (Cascade) |
| name | String @db.VarChar(160) | VARCHAR(160) | required | Product name |
| description | String? @db.Text | TEXT | optional | Description + features prose |
| category | String @db.VarChar(24) | VARCHAR(24) | required | FinancingCategory enum (B2B trio + competitor taxonomy) |
| targetSegment | String? @db.VarChar(16) | VARCHAR(16) | optional | FinancingSegment enum (DP-13) |
| status | String @default("ACTIVE") @db.VarChar(16) | VARCHAR(16) | required, default ACTIVE | FinancingProductStatus enum |
| currency | String @default("YER") @db.VarChar(3) | VARCHAR(3) | required, default YER | ISO-4217; NO currency table |
| amountMin | Decimal @db.Decimal(12, 2) | DECIMAL(12,2) | required | Minimum financing amount (competitor's currency.min folds here) |
| amountMax | Decimal @db.Decimal(12, 2) | DECIMAL(12,2) | required | Maximum financing amount |
| rateType | String? @db.VarChar(24) | VARCHAR(24) | optional | RateType enum |
| rateMax | Decimal? @db.Decimal(6, 3) | DECIMAL(6,3) | optional | e.g. 30.000 = 30%/yr cap (murabaha) |
| feeFlat | Decimal? @db.Decimal(12, 2) | DECIMAL(12,2) | optional | Flat fee |
| tenorMinMonths | Int? | INT | optional | e.g. 6 (competitor floor) |
| tenorMaxMonths | Int? | INT | optional | Maximum tenor |
| repaymentFrequency | String? @db.VarChar(16) | VARCHAR(16) | optional | RepaymentFrequency enum |
| gracePeriodDays | Int? | INT | optional | Grace period |
| shariaCompliant | Boolean @default(false) | TINYINT(1) | required, default false | Islamic-finance flag |
| processingDays | Int? | INT | optional | Processing time |
| viewCount | Int @default(0) | INT | required, default 0 | Product page stats |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |
| updatedAt | DateTime @updatedAt | DATETIME(3) | required | Last update |

Relations: `financierProfile`→FinancierProfile (Cascade), `attributes`, `requirements`,
`coverage`, `requests`→FinancingRequest. Indexes: `[financierProfileId, status]`,
`[category, status]`.

### FinancingProductAttribute

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| productId | String | VARCHAR(191) | required | FK → FinancingProduct.id (Cascade) |
| kind | String @db.VarChar(24) | VARCHAR(24) | required | AttributeKind enum — FEATURE \| ELIGIBILITY_CONDITION |
| position | Int @default(0) | INT | required, default 0 | Sort position |
| text | String @db.VarChar(500) | VARCHAR(500) | required | Bullet text |

Relations: `product`→FinancingProduct (Cascade). Indexes: unique `[productId, kind, position]`,
`[productId, kind]`.

### FinancingProductRequirement

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| productId | String | VARCHAR(191) | required | FK → FinancingProduct.id (Cascade) |
| kind | String @db.VarChar(24) | VARCHAR(24) | required | RequirementKind enum |
| value | String @db.VarChar(32) | VARCHAR(32) | required | Validated: collateral enum \| ApplicantDocument.type enum |

Relations: `product`→FinancingProduct (Cascade). Indexes: unique `[productId, kind, value]`,
`[productId, kind]`.

### FinancingProductCoverage

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| productId | String | VARCHAR(191) | required | FK → FinancingProduct.id (Cascade) |
| regionName | String @db.VarChar(120) | VARCHAR(120) | required | Normalized (trim/case-fold) at write; matched case-insensitively vs FinancingRequest.activityCity |

Relations: `product`→FinancingProduct (Cascade). Indexes: unique `[productId, regionName]`,
`[productId]`.

## B.5 FinancingRequest — the application (FR-YYYY-NNNNNN via Sequence 'FIN')

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| number | String @unique @db.VarChar(32) | VARCHAR(32) | required, unique | FR-YYYY-NNNNNN |
| organizationId | String? | VARCHAR(191) | optional | FK → Organization.id (—) — applicant org (B2B); null = individual (DP-13) |
| createdById | String | VARCHAR(191) | required | FK → User.id — submitting member or the individual |
| productId | String? | VARCHAR(191) | optional | FK → FinancingProduct.id (—) — direct application ("طلب تمويل" CTA) |
| targetType | String @db.VarChar(16) | VARCHAR(16) | required | FinancingTargetType enum — WORKING_CAPITAL \| QUOTE \| ORDER \| RFQ_LINE |
| targetId | String? @db.VarChar(64) | VARCHAR(64) | optional | Loose FK → Quote/Order/RfqLine id (Dispute pattern) |
| activityStatus | String? @db.VarChar(16) | VARCHAR(16) | optional | ActivityStatus enum — NEW \| EXISTING |
| activityName | String? @db.VarChar(160) | VARCHAR(160) | optional | e.g. "Grocery store" |
| activityDescription | String? @db.Text | TEXT | optional | Free description |
| activityStartDate | DateTime? | DATETIME(3) | optional | Null = not started yet |
| activityCity | String? @db.VarChar(120) | VARCHAR(120) | optional | Matches product coverage (string, DP-16) |
| activityDistrict | String? @db.VarChar(120) | VARCHAR(120) | optional | District |
| activityAddress | String? @db.VarChar(255) | VARCHAR(255) | optional | Street address |
| activityLocationType | String? @db.VarChar(16) | VARCHAR(16) | optional | LocationType enum — OWNED \| RENTED |
| activityCategory | String? @db.VarChar(24) | VARCHAR(24) | optional | ActivityCategory enum — applicant's "activity type" |
| activityCategoryOther | String? @db.VarChar(160) | VARCHAR(160) | optional | Free text when activityCategory = OTHER |
| capitalAmount | Decimal? @db.Decimal(12, 2) | DECIMAL(12,2) | optional | Underwriting: capital |
| ownContributionAmount | Decimal? @db.Decimal(12, 2) | DECIMAL(12,2) | optional | Underwriting: customer contribution |
| monthlyInstallmentCapacity | Decimal? @db.Decimal(12, 2) | DECIMAL(12,2) | optional | Underwriting: repayment capacity (monthly) |
| previousFinancing | Boolean? | TINYINT(1) | optional | Underwriting: prior financing flag |
| otherIncomeSources | String? @db.VarChar(500) | VARCHAR(500) | optional | Underwriting: other income |
| amountRequested | Decimal @db.Decimal(12, 2) | DECIMAL(12,2) | required | The ask |
| currency | String @default("YER") @db.VarChar(3) | VARCHAR(3) | required, default YER | ISO-4217; no currency table |
| purpose | String? @db.Text | TEXT | optional | Financing purpose |
| tenorRequestedMonths | Int? | INT | optional | Requested tenor |
| guaranteeType | String? @db.VarChar(24) | VARCHAR(24) | optional | GuaranteeType enum |
| guaranteeTypeOther | String? @db.VarChar(160) | VARCHAR(160) | optional | Free text companion when OTHER |
| guaranteeStatus | String? @db.VarChar(24) | VARCHAR(24) | optional | GuaranteeStatus enum |
| guaranteeStatusOther | String? @db.VarChar(160) | VARCHAR(160) | optional | Free text companion when OTHER |
| applicantNotes | String? @db.Text | TEXT | optional | Wizard notes field |
| consentAt | DateTime? | DATETIME(3) | optional | Step-1 data-transfer consent + terms, stamped at submit |
| distributionMode | String @default("OPEN") @db.VarChar(16) | VARCHAR(16) | required, default OPEN | DistributionMode enum |
| status | String @default("DRAFT") @db.VarChar(16) | VARCHAR(16) | required, default DRAFT | FinancingRequestStatus enum |
| expiresAt | DateTime? | DATETIME(3) | optional | Lazy-sweep expiry (D-011) |
| submittedAt | DateTime? | DATETIME(3) | optional | Submission time |
| closedAt | DateTime? | DATETIME(3) | optional | Terminal time |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |
| updatedAt | DateTime @updatedAt | DATETIME(3) | required | Last update |

Relations: `organization`→Organization, `createdBy`→User ("FinancingRequests"), `product`→
FinancingProduct, `documents`→ApplicantDocument, `invites`→FinancingRequestInvite,
`offers`→FinancingOffer. Indexes: `[organizationId, status]`, `[createdById, createdAt]`,
`[status, createdAt]`, `[productId]`, `[targetType, targetId]`, `[activityCity]`.

## B.6 FinancingRequestInvite — BUYER_SELECTED distribution as rows, not JSON

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| requestId | String | VARCHAR(191) | required | FK → FinancingRequest.id (Cascade) |
| organizationId | String | VARCHAR(191) | required | FK → Organization.id (—) — the invited financier org |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |

Relations: `request`→FinancingRequest (Cascade), `organization`→Organization.
Indexes: unique `[requestId, organizationId]`, `[organizationId]`.

## B.7 ApplicantDocument — ONE document subsystem over MediaAsset

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| userId | String | VARCHAR(191) | required | FK → User.id (Cascade) — owner/uploader, ALWAYS set |
| requestId | String? | VARCHAR(191) | optional | FK → FinancingRequest.id (Cascade) — null = user-level KYC (uploaded ONCE, reused) |
| accreditationId | String? | VARCHAR(191) | optional | FK → SupplierAccreditation.id (—) — set = accreditation evidence (Flow 4) |
| mediaId | String | VARCHAR(191) | required | FK → MediaAsset.id (—) — THE storage entry (DP-19) |
| type | String @db.VarChar(32) | VARCHAR(32) | required | ApplicantDocumentType enum (scope-dependent) |
| status | String @default("PENDING") @db.VarChar(16) | VARCHAR(16) | required, default PENDING | ApplicantDocumentStatus enum |
| reviewedById | String? | VARCHAR(191) | optional | FK → User.id (—) — verifying staff |
| reviewedAt | DateTime? | DATETIME(3) | optional | Verification time |
| note | String? @db.Text | TEXT | optional | Verification / rejection note |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |

Relations: `user`→User (Cascade), `request`→FinancingRequest (Cascade), `accreditation`→
SupplierAccreditation, `media`→MediaAsset, `reviewedBy`→User. Indexes: `[userId]`,
`[requestId]`, `[accreditationId]`, `[userId, type, status]`, `[mediaId]`.

## B.8 FinancingOffer + installments

### FinancingOffer

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier (id-addressed — DP-12, no offer numbers) |
| requestId | String | VARCHAR(191) | required | FK → FinancingRequest.id (Cascade) |
| createdById | String | VARCHAR(191) | required | FK → User.id — financier staff (via OrganizationMember, DP-1) |
| amount | Decimal @db.Decimal(12, 2) | DECIMAL(12,2) | required | Offered amount |
| currency | String @default("YER") @db.VarChar(3) | VARCHAR(3) | required, default YER | ISO-4217 |
| rateType | String? @db.VarChar(24) | VARCHAR(24) | optional | RateType enum |
| ratePercent | Decimal? @db.Decimal(6, 3) | DECIMAL(6,3) | optional | Rate percent |
| feeFlat | Decimal? @db.Decimal(12, 2) | DECIMAL(12,2) | optional | Flat fee |
| tenorMonths | Int | INT | required | Tenor |
| collateralRequired | String? @db.VarChar(24) | VARCHAR(24) | optional | GuaranteeType enum value |
| notes | String? @db.VarChar(1000) | VARCHAR(1000) | optional | Offer notes |
| validUntil | DateTime? | DATETIME(3) | optional | Validity window |
| status | String @default("DRAFT") @db.VarChar(16) | VARCHAR(16) | required, default DRAFT | FinancingOfferStatus enum |
| sentAt | DateTime? | DATETIME(3) | optional | Sent time |
| acceptedAt | DateTime? | DATETIME(3) | optional | Acceptance time |
| declinedAt | DateTime? | DATETIME(3) | optional | Decline time |
| withdrawnAt | DateTime? | DATETIME(3) | optional | Withdrawal time |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |
| updatedAt | DateTime @updatedAt | DATETIME(3) | required | Last update |

Relations: `request`→FinancingRequest (Cascade), `createdBy`→User ("FinancingOffers"),
`installments`→FinancingOfferInstallment, `agreement`→FinancingAgreement (1:1 back-relation).
Indexes: `[requestId, status]`.

### FinancingOfferInstallment

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| offerId | String | VARCHAR(191) | required | FK → FinancingOffer.id (Cascade) |
| installmentNo | Int | INT | required | Installment sequence |
| dueDate | DateTime | DATETIME(3) | required | Due date |
| amount | Decimal @db.Decimal(12, 2) | DECIMAL(12,2) | required | Installment amount |

Relations: `offer`→FinancingOffer (Cascade). Indexes: unique `[offerId, installmentNo]`,
`[offerId, dueDate]`.

## B.9 FinancingAgreement — references the accepted offer; NO snapshot (DP-20)

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| number | String @unique @db.VarChar(32) | VARCHAR(32) | required, unique | AGR-YYYY-NNNNNN via Sequence 'AGR' |
| offerId | String @unique | VARCHAR(191) | required, unique | FK → FinancingOffer.id (—) — the ACCEPTED offer; its rows (incl. installments) are frozen by the service |
| fundingStatus | String @default("PENDING") @db.VarChar(24) | VARCHAR(24) | required, default PENDING | FundingStatus enum — financier-REPORTED external money events (D-002) |
| status | String @default("ACTIVE") @db.VarChar(16) | VARCHAR(16) | required, default ACTIVE | AgreementStatus enum |
| acceptedAt | DateTime | DATETIME(3) | required | Offer acceptance time |
| fundedReportedAt | DateTime? | DATETIME(3) | optional | Disbursement reported time |
| settledReportedAt | DateTime? | DATETIME(3) | optional | Final settlement reported time |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |
| updatedAt | DateTime @updatedAt | DATETIME(3) | required | Last update |

Relations: `offer`→FinancingOffer (1:1), `events`→FinancingEvent, `fees`→FinancingFee.
Indexes: `[status]`.

## B.10 FinancingEvent — track-only ledger (D-002)

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| agreementId | String | VARCHAR(191) | required | FK → FinancingAgreement.id (Cascade) |
| type | String @db.VarChar(24) | VARCHAR(24) | required | FinancingEventType enum |
| eventDate | DateTime | DATETIME(3) | required | Effective date |
| amount | Decimal? @db.Decimal(12, 2) | DECIMAL(12,2) | optional | Money fact (null for NOTE) |
| note | String? @db.VarChar(500) | VARCHAR(500) | optional | Context note |
| reportedById | String? | VARCHAR(191) | optional | FK → User.id (—) — financier staff who reported it |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |

Relations: `agreement`→FinancingAgreement (Cascade), `reportedBy`→User ("FinancingEventsReportedBy").
Indexes: `[agreementId, eventDate]`.

## B.11 FinancingFee — commission accounting, invoiced externally (D-001/002)

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| agreementId | String | VARCHAR(191) | required | FK → FinancingAgreement.id (Cascade) |
| type | String @db.VarChar(16) | VARCHAR(16) | required | FinancingFeeType enum — SUCCESS \| ORIGINATION \| ACCREDITATION |
| baseAmount | Decimal @db.Decimal(12, 2) | DECIMAL(12,2) | required | Base the fee was computed on |
| percentApplied | Decimal @db.Decimal(6, 3) | DECIMAL(6,3) | required | Snapshot of the configured rate at accrual |
| amount | Decimal @db.Decimal(12, 2) | DECIMAL(12,2) | required | Fee amount |
| status | String @default("ACCRUED") @db.VarChar(16) | VARCHAR(16) | required, default ACCRUED | FinancingFeeStatus enum |
| invoicedAt | DateTime? | DATETIME(3) | optional | External invoice time |
| paidAt | DateTime? | DATETIME(3) | optional | Admin-marked paid time |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |
| updatedAt | DateTime @updatedAt | DATETIME(3) | required | Last update |

Relations: `agreement`→FinancingAgreement (Cascade). Indexes: `[agreementId, type, status]`,
`[status, createdAt]`.

## B.12 Accreditation (Flow 4)

### AccreditationProgram

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| financierProfileId | String | VARCHAR(191) | required | FK → FinancierProfile.id (Cascade) |
| name | String @db.VarChar(160) | VARCHAR(160) | required | Program name |
| description | String? @db.Text | TEXT | optional | Program description |
| feeAmount | Decimal? @db.Decimal(12, 2) | DECIMAL(12,2) | optional | Accreditation fee (external invoice) |
| validMonths | Int? | INT | optional | Accreditation lifetime once verified |
| active | Boolean @default(true) | TINYINT(1) | required, default true | Enabled flag |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |
| updatedAt | DateTime @updatedAt | DATETIME(3) | required | Last update |

Relations: `financierProfile`→FinancierProfile (Cascade), `criteria`→AccreditationCriterion,
`accreditations`→SupplierAccreditation. Indexes: `[financierProfileId, active]`.

### AccreditationCriterion

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| programId | String | VARCHAR(191) | required | FK → AccreditationProgram.id (Cascade) |
| kind | String @db.VarChar(24) | VARCHAR(24) | required | AccreditationCriterionKind enum |
| value | String? @db.VarChar(160) | VARCHAR(160) | optional | Typed per kind; zod-validated per kind |
| label | String @db.VarChar(160) | VARCHAR(160) | required | Human checklist line |
| position | Int @default(0) | INT | required, default 0 | Sort position |

Relations: `program`→AccreditationProgram (Cascade). Indexes: `[programId]`.

### SupplierAccreditation

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| programId | String | VARCHAR(191) | required | FK → AccreditationProgram.id (Cascade) |
| organizationId | String | VARCHAR(191) | required | FK → Organization.id (—) — the supplier org applying |
| status | String @default("PENDING") @db.VarChar(16) | VARCHAR(16) | required, default PENDING | SupplierAccreditationStatus enum |
| submittedById | String | VARCHAR(191) | required | FK → User.id (—) — submitting member |
| reviewedById | String? | VARCHAR(191) | optional | FK → User.id (—) — reviewing staff |
| verifiedAt | DateTime? | DATETIME(3) | optional | Verification time |
| expiresAt | DateTime? | DATETIME(3) | optional | Expiry (program validMonths) |
| note | String? @db.Text | TEXT | optional | Review note |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |
| updatedAt | DateTime @updatedAt | DATETIME(3) | required | Last update |

Relations: `program`→AccreditationProgram (Cascade), `organization`→Organization, `submittedBy`→
User ("SupplierAccreditationsSubmitted"), `reviewedBy`→User ("SupplierAccreditationsReviewed"),
`documents`→ApplicantDocument. Indexes: unique `[programId, organizationId]`,
`[organizationId, status]`.

---

## 5. Field count summary

Scalar columns per model (relation fields excluded; unique/index constraints not counted).

**Part A — existing (source: prisma/schema.prisma):**

| model | fields | model | fields |
|---|---|---|---|
| User | 14 | Organization | 18 |
| Category | 4 | OrganizationMember | 6 |
| Product | 36 | CustomerGroup | 7 |
| ProductVariant | 12 | PriceList | 13 |
| Review | 7 | PriceListEntry | 5 |
| Favorite | 4 | Coupon | 9 |
| Order | 17 | ApprovalRequest | 14 |
| OrderItem | 11 | Payment | 14 |
| Rfq | 15 | Payout | 15 |
| RfqLine | 10 | Dispute | 20 |
| Quote | 21 | MediaAsset | 11 |
| QuoteLine | 8 | Notification | 9 |
| RfqMessage | 5 | PlatformSetting | 3 |
| RecurringRfq | 19 | RfqSetting | 8 |
| BannerSlide | 12 | SettingChange | 10 |
| AuditLog | 9 | Sequence | 2 |
| | | **Total (32 models)** | **368** |

**Part B — planned (source: FINANCIER_SCHEMA v4.0 §3):**

| model | fields | model | fields |
|---|---|---|---|
| User additive | 12 | FinancingRequestInvite | 4 |
| FinancierProfile | 13 | ApplicantDocument | 11 |
| FinancierBranch | 14 | FinancingOffer | 19 |
| FinancingProduct | 22 | FinancingOfferInstallment | 5 |
| FinancingProductAttribute | 5 | FinancingAgreement | 10 |
| FinancingProductRequirement | 4 | FinancingEvent | 8 |
| FinancingProductCoverage | 3 | FinancingFee | 11 |
| FinancingRequest | 39 | AccreditationProgram | 9 |
| AccreditationCriterion | 6 | SupplierAccreditation | 11 |
| | | **Total planned** | **206** (194 in 17 new tables + 12 User additive) |

**Grand total after financier implementation: 574 scalar columns** (32 existing + 17 planned
models + User extension).

---

## Appendix — Legacy JSON inventory (FROZEN — document only, do not migrate now)

Owner doctrine (2026-09, DP-18): these fields keep working as-is; they must NOT be extended with
new payload shapes, and the financier domain must not add new ones. Normalization is a possible
future project only. One-line sketch of what normalization would eventually look like:

| # | Field | Kind | Today's payload | Eventual normalization (NOT now) |
|---|---|---|---|---|
| 1 | `Product.images` | JSON-in-Text | Array of rendition URLs | `ProductImage (productId, position, url)` child table — or FK to `MediaAsset` |
| 2 | `Product.highlights` | JSON-in-Text | Array of bullet strings | `ProductHighlight (productId, position, text)` |
| 3 | `Product.specs` | JSON-in-Text | Array of {label, value} | `ProductSpec (productId, position, label, value)` |
| 4 | `Product.priceTiers` | JSON-in-Text | [{from, to, price}] ladder | `ProductPriceTier (productId, fromQty, toQty, price)` — or fold into `PriceListEntry` ladders |
| 5 | `ProductVariant.options` | JSON-in-Text | Map option-name → value | `ProductVariantOption (variantId, optionName, optionValue)` |
| 6 | `Organization.billingAddress` | Json column | Address document | Typed scalar columns (street/city/district) — same shape as planned `FinancierBranch` |
| 7 | `MediaAsset.variants` | JSON-in-Text | {thumb, medium, large, full} storage keys | `MediaVariant (mediaId, kind, storageKey)` |
| 8 | `RecurringRfq.lines` | JSON-in-Text | Snapshot of line inputs | `RecurringRfqLine` child table mirroring `RfqLine` inputs |
| 9 | `RecurringRfq.recipientIds` | JSON-in-Text | Array of seller ids | `RecurringRfqRecipient (scheduleId, sellerId)` |
| 10 | `AuditLog.metadata` | Json column | Structured extras per action | `AuditLogMetadata (auditLogId, key, value)` — or typed columns per action. Financier domain deliberately writes `summary` text instead (R-1) |
| 11 | `PlatformSetting.value` | JSON-in-Text | Platform config document | `PlatformSettingField (settingKey, field, value)` rows |
| 12 | `RfqSetting.value` | JSON-in-Text | Panel fields document | `RfqSettingField (settingKey, scopeType, scopeId, field, value)` — naturally aligned with `SettingChange.field` |

The financier domain (Part B) deliberately demonstrates the target style everywhere: lists as
child tables (`FinancingProductAttribute/Requirement/Coverage`, `FinancingOfferInstallment`,
`FinancingRequestInvite`), addresses as typed scalars (`FinancierBranch`, `User.residence*`),
schedules as rows.

---

*End of document. Structural views (ERD, state machines, invariants) are in
`01-domain-model.md`.*
