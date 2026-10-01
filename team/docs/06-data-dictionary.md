# Vendora — Data Dictionary

| | |
|---|---|
| **Version** | 1.2 |
| **Date** | September 2026 |
| **Audience** | Expert software engineers (Vendora core team) |
| **Part A source** | `prisma/schema.prisma` (32 commerce models + **18 financier models IMPLEMENTED 2026-09-26, FIN-1** — the schema of record; every field below is transcribed from it, none invented, none dropped) |
| **Part B source** | `team/FINANCIER_SCHEMA.md` v5.0 §3 — **IMPLEMENTED 2026-09-26 (FIN-1…FIN-9)**: Float money realization on the managed Aiven MySQL (see worklog FIN-0 for the original provider conversion) |
| **Companion** | `01-domain-model.md` (ER diagrams, relationship inventory, state machines) |
| **Changelog** | 1.1 (DOC-V5-e) — Part B, planned enum registry, field-count summary and appendix note rebuilt to FINANCIER_SCHEMA **v5.0** (D-015/D-016: services-not-products · platform verification gate · requirements engine · universal documents · accreditation as a main service · multi-financier sibling routing). Part A (existing schema) unchanged. |

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
FINANCIER_SCHEMA v5.0 §3–§6.

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
| ServiceKind | `FINANCING` \| `ACCREDITATION` (DP-22/DP-26) | `FinancierService.serviceKind` |
| ServiceCategory | FINANCING kinds: `WORKING_CAPITAL` \| `INVOICE_FINANCING` \| `PO_FINANCING` \| `EQUIPMENT` \| `VEHICLE` \| `HOME` \| `EDUCATION` \| `AGRICULTURE` \| `MICROENTERPRISE` \| `SME` \| `OTHER`; ACCREDITATION kinds: `SUPPLIER_QUALIFICATION` \| `VENDOR_APPROVAL` (v1 uses `SUPPLIER_QUALIFICATION`) | `FinancierService.category` |
| FinancingSegment | `BUSINESS` \| `INDIVIDUAL` \| `BOTH` (DP-13) | `FinancierService.targetSegment` |
| ServiceStatus | `DRAFT` \| `ACTIVE` \| `ARCHIVED` | `FinancierService.status` |
| RateType | `MURABAHA_ANNUAL` \| `FIXED_ANNUAL` \| `FLAT_FEE` | `FinancierService.rateType`, `FinancingOffer.rateType` |
| RepaymentFrequency | `MONTHLY` \| `QUARTERLY` \| `LUMP_SUM` | `FinancierService.repaymentFrequency` |
| AttributeKind | `FEATURE` \| `ELIGIBILITY_CONDITION` | `FinancierServiceAttribute.kind` |
| ConditionScope | `GENERAL` \| `FINANCIER` (R-5 — platform library vs financier-private) | `ConditionTemplate.scope` |
| ConditionType | `DOCUMENT` \| `PROFILE_FIELD` \| `DECLARATION` \| `TEXT` \| `NUMBER` \| `DATE` \| `SELECT` \| `MULTI_SELECT` (DP-24 — 8 typed kinds) | `ConditionTemplate.conditionType` |
| FinancingTargetType | `WORKING_CAPITAL` \| `QUOTE` \| `ORDER` \| `RFQ_LINE` | `FinancingRequest.targetType` |
| ActivityStatus | `NEW` \| `EXISTING` | `FinancingRequest.activityStatus` |
| ActivityCategory | `INVESTMENT` \| `RURAL` \| `ENERGY` \| `HOUSING` \| `FISHERIES` \| `OTHER` (+ B2B trio & catalog extras) | `FinancingRequest.activityCategory` |
| LocationType | `OWNED` \| `RENTED` | `FinancingRequest.activityLocationType` (and planned `User.residenceType`) |
| GuaranteeType | `PERSONAL_GUARANTEE` \| `BANK_GUARANTEE` \| `GOLD` \| `COMMERCIAL` \| `MORTGAGE` \| `CONVERTIBLE_SECURITIES` \| `SELF_GUARANTEE` \| `OTHER` | `FinancingRequest.guaranteeType`, `FinancingOffer.collateralRequired` |
| GuaranteeStatus | `AVAILABLE` \| `PARTIALLY_AVAILABLE` \| `UNAVAILABLE` \| `OTHER` | `FinancingRequest.guaranteeStatus` |
| FinancingRequestStatus (v3) | `DRAFT` \| `SUBMITTED` \| `UNDER_PLATFORM_REVIEW` \| `RETURNED_FOR_COMPLETION` \| `FORWARDED_TO_FINANCIER` \| `UNDER_FINANCIER_REVIEW` \| `OFFERED` \| `ACCEPTED` \| `DECLINED` \| `EXPIRED` \| `CANCELLED` — 11 gate-first states (DP-23) | `FinancingRequest.status` |
| RequirementSubmissionStatus | `PENDING` \| `SUBMITTED` \| `VERIFIED` \| `REJECTED` \| `WAIVED` | `RequirementSubmission.status` |
| AccountDocumentType | `NATIONAL_ID` \| `PASSPORT` \| `RESIDENCE_PERMIT` \| `COMMERCIAL_REG` \| `TAX_CARD` \| `BUSINESS_LICENSE` \| `BANK_STATEMENT` \| `FINANCIAL_STATEMENT` \| `PROOF_OF_ADDRESS` \| `GUARANTEE_DOC` \| `FEASIBILITY_STUDY` \| `INVOICE` \| `PURCHASE_ORDER` \| `PROJECT_FILE` \| `OTHER` (15 values) | `AccountDocument.documentType`, `ConditionTemplate.documentType` |
| AccountDocumentStatus | `PENDING` \| `VERIFIED` \| `REJECTED` | `AccountDocument.status` |
| RequestAttachmentParentType | `FINANCING_REQUEST` \| `ACCREDITATION_REQUEST` | `RequestAttachment.parentType` |
| RequestAttachmentKind | `GUARANTEE_DOC` \| `STUDY` \| `PROJECT_FILE` \| `OTHER` | `RequestAttachment.kind` |
| FinancingOfferStatus | `DRAFT` \| `SENT` \| `ACCEPTED` \| `DECLINED` \| `EXPIRED` \| `WITHDRAWN` | `FinancingOffer.status` |
| FundingStatus | `PENDING` \| `REPORTED_FUNDED` \| `REPORTED_SETTLED` — financier-REPORTED external money events (D-002) | `FinancingAgreement.fundingStatus` |
| AgreementStatus | `ACTIVE` \| `COMPLETED` \| `DEFAULTED` \| `CANCELLED` | `FinancingAgreement.status` |
| FinancingEventType | `DISBURSEMENT` \| `REPAYMENT` \| `EARLY_SETTLEMENT` \| `LATE_FEE` \| `NOTE` | `FinancingEvent.type` |
| FinancingFeeType | `SUCCESS` \| `ORIGINATION` \| `ACCREDITATION` | `FinancingFee.type` |
| FinancingFeeStatus | `ACCRUED` \| `INVOICED` \| `PAID` \| `WAIVED` | `FinancingFee.status` |
| AccreditationRequestStatus | `DRAFT` \| `SUBMITTED` \| `UNDER_PLATFORM_REVIEW` \| `RETURNED_FOR_COMPLETION` \| `FORWARDED_TO_FINANCIER` \| `UNDER_FINANCIER_REVIEW` \| `ACCREDITED` \| `REJECTED` \| `EXPIRED` \| `REVOKED` \| `CANCELLED` — 11 states | `AccreditationRequest.status` |
| Planned currency | ISO-4217, default `YER` | `FinancierService.currency`, `FinancingRequest.currency`, `FinancingOffer.currency` |
| Planned sequence keys | `FIN` \| `AGR` \| `ACC` → `FR-YYYY-######` / `AGR-YYYY-######` / `ACC-YYYY-######` (D-006; offers stay id-addressed, DP-12) | `Sequence.key` |
| Planned RfqSetting financing panels | 6 panels — `general` {enabled, requestExpiryDays, maxOffersPerRequest, platformReviewRequired (default TRUE — R-4), autoForwardWhenAllVerified} · `fees` {financierSuccessPercent (default 0.75, 0–5), originationPercentCap} · `requirements` {allowFinancierCustomConditions (default true), defaultValidityMonths, maxRequirementsPerService (default 40)} · `documents` {allowedTypes, maxSizeMb} · `intake` {requireConsent, wizardEnabled} · `accreditation` {defaultValidMonths (default 12), allowMultiFinancier (default true)} | `RfqSetting.value` (financing section) |
| Planned notification types | `linkView` += `financing` \| `financier`; types: `PLATFORM_RETURNED_REQUEST`, `PLATFORM_FORWARDED_REQUEST`, `REQUIREMENT_VERIFIED`, `REQUIREMENT_REJECTED`, `DOCUMENT_VERIFIED`, `DOCUMENT_REJECTED`, `FINANCING_REQUEST_RECEIVED` (fired at forward), `OFFER_RECEIVED`, `OFFER_ACCEPTED`, `OFFER_DECLINED`, `OFFER_WITHDRAWN`, `ACCREDITATION_RECEIVED`, `ACCREDITATION_GRANTED`, `ACCREDITATION_REJECTED`, `ACCREDITATION_REVOKED`, `ACCREDITATION_EXPIRING`, `FEE_ACCRUED`, `AGREEMENT_STATUS_CHANGED`, `FINANCING_STATUS_CHANGED` | `Notification.type`, `Notification.linkView` |

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
| key | String @id | VARCHAR(32) PK | required | Sequence key: RFQ \| QTE \| DSP \| PY (planned: FIN, AGR, ACC) |
| value | Int @default(0) | INT | required, default 0 | Last issued number |

Relations: none. Indexes: PK on `key`.

---

# Part B — PLANNED financier models — **NOT IN DATABASE YET**

> Source: `team/FINANCIER_SCHEMA.md` **v5.0** §3 (owner-gated; D-013/D-016). Zero Json columns in
> this entire domain (R-1/DP-18). Field names/types are verbatim from the v5.0 model blocks;
> Prisma type shown, MySQL per §1 conventions. **`onDelete` not annotated in v5.0 for several
> relations — marked "—".** Prisma would default these to Restrict (required) / SetNull
> (optional).
>
> **Migration note — v4.0 → v5.0 planned model set (owner rulings D-015/D-016), renames vs
> deletions explicit:**
> - **RENAMED:** `FinancingProduct` → `FinancierService` — also EXTENDED (`serviceKind`,
>   `summary`, `accreditationValidMonths`, `accreditationFeeAmount`; `amountMin`/`amountMax`
>   now nullable) · `FinancingProductAttribute` → `FinancierServiceAttribute` ·
>   `FinancingProductCoverage` → `FinancierServiceCoverage`.
> - **REPLACED:** `ApplicantDocument` → `AccountDocument` (universal user+org vault, DP-27) +
>   thin `RequestAttachment` link · `AccreditationProgram`/`AccreditationCriterion`/
>   `SupplierAccreditation` → `FinancierService(serviceKind = ACCREDITATION)` + the same
>   requirements engine + `AccreditationRequest` (full lifecycle incl. the platform gate).
> - **DELETED:** `FinancingProductRequirement` (superseded by the requirements engine, DP-24) ·
>   `FinancingRequestInvite` (superseded by sibling requests sharing `multiGroupId`, DP-25; open
>   distribution deferred, DP-28).
> - **NEW:** `ConditionTemplate` · `ConditionOption` · `ServiceRequirement` ·
>   `RequirementSubmission` · `AccountDocument` · `RequestAttachment` · `AccreditationRequest`.
>
> Grouped below: services catalog (B.2–B.4) · requirements engine (B.5–B.8) · requests — financing
> AND accreditation, both through the platform gate (B.9–B.14) · documents (B.15–B.16).

## B.1 User — additive applicant profile columns (the ONLY existing model whose columns change)

All 12 columns are nullable; B2C buyers unaffected until they apply for financing (DP-14).
Existing User fields and relations are unchanged (see A.1). Treatment unchanged from v4.0 —
v5.0 keeps these 12 scalars exactly as they were (FINANCIER_SCHEMA §3.1).

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

Additive relations (pure Prisma back-relation declarations, v5.0 §3.1):
`accountDocuments`→AccountDocument ("AccountDocumentsOwner"), `documentsReviewed`→
AccountDocument ("AccountDocumentsReviewedBy"), `financingRequests`→FinancingRequest
("FinancingRequests"), `financingOffers`→FinancingOffer ("FinancingOffers"),
`financingEventsReported`→FinancingEvent ("FinancingEventsReportedBy"),
`accreditationsSubmitted`→AccreditationRequest ("AccreditationsSubmitted"),
`accreditationsDecided`→AccreditationRequest ("AccreditationsDecidedBy"),
`accreditationsRevoked`→AccreditationRequest ("AccreditationsRevokedBy"),
`gateReviewsFinancing`→FinancingRequest ("FinancingPlatformReviews"),
`gateReviewsAccreditation`→AccreditationRequest ("AccreditationPlatformReviews"),
`submissionsVerified`→RequirementSubmission ("RequirementSubmissionsVerifiedBy"),
`conditionTemplatesCreated`→ConditionTemplate ("ConditionTemplatesCreatedBy").

## Services catalog (B.2–B.4) — financier identity, branches, and THE offering

### B.2 FinancierProfile — slim: financing facts ONLY; identity lives on Organization

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
| minTicket | Decimal? @db.Decimal(12, 2) | DECIMAL(12,2) | optional | Routing hint; service-level ranges remain authoritative |
| maxTicket | Decimal? @db.Decimal(12, 2) | DECIMAL(12,2) | optional | Routing hint |
| viewCount | Int @default(0) | INT | required, default 0 | Public profile stats |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |
| updatedAt | DateTime @updatedAt | DATETIME(3) | required | Last update |

Relations: `organization`→Organization (1:1, Cascade), `branches`→FinancierBranch,
`services`→FinancierService, `conditionTemplates`→ConditionTemplate
("FinancierConditionTemplates"). Indexes: `[organizationId]` (plus unique).

### B.3 FinancierBranch — typed address columns (no Json, no geo tables)

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

Relations: `financierProfile`→FinancierProfile (Cascade). Indexes:
`[financierProfileId, isActive]`.

### B.4 FinancierService — THE offering (services, not products — DP-22)

A financier's catalog consists of SERVICES. A service is either a **FINANCING** service
(working capital, invoice financing, PO financing, equipment, vehicle, …) or an
**ACCREDITATION** service (the financier's supplier-qualification program — its acceptance
requirements live on it). Every application — financing or accreditation — targets exactly
ONE service, which is what keeps the requirements checklist ALWAYS well-defined (R-4).

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| financierProfileId | String | VARCHAR(191) | required | FK → FinancierProfile.id (Cascade) |
| serviceKind | String @db.VarChar(16) | VARCHAR(16) | required | ServiceKind enum — FINANCING \| ACCREDITATION (DP-22/DP-26) |
| category | String @db.VarChar(24) | VARCHAR(24) | required | ServiceCategory enum — FINANCING kinds (11) or ACCREDITATION kinds (see registry) |
| name | String @db.VarChar(160) | VARCHAR(160) | required | Service name |
| summary | String? @db.VarChar(500) | VARCHAR(500) | optional | One-line card text |
| description | String? @db.Text | TEXT | optional | Description + features prose |
| targetSegment | String? @db.VarChar(16) | VARCHAR(16) | optional | FinancingSegment enum (DP-13) |
| status | String @default("ACTIVE") @db.VarChar(16) | VARCHAR(16) | required, default ACTIVE | ServiceStatus enum — DRAFT \| ACTIVE \| ARCHIVED |
| currency | String @default("YER") @db.VarChar(3) | VARCHAR(3) | required, default YER | ISO-4217; NO currency table |
| amountMin | Decimal? @db.Decimal(12, 2) | DECIMAL(12,2) | optional | Null = open (ACCREDITATION kinds) |
| amountMax | Decimal? @db.Decimal(12, 2) | DECIMAL(12,2) | optional | Competitor's currency.min/max folds HERE |
| rateType | String? @db.VarChar(24) | VARCHAR(24) | optional | RateType enum |
| rateMax | Decimal? @db.Decimal(6, 3) | DECIMAL(6,3) | optional | e.g. 30.000 = 30%/yr cap (murabaha) |
| feeFlat | Decimal? @db.Decimal(12, 2) | DECIMAL(12,2) | optional | Flat fee |
| tenorMinMonths | Int? | INT | optional | e.g. 6 (competitor floor) |
| tenorMaxMonths | Int? | INT | optional | Maximum tenor |
| repaymentFrequency | String? @db.VarChar(16) | VARCHAR(16) | optional | RepaymentFrequency enum |
| gracePeriodDays | Int? | INT | optional | Grace period |
| shariaCompliant | Boolean @default(false) | TINYINT(1) | required, default false | Islamic-finance flag |
| processingDays | Int? | INT | optional | Processing time |
| accreditationValidMonths | Int? | INT | optional | ACCREDITATION kind: lifetime of the grant once ACCREDITED |
| accreditationFeeAmount | Decimal? @db.Decimal(12, 2) | DECIMAL(12,2) | optional | ACCREDITATION kind: fee (invoiced externally, D-002) |
| viewCount | Int @default(0) | INT | required, default 0 | Service page stats |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |
| updatedAt | DateTime @updatedAt | DATETIME(3) | required | Last update |

Relations: `financierProfile`→FinancierProfile (Cascade), `attributes`→
FinancierServiceAttribute, `coverage`→FinancierServiceCoverage, `requirements`→
ServiceRequirement, `financingRequests`→FinancingRequest (serviceKind = FINANCING, enforced
in service layer), `accreditationRequests`→AccreditationRequest (serviceKind = ACCREDITATION,
enforced in service layer). Indexes: `[financierProfileId, status]`,
`[serviceKind, category, status]`.

#### FinancierServiceAttribute — text-bullet traits (competitor "features" + "eligibility conditions" list)

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| serviceId | String | VARCHAR(191) | required | FK → FinancierService.id (Cascade) |
| kind | String @db.VarChar(24) | VARCHAR(24) | required | AttributeKind enum — FEATURE \| ELIGIBILITY_CONDITION |
| position | Int @default(0) | INT | required, default 0 | Sort position |
| text | String @db.VarChar(500) | VARCHAR(500) | required | Bullet text |

Relations: `service`→FinancierService (Cascade). Indexes: unique `[serviceId, kind, position]`,
`[serviceId, kind]`.

#### FinancierServiceCoverage — geographic coverage, region NAMES (DP-16: no geo tables in v1)

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| serviceId | String | VARCHAR(191) | required | FK → FinancierService.id (Cascade) |
| regionName | String @db.VarChar(120) | VARCHAR(120) | required | Normalized (trim/case-fold) at write; matched case-insensitively vs FinancingRequest.activityCity |

Relations: `service`→FinancierService (Cascade). Indexes: unique `[serviceId, regionName]`,
`[serviceId]`.

## Requirements engine (B.5–B.8) — ConditionTemplate · ConditionOption · ServiceRequirement · RequirementSubmission (R-5, DP-24)

Two flavors (R-5): templates with `scope = GENERAL` form the platform-curated shared library
(used by many financiers on many services); templates with `scope = FINANCIER` are private to
one financier. Both attach to a financier's service via `ServiceRequirement` rows — ONE
definition, many attachments. Eight typed condition kinds cover documents, profile completeness,
declarations, free answers, and choices — with zero JSON (options are `ConditionOption` rows).

### B.5 ConditionTemplate — the condition definition

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| scope | String @db.VarChar(16) | VARCHAR(16) | required | ConditionScope enum — GENERAL \| FINANCIER (R-5) |
| organizationId | String? | VARCHAR(191) | optional | FK → Organization.id (—) — null = GENERAL (platform library, admin-managed); set = FINANCIER (private to that org) |
| conditionType | String @db.VarChar(16) | VARCHAR(16) | required | ConditionType enum — 8 kinds (see registry) |
| code | String? @db.VarChar(32) | VARCHAR(32) | optional | Stable ref, e.g. "COM-REG" (uniqueness service-enforced — MySQL allows NULL dupes) |
| title | String @db.VarChar(160) | VARCHAR(160) | required | e.g. "Valid commercial registration" |
| description | String? @db.Text | TEXT | optional | Instructions shown to the applicant |
| profileFieldKey | String? @db.VarChar(64) | VARCHAR(64) | optional | PROFILE_FIELD only — closed zod set: user.phone \| user.identityNumber \| user.dateOfBirth \| org.taxId \| org.registrationNumber \| org.industry |
| documentType | String? @db.VarChar(32) | VARCHAR(32) | optional | DOCUMENT only — expected AccountDocument.documentType |
| validationMin | Decimal? @db.Decimal(12, 2) | DECIMAL(12,2) | optional | NUMBER only — inclusive lower bound |
| validationMax | Decimal? @db.Decimal(12, 2) | DECIMAL(12,2) | optional | NUMBER only — inclusive upper bound |
| validityMonths | Int? | INT | optional | Evidence freshness window (e.g. bank statement ≤ 3 months old) |
| isRepeatable | Boolean @default(false) | TINYINT(1) | required, default false | DOCUMENT only — multiple docs allowed (e.g. 6× monthly statements) |
| isActive | Boolean @default(true) | TINYINT(1) | required, default true | Library visibility |
| createdById | String | VARCHAR(191) | required | FK → User.id (—) — admin (GENERAL) or financier staff (FINANCIER) |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |
| updatedAt | DateTime @updatedAt | DATETIME(3) | required | Last update |

Relations: `organization`→Organization ("FinancierConditionTemplates"), `createdBy`→User
("ConditionTemplatesCreatedBy"), `options`→ConditionOption, `serviceRequirements`→
ServiceRequirement. Indexes: `[scope, organizationId, isActive]`, `[conditionType, isActive]`.

Worked example: `ConditionTemplate(scope = GENERAL, conditionType = DOCUMENT, documentType =
COMMERCIAL_REG, title = "Valid commercial registration")` — attached to three financiers'
services as three `ServiceRequirement` rows (different `isRequired`/`instructions` per
service); each financier also adds their own `scope = FINANCIER` templates that nobody else
can see or attach.

### B.6 ConditionOption — SELECT / MULTI_SELECT choices as rows (R-1)

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| conditionTemplateId | String | VARCHAR(191) | required | FK → ConditionTemplate.id (Cascade) |
| value | String @db.VarChar(160) | VARCHAR(160) | required | Stored + displayed (e.g. "Sana'a") |
| position | Int @default(0) | INT | required, default 0 | Sort position |

Relations: `conditionTemplate`→ConditionTemplate (Cascade). Indexes: unique
`[conditionTemplateId, value]`, `[conditionTemplateId, position]`.

### B.7 ServiceRequirement — ONE template attached to ONE service, with per-service config

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| serviceId | String | VARCHAR(191) | required | FK → FinancierService.id (Cascade) |
| conditionTemplateId | String | VARCHAR(191) | required | FK → ConditionTemplate.id (—) |
| isRequired | Boolean @default(true) | TINYINT(1) | required, default true | Optional conditions inform but never gate |
| displayOrder | Int @default(0) | INT | required, default 0 | Sort position |
| instructions | String? @db.VarChar(500) | VARCHAR(500) | optional | Financier's per-service override text |
| autoPassAccredited | Boolean @default(false) | TINYINT(1) | required, default false | Auto-VERIFIED when the applicant org holds a live accreditation from THIS financier (DP-26) |
| isActive | Boolean @default(true) | TINYINT(1) | required, default true | Attachment visibility |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |
| updatedAt | DateTime @updatedAt | DATETIME(3) | required | Last update |

Relations: `service`→FinancierService (Cascade), `conditionTemplate`→ConditionTemplate,
`submissions`→RequirementSubmission. Indexes: unique `[serviceId, conditionTemplateId]`,
`[serviceId, isActive, displayOrder]`.

### B.8 RequirementSubmission — per-request checklist row; THE GATE's verification unit

One row per (request × service-requirement). This is what the platform admin verifies
item-by-item, and what must be all-VERIFIED (or WAIVED with a note) before the request can be
forwarded (R-4). Answers are TYPED columns — zero JSON (R-1).

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| serviceRequirementId | String | VARCHAR(191) | required | FK → ServiceRequirement.id (Cascade) |
| financingRequestId | String? | VARCHAR(191) | optional | FK → FinancingRequest.id (Cascade) — parent XOR with accreditationRequestId (service-enforced) |
| accreditationRequestId | String? | VARCHAR(191) | optional | FK → AccreditationRequest.id (Cascade) — parent XOR with financingRequestId (service-enforced) |
| status | String @default("PENDING") @db.VarChar(16) | VARCHAR(16) | required, default PENDING | RequirementSubmissionStatus enum — PENDING \| SUBMITTED \| VERIFIED \| REJECTED \| WAIVED |
| valueText | String? @db.VarChar(500) | VARCHAR(500) | optional | TEXT / DECLARATION / SELECT answers |
| valueNumber | Decimal? @db.Decimal(12, 2) | DECIMAL(12,2) | optional | NUMBER answers |
| valueDate | DateTime? | DATETIME(3) | optional | DATE answers |
| accountDocumentId | String? | VARCHAR(191) | optional | FK → AccountDocument.id (—) — DOCUMENT evidence; REUSE of a vault doc (R-2) |
| submittedAt | DateTime? | DATETIME(3) | optional | Applicant supply time |
| verifiedAt | DateTime? | DATETIME(3) | optional | Platform verdict time |
| verifiedById | String? | VARCHAR(191) | optional | FK → User.id (—) — the platform admin (or system for autoPass) |
| decisionNote | String? @db.VarChar(500) | VARCHAR(500) | optional | Rejection/waiver reason — REQUIRED in REJECTED/WAIVED; shown to applicant |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |
| updatedAt | DateTime @updatedAt | DATETIME(3) | required | Last update |

Relations: `serviceRequirement`→ServiceRequirement (Cascade), `financingRequest`→
FinancingRequest (Cascade), `accreditationRequest`→AccreditationRequest (Cascade),
`accountDocument`→AccountDocument, `verifiedBy`→User ("RequirementSubmissionsVerifiedBy").
Indexes: unique `[financingRequestId, serviceRequirementId]`, unique
`[accreditationRequestId, serviceRequirementId]`, `[status]`.

**Parent rule:** exactly ONE of `financingRequestId` / `accreditationRequestId` is set
(service-enforced; both FKs keep cascade integrity).

**Gate completeness rule (service-layer, R-4):** a request may move to FORWARDED_TO_FINANCIER
only when every RequirementSubmission whose `serviceRequirement.isRequired = true` is VERIFIED
(or WAIVED with a decisionNote); PENDING/SUBMITTED/REJECTED items block the transition.

## Requests (B.9–B.14) — financing AND accreditation, both through the platform gate (R-4, DP-23)

No financing or accreditation request is EVER visible to a financier until platform management
has verified all required conditions; financier inbox queries filter FORWARDED_TO_FINANCIER and
later states only. Status machines (11 states each, gate-first): FINANCIER_SCHEMA §5.1–§5.2.

### B.9 FinancingRequest v3 — the financing application (FR-YYYY-###### via Sequence 'FIN')

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| number | String @unique @db.VarChar(32) | VARCHAR(32) | required, unique | FR-YYYY-###### |
| organizationId | String? | VARCHAR(191) | optional | FK → Organization.id (—) — applicant org (B2B); null = individual (DP-13) |
| createdById | String | VARCHAR(191) | required | FK → User.id — submitting member or the individual |
| serviceId | String | VARCHAR(191) | required | FK → FinancierService.id (—) — serviceKind = FINANCING enforced in service layer (DP-22) |
| targetType | String @db.VarChar(16) | VARCHAR(16) | required | FinancingTargetType enum — WORKING_CAPITAL \| QUOTE \| ORDER \| RFQ_LINE |
| targetId | String? @db.VarChar(64) | VARCHAR(64) | optional | Loose FK → Quote/Order/RfqLine id (Dispute pattern) |
| multiGroupId | String? @db.VarChar(32) | VARCHAR(32) | optional | Multi-financier routing (DP-25) — null = EXCLUSIVE; set = sibling requests share the group |
| activityStatus | String? @db.VarChar(16) | VARCHAR(16) | optional | ActivityStatus enum — NEW \| EXISTING |
| activityName | String? @db.VarChar(160) | VARCHAR(160) | optional | e.g. "Grocery store" |
| activityDescription | String? @db.Text | TEXT | optional | Free description |
| activityStartDate | DateTime? | DATETIME(3) | optional | Null = not started yet |
| activityCity | String? @db.VarChar(120) | VARCHAR(120) | optional | Matches service coverage (string, DP-16) |
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
| platformReviewedById | String? | VARCHAR(191) | optional | FK → User.id (—) — the admin working the gate (DP-23) |
| platformReviewedAt | DateTime? | DATETIME(3) | optional | Gate review time |
| platformNote | String? @db.Text | TEXT | optional | Public-to-applicant review summary |
| returnedAt | DateTime? | DATETIME(3) | optional | Set when RETURNED_FOR_COMPLETION |
| returnedReason | String? @db.VarChar(500) | VARCHAR(500) | optional | Aggregate missing/incorrect note (per-item notes on RequirementSubmission.decisionNote) |
| forwardedAt | DateTime? | DATETIME(3) | optional | Set when the gate PASSED — financier visibility starts HERE (R-4) |
| status | String @default("DRAFT") @db.VarChar(24) | VARCHAR(24) | required, default DRAFT | FinancingRequestStatus v3 enum — 11 gate-first states (§5.1) |
| expiresAt | DateTime? | DATETIME(3) | optional | Lazy-sweep expiry (D-011) |
| submittedAt | DateTime? | DATETIME(3) | optional | Submission time |
| closedAt | DateTime? | DATETIME(3) | optional | Terminal time |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |
| updatedAt | DateTime @updatedAt | DATETIME(3) | required | Last update |

Relations: `organization`→Organization ("FinancingRequestsByOrg"), `createdBy`→User
("FinancingRequests"), `service`→FinancierService, `platformReviewedBy`→User
("FinancingPlatformReviews"), `submissions`→RequirementSubmission, `offers`→FinancingOffer.
Indexes: `[organizationId, status]`, `[createdById, createdAt]`, `[status, createdAt]` (gate
queue: SUBMITTED + UNDER_PLATFORM_REVIEW), `[serviceId]`, `[multiGroupId]`,
`[targetType, targetId]`, `[activityCity]`.

Notes: `serviceId` is REQUIRED — applications are service-scoped (DP-22). Multi-financier
routing (DP-25): EXCLUSIVE = `multiGroupId` null (this request goes to the service's owning
financier only); MULTI = the wizard created N sibling requests (one per selected financier's
matching service) sharing the groupId, grouped for side-by-side offer comparison. v3's
`businessInfo` Json is DELETED (R-1/R-3: industry/registration come from Organization, financial
evidence arrives as typed AccountDocuments).

### B.10 FinancingOffer + installments — the financier's proposal; schedule as rows (R-1)

#### FinancingOffer

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

Offer comparison & tracking: within one request the financier may send multiple offers
(revised terms); ACROSS financiers the applicant compares the latest SENT offer of each sibling
request sharing a `multiGroupId` — both surfaces render from these rows, no snapshot table.

#### FinancingOfferInstallment

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| offerId | String | VARCHAR(191) | required | FK → FinancingOffer.id (Cascade) |
| installmentNo | Int | INT | required | Installment sequence |
| dueDate | DateTime | DATETIME(3) | required | Due date |
| amount | Decimal @db.Decimal(12, 2) | DECIMAL(12,2) | required | Installment amount |

Relations: `offer`→FinancingOffer (Cascade). Indexes: unique `[offerId, installmentNo]`,
`[offerId, dueDate]`.

### B.11 FinancingAgreement — references the accepted offer; NO snapshot (DP-20)

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| number | String @unique @db.VarChar(32) | VARCHAR(32) | required, unique | AGR-YYYY-###### via Sequence 'AGR' |
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

NO termsSnapshot: the service FREEZES the accepted offer (status lock + installment rows
immutable); the agreement references, never copies (R-2).

### B.12 FinancingEvent — track-only ledger (D-002)

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

Relations: `agreement`→FinancingAgreement (Cascade), `reportedBy`→User
("FinancingEventsReportedBy"). Indexes: `[agreementId, eventDate]`.

### B.13 FinancingFee — commission accounting, invoiced externally (D-001/002)

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

### B.14 AccreditationRequest — the qualification & accreditation flow, a MAIN service (ACC-YYYY-###### via Sequence 'ACC'; DP-26)

A company seeks qualification/accreditation by a financier: it selects the financier, completes
any missing requirements not already in its profile, the PLATFORM verifies and forwards once
all conditions are met, and the financier grants or rejects. The grant lives ON the request
(`status = ACCREDITED` + `validUntil`) — no separate grant entity (single entry). A live
accreditation unlocks RFQ send/receive participation with that financier and auto-passes
`autoPassAccredited` requirements on the financier's other services.

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| number | String @unique @db.VarChar(32) | VARCHAR(32) | required, unique | ACC-YYYY-###### via Sequence 'ACC' |
| organizationId | String | VARCHAR(191) | required | FK → Organization.id (—) — the applicant company (companies only; individuals use financing) |
| submittedById | String | VARCHAR(191) | required | FK → User.id (—) — org member user |
| serviceId | String | VARCHAR(191) | required | FK → FinancierService.id (—) — serviceKind = ACCREDITATION enforced in service layer (DP-26) |
| multiGroupId | String? @db.VarChar(32) | VARCHAR(32) | optional | Multi-financier routing (DP-25) — sibling accreditation requests share the group |
| scopeNotes | String? @db.VarChar(500) | VARCHAR(500) | optional | What the accreditation covers (e.g. "IT equipment suppliers") |
| consentAt | DateTime? | DATETIME(3) | optional | Data-transfer consent, stamped at submit |
| platformReviewedById | String? | VARCHAR(191) | optional | FK → User.id (—) — the admin working the gate (same fields as FinancingRequest) |
| platformReviewedAt | DateTime? | DATETIME(3) | optional | Gate review time |
| platformNote | String? @db.Text | TEXT | optional | Public-to-applicant review summary |
| returnedAt | DateTime? | DATETIME(3) | optional | Set when RETURNED_FOR_COMPLETION |
| returnedReason | String? @db.VarChar(500) | VARCHAR(500) | optional | Aggregate missing/incorrect note (per-item notes on RequirementSubmission.decisionNote) |
| forwardedAt | DateTime? | DATETIME(3) | optional | Set when the gate PASSED — financier visibility starts HERE (R-4) |
| status | String @default("DRAFT") @db.VarChar(24) | VARCHAR(24) | required, default DRAFT | AccreditationRequestStatus enum — 11 states (§5.2) |
| submittedAt | DateTime? | DATETIME(3) | optional | Submission time |
| decidedById | String? | VARCHAR(191) | optional | FK → User.id (—) — the financier's deciding staff user |
| decidedAt | DateTime? | DATETIME(3) | optional | Decision time |
| decisionNote | String? @db.VarChar(500) | VARCHAR(500) | optional | Financier's grant/reject note |
| accreditedAt | DateTime? | DATETIME(3) | optional | Grant stamp (ACCREDITED only) |
| validUntil | DateTime? | DATETIME(3) | optional | Grant lifetime — service.accreditationValidMonths default |
| revokedById | String? | VARCHAR(191) | optional | FK → User.id (—) — revocation (financier or platform admin) |
| revokedAt | DateTime? | DATETIME(3) | optional | Revocation time |
| revocationReason | String? @db.VarChar(500) | VARCHAR(500) | optional | Reason REQUIRED on revoke |
| expiresAt | DateTime? | DATETIME(3) | optional | REQUEST-level expiry (pre-decision), lazy sweep |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |
| updatedAt | DateTime @updatedAt | DATETIME(3) | required | Last update |

Relations: `organization`→Organization ("AccreditationRequestsByOrg"), `submittedBy`→User
("AccreditationsSubmitted"), `service`→FinancierService, `platformReviewedBy`→User
("AccreditationPlatformReviews"), `decidedBy`→User ("AccreditationsDecidedBy"), `revokedBy`→
User ("AccreditationsRevokedBy"), `submissions`→RequirementSubmission. Indexes: unique
`[serviceId, organizationId]` (one accreditation record per financier-program per org;
renewals allowed after EXPIRED/REVOKED/REJECTED/CANCELLED — service-enforced, Prisma partial
unique unavailable), `[organizationId, status]`, `[status, createdAt]`, `[multiGroupId]`,
`[validUntil]`.

## Documents (B.15–B.16) — universal vault + request links (DP-27)

Document management for ALL users and accounts: every user — buyer, seller, financier staff,
individual applicant — and every organization owns a document vault. KYC evidence is uploaded
ONCE, verified ONCE by the platform, and reused by every financing / accreditation / general
KYC flow. Requests never own document bytes; they REFERENCE.

### B.15 AccountDocument — ONE document subsystem over MediaAsset, for all users and orgs

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| userId | String | VARCHAR(191) | required | FK → User.id (Cascade) — owner/uploader, ALWAYS set (all users, not just applicants) |
| organizationId | String? | VARCHAR(191) | optional | FK → Organization.id (—) — org-scope docs (company registry papers); null = personal |
| mediaId | String | VARCHAR(191) | required | FK → MediaAsset.id (—) — THE storage entry (DP-19) |
| documentType | String @db.VarChar(32) | VARCHAR(32) | required | AccountDocumentType enum — 15 values (see registry) |
| title | String? @db.VarChar(160) | VARCHAR(160) | optional | Display title |
| issuedAt | DateTime? | DATETIME(3) | optional | Document's own issue date |
| expiresAt | DateTime? | DATETIME(3) | optional | Freshness vs ConditionTemplate.validityMonths |
| status | String @default("PENDING") @db.VarChar(16) | VARCHAR(16) | required, default PENDING | AccountDocumentStatus enum — PENDING \| VERIFIED \| REJECTED |
| reviewedById | String? | VARCHAR(191) | optional | FK → User.id (—) — verifying staff |
| reviewedAt | DateTime? | DATETIME(3) | optional | Verification time |
| note | String? @db.Text | TEXT | optional | Verification / rejection note |
| isActive | Boolean @default(true) | TINYINT(1) | required, default true | Soft-delete (replaced by a newer version of the doc) |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |
| updatedAt | DateTime @updatedAt | DATETIME(3) | required | Last update |

Relations: `user`→User (Cascade, "AccountDocumentsOwner"), `organization`→Organization
("OrganizationAccountDocuments"), `media`→MediaAsset ("AccountDocumentMedia"),
`reviewedBy`→User ("AccountDocumentsReviewedBy"), `submissions`→RequirementSubmission (reuse
links from request checklists). Indexes: `[userId, documentType, status]`,
`[organizationId]`, `[mediaId]`.

### B.16 RequestAttachment — free-form request attachments (loose-parent pattern)

Wizard field 20 (guarantee documents, studies, project files) NOT tied to a specific
requirement. Loose-parent pattern (Dispute precedent) so ONE table serves both request types;
the document itself still lives in AccountDocument (R-2).

| field | Prisma type | MySQL type | null/default | description |
|---|---|---|---|---|
| id | String @id @default(cuid()) | VARCHAR(191) PK | required, default cuid | Identifier |
| parentType | String @db.VarChar(24) | VARCHAR(24) | required | RequestAttachmentParentType enum — FINANCING_REQUEST \| ACCREDITATION_REQUEST |
| parentId | String @db.VarChar(64) | VARCHAR(64) | required | Loose FK → FinancingRequest.id / AccreditationRequest.id (Dispute pattern) |
| accountDocumentId | String | VARCHAR(191) | required | FK → AccountDocument.id (Cascade) — the document lives in the vault (R-2) |
| kind | String @db.VarChar(24) | VARCHAR(24) | required | RequestAttachmentKind enum — GUARANTEE_DOC \| STUDY \| PROJECT_FILE \| OTHER |
| createdAt | DateTime @default(now()) | DATETIME(3) | required, default now() | Creation |

Relations: `accountDocument`→AccountDocument (Cascade, "RequestAttachmentDocument").
Indexes: `[parentType, parentId]`, `[accountDocumentId]`.

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

**Part B — planned (source: FINANCIER_SCHEMA v5.0 §3):**

| model | fields | model | fields |
|---|---|---|---|
| User additive | 12 | FinancingRequest | 45 |
| FinancierProfile | 13 | FinancingOffer | 19 |
| FinancierBranch | 14 | FinancingOfferInstallment | 5 |
| FinancierService | 26 | FinancingAgreement | 10 |
| FinancierServiceAttribute | 5 | FinancingEvent | 8 |
| FinancierServiceCoverage | 3 | FinancingFee | 11 |
| ConditionTemplate | 17 | AccreditationRequest | 27 |
| ConditionOption | 4 | AccountDocument | 15 |
| ServiceRequirement | 10 | RequestAttachment | 6 |
| RequirementSubmission | 15 | | |
| | | **Total planned** | **265** (253 in 18 new tables + 12 User additive) |

**Grand total after financier implementation: 633 scalar columns** (32 existing + 18 planned
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
child tables (`FinancierServiceAttribute/Coverage`, `ConditionOption`, `FinancingOfferInstallment`,
`RequestAttachment`), addresses as typed scalars (`FinancierBranch`, `User.residence*`),
schedules as rows, condition options as rows — never JSON.

---

*End of document. Structural views (ERD, state machines, invariants) are in
`01-domain-model.md`.*
