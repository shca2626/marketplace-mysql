# Vendora — Domain Model & Entity Relationships

| | |
|---|---|
| **Version** | 1.0 |
| **Date** | September 2026 |
| **Audience** | Expert software engineers (Vendora core team) |
| **Status** | **EXISTING** sections describe `prisma/schema.prisma` (32 models, live database, ground truth). **PLANNED** sections describe `team/FINANCIER_SCHEMA.md` v4.0 (17 financier models + additive `User` columns) — owner-gated, NOT in the database yet. Every PLANNED artifact is explicitly marked. |
| **Related** | `prisma/schema.prisma` (schema of record), `team/FINANCIER_SCHEMA.md` v4.0, `team/DECISIONS.md` (D-001…D-013, DP-1…DP-21), `06-data-dictionary.md` (field-level companion) |

---

## 1. Domain overview — bounded contexts

Vendora is a unified commerce platform (B2C + B2B marketplace) built as a Next.js 16 App Router SPA
(single route `/`, views switched via `?view=` in `src/lib/routing.ts`) on MySQL + Prisma. The
foundational principle, stated in the schema header: *the difference between B2C and B2B is DATA,
not code paths* — one buyer graph, one pricing resolution pipeline, one negotiation primitive, one
order pipeline. The platform is a third-party orchestrator (D-001): it never holds inventory, is
never merchant of record, and settlement of buyer→vendor funds is external (D-002). Single operator,
no multi-tenancy (D-003) — there is no tenant discriminator anywhere.

### 1.1 Identity & Access — `User`
A flat identity table doubling as the vendor registry. `role` (BUYER | SELLER | ADMIN) drives
authorization; `status` (ACTIVE | SUSPENDED) + `suspendedAt` implement the platform-controlled
vendor lifecycle; `verifiedAt` is the KYC-lite verification stamp that enables RFQ routing
auto-approve and distribution filters; `commissionRate` is the per-vendor payout commission
override; `storeName`/`storeBio` carry the seller storefront. PLANNED: 12 additive nullable
applicant-profile columns (§7 of FINANCIER_SCHEMA) — no new identity table.

### 1.2 Catalog & Pricing — `Category`, `Product`, `ProductVariant`, `Review`, `Favorite`, `CustomerGroup`, `PriceList`, `PriceListEntry`, `Coupon`
The governed catalog: `Category` (slug-addressed taxonomy), `Product` (retail `price` is the
pipeline fallback; `priceTiers` is a JSON quantity-break ladder; `status` ACTIVE | DRAFT | ARCHIVED
with moderation via `soldCount`), `ProductVariant` (options as JSON map, optional price override).
Pricing is RESOLVED, never just read: `PriceList` (scope ORG | GROUP | CHANNEL, precedence
organization contract > customer group > channel > retail) with `PriceListEntry` ladder steps.
`CustomerGroup` segments both users and organizations for pricing. `Review` (1–5, unique per
user×product) and `Favorite` are consumer surfaces. `Coupon` is admin-managed checkout discounts
(moved from hardcoded constants to data). PLANNED: nothing here — the financing catalog is its own
domain (§1.12).

### 1.3 Order & Fulfillment — `Order`, `OrderItem`
One order pipeline for B2C and B2B. `Order` carries the shipping snapshot (name/address/city/
country/zip/phone), B2B extensions (all optional so the B2C fast path is unchanged):
`organizationId`, `poNumber`, `costCenter`, `paymentTerms` (e.g. NET-30), `sourceType`
(CART | RFQ) and `sourceQuoteId` (unique — the quote that produced the order). `OrderItem`
snapshots title/image/variant label at purchase time, carries `sellerId` for multi-seller splits,
and `payoutId` (set-once settlement link). `status` runs PENDING_PAYMENT | PENDING_APPROVAL | PAID
| PROCESSING | SHIPPED | DELIVERED | CANCELLED.

### 1.4 Negotiation (RFQ/Quote) — `Rfq`, `RfqLine`, `Quote`, `QuoteLine`, `RfqMessage`, `RecurringRfq`
The B2B transaction primitive. `Rfq` (numbered RFQ-YYYY-NNNNNN via `Sequence`) with multi-line
`RfqLine` (product-referenced or free-text, optional target price), competing `Quote`s with
validity windows and money as Decimal(12,2), `QuoteLine` answering specific `RfqLine`s, and
`RfqMessage` as the buyer↔admin↔seller Q&A thread. Accepting a quote declines its siblings and
closes the RFQ; conversion to an order is prepared by `Order.sourceQuoteId`.
`RecurringRfq` is the standing-purchase schedule whose lazy sweep (D-011 — no cron) clones its
line snapshot into a fresh RFQ each cycle; it links back via the loose FK
`Rfq.sourceRecurringId`.

### 1.5 Organization & Approvals — `Organization`, `OrganizationMember`, `ApprovalRequest`
The B2B party graph. A "B2B buyer" is a User acting inside an Organization with a role — never a
separate user type. `Organization` carries verification state, tax identity, credit configuration
(`creditTermsDays`, `creditLimit`) and `approvalThreshold`; `orgType` (COMPANY | BANK | MFI |
EWALLET) is the settings scope key. `OrganizationMember` (OWNER | ADMIN | BUYER | APPROVER |
VIEWER) is the join. `ApprovalRequest` gates orders (cart checkout) and quote acceptances that
reach the org threshold — type ORDER | QUOTE_ACCEPT, exactly one per order/quote (unique), and the
requester is never the decider.

### 1.6 Payments & Settlement — `Payment`, `Payout`
Explicit money settlement, external to the platform (D-002). `Payment` is 1:1 with an order and
exists exactly when money is expected: CARD (simulated gateway, succeeds inline), BANK_TRANSFER
(manual — buyer wires, admin captures), INVOICE (NET-terms B2B from quote conversion); a SUCCEEDED
payment flips the order to PAID. `Payout` (numbered PY-YYYY-NNNNNN) is the platform→seller
settlement record: it sweeps all `OrderItem`s whose payment SUCCEEDED and `payoutId` is NULL,
computing commission = rate × gross where the rate is the vendor override (`User.commissionRate`)
or the platform default (`PlatformSetting` key `payouts`, 0–90%, zod-validated); net = gross −
commission. The money itself always moves outside the platform.

### 1.7 Disputes — `Dispute`
Buyer raises a dispute on an order against a specific seller (numbered DSP-YYYY-NNNNNN via
`Sequence`). `reason` is a 7-value enum; lifecycle OPEN → SELLER_RESPONDED → (auto-escalation at
`escalateAt` per the dispute settings) → RESOLVED/CLOSED/CANCELLED with an `outcome` enum
(FULL_REFUND … SELLER_PENALTY). Outcome effects (rating penalty, verification loss) are enforced
by the Dispute Resolution settings panel; the disputed seller's RFQ distribution can be excluded.

### 1.8 Media — `MediaAsset`
The single upload subsystem: content-deduplicated by `sha256`, processed into webp renditions
(`variants`, LEGACY-JSON). `Product.images`/`ProductVariant.image`/`User.image` reference the
medium rendition URL; deletes are reference-checked. PLANNED: the financier domain's entire
document storage hangs off `MediaAsset` through `ApplicantDocument.mediaId` (DP-19 — one storage
subsystem, no storage metadata duplication).

### 1.9 Notifications — `Notification`
Server-side notification feed for everything the order list cannot see (order events stay derived
client-side in the NotificationsBell). `type` is a 10-value string enum (RFQ_* / APPROVAL_*),
`linkView` targets an SPA view (rfq | orders | business | seller) with optional `linkId`.
PLANNED: `linkView` gains `financing`; new FINANCING_* / OFFER_* / DOC_* / FEE_* / AGREEMENT_*
types (FINANCIER_SCHEMA §6).

### 1.10 Settings & Governance — `PlatformSetting`, `RfqSetting`, `SettingChange`, `BannerSlide`
`PlatformSetting` is the platform-level key/value document store (storefront config; `value` is
JSON-in-Text, LEGACY-JSON). `RfqSetting` is scoped RFQ configuration — one row per
(panel `key`, `scopeType` PLATFORM | ORG_TYPE | ORG | CATEGORY | REGION, `scopeId`), most specific
scope wins; panels include quote routing, expiry, distribution, dispute resolution, recurring
RFQs, verification. `SettingChange` is the append-only change log with rollback chain
(`rollbackOfId`), deliberately NOT FK-linked to RfqSetting so history survives override deletion.
`BannerSlide` is admin-managed hero content. PLANNED: the financing settings panels
(general/fees/distribution/documents/intake) land in the same `RfqSetting` registry — no new
settings table.

### 1.11 Platform substrate — `AuditLog`, `Sequence`
`AuditLog` is the polymorphic audit trail (loose `actorId` — SYSTEM entries have no user;
`entityType`/`entityId`/`action` + `metadata` Json, LEGACY-JSON). `Sequence` is the atomic
number generator behind every business number (D-006): current prefixes RFQ, QTE, DSP, PY →
`PREFIX-YYYY-NNNNNN`; never client-side counters. PLANNED: prefixes += FIN (FR-) and AGR (AGR-);
financing status history rides `AuditLog.summary` text + `Notification` bodies (DP-15) — the
`metadata` Json column is deliberately not used by the financier domain (R-1).

### 1.12 Financing (PLANNED — NOT in the database yet) — 17 models + `User` additive columns
The financier domain per `team/FINANCIER_SCHEMA.md` v4.0 (owner rulings: zero Json columns — R-1;
single entry per data point — R-2; reuse the existing substrate — R-3). `FinancierProfile` is a
slim 1:1 extension of `Organization` (legal identity stays on Organization); `FinancierBranch`
(typed address columns); `FinancingProduct` + three trait child tables (`Attribute` features /
eligibility text, `Requirement` collateral/document enums, `Coverage` region names);
`FinancingRequest` (the application, FR-YYYY-NNNNNN, typed activity/underwriting/guarantee
columns, loose-FK target to a quote/order/rfq-line); `FinancingRequestInvite` (BUYER_SELECTED
distribution as rows); `ApplicantDocument` (one document subsystem over `MediaAsset`, dual-scope
user-KYC / request-evidence, triple-scope with accreditation); `FinancingOffer` +
`FinancingOfferInstallment` (the schedule is the financier's proposal); `FinancingAgreement`
(1:1 with the accepted offer, NO snapshot — the offer is frozen instead, DP-20) with
financier-REPORTED `fundingStatus` (D-002 — money never on platform); `FinancingEvent`
(track-only ledger) and `FinancingFee` (commission accounting, invoiced externally);
`AccreditationProgram` / `AccreditationCriterion` / `SupplierAccreditation` (Flow 4). Owner-gated
behind DP-1…DP-21 approval.

---

## 2. Entity relationship diagrams

Conventions: solid connectors are Prisma-enforced FKs; `..` connectors are loose string references
(no DB constraint, enforced in service code — the Dispute pattern). Only key fields are shown for
large models; the full field inventory is in `06-data-dictionary.md`. MySQL types are abbreviated
(`varchar(n)`, `text`, `int`, `bool`, `datetime`, `decimal`).

### 2.1 Identity & commerce core

```mermaid
erDiagram
    USER ||--o{ PRODUCT : sells
    CATEGORY ||--o{ PRODUCT : categorizes
    PRODUCT ||--|{ PRODUCT_VARIANT : "has variants"
    PRODUCT ||--o{ REVIEW : receives
    USER ||--o{ REVIEW : writes
    PRODUCT ||--o{ FAVORITE : "is favorited"
    USER ||--o{ FAVORITE : favorites
    USER ||--o{ ORDER : buys
    ORGANIZATION ||--o{ ORDER : "B2B context (optional)"
    ORDER ||--|{ ORDER_ITEM : contains
    PRODUCT ||--o{ ORDER_ITEM : "ordered as"
    ORGANIZATION ||--|{ ORGANIZATION_MEMBER : has
    USER ||--o{ ORGANIZATION_MEMBER : "is member"
    USER }|..o{ CUSTOMER_GROUP : "segmented by (implicit m-n)"
    ORGANIZATION }|..o{ CUSTOMER_GROUP : "segmented by (implicit m-n)"
    ORGANIZATION |o--o{ PRICE_LIST : "contract list"
    CUSTOMER_GROUP |o--o{ PRICE_LIST : "group list"
    PRICE_LIST ||--|{ PRICE_LIST_ENTRY : contains
    PRODUCT ||--|{ PRICE_LIST_ENTRY : "priced by"

    USER {
        string id PK
        string email UK
        string role "BUYER | SELLER | ADMIN"
        string status "ACTIVE | SUSPENDED"
        datetime verifiedAt
        float commissionRate "payout override"
        string storeName
    }
    CATEGORY {
        string id PK
        string name
        string slug UK
        string icon
    }
    PRODUCT {
        string id PK
        string title
        float price "retail fallback"
        string images "LEGACY-JSON url array"
        string status "ACTIVE | DRAFT | ARCHIVED"
        string slug UK
        string categoryId FK
        string sellerId FK
    }
    PRODUCT_VARIANT {
        string id PK
        string productId FK
        string name
        string options "LEGACY-JSON map"
        float price "null = inherit"
        int stock
        bool isActive
    }
    ORDER {
        string id PK
        string buyerId FK
        string organizationId FK "nullable"
        string status "7-value enum"
        float total
        string sourceType "CART | RFQ"
        string sourceQuoteId "loose, unique"
    }
    ORDER_ITEM {
        string id PK
        string orderId FK
        string productId FK
        string sellerId FK
        string title "snapshot"
        string payoutId FK "set-once"
    }
    REVIEW {
        string id PK
        string productId FK
        string userId FK
        int rating "1..5"
    }
    FAVORITE {
        string id PK
        string userId FK
        string productId FK
    }
    ORGANIZATION {
        string id PK
        string slug UK
        string orgType "COMPANY | BANK | MFI | EWALLET"
        string status "4-value enum"
        decimal approvalThreshold
        decimal creditLimit
    }
    ORGANIZATION_MEMBER {
        string id PK
        string organizationId FK
        string userId FK
        string role "OWNER | ADMIN | BUYER | APPROVER | VIEWER"
    }
    CUSTOMER_GROUP {
        string id PK
        string key UK
        int priority "higher wins"
        bool isDefault
    }
    PRICE_LIST {
        string id PK
        string scope "ORG | GROUP | CHANNEL"
        string status "ACTIVE | DRAFT | ARCHIVED"
        string organizationId FK "nullable"
        string customerGroupId FK "nullable"
    }
    PRICE_LIST_ENTRY {
        string id PK
        string priceListId FK
        string productId FK
        int minQuantity "ladder step"
        decimal unitPrice
    }
```

### 2.2 Negotiation & approvals

```mermaid
erDiagram
    USER ||--o{ RFQ : requests
    ORGANIZATION |o--o{ RFQ : "org context (optional)"
    RFQ ||--|{ RFQ_LINE : contains
    PRODUCT |o--o{ RFQ_LINE : "references (optional, else free text)"
    RFQ ||--o{ QUOTE : "answered by"
    USER ||--o{ QUOTE : "issued by (admin or seller)"
    QUOTE ||--|{ QUOTE_LINE : contains
    RFQ_LINE |o--o{ QUOTE_LINE : "answered by (optional)"
    PRODUCT ||--|{ QUOTE_LINE : prices
    ORGANIZATION ||--|{ APPROVAL_REQUEST : scopes
    USER ||--o{ APPROVAL_REQUEST : requests
    USER |o--o{ APPROVAL_REQUEST : decides
    ORDER |o--o| APPROVAL_REQUEST : "gated by (unique orderId)"
    QUOTE |o--o| APPROVAL_REQUEST : "gated by (unique quoteId)"
    RFQ ||--o{ RFQ_MESSAGE : discusses
    USER ||--o{ RFQ_MESSAGE : authors
    QUOTE |o--o| ORDER : "converts to (sourceQuoteId, loose)"

    RFQ {
        string id PK
        string number UK "RFQ-YYYY-NNNNNN"
        string userId FK
        string organizationId FK "nullable"
        string status "9-value enum"
        datetime expiresAt
        int extendedCount
        string sourceRecurringId "loose"
    }
    RFQ_LINE {
        string id PK
        string rfqId FK
        string productId FK "nullable = free item"
        string productName "snapshot / free description"
        int quantity
        decimal targetPrice
    }
    QUOTE {
        string id PK
        string number UK "QTE-YYYY-NNNNNN"
        string rfqId FK
        string createdById FK
        string sellerId "null = platform-facilitated"
        string status "9-value enum"
        decimal total
        datetime validUntil
    }
    QUOTE_LINE {
        string id PK
        string quoteId FK
        string rfqLineId FK "nullable"
        string productId FK
        int quantity
        decimal unitPrice
    }
    APPROVAL_REQUEST {
        string id PK
        string organizationId FK
        string type "ORDER | QUOTE_ACCEPT"
        string orderId UK "nullable"
        string quoteId UK "nullable"
        string requesterId FK
        decimal amount
        string status "PENDING | APPROVED | REJECTED | CANCELLED"
        string decidedById FK "nullable"
    }
    RFQ_MESSAGE {
        string id PK
        string rfqId FK
        string authorId FK
        text body
    }
    ORDER {
        string id PK
        string sourceQuoteId "loose, unique"
        string status
    }
```

### 2.3 Payments, payouts, disputes, recurring & settings substrate

```mermaid
erDiagram
    ORDER ||--|| PAYMENT : "settled by (1:1)"
    USER |o--o{ PAYMENT : "captures (admin)"
    USER ||--o{ PAYOUT : "settled to (seller)"
    PAYOUT ||--o{ ORDER_ITEM : "sweeps unsettled items"
    ORDER ||--o{ DISPUTE : "disputed via"
    USER ||--o{ DISPUTE : "raised by (buyer)"
    USER ||--o{ DISPUTE : "against (seller)"
    USER |o--o{ DISPUTE : "resolved by (admin)"
    USER ||--o{ RECURRING_RFQ : owns
    RECURRING_RFQ ||..o{ RFQ : "spawns (loose sourceRecurringId)"
    USER ||--o{ NOTIFICATION : receives
    USER ||--o{ MEDIA_ASSET : uploads
    USER ||--o{ SETTING_CHANGE : "records"
    AUDIT_LOG }o..o| USER : "actorId (loose, nullable)"
    RFQ_SETTING }o..o| USER : "updatedById (loose, nullable)"
    SETTING_CHANGE }o..|| SETTING_CHANGE : "rollbackOfId (loose)"
    DISPUTE }o..|| RFQ : "rfqId context (loose)"
    RECURRING_RFQ }o..o| ORGANIZATION : "orgId (loose, nullable)"
    QUOTE ||..o| ORDER : "sourceQuoteId (loose, unique)"

    PAYMENT {
        string id PK
        string orderId FK "unique"
        string method "CARD | BANK_TRANSFER | INVOICE"
        string status "PENDING | SUCCEEDED | FAILED | CANCELLED"
        decimal amount
        datetime dueAt "INVOICE NET-terms"
        string capturedById FK "nullable"
    }
    PAYOUT {
        string id PK
        string number UK "PY-YYYY-NNNNNN"
        string sellerId FK
        string status "PENDING | PAID | CANCELLED"
        decimal grossAmount
        float commissionRate "snapshot"
        decimal commission
        decimal netAmount
    }
    ORDER_ITEM {
        string id PK
        string payoutId FK "set-once, nullable"
        string sellerId FK
    }
    DISPUTE {
        string id PK
        string number UK "DSP-YYYY-NNNNNN"
        string orderId FK
        string raisedById FK
        string sellerId FK
        string reason "7-value enum"
        string status "6-value enum"
        string outcome "6-value enum, nullable"
        datetime escalateAt
    }
    RECURRING_RFQ {
        string id PK
        string userId FK
        string frequency "5-value enum"
        datetime nextRunAt
        bool active
        int emptyCycles
    }
    NOTIFICATION {
        string id PK
        string userId FK
        string type "10-value enum"
        string linkView "rfq | orders | business | seller"
        datetime readAt
    }
    MEDIA_ASSET {
        string id PK
        string key UK
        string sha256 UK
        string variants "LEGACY-JSON"
        string uploadedById FK
    }
    AUDIT_LOG {
        string id PK
        string actorId "loose, nullable"
        string actorType "USER | SELLER | ADMIN | SYSTEM"
        string action
        string entityType
        string entityId
        json metadata "LEGACY-JSON"
    }
    RFQ_SETTING {
        string id PK
        string key "panel key"
        string scopeType "PLATFORM | ORG_TYPE | ORG | CATEGORY | REGION"
        string scopeId "empty at platform scope"
        string value "LEGACY-JSON document"
    }
    SETTING_CHANGE {
        string id PK
        string settingKey
        string field
        string userId FK
        string rollbackOfId "loose"
    }
    PLATFORM_SETTING {
        string key PK
        string value "LEGACY-JSON document"
    }
    SEQUENCE {
        string key PK
        int value
    }
    BANNER_SLIDE {
        string id PK
        int position
        bool active
    }
    COUPON {
        string id PK
        string code UK
        int percentOff
        bool active
    }
    RFQ {
        string id PK
        string number UK
    }
    USER {
        string id PK
    }
    ORGANIZATION {
        string id PK
    }
    QUOTE {
        string id PK
    }
```

### 2.4 Financing domain (PLANNED — every entity below is NOT in the database yet)

> Caption: **ALL 17 entities in this diagram are PLANNED** (source: `team/FINANCIER_SCHEMA.md`
> v4.0, owner-gated). Only `ORGANIZATION`, `USER` and `MEDIA_ASSET` are existing substrate,
> referenced without duplication (R-2/R-3). Field names are verbatim from FINANCIER_SCHEMA v4.0.
> Zero Json columns anywhere in this domain (R-1 / DP-18).

```mermaid
erDiagram
    ORGANIZATION ||--|| FINANCIER_PROFILE : "1:1 legal entity"
    FINANCIER_PROFILE ||--o{ FINANCIER_BRANCH : has
    FINANCIER_PROFILE ||--o{ FINANCING_PRODUCT : offers
    FINANCING_PRODUCT ||--|{ FINANCING_PRODUCT_ATTRIBUTE : "features / eligibility"
    FINANCING_PRODUCT ||--|{ FINANCING_PRODUCT_REQUIREMENT : "collateral / documents"
    FINANCING_PRODUCT ||--|{ FINANCING_PRODUCT_COVERAGE : "geographic coverage"
    ORGANIZATION |o--o{ FINANCING_REQUEST : "applicant org (nullable, DP-13)"
    USER ||--o{ FINANCING_REQUEST : "created by"
    FINANCING_PRODUCT |o--o{ FINANCING_REQUEST : "direct target (optional)"
    FINANCING_REQUEST ||..o| QUOTE : "targetId (loose)"
    FINANCING_REQUEST ||..o| ORDER : "targetId (loose)"
    FINANCING_REQUEST ||..o| RFQ_LINE : "targetId (loose)"
    FINANCING_REQUEST ||--o{ FINANCING_REQUEST_INVITE : "BUYER_SELECTED distribution"
    ORGANIZATION ||--o{ FINANCING_REQUEST_INVITE : "invited financier"
    FINANCING_REQUEST ||--o{ APPLICANT_DOCUMENT : "request evidence"
    USER ||--o{ APPLICANT_DOCUMENT : "owns (KYC scope)"
    APPLICANT_DOCUMENT }o--|| MEDIA_ASSET : "mediaId (one storage subsystem)"
    USER |o--o{ APPLICANT_DOCUMENT : "reviewed by"
    FINANCING_REQUEST ||--o{ FINANCING_OFFER : receives
    USER ||--o{ FINANCING_OFFER : "issued by (financier staff)"
    FINANCING_OFFER ||--|{ FINANCING_OFFER_INSTALLMENT : schedules
    FINANCING_OFFER ||--|| FINANCING_AGREEMENT : "accepted offer (1:1)"
    FINANCING_AGREEMENT ||--o{ FINANCING_EVENT : "track-only ledger"
    FINANCING_AGREEMENT ||--o{ FINANCING_FEE : "platform commission"
    USER |o--o{ FINANCING_EVENT : "reported by"
    FINANCIER_PROFILE ||--o{ ACCREDITATION_PROGRAM : runs
    ACCREDITATION_PROGRAM ||--|{ ACCREDITATION_CRITERION : defines
    ACCREDITATION_PROGRAM ||--o{ SUPPLIER_ACCREDITATION : issues
    ORGANIZATION ||--o{ SUPPLIER_ACCREDITATION : "supplier applies"
    SUPPLIER_ACCREDITATION |o--o{ APPLICANT_DOCUMENT : "accreditation evidence"
    USER ||--o{ SUPPLIER_ACCREDITATION : "submits"
    USER |o--o{ SUPPLIER_ACCREDITATION : "reviews"

    FINANCIER_PROFILE {
        string id PK
        string organizationId FK "unique, 1:1"
        text about
        string licenseNumber
        string regulator
        string logoUrl "MediaAsset-backed"
        string contactEmail
        string contactPhone
        decimal minTicket
        decimal maxTicket
        int viewCount
    }
    FINANCIER_BRANCH {
        string id PK
        string financierProfileId FK
        string name
        string kind "BRANCH | AGENT | ATM"
        string street
        string city
        string district
        decimal latitude
        decimal longitude
        bool isActive
    }
    FINANCING_PRODUCT {
        string id PK
        string financierProfileId FK
        string name
        string category "12-value taxonomy"
        string targetSegment "BUSINESS | INDIVIDUAL | BOTH"
        string status "ACTIVE | DRAFT | ARCHIVED"
        string currency "YER"
        decimal amountMin
        decimal amountMax
        string rateType "MURABAHA_ANNUAL | FIXED_ANNUAL | FLAT_FEE"
        decimal rateMax
        decimal feeFlat
        int tenorMinMonths
        int tenorMaxMonths
        string repaymentFrequency
        bool shariaCompliant
        int processingDays
        int viewCount
    }
    FINANCING_PRODUCT_ATTRIBUTE {
        string id PK
        string productId FK
        string kind "FEATURE | ELIGIBILITY_CONDITION"
        int position
        string text
    }
    FINANCING_PRODUCT_REQUIREMENT {
        string id PK
        string productId FK
        string kind "COLLATERAL_ACCEPTED | DOCUMENT_REQUIRED"
        string value "enum per kind"
    }
    FINANCING_PRODUCT_COVERAGE {
        string id PK
        string productId FK
        string regionName "normalized, case-insensitive match"
    }
    FINANCING_REQUEST {
        string id PK
        string number UK "FR-YYYY-NNNNNN via Sequence FIN"
        string organizationId FK "nullable"
        string createdById FK
        string productId FK "nullable"
        string targetType "WORKING_CAPITAL | QUOTE | ORDER | RFQ_LINE"
        string targetId "loose"
        string activityStatus "NEW | EXISTING"
        string activityName
        string activityCity
        string activityLocationType "OWNED | RENTED"
        string activityCategory
        string activityCategoryOther
        decimal capitalAmount
        decimal ownContributionAmount
        decimal monthlyInstallmentCapacity
        bool previousFinancing
        string otherIncomeSources
        decimal amountRequested
        string currency
        text purpose
        int tenorRequestedMonths
        string guaranteeType "8-value enum"
        string guaranteeStatus "4-value enum"
        text applicantNotes
        datetime consentAt
        string distributionMode "OPEN | BUYER_SELECTED"
        string status "10-value enum"
        datetime expiresAt
    }
    FINANCING_REQUEST_INVITE {
        string id PK
        string requestId FK
        string organizationId FK "invited financier org"
    }
    APPLICANT_DOCUMENT {
        string id PK
        string userId FK "owner/uploader, always set"
        string requestId FK "null = user-level KYC"
        string accreditationId FK "null unless accreditation evidence"
        string mediaId FK "THE storage entry"
        string type "11-value enum, scope-dependent"
        string status "PENDING | VERIFIED | REJECTED"
        string reviewedById FK "nullable"
        datetime reviewedAt
        text note
    }
    FINANCING_OFFER {
        string id PK
        string requestId FK
        string createdById FK "financier staff"
        decimal amount
        string currency
        string rateType
        decimal ratePercent
        decimal feeFlat
        int tenorMonths
        string collateralRequired
        datetime validUntil
        string status "DRAFT | SENT | ACCEPTED | DECLINED | EXPIRED | WITHDRAWN"
        datetime sentAt
        datetime acceptedAt
    }
    FINANCING_OFFER_INSTALLMENT {
        string id PK
        string offerId FK
        int installmentNo
        datetime dueDate
        decimal amount
    }
    FINANCING_AGREEMENT {
        string id PK
        string number UK "AGR-YYYY-NNNNNN via Sequence AGR"
        string offerId FK "unique, the ACCEPTED offer"
        string fundingStatus "PENDING | REPORTED_FUNDED | REPORTED_SETTLED"
        string status "ACTIVE | COMPLETED | DEFAULTED | CANCELLED"
        datetime acceptedAt
        datetime fundedReportedAt
        datetime settledReportedAt
    }
    FINANCING_EVENT {
        string id PK
        string agreementId FK
        string type "DISBURSEMENT | REPAYMENT | EARLY_SETTLEMENT | LATE_FEE | NOTE"
        datetime eventDate
        decimal amount
        string reportedById FK "nullable, financier staff"
    }
    FINANCING_FEE {
        string id PK
        string agreementId FK
        string type "SUCCESS | ORIGINATION | ACCREDITATION"
        decimal baseAmount
        decimal percentApplied "snapshot"
        decimal amount
        string status "ACCRUED | INVOICED | PAID | WAIVED"
    }
    ACCREDITATION_PROGRAM {
        string id PK
        string financierProfileId FK
        string name
        decimal feeAmount
        int validMonths
        bool active
    }
    SUPPLIER_ACCREDITATION {
        string id PK
        string programId FK
        string organizationId FK "supplier org"
        string status "PENDING | UNDER_REVIEW | VERIFIED | REJECTED | EXPIRED"
        string submittedById FK
        string reviewedById FK
        datetime verifiedAt
        datetime expiresAt
    }
    ACCREDITATION_CRITERION {
        string id PK
        string programId FK
        string kind "REQUIRED_DOCUMENT | MIN_TENURE_MONTHS | MIN_MONTHLY_REVENUE | MANUAL_CHECK"
        string value "typed per kind"
        string label
        int position
    }
```

---

## 3. Relationship inventory

### 3.1 EXISTING — Prisma-enforced foreign keys

| # | From (field) | To | Cardinality | onDelete | Semantics |
|---|---|---|---|---|---|
| 1 | `Product.categoryId` | `Category.id` | N:1 (required) | Restrict (default) | Product belongs to one category |
| 2 | `Product.sellerId` | `User.id` | N:1 (required) | Restrict (default) | Owning seller |
| 3 | `Order.buyerId` | `User.id` | N:1 (required) | Restrict (default) | Buying user |
| 4 | `Order.organizationId` | `Organization.id` | N:1 (optional) | SetNull (default) | B2B purchasing org context |
| 5 | `OrderItem.orderId` | `Order.id` | N:1 (required) | Cascade | Order line |
| 6 | `OrderItem.productId` | `Product.id` | N:1 (required) | Restrict (default) | Ordered product |
| 7 | `OrderItem.payoutId` | `Payout.id` | N:1 (optional) | SetNull (default) | Set-once settlement link (see §4) |
| 8 | `ProductVariant.productId` | `Product.id` | N:1 (required) | Cascade | Variant of product |
| 9 | `Review.productId` | `Product.id` | N:1 (required) | Cascade | Reviewed product |
| 10 | `Review.userId` | `User.id` | N:1 (required) | Restrict (default) | Review author |
| 11 | `Favorite.userId` | `User.id` | N:1 (required) | Restrict (default) | Favoriting user |
| 12 | `Favorite.productId` | `Product.id` | N:1 (required) | Cascade | Favorited product |
| 13 | `OrganizationMember.organizationId` | `Organization.id` | N:1 (required) | Cascade | Membership |
| 14 | `OrganizationMember.userId` | `User.id` | N:1 (required) | Cascade | Member user |
| 15 | `PriceList.organizationId` | `Organization.id` | N:1 (optional) | Cascade (explicit) | ORG-scope contract list |
| 16 | `PriceList.customerGroupId` | `CustomerGroup.id` | N:1 (optional) | Cascade (explicit) | GROUP-scope list |
| 17 | `PriceListEntry.priceListId` | `PriceList.id` | N:1 (required) | Cascade | Ladder entry |
| 18 | `PriceListEntry.productId` | `Product.id` | N:1 (required) | Cascade | Priced product |
| 19 | `Rfq.userId` | `User.id` | N:1 (required) | Restrict (default) | Requesting user |
| 20 | `Rfq.organizationId` | `Organization.id` | N:1 (optional) | SetNull (default) | Org context for settings resolution |
| 21 | `RfqLine.rfqId` | `Rfq.id` | N:1 (required) | Cascade | RFQ line |
| 22 | `RfqLine.productId` | `Product.id` | N:1 (optional) | SetNull (default) | Catalog reference; null = free item |
| 23 | `Quote.rfqId` | `Rfq.id` | N:1 (required) | Cascade | Quote answers RFQ |
| 24 | `Quote.createdById` | `User.id` | N:1 (required) | Restrict (default) | Issuing admin/seller |
| 25 | `ApprovalRequest.organizationId` | `Organization.id` | N:1 (required) | Cascade | Approving org |
| 26 | `ApprovalRequest.orderId` | `Order.id` | 1:1 (optional) | SetNull (default) | ORDER-type gate; unique |
| 27 | `ApprovalRequest.quoteId` | `Quote.id` | 1:1 (optional) | SetNull (default) | QUOTE_ACCEPT-type gate; unique |
| 28 | `ApprovalRequest.requesterId` | `User.id` | N:1 (required) | Restrict (default) | Requesting member |
| 29 | `ApprovalRequest.decidedById` | `User.id` | N:1 (optional) | SetNull (default) | Deciding member (≠ requester) |
| 30 | `QuoteLine.quoteId` | `Quote.id` | N:1 (required) | Cascade | Quote line |
| 31 | `QuoteLine.rfqLineId` | `RfqLine.id` | N:1 (optional) | SetNull (default) | Answered RFQ line |
| 32 | `QuoteLine.productId` | `Product.id` | N:1 (required) | Restrict (default) | Quoted product |
| 33 | `Notification.userId` | `User.id` | N:1 (required) | Cascade | Recipient |
| 34 | `RfqMessage.rfqId` | `Rfq.id` | N:1 (required) | Cascade | Negotiation thread |
| 35 | `RfqMessage.authorId` | `User.id` | N:1 (required) | Restrict (default) | Message author |
| 36 | `MediaAsset.uploadedById` | `User.id` | N:1 (required) | Restrict (default) | Uploader |
| 37 | `Dispute.orderId` | `Order.id` | N:1 (required) | Restrict (default) | Disputed order |
| 38 | `Dispute.raisedById` | `User.id` | N:1 (required) | Restrict (default) | Buyer (or admin for them) |
| 39 | `Dispute.sellerId` | `User.id` | N:1 (required) | Restrict (default) | Disputed seller |
| 40 | `Dispute.resolvedById` | `User.id` | N:1 (optional) | SetNull (default) | Mediating admin |
| 41 | `RecurringRfq.userId` | `User.id` | N:1 (required) | Restrict (default) | Schedule owner |
| 42 | `Payment.orderId` | `Order.id` | 1:1 (required) | Cascade | The order's payment |
| 43 | `Payment.capturedById` | `User.id` | N:1 (optional) | SetNull (default) | Admin who captured |
| 44 | `Payout.sellerId` | `User.id` | N:1 (required) | Restrict (default) | Settled seller |
| 45 | `SettingChange.userId` | `User.id` | N:1 (required) | Restrict (default) | Admin who changed a setting |

Implicit many-to-many (Prisma-managed join tables, no cascade semantics documented at field level):
`User ↔ CustomerGroup` (relation "UserCustomerGroups") and `Organization ↔ CustomerGroup`
(relation "OrganizationCustomerGroups").

### 3.2 EXISTING — loose string references (no DB constraint; enforced in service code)

| From (field) | To | Semantics |
|---|---|---|
| `Order.sourceQuoteId` (unique) | `Quote.id` | The quote whose acceptance produced this order; one order per quote, ever |
| `Rfq.sourceRecurringId` | `RecurringRfq.id` | The schedule whose lazy sweep spawned this run |
| `RfqLine.variantId` | `ProductVariant.id` | Referenced catalog variant |
| `QuoteLine.variantId` | `ProductVariant.id` | Quoted variant |
| `ApprovalRequest.rfqId` | `Rfq.id` | Owning RFQ context for QUOTE_ACCEPT approvals |
| `Dispute.rfqId` | `Rfq.id` | RFQ context when the order came from a quote |
| `RecurringRfq.organizationId` | `Organization.id` | Org context for settings resolution |
| `RecurringRfq.lastRfqId` | `Rfq.id` | Most recently spawned RFQ |
| `AuditLog.actorId` | `User.id` | Acting user; null = SYSTEM |
| `RfqSetting.updatedById` | `User.id` | Last editor (no relation declared) |
| `SettingChange.rollbackOfId` | `SettingChange.id` | Change this row reverts |

### 3.3 PLANNED — financier domain (NOT in the database yet)

| # | From (field) | To | Cardinality | onDelete | Semantics |
|---|---|---|---|---|---|
| 1 | `FinancierProfile.organizationId` (unique) | `Organization.id` | 1:1 (required) | Cascade | The financier legal entity (BANK/MFI/EWALLET) |
| 2 | `FinancierBranch.financierProfileId` | `FinancierProfile.id` | N:1 (required) | Cascade | Branch/agent/ATM of financier |
| 3 | `FinancingProduct.financierProfileId` | `FinancierProfile.id` | N:1 (required) | Cascade | Product catalog entry |
| 4 | `FinancingProductAttribute.productId` | `FinancingProduct.id` | N:1 (required) | Cascade | Feature / eligibility bullet |
| 5 | `FinancingProductRequirement.productId` | `FinancingProduct.id` | N:1 (required) | Cascade | Collateral/document requirement |
| 6 | `FinancingProductCoverage.productId` | `FinancingProduct.id` | N:1 (required) | Cascade | Covered region name |
| 7 | `FinancingRequest.organizationId` | `Organization.id` | N:1 (optional) | — (unset in v4.0) | Applicant org; null = individual (DP-13) |
| 8 | `FinancingRequest.createdById` | `User.id` | N:1 (required) | — | Submitting user |
| 9 | `FinancingRequest.productId` | `FinancingProduct.id` | N:1 (optional) | — | Direct product application; null = open request |
| 10 | `FinancingRequestInvite.requestId` | `FinancingRequest.id` | N:1 (required) | Cascade | Distribution row |
| 11 | `FinancingRequestInvite.organizationId` | `Organization.id` | N:1 (required) | — | Invited financier org |
| 12 | `ApplicantDocument.userId` | `User.id` | N:1 (required) | Cascade | Owner/uploader — always set |
| 13 | `ApplicantDocument.requestId` | `FinancingRequest.id` | N:1 (optional) | Cascade | Null = user-level KYC |
| 14 | `ApplicantDocument.accreditationId` | `SupplierAccreditation.id` | N:1 (optional) | — | Accreditation evidence scope |
| 15 | `ApplicantDocument.mediaId` | `MediaAsset.id` | N:1 (required) | — | THE storage entry (DP-19) |
| 16 | `ApplicantDocument.reviewedById` | `User.id` | N:1 (optional) | — | Verifying staff user |
| 17 | `FinancingOffer.requestId` | `FinancingRequest.id` | N:1 (required) | Cascade | Offer answers request |
| 18 | `FinancingOffer.createdById` | `User.id` | N:1 (required) | — | Financier staff (via OrganizationMember, DP-1) |
| 19 | `FinancingOfferInstallment.offerId` | `FinancingOffer.id` | N:1 (required) | Cascade | Proposed schedule row |
| 20 | `FinancingAgreement.offerId` (unique) | `FinancingOffer.id` | 1:1 (required) | — | The accepted offer; NO snapshot (DP-20) |
| 21 | `FinancingEvent.agreementId` | `FinancingAgreement.id` | N:1 (required) | Cascade | Track-only ledger entry |
| 22 | `FinancingEvent.reportedById` | `User.id` | N:1 (optional) | — | Reporting financier staff |
| 23 | `FinancingFee.agreementId` | `FinancingAgreement.id` | N:1 (required) | Cascade | Platform commission row |
| 24 | `AccreditationProgram.financierProfileId` | `FinancierProfile.id` | N:1 (required) | Cascade | Program owner |
| 25 | `AccreditationCriterion.programId` | `AccreditationProgram.id` | N:1 (required) | Cascade | Checklist criterion |
| 26 | `SupplierAccreditation.programId` | `AccreditationProgram.id` | N:1 (required) | Cascade | Application to program |
| 27 | `SupplierAccreditation.organizationId` | `Organization.id` | N:1 (required) | — | Supplier org applying |
| 28 | `SupplierAccreditation.submittedById` | `User.id` | N:1 (required) | — | Submitting member |
| 29 | `SupplierAccreditation.reviewedById` | `User.id` | N:1 (optional) | — | Reviewing staff |
| 30 | `FinancingRequest.targetId` (loose) | `Quote/Order/RfqLine.id` | N:1 (optional) | n/a | What the financing is for (Dispute pattern) |

"—" = onDelete not specified in FINANCIER_SCHEMA v4.0; Prisma defaults would apply (Restrict for
required, SetNull for optional).

---

## 4. Business invariants expressed as data rules

Owner-set invariants (DECISIONS.md) are marked D-xxx; financier ruling points DP-xxx.

1. **D-001 / D-002 — Orchestrator, never merchant of record.** No table holds buyer→vendor funds.
   `Payment` records expected external money per order; `Payout` records external settlement;
   `FinancingFee` is invoiced externally and only marked PAID by an admin. PLANNED
   `FinancingAgreement.fundingStatus` is REPORTED_* precisely because the platform never holds funds.
2. **Commission on success.** `FinancingFee` accrues at request ACCEPTED (type SUCCESS);
   `Payout.commission = commissionRate (snapshot) × grossAmount`; rate source = `User.commissionRate`
   override, else `PlatformSetting` key `payouts` (0–90%, zod-validated). Snapshots, never re-derived.
3. **D-003 — No multi-tenancy.** No tenantId column exists on any of the 32 models; none may be added.
4. **D-006 — Atomic numbering.** Every business number comes from `Sequence` via the service:
   RFQ (`Rfq.number`), QTE (`Quote.number`), DSP (`Dispute.number`), PY (`Payout.number`),
   format `PREFIX-YYYY-NNNNNN`. PLANNED additions: FIN → `FinancingRequest.number` (FR-),
   AGR → `FinancingAgreement.number`. Client-side counters are forbidden.
5. **D-011 — No cron.** `Rfq.expiresAt`, `Quote.validUntil`, `Dispute.escalateAt`,
   `RecurringRfq.nextRunAt` (and PLANNED `FinancingRequest.expiresAt`) are all consumed by lazy
   sweeps triggered on traffic — never by timers.
6. **OrderItem.payoutId is set-once.** Payout eligibility selects items where `payoutId IS NULL` AND
   order status ≠ CANCELLED AND order payment SUCCEEDED. Once attached, an item never re-settles.
7. **Quote→Order is unique.** `Order.sourceQuoteId` is unique — one order per quote, ever.
   Conversion atomically sets `Quote.status = CONVERTED` + `Rfq.status = ORDERED`; accepting a quote
   auto-declines sibling quotes and closes the RFQ.
8. **ApprovalRequest requester ≠ decider.** BUYER-role members trigger; OWNER/ADMIN/APPROVER decide;
   self-approval is impossible by construction. `orderId`/`quoteId` are unique — exactly one
   approval gate per order/quote; trigger condition: amount ≥ `Organization.approvalThreshold`.
9. **FinancingAgreement is 1:1 with an offer.** `offerId` unique; no terms snapshot — the accepted
   offer and its installment rows are frozen instead (DP-20).
10. **Single entry per data point (financier domain, R-2).** Applicant personal data lives only on
    `User` (12 additive nullable columns); KYC documents once at user level
    (`ApplicantDocument.requestId IS NULL`); per-application facts only on `FinancingRequest`;
    money schedules only on the offer; status history only in `AuditLog`/`Notification` (DP-15).
11. **Zero JSON in the financier domain (R-1 / DP-18).** All 17 planned models have zero Json
    columns — every list is a child table (`FinancingProductAttribute/Requirement/Coverage`,
    `FinancingOfferInstallment`, `FinancingRequestInvite`), every address is typed scalars.
    Legacy Json columns elsewhere are FROZEN (see `06-data-dictionary.md` appendix).
12. **One storage subsystem (DP-19).** `ApplicantDocument.mediaId → MediaAsset` — no
    storageKey/fileName/size duplication anywhere.
13. **Purchase-time snapshots.** `OrderItem.title/image/variantName`, `RfqLine.productName/variantName`,
    `QuoteLine.variantName`, `Payout.commissionRate` — display/settlement data is frozen at write
    time against later catalog edits.
14. **Uniqueness contract set.** `Review (productId,userId)`, `Favorite (userId,productId)`,
    `OrganizationMember (organizationId,userId)`, `PriceListEntry (priceListId,productId,minQuantity)`,
    `RfqSetting (key,scopeType,scopeId)`, PLANNED `FinancingRequestInvite (requestId,organizationId)`,
    `FinancingOfferInstallment (offerId,installmentNo)`, `FinancingProductAttribute
    (productId,kind,position)`, `FinancingProductRequirement (productId,kind,value)`,
    `FinancingProductCoverage (productId,regionName)`, `SupplierAccreditation (programId,organizationId)`.
15. **Media integrity.** `MediaAsset.sha256` unique — content-level dedupe; deletes are
    reference-checked by the storage pipeline.
16. **Settings history survives deletion.** `SettingChange` is deliberately NOT FK-linked to
    `RfqSetting`; rollback (`rollbackOfId`) is itself logged.

---

## 5. State machines

Statuses are verbatim from the schema comments; transitions are verified against the service
layer (`src/server/modules/*`, `src/app/api/orders/[id]/route.ts`). Terminal states in each
diagram end the flow.

### 5.1 RFQ (`Rfq.status`) — transition table in `src/server/modules/rfq/service.ts`

```mermaid
stateDiagram-v2
    [*] --> DRAFT
    DRAFT --> SUBMITTED : submit (buyer)
    DRAFT --> CANCELLED : cancel (requester)
    SUBMITTED --> UNDER_REVIEW : review (admin)
    SUBMITTED --> REJECTED : reject (admin)
    SUBMITTED --> CANCELLED : cancel (requester)
    SUBMITTED --> QUOTED : quote issued (before review)
    UNDER_REVIEW --> QUOTED : quote issued
    UNDER_REVIEW --> REJECTED : reject (admin)
    QUOTED --> ACCEPTED : buyer accepts a quote (siblings auto-decline)
    QUOTED --> REJECTED : reject (admin)
    QUOTED --> CANCELLED : cancel (requester)
    QUOTED --> EXPIRED : lazy sweep (expiresAt, or all quotes expired)
    ACCEPTED --> ORDERED : convert (order created via sourceQuoteId)
    ORDERED --> [*]
    REJECTED --> [*]
    CANCELLED --> [*]
    EXPIRED --> [*]
```

### 5.2 Quote (`Quote.status`)

```mermaid
stateDiagram-v2
    [*] --> SENT : issued (no review needed)
    [*] --> PENDING_REVIEW : issued (review needed)
    PENDING_REVIEW --> SENT : admin approves (released to buyer)
    PENDING_REVIEW --> REJECTED : admin rejects (internal)
    SENT --> ACCEPTED : buyer accepts (siblings auto-decline)
    SENT --> DECLINED : buyer declines
    SENT --> EXPIRED : validUntil passed (lazy sweep)
    SENT --> WITHDRAWN : seller/admin withdraws
    ACCEPTED --> CONVERTED : order created
    CONVERTED --> [*]
    DECLINED --> [*]
    REJECTED --> [*]
    EXPIRED --> [*]
    WITHDRAWN --> [*]
```

(`DRAFT` exists in the enum for future use; the issue path currently creates SENT or
PENDING_REVIEW directly.)

### 5.3 Order (`Order.status`) — `src/app/api/orders/[id]/route.ts`, approvals/payments services

```mermaid
stateDiagram-v2
    [*] --> PAID : checkout CARD (simulated gateway)
    [*] --> PENDING_PAYMENT : checkout BANK_TRANSFER
    [*] --> PENDING_APPROVAL : checkout at/above org approvalThreshold
    PENDING_APPROVAL --> PENDING_PAYMENT : approval APPROVED
    PENDING_APPROVAL --> CANCELLED : approval REJECTED
    PENDING_PAYMENT --> PAID : payment SUCCEEDED (capture)
    PENDING_PAYMENT --> CANCELLED : buyer cancel (restock, void payment)
    PAID --> CANCELLED : buyer cancel (restock, void pending payment)
    PENDING_APPROVAL --> CANCELLED : buyer cancel (restock, void)
    PAID --> PROCESSING : seller advances fulfillment
    PROCESSING --> SHIPPED : seller advances fulfillment
    SHIPPED --> DELIVERED : seller advances fulfillment
    DELIVERED --> [*]
    CANCELLED --> [*]
```

Note: fulfillment advances strictly one step along PAID→PROCESSING→SHIPPED→DELIVERED; quote
conversion creates the order directly at PROCESSING (B2B invoiced, payment on terms).

### 5.4 Payment (`Payment.status`) — `src/server/modules/payments/service.ts`

```mermaid
stateDiagram-v2
    [*] --> PENDING : ensurePayment (row exists exactly when money expected)
    PENDING --> SUCCEEDED : CARD inline / admin capture (flips order to PAID)
    PENDING --> FAILED : admin marks failed (note)
    PENDING --> CANCELLED : order cancelled (pending payment voided)
    SUCCEEDED --> [*]
    FAILED --> [*]
    CANCELLED --> [*]
```

### 5.5 Payout (`Payout.status`) — `src/server/modules/payouts/service.ts`

```mermaid
stateDiagram-v2
    [*] --> PENDING : generated from eligible items (payment SUCCEEDED, payoutId NULL, order not CANCELLED)
    PENDING --> PAID : admin marks paid (external transfer confirmed)
    PENDING --> CANCELLED : admin cancels with reason (items released for re-sweep)
    PAID --> [*]
    CANCELLED --> [*]
```

### 5.6 Dispute (`Dispute.status`) — lifecycle comment in `src/server/modules/rfq/disputes.ts`

```mermaid
stateDiagram-v2
    [*] --> OPEN : buyer raises (order in flight/delivered)
    OPEN --> SELLER_RESPONDED : seller responds (sellerResponseDays window)
    OPEN --> ESCALATED : autoEscalateDays elapsed (escalateAt, lazy sweep)
    SELLER_RESPONDED --> ESCALATED : response window elapsed unresolved
    OPEN --> RESOLVED : admin outcome
    SELLER_RESPONDED --> RESOLVED : admin outcome
    ESCALATED --> RESOLVED : admin outcome
    RESOLVED --> CLOSED : admin closes
    OPEN --> CANCELLED : buyer withdraws (buyerCancelOwn)
    CLOSED --> [*]
    CANCELLED --> [*]
```

### 5.7 PLANNED — FinancingRequest (`FinancingRequest.status`) — FINANCIER_SCHEMA §3.5/§5

```mermaid
stateDiagram-v2
    [*] --> DRAFT : wizard in progress
    DRAFT --> SUBMITTED : submit (consentAt stamped)
    SUBMITTED --> UNDER_REVIEW : financier credit analysis
    UNDER_REVIEW --> INFO_REQUESTED : financier asks for missing docs/info
    INFO_REQUESTED --> UNDER_REVIEW : docs supplied
    UNDER_REVIEW --> OFFERED : approval materializes as a FinancingOffer
    OFFERED --> ACCEPTED : buyer accepts one offer (siblings auto-decline, FinancingFee accrues)
    OFFERED --> DECLINED_ALL : buyer declines every offer
    SUBMITTED --> EXPIRED : lazy sweep at expiresAt (competitor auto-rejected)
    UNDER_REVIEW --> EXPIRED : lazy sweep at expiresAt
    INFO_REQUESTED --> EXPIRED : lazy sweep at expiresAt
    OFFERED --> EXPIRED : lazy sweep at expiresAt
    DRAFT --> CANCELLED : applicant cancels pre-acceptance
    SUBMITTED --> CANCELLED : applicant cancels pre-acceptance
    UNDER_REVIEW --> CANCELLED : applicant cancels pre-acceptance
    INFO_REQUESTED --> CANCELLED : applicant cancels pre-acceptance
    OFFERED --> WITHDRAWN : post-offer withdrawal
    ACCEPTED --> [*]
    DECLINED_ALL --> [*]
    EXPIRED --> [*]
    CANCELLED --> [*]
    WITHDRAWN --> [*]
```

### 5.8 PLANNED — FinancingOffer (`FinancingOffer.status`)

```mermaid
stateDiagram-v2
    [*] --> DRAFT : financier drafts terms
    DRAFT --> SENT : sent to applicant
    SENT --> ACCEPTED : applicant accepts (offer + installments frozen; agreement created)
    SENT --> DECLINED : applicant declines
    SENT --> EXPIRED : validUntil passed
    SENT --> WITHDRAWN : financier withdraws
    ACCEPTED --> [*]
    DECLINED --> [*]
    EXPIRED --> [*]
    WITHDRAWN --> [*]
```

### 5.9 PLANNED — FinancingAgreement `fundingStatus` (financier-reported, D-002) and `status`

```mermaid
stateDiagram-v2
    [*] --> PENDING : agreement created from accepted offer
    PENDING --> REPORTED_FUNDED : financier reports disbursement (+ FinancingEvent DISBURSEMENT)
    REPORTED_FUNDED --> REPORTED_SETTLED : financier reports final repayment
    REPORTED_SETTLED --> [*]
```

```mermaid
stateDiagram-v2
    [*] --> ACTIVE : agreement created
    ACTIVE --> COMPLETED : reported repayment events reach schedule end
    ACTIVE --> DEFAULTED : financier reports default
    ACTIVE --> CANCELLED : cancelled pre-funding
    COMPLETED --> [*]
    DEFAULTED --> [*]
    CANCELLED --> [*]
```

---

## 6. Traceability chains

### 6.1 EXISTING — the commerce chain

```
Rfq (RFQ-YYYY-NNNNNN)
 └─ RfqLine (productId nullable / free text, targetPrice)
     └─ Quote (QTE-…) ── QuoteLine ── answers RfqLine
         │   validUntil window · money Decimal(12,2) · optional paymentTerms (NET-30)
         ├─ ApprovalRequest (type QUOTE_ACCEPT, amount ≥ org threshold, requester ≠ decider)
         └─ Order (sourceType=RFQ, sourceQuoteId unique → Quote, poNumber, paymentTerms)
              │   Quote flips CONVERTED · Rfq flips ORDERED (siblings auto-declined)
              ├─ OrderItem (title/image/variantName snapshots, sellerId split)
              │    └─ Payout (PY-…) — set-once payoutId; commission snapshot;
              │         rate = User.commissionRate ?? PlatformSetting 'payouts'
              ├─ Payment (1:1; CARD | BANK_TRANSFER | INVOICE; SUCCEEDED → Order PAID)
              └─ Dispute (DSP-…; rfqId loose context; escalateAt lazy sweep)
Side rails: AuditLog (every transition) · Notification (RFQ_*/APPROVAL_* events) ·
            RecurringRfq → spawns Rfq runs (sourceRecurringId, lazy sweep at nextRunAt)
B2C entry: cart → Order (sourceType=CART) joins the chain at Order.
```

Every hop writes an `AuditLog` row; user-visible hops emit `Notification`s. `Sequence` numbers the
four artifact kinds atomically (D-006).

### 6.2 PLANNED — the financing chain (owner-gated)

```
User (applicant profile — 12 additive nullable columns, single entry)
 └─ FinancingRequest (FR-YYYY-NNNNNN via Sequence FIN)
      │   targetType WORKING_CAPITAL | QUOTE | ORDER | RFQ_LINE → targetId (loose FK)
      │   typed ACTIVITY / UNDERWRITING / GUARANTEE columns; consentAt stamped at submit
      ├─ ApplicantDocument (user-scope KYC once; request-scope evidence) → MediaAsset (mediaId)
      ├─ FinancingRequestInvite (BUYER_SELECTED distribution rows → Organization)
      └─ FinancingOffer (per financier; rateType/ratePercent/feeFlat/tenorMonths)
           ├─ FinancingOfferInstallment (installmentNo, dueDate, amount)
           └─ acceptance → FinancingAgreement (AGR-YYYY-NNNNNN via Sequence AGR)
                 │   offerId unique, 1:1, NO snapshot — offer frozen instead (DP-20)
                 ├─ FinancingEvent (DISBURSEMENT | REPAYMENT | … — track-only, D-002)
                 │    fundingStatus PENDING → REPORTED_FUNDED → REPORTED_SETTLED
                 └─ FinancingFee (SUCCESS | ORIGINATION | ACCREDITATION; ACCRUED → INVOICED
                      → PAID/WAIVED — invoiced externally per D-001/D-002)
Substrate reuse: status history = AuditLog.summary + Notification (DP-15);
settings = RfqSetting 'financing' panels; staff access = OrganizationMember (DP-1).
Accreditation rail (Flow 4): AccreditationProgram → AccreditationCriterion (data) →
SupplierAccreditation (per supplier org) → ApplicantDocument evidence (same subsystem).
```

---

*End of document. Field-level definitions for every column of every model live in
`06-data-dictionary.md`.*
