# Vendora — FINANCIER DOMAIN SCHEMA v4.0 (zero-JSON · single-entry · substrate-reusing)

> THE data model for the financier module. Supersedes v3.0.
> **v4.0 exists because of two owner rulings (2026-09, verbatim intent):**
> 1. **"dont use any json data"** — v3.0 still had 10 Json columns. v4.0 has **ZERO**.
> 2. **"you dont use existing tables … you will duplicate data and tables"** — v3.0 re-implemented
>    storage (`ApplicantDocument.storageKey/fileName/size`), re-stored `Organization` facts on
>    `FinancierProfile` (legalName/website/status/verifiedAt) and `businessInfo.industry` which
>    already exists as `Organization.industry`. v4.0 **reuses the existing substrate everywhere a
>    fact already has a home** and adds only financier-specific facts.
>
> Evidence base (unchanged, field-level): owner's wizard walk-through + live authenticated
> extraction (`/api/profile`, `/api/fund-order/3763`, localStorage `userInfo`, wizard DOM option
> codes) + our codebase recon (schema.prisma, sequences, notifications, settings registry,
> MediaAsset/local-disk pipeline, AuditLog). This file is the schema layer of PLATFORM_PLAN P1.

---

## 1. Extraction evidence (what the competitor actually stores — retained from v3)

### 1.1 Provider profile page (public)
Name + logo + institution type · rich about · tabs About/Services/Agents&Branches/Success-Stories ·
contact email/phone/addresses · Leaflet map marker · branch & agent entries · visitor stats · products list.

### 1.2 Financing product detail page (public)
Name + owning provider · category taxonomy · description + features · murabaha annual cap 30% +
min 6-month repayment · eligibility conditions list · amountMin/amountMax in currency
(99,996 – 100,000,000 YER) · collateral-type enum (5) · geographic coverage (22 governorates) ·
auth-gated "طلب تمويل" CTA · service tags.

### 1.3 E-wallet providers (public)
E-wallets are first-class providers (Jeeb, Mobile Money) incl. payroll mass-payout services.

### 1.4 Content layer (public)
Success stories, news, education center, FAQ, privacy/terms. Deferred (DP-9).

### 1.5 Financing application wizard (auth-gated) — 3 steps, 22 controls
**Step 1 — personal data review + consent.** NOT a form: the applicant's profile renders
read-only from the account, one checkbox `info_agree` (data-transfer approval) + an **"Edit
profile"** button. Personal data is edited ONCE at account level and REFERENCED by every application.

**Step 2 — activity data and financing amount (22 controls, DOM order):**

| # | Wizard field | Control | Competitor code / options |
|---|---|---|---|
| 1 | Activity status (حالة النشاط) | select | `new` جديد · `existing` قائم |
| 2 | Capital (رأس المال) | text | free numeric |
| 3 | Installment capacity (القدرة على السداد) | text | free numeric (monthly) |
| 4 | Previous financing (تمويلات سابقة) | select | `false` لا · `true` نعم |
| 5 | Customer contribution to project | text | free numeric |
| 6 | Other income sources | text | free |
| 7 | Activity type (نوع النشاط) | select | 12 project · 13 rural · 14 green-energy · 15 housing · 16 fisheries · 1 other |
| 8 | Activity start date | date | optional — "leave empty if not started" |
| 9 | Activity name | text | e.g. بقالة "Grocery store" |
| 10 | Activity address | text | street |
| 11 | City (المدينة) | select | governorate lookup (1 Sana'a, 2 Aden, 3 Taiz, 4 Al-Hudaydah, 5 Amanat Al-Asimah, …) |
| 12 | District (المديرية) | select | depends on city (51 Old Sana'a, 52 Azal, 53 Al-Safia, …) |
| 13 | Activity description | textarea | free |
| 14 | Financing amount (مبلغ التمويل) | number | |
| 15 | Currency type | select | 179 Yemeni Rial (single option today) |
| 16 | Financing purpose (الغرض) | textarea | free text |
| 17 | Activity location type (نوع مكان النشاط) | select | `ownership` ملك · `rent` إيجار |
| 18 | Guarantee type (نوع الضمانة) | select | 59 personal · 345 bank · 346 gold · 347 commercial · 1 other |
| 19 | Guarantee status (حالة الضمانة) | select | 7 available · 8 partially · 9 unavailable · 1 other |
| 20 | Attachments (مرفقات) | file | optional multi — guarantee documents, studies, project files |
| 21 | Notes (ملاحظات) | textarea | free |
| 22 | Terms + privacy agreement | checkbox | required |

**Step 3 — review** of steps 1–2 grouped Personal / Residence / Identity / Activity + financing → submit
→ "My financing requests" with detail + "Cancel request".

### 1.6 Authenticated user model (localStorage `userInfo`, verbatim)
```json
{ "id": 5967, "name": "ali ali moh sa;",
  "first_name": "ali", "second_name": "ali", "third_name": "moh", "last_name": "sa;",
  "email": "nosopan860@dd2car.com", "phone": "772228289",
  "identity_type": "personalCard",
  "residence_type": { "slug": "own", "name": { "ar": "ملك", "en": "Own" } },
  "identity_attachment": ["https://ymp.ye/storage/…/….webp"],
  "national_identity": 10101254747,
  "marital_status": "single", "nationality": "يمني",
  "initial_data": { "birthday": "2000-08-10", "gender": "male", "address": "tah",
    "latitude": 1.1, "longitude": 1.1,
    "district_id": 52, "city_id": 5,
    "district": { "id": 52, "name": { "ar": "آزَاْل", "en": "Azal" } },
    "city": { "id": 5, "name": { "ar": "أمانة العاصمة", "en": "Amant Al-Asmah" } },
    "service_categories": [] },
  "whatsapp_number": null,
  "created_at": "2026-08-31T19:05:10Z",
  "image": "https://ymp.ye/storage/…/….webp" }
```
Login is by phone; profile page renders Personal data + Contact sections read-only.

### 1.7 Financing request API model (`/api/fund-order/3763`, verbatim, decoded)
```json
{ "data": {
  "id": 3763, "account_id": 5967, "provider_id": 3,
  "account":   { "id": 5967, "name": "ali ali moh sa;" },   // ← REFERENCE ONLY, no profile copy
  "provider":  { "id": 3,   "name": { "ar": "بنك الأمل…", "en": "Alamal Bank" } },
  "service":   { "id": 62,  "name": { "ar": "الأمل تمويل الكتروني", "en": "E-Loan" } },
  "project_title": "بقالة", "project_details": "بقالة",
  "project_starting_date": "2025-07-28", "project_address": "ش الرباط",
  "project_type":   { "id": 14, "name": { "ar": "تمويل الطاقة الخضراء", "en": "Green energy financing" } },
  "project_location_type": { "slug": "ownership", "name": { "ar": "ملك", "en": "Own" } },
  "district": { "id": 52, "name": { "ar": "آزَاْل", "en": "Azal" } },
  "city":     { "ar": "أمانة العاصمة", "en": "Amant Al-Asmah" },
  "amount": 500000,
  "currency": { "id": 64, "name": { "ar": "ريال يمني", "en": "Yemeni Riyal" },
                "minimum_amount": 30000, "maximum_amount": 500000 },
  "purpose": "زيادة الضمار",
  "guarantee":        { "id": 59, "name": { "ar": "ضمانة شخصية", "en": "Personal guarantee" } },
  "guarantee_status": { "id": 7,  "name": { "ar": "متوفرة", "en": "Available" } },
  "guarantee_type_other": null, "guarantee_status_other": null, "project_type_other": null,
  "note": "يا نجازاه",
  "attachment": [],
  "installments": [],
  "branch": null,
  "is_rating": false,
  "status": { "status": { "ar": "تم الغاء الطلب آلياً", "en": "Fund was canceled automatically" },
              "code": "auto-rejected" },
  "fund_order_statuses": [
    { "status": { "ar": "تم الغاء الطلب آلياً", "en": "Fund was canceled automatically" },
      "checked": true, "code": "rejected", "updated_at": "2026-09-05T19:22:02Z",
      "note": "عزيزنا العميل، نعتذر عن التأخير… يمكنك الآن التقدم على خدمات أخرى" } ],
  "created_at": "2026-08-31T19:21:39Z", "updated_at": "2026-09-05T19:22:02Z" } }
```

### 1.8 Request list card + statuses
Activity name · request number · provider name · service (product) name · request date · status chip ·
latest status note. Status set (codes): `under-review` → `under-study` → `approved` → `paid` →
`completed`, plus `rejected`, `auto-rejected`, `cancelled-by-customer`.

---

## 2. The three owner rules, formalized (governing this domain)

**R-1 — ZERO JSON.** No `Json` columns, no JSON-in-`Text` blobs, anywhere in the financier domain.
Every list is a **child table** with FKs; every address is **typed scalar columns**; every schedule
is an **installment table**. (Legacy Json columns elsewhere in the platform — `Product.images`,
`Organization.billingAddress`, `AuditLog.metadata`, `RfqSetting.value`, … — are FROZEN legacy,
out of scope for this module and not extended by it. Financing status notes use `AuditLog.summary`
text, never `AuditLog.metadata`.)

**R-2 — SINGLE ENTRY.** Every data point lives in EXACTLY ONE place and is referenced everywhere
else. Personal data on `User`; KYC uploaded once at user level; per-application facts on
`FinancingRequest`; money schedules on the offer; status history in the existing audit substrate.
The competitor's own API proves the pattern: `fund-order.account = {id, name}` — reference only.

**R-3 — REUSE THE EXISTING SUBSTRATE.** Before adding any column or table, prove no existing home
exists. Concretely v4.0 reuses: `Organization` (legal identity, orgType, status, verifiedAt,
industry, taxId), `OrganizationMember` (financier staff access — DP-1), `MediaAsset` (the ONLY
upload/storage subsystem — sha256 dedupe, webp renditions), `Sequence` (`FIN`/`AGR`), `AuditLog` +
`Notification` (status history + notes), `RfqSetting` (financing settings panels). New tables carry
ONLY facts that have no home — and each one is justified in §8.

---

## 3. The schema

> Conventions honored: MySQL `@db.*` types, `Decimal(12,2)` money, string status enums validated by
> TS unions + zod (matches every existing model), `Sequence` service for business numbers
> (D-006), org-membership auth in services (guards pattern), settings via `RfqSetting` registry.
> **Zero `Json` columns below — by construction.**

### 3.0 Reused existing models — NOTHING duplicated on top of them

| Existing model | What this domain uses it for | What we deliberately DO NOT add |
|---|---|---|
| `User` | Applicant identity + additive profile scalars (§3.1) | No `ApplicantProfile` table — profile data stays on `User` |
| `Organization` | Financier legal identity: `name`, `legalName`, `orgType` (BANK\|MFI\|EWALLET), `website`, `taxId`, `registrationNumber`, `industry`, `status` (PENDING_VERIFICATION\|ACTIVE\|SUSPENDED\|REJECTED), `verifiedAt`, `notes` | No second name/legalName/status/verifiedAt on `FinancierProfile`; no `businessInfo.industry` — `Organization.industry` exists |
| `OrganizationMember` | Financier staff access (OWNER\|ADMIN\|BUYER\|APPROVER\|VIEWER) — no new global role (DP-1) | No `FINANCIER` role |
| `MediaAsset` | ALL uploads: KYC, guarantee docs, studies, logos — sha256-deduped, rendition-processed | No storageKey/fileName/size on `ApplicantDocument` — that IS `MediaAsset` |
| `Sequence` | `FIN` → `FR-YYYY-######`, `AGR` → `AGR-YYYY-######` (D-006) | No per-domain counters; offers stay id-addressed (DP-12) |
| `AuditLog` + `Notification` | Status history + provider/applicant notes (DP-15) | No `financing_status_history` table |
| `RfqSetting` | `financing` section panels (§6) | No new settings table |
| `Rfq` / `Quote` / `Order` | `targetType` references for QUOTE / ORDER / RFQ_LINE flows | No copy of quote/order data into requests |

*(Additive back-relation fields on `User`, `Organization`, `MediaAsset` are required by Prisma and
are pure relation declarations — zero data impact, same pattern as every existing relation.)*

### 3.1 User — additive applicant profile (the ONLY existing model whose COLUMNS we touch)

```prisma
model User {
  // … ALL existing fields & relations unchanged (id, email, password, name, image, role,
  //    status, suspendedAt, storeName, storeBio, commissionRate, verifiedAt, timestamps,
  //    products/orders/reviews/… ) …

  // ── Applicant profile (competitor step 1) — SINGLE source, additive, ALL nullable;
  //    B2C buyers are unaffected until they apply for financing (DP-14) ──
  phone             String?   @db.VarChar(40)   // contact only — login stays email-based
  whatsappNumber    String?   @db.VarChar(40)
  dateOfBirth       DateTime?
  gender            String?   @db.VarChar(16)  // MALE | FEMALE | OTHER
  maritalStatus     String?   @db.VarChar(16)  // SINGLE | MARRIED | DIVORCED | WIDOWED
  nationality       String?   @db.VarChar(64)
  identityType      String?   @db.VarChar(16)  // NATIONAL_ID | PASSPORT | RESIDENCE_PERMIT | OTHER
  identityNumber    String?   @db.VarChar(64)
  // residence: typed scalars (v3 had a Json blob — REMOVED, R-1). No geo FK tables (DP-16);
  // same string-on-entity precedent as the existing Order.city column.
  residenceStreet   String?   @db.VarChar(255)
  residenceCity     String?   @db.VarChar(120)
  residenceDistrict String?   @db.VarChar(120)
  residenceType     String?   @db.VarChar(16)  // OWNED | RENTED

  applicantDocuments ApplicantDocument[] @relation("ApplicantDocuments")
  documentsReviewed  ApplicantDocument[] @relation("ApplicantDocumentsReviewedBy")
  financingRequests  FinancingRequest[]  @relation("FinancingRequests")
  financingOffers    FinancingOffer[]    @relation("FinancingOffers")
}
```
Deviation (kept from v3): the competitor's 4-part Arabic name stays our single `User.name` — every
existing surface (auth, checkout, reviews) depends on it. Competitor lat/lng dropped (map pins are
a branch-level fact, §3.3).

### 3.2 FinancierProfile — slim: financing facts ONLY, identity lives on Organization

```prisma
model FinancierProfile {
  id             String        @id @default(cuid())
  organizationId String        @unique            // 1:1 — the legal entity (BANK | MFI | EWALLET)
  organization   Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  // ── financing-domain facts ONLY (R-3): displayName/legalName/website/status/verifiedAt
  //    are Organization columns — NOT repeated here ──
  about          String?       @db.Text           // public marketing text (About tab)
  licenseNumber  String?       @db.VarChar(80)
  regulator      String?       @db.VarChar(120)
  logoUrl        String?       @db.VarChar(512)   // MediaAsset-backed URL (existing pattern: User.image)
  contactEmail   String?       @db.VarChar(255)
  contactPhone   String?       @db.VarChar(40)
  minTicket      Decimal?      @db.Decimal(12, 2) // routing hint; product-level ranges remain authoritative
  maxTicket      Decimal?      @db.Decimal(12, 2)
  viewCount      Int           @default(0)        // public profile stats (competitor: 11,449 views)
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  branches FinancierBranch[]
  products FinancingProduct[]

  @@index([organizationId])
}
```

### 3.3 FinancierBranch — typed address columns (no Json, no geo tables)

```prisma
model FinancierBranch {
  id                String          @id @default(cuid())
  financierProfileId String
  financierProfile  FinancierProfile @relation(fields: [financierProfileId], references: [id], onDelete: Cascade)
  name              String          @db.VarChar(160)
  kind              String          @default("BRANCH") @db.VarChar(16) // BRANCH | AGENT | ATM
  street            String?         @db.VarChar(255)
  city              String?         @db.VarChar(120)
  district          String?         @db.VarChar(120)
  latitude          Decimal?        @db.Decimal(9, 6)
  longitude         Decimal?        @db.Decimal(9, 6)
  phone             String?         @db.VarChar(40)
  isActive          Boolean         @default(true)
  position          Int             @default(0)
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt

  @@index([financierProfileId, isActive])
}
```

### 3.4 FinancingProduct + three trait child tables (every list a table — R-1)

```prisma
model FinancingProduct {
  id                 String          @id @default(cuid())
  financierProfileId String
  financierProfile   FinancierProfile @relation(fields: [financierProfileId], references: [id], onDelete: Cascade)
  name               String          @db.VarChar(160)
  description        String?         @db.Text
  category           String          @db.VarChar(24)
    // OUR B2B trio: WORKING_CAPITAL | INVOICE_FINANCING | PO_FINANCING
    // competitor taxonomy: INVESTMENT | RURAL | ENERGY(green) | HOUSING | FISHERIES
    //                      | AGRICULTURAL | SEASONAL | EQUIPMENT | OTHER  (wizard ids 12..16, 1)
  targetSegment      String?         @db.VarChar(16) // BUSINESS | INDIVIDUAL | BOTH (DP-13)
  status             String          @default("ACTIVE") @db.VarChar(16) // ACTIVE | DRAFT | ARCHIVED
  currency           String          @default("YER") @db.VarChar(3)    // ISO-4217; NO currency table
  amountMin          Decimal         @db.Decimal(12, 2)                 // competitor's currency.min folds HERE
  amountMax          Decimal         @db.Decimal(12, 2)
  rateType           String?         @db.VarChar(24) // MURABAHA_ANNUAL | FIXED_ANNUAL | FLAT_FEE
  rateMax            Decimal?        @db.Decimal(6, 3)  // e.g. 30.000 = 30%/yr cap (murabaha)
  feeFlat            Decimal?        @db.Decimal(12, 2)
  tenorMinMonths     Int?            // e.g. 6 (competitor floor)
  tenorMaxMonths     Int?
  repaymentFrequency String?         @db.VarChar(16) // MONTHLY | QUARTERLY | LUMP_SUM
  gracePeriodDays    Int?
  shariaCompliant    Boolean         @default(false)
  processingDays     Int?
  viewCount          Int             @default(0)
  createdAt          DateTime        @default(now())
  updatedAt          DateTime        @updatedAt

  attributes   FinancingProductAttribute[]    // features + eligibility conditions (§3.4a)
  requirements FinancingProductRequirement[]  // collateral + document enums (§3.4b)
  coverage     FinancingProductCoverage[]     // geographic coverage (§3.4c)
  requests     FinancingRequest[]

  @@index([financierProfileId, status])
  @@index([category, status])
}

// Text-bullet traits: competitor "features" list + "eligibility conditions" list.
model FinancingProductAttribute {
  id        String           @id @default(cuid())
  productId String
  product   FinancingProduct  @relation(fields: [productId], references: [id], onDelete: Cascade)
  kind      String           @db.VarChar(24) // FEATURE | ELIGIBILITY_CONDITION
  position  Int              @default(0)
  text      String           @db.VarChar(500)

  @@unique([productId, kind, position])
  @@index([productId, kind])
}

// Enum-valued traits: collateral types accepted + documents required.
model FinancingProductRequirement {
  id        String           @id @default(cuid())
  productId String
  product   FinancingProduct  @relation(fields: [productId], references: [id], onDelete: Cascade)
  kind      String           @db.VarChar(24) // COLLATERAL_ACCEPTED | DOCUMENT_REQUIRED
  value     String           @db.VarChar(32) // validated: collateral enum (§3.5) | ApplicantDocument.type enum

  @@unique([productId, kind, value])
  @@index([productId, kind])
}

// Geographic coverage — region NAMES (DP-16: no geo lookup tables in v1).
model FinancingProductCoverage {
  id         String           @id @default(cuid())
  productId  String
  product    FinancingProduct  @relation(fields: [productId], references: [id], onDelete: Cascade)
  regionName String           @db.VarChar(120) // normalized (trim/case-fold) at write; matched
                                               // case-insensitively vs FinancingRequest.activityCity

  @@unique([productId, regionName])
  @@index([productId])
}
```

### 3.5 FinancingRequest — the application (`FR-YYYY-######` via `Sequence 'FIN'`)

```prisma
model FinancingRequest {
  id        String  @id @default(cuid())
  number    String  @unique @db.VarChar(32)

  // ── WHO — references ONLY, never copies of profile data (R-2) ──
  organizationId String?                         // applicant org (B2B); null = individual (DP-13)
  organization   Organization? @relation(fields: [organizationId], references: [id])
  createdById    String                          // submitting User (org member or the individual)
  createdBy      User @relation("FinancingRequests", fields: [createdById], references: [id])
  productId      String?                         // direct application to a product ("طلب تمويل" CTA)
  product        FinancingProduct? @relation(fields: [productId], references: [id])
  targetType      String @db.VarChar(16)          // WORKING_CAPITAL | QUOTE | ORDER | RFQ_LINE
  targetId        String? @db.VarChar(64)         // quote/order/rfqLine id (loose FK, Dispute pattern)

  // ── ACTIVITY (wizard step 2, fields 1, 7–13, 17) ──
  activityStatus       String?    @db.VarChar(16)   // NEW | EXISTING
  activityName         String?    @db.VarChar(160)
  activityDescription  String?    @db.Text
  activityStartDate    DateTime?                     // null = not started yet
  activityCity         String?    @db.VarChar(120)   // matches product coverage (string, DP-16)
  activityDistrict     String?    @db.VarChar(120)
  activityAddress      String?    @db.VarChar(255)
  activityLocationType String?    @db.VarChar(16)   // OWNED | RENTED
  activityCategory     String?    @db.VarChar(24)    // applicant's answer to "activity type"
  activityCategoryOther String?   @db.VarChar(160)   // free text when activityCategory = OTHER

  // ── UNDERWRITING INPUTS (wizard step 2, fields 2–6) ──
  capitalAmount              Decimal? @db.Decimal(12, 2)
  ownContributionAmount      Decimal? @db.Decimal(12, 2)
  monthlyInstallmentCapacity Decimal? @db.Decimal(12, 2)
  previousFinancing          Boolean?
  otherIncomeSources         String?  @db.VarChar(500)
  // (v3's businessInfo Json is DELETED — R-1/R-3: industry/registration come from Organization,
  //  financial evidence comes as typed ApplicantDocuments, e.g. FINANCIAL_STATEMENT)

  // ── THE ASK (wizard step 2, fields 14–16) ──
  amountRequested      Decimal  @db.Decimal(12, 2)
  currency             String   @default("YER") @db.VarChar(3) // ISO-4217; no currency table
  purpose              String?  @db.Text
  tenorRequestedMonths Int?

  // ── GUARANTEE (wizard step 2, fields 18–19) ──
  guaranteeType        String? @db.VarChar(24)
    // PERSONAL_GUARANTEE | BANK_GUARANTEE | GOLD | COMMERCIAL | MORTGAGE
    // | CONVERTIBLE_SECURITIES | SELF_GUARANTEE | OTHER
  guaranteeTypeOther   String? @db.VarChar(160)
  guaranteeStatus      String? @db.VarChar(24) // AVAILABLE | PARTIALLY_AVAILABLE | UNAVAILABLE | OTHER
  guaranteeStatusOther String? @db.VarChar(160)

  // ── CONSENT + DISTRIBUTION (wizard fields 21–22) ──
  applicantNotes   String?   @db.Text
  consentAt        DateTime?                  // step-1 data-transfer consent + terms, stamped at submit
  distributionMode String    @default("OPEN") @db.VarChar(16) // OPEN | BUYER_SELECTED

  // ── LIFECYCLE ──
  status      String    @default("DRAFT") @db.VarChar(16)
    // DRAFT | SUBMITTED | UNDER_REVIEW | INFO_REQUESTED | OFFERED | ACCEPTED
    // | DECLINED_ALL | EXPIRED | CANCELLED | WITHDRAWN        (§5 maps competitor states)
  expiresAt   DateTime?
  submittedAt DateTime?
  closedAt    DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  documents ApplicantDocument[]
  invites   FinancingRequestInvite[]
  offers    FinancingOffer[]

  @@index([organizationId, status])
  @@index([createdById, createdAt])
  @@index([status, createdAt])
  @@index([productId])
  @@index([targetType, targetId])
  @@index([activityCity])
}
```

### 3.6 FinancingRequestInvite — BUYER_SELECTED distribution as rows, not JSON

```prisma
model FinancingRequestInvite {
  id             String            @id @default(cuid())
  requestId      String
  request        FinancingRequest  @relation(fields: [requestId], references: [id], onDelete: Cascade)
  organizationId String                       // the invited financier Organization (BANK | MFI | EWALLET)
  organization   Organization      @relation(fields: [organizationId], references: [id])
  createdAt      DateTime          @default(now())

  @@unique([requestId, organizationId])       // (v3's selectedFinanciers Json array → real rows)
  @@index([organizationId])
}
```

### 3.7 ApplicantDocument — ONE document subsystem over MediaAsset (no storage fields)

```prisma
model ApplicantDocument {
  id              String            @id @default(cuid())
  userId          String                         // owner/uploader — ALWAYS set
  user            User              @relation("ApplicantDocuments", fields: [userId], references: [id], onDelete: Cascade)
  requestId       String?                        // null  = user-level KYC (ID image — uploaded ONCE, reused)
  request         FinancingRequest? @relation(fields: [requestId], references: [id], onDelete: Cascade)
  accreditationId String?                        // set  = accreditation evidence (Flow 4, §3.12)
  accreditation   SupplierAccreditation? @relation(fields: [accreditationId], references: [id])
  mediaId         String                         // ← THE storage entry: MediaAsset carries
  media           MediaAsset        @relation(fields: [mediaId], references: [id])
                                                 //    key/originalName/mime/size/sha256/renditions
  type            String            @db.VarChar(32)
    // user-scope:     ID_DOCUMENT
    // request-scope:  BUSINESS_LICENSE | FINANCIAL_STATEMENT | BANK_STATEMENT | TAX_REGISTRATION
    //                | PROPERTY_PROOF | INVOICE | PURCHASE_ORDER | GUARANTEE_DOC | FEASIBILITY_STUDY | OTHER
    // accred-scope:   as required by AccreditationCriterion (§3.12)
  status          String            @default("PENDING") @db.VarChar(16) // PENDING | VERIFIED | REJECTED
  reviewedById    String?
  reviewedBy      User?             @relation("ApplicantDocumentsReviewedBy", fields: [reviewedById], references: [id])
  reviewedAt      DateTime?
  note            String?           @db.Text    // verification / rejection note
  createdAt       DateTime          @default(now())

  @@index([userId])
  @@index([requestId])
  @@index([accreditationId])
  @@index([userId, type, status])
  @@index([mediaId])
}
```

### 3.8 FinancingOffer + installments (schedule proposed by the financier — R-1)

```prisma
model FinancingOffer {
  id          String   @id @default(cuid())
  requestId   String
  request     FinancingRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
  createdById String                        // financier staff User (via OrganizationMember, DP-1)
  createdBy   User      @relation("FinancingOffers", fields: [createdById], references: [id])
  amount      Decimal  @db.Decimal(12, 2)
  currency    String   @default("YER") @db.VarChar(3)
  rateType    String?  @db.VarChar(24)       // MURABAHA_ANNUAL | FIXED_ANNUAL | FLAT_FEE
  ratePercent Decimal? @db.Decimal(6, 3)
  feeFlat     Decimal? @db.Decimal(12, 2)
  tenorMonths Int
  collateralRequired String? @db.VarChar(24)  // enum from the guarantee taxonomy (§3.5)
  notes       String?  @db.VarChar(1000)
  validUntil  DateTime?
  status      String   @default("DRAFT") @db.VarChar(16)
    // DRAFT | SENT | ACCEPTED | DECLINED | EXPIRED | WITHDRAWN
  sentAt      DateTime?
  acceptedAt  DateTime?
  declinedAt  DateTime?
  withdrawnAt DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  installments FinancingOfferInstallment[]
  agreement    FinancingAgreement?            // back-relation of the 1:1

  @@index([requestId, status])
}

// (v3's repaymentSchedule Json [{installmentNo, dueDate, amount}] → real rows)
model FinancingOfferInstallment {
  id            String          @id @default(cuid())
  offerId       String
  offer         FinancingOffer  @relation(fields: [offerId], references: [id], onDelete: Cascade)
  installmentNo Int
  dueDate       DateTime
  amount        Decimal         @db.Decimal(12, 2)

  @@unique([offerId, installmentNo])
  @@index([offerId, dueDate])
}
```

### 3.9 FinancingAgreement — references the accepted offer; NO terms snapshot (DP-20)

```prisma
model FinancingAgreement {
  id        String   @id @default(cuid())
  number    String   @unique @db.VarChar(32)   // AGR-YYYY-###### via Sequence 'AGR'
  offerId   String   @unique                    // the ACCEPTED offer — its rows (incl. installments)
  offer     FinancingOffer @relation(fields: [offerId], references: [id])
  // NO termsSnapshot: the service FREEZES the accepted offer (status lock + installment rows
  // immutable) — the agreement references, never copies (R-2; kills v3's Json snapshot).
  fundingStatus String @default("PENDING") @db.VarChar(24) // PENDING | REPORTED_FUNDED | REPORTED_SETTLED
    // financier-REPORTED external money events — platform never holds funds (D-002)
  status    String   @default("ACTIVE") @db.VarChar(16)   // ACTIVE | COMPLETED | DEFAULTED | CANCELLED
  acceptedAt      DateTime
  fundedReportedAt  DateTime?
  settledReportedAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  events FinancingEvent[]
  fees   FinancingFee[]

  @@index([status])
}
```

### 3.10 FinancingEvent — track-only ledger (D-002; distinct from AuditLog: typed money facts)

```prisma
model FinancingEvent {
  id           String             @id @default(cuid())
  agreementId  String
  agreement    FinancingAgreement  @relation(fields: [agreementId], references: [id], onDelete: Cascade)
  type         String             @db.VarChar(24) // DISBURSEMENT | REPAYMENT | EARLY_SETTLEMENT | LATE_FEE | NOTE
  eventDate    DateTime
  amount       Decimal?           @db.Decimal(12, 2)
  note         String?            @db.VarChar(500)
  reportedById String?                              // financier staff who reported it
  reportedBy   User?              @relation("FinancingEventsReportedBy", fields: [reportedById], references: [id])
  createdAt    DateTime           @default(now())

  @@index([agreementId, eventDate])
}
```

### 3.11 FinancingFee — commission accounting, invoiced externally, admin marks PAID (D-001/002)

```prisma
model FinancingFee {
  id            String            @id @default(cuid())
  agreementId   String
  agreement     FinancingAgreement @relation(fields: [agreementId], references: [id], onDelete: Cascade)
  type          String            @db.VarChar(16) // SUCCESS | ORIGINATION | ACCREDITATION
  baseAmount    Decimal           @db.Decimal(12, 2)
  percentApplied Decimal          @db.Decimal(6, 3) // snapshot of the configured rate at accrual
  amount        Decimal           @db.Decimal(12, 2)
  status        String            @default("ACCRUED") @db.VarChar(16) // ACCRUED | INVOICED | PAID | WAIVED
  invoicedAt    DateTime?
  paidAt        DateTime?
  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt

  @@index([agreementId, type, status])
  @@index([status, createdAt])
}
```

### 3.12 Accreditation (Flow 4) — criteria as data, documents via the ONE subsystem

```prisma
model AccreditationProgram {
  id                String            @id @default(cuid())
  financierProfileId String
  financierProfile  FinancierProfile  @relation(fields: [financierProfileId], references: [id], onDelete: Cascade)
  name              String            @db.VarChar(160)
  description       String?           @db.Text
  feeAmount         Decimal?          @db.Decimal(12, 2)   // accreditation fee (external invoice)
  validMonths       Int?                                     // accreditation lifetime once verified
  active            Boolean           @default(true)
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt

  criteria        AccreditationCriterion[]
  accreditations  SupplierAccreditation[]

  @@index([financierProfileId, active])
}

model AccreditationCriterion {
  id        String              @id @default(cuid())
  programId String
  program   AccreditationProgram @relation(fields: [programId], references: [id], onDelete: Cascade)
  kind      String              @db.VarChar(24)
    // REQUIRED_DOCUMENT (value = ApplicantDocument.type) | MIN_TENURE_MONTHS
    // | MIN_MONTHLY_REVENUE | MANUAL_CHECK
  value     String?             @db.VarChar(160)   // typed per kind; zod-validated per kind
  label     String              @db.VarChar(160)   // human checklist line
  position  Int                 @default(0)

  @@index([programId])
}

model SupplierAccreditation {
  id             String              @id @default(cuid())
  programId      String
  program        AccreditationProgram @relation(fields: [programId], references: [id], onDelete: Cascade)
  organizationId String                       // the supplier Organization applying
  organization   Organization        @relation(fields: [organizationId], references: [id])
  status         String              @default("PENDING") @db.VarChar(16)
    // PENDING | UNDER_REVIEW | VERIFIED | REJECTED | EXPIRED
  submittedById  String
  submittedBy    User                @relation("SupplierAccreditationsSubmitted", fields: [submittedById], references: [id])
  reviewedById   String?
  reviewedBy     User?               @relation("SupplierAccreditationsReviewed", fields: [reviewedById], references: [id])
  verifiedAt     DateTime?
  expiresAt      DateTime?
  note           String?             @db.Text
  createdAt      DateTime            @default(now())
  updatedAt      DateTime            @updatedAt

  documents ApplicantDocument[]      // evidence — same ONE subsystem (§3.7)

  @@unique([programId, organizationId])
  @@index([organizationId, status])
}
```

---

## 4. Enum code mapping (competitor ⇄ Vendora)

| Concept | Competitor (API/DOM) | Vendora value |
|---|---|---|
| Activity status | `new` / `existing` | `NEW` / `EXISTING` |
| Previous financing | `false` / `true` | Boolean |
| Activity type | 12 project · 13 rural · 14 green-energy · 15 housing · 16 fisheries · 1 other | `INVESTMENT`/`RURAL`/`ENERGY`/`HOUSING`/`FISHERIES`/`OTHER` (+ our B2B trio & catalog extras) |
| Location/residence type | `ownership` / `own` / `rent` | `OWNED` / `RENTED` |
| Guarantee type | 59 personal · 345 bank · 346 gold · 347 commercial · 1 other (+ page: mortgage, convertible, self) | `PERSONAL_GUARANTEE`/`BANK_GUARANTEE`/`GOLD`/`COMMERCIAL`/`MORTGAGE`/`CONVERTIBLE_SECURITIES`/`SELF_GUARANTEE`/`OTHER` |
| Guarantee status | 7 · 8 · 9 · 1 | `AVAILABLE`/`PARTIALLY_AVAILABLE`/`UNAVAILABLE`/`OTHER` |
| Identity type | `personalCard` | `NATIONAL_ID` |
| Gender / marital | `male` / `single` | `MALE` / `SINGLE` |
| Currency | id 179 YER (+min/max) | ISO string `YER` — ranges on `FinancingProduct` |

## 5. Status lifecycle mapping (competitor ⇄ Vendora)

| Competitor state (code) | Vendora state | Notes |
|---|---|---|
| — (not submitted) | `DRAFT` | wizard in progress |
| Under review | `SUBMITTED` | initial triage; distribution to pool / direct product target |
| Under study | `UNDER_REVIEW` | credit analysis (financier-side work state) |
| — (ours only) | `INFO_REQUESTED` | financier asks for missing docs/info |
| Approved (terms issued) | `OFFERED` | approval materializes as a **FinancingOffer** |
| — (ours only) | `ACCEPTED` | buyer accepts one offer; siblings auto-decline; `FinancingFee` accrues |
| Paid (disbursed) | `ACCEPTED` + `FinancingAgreement.fundingStatus = REPORTED_FUNDED` + `FinancingEvent(DISBURSEMENT)` | money NEVER on platform (D-002) |
| Completed | `FinancingAgreement.status = COMPLETED` | via reported repayment events |
| Rejected (provider) | no v1 action — a non-bidding financier sends no offer | competitor's reject-with-note UX noted for v2 |
| Automatically cancelled (`auto-rejected`) | `EXPIRED` | lazy sweep at `expiresAt` (mirrors `sweepDisputes` — state-machine, no cron) |
| Cancelled by customer | `CANCELLED` (pre-acceptance) / `WITHDRAWN` | wizard "Cancel request" action |

**Status history + notes** (competitor `fund_order_statuses[] {code, updated_at, note}`): recorded as
`AuditLog` rows — `action: FINANCING_STATUS_CHANGED`, `summary: "UNDER_REVIEW → OFFERED — <note>"` —
and delivered to the applicant as a `Notification` (`body` = note). **The `AuditLog.metadata` Json
column is deliberately NOT used by this domain (R-1)** — `summary` text carries it. No new column,
no new table (DP-15).

## 6. Sequences, settings & notification additions

- `SequencePrefix` union (sequences/service.ts:9): += `'FIN' | 'AGR'` → `FR-YYYY-######`, `AGR-YYYY-######`.
  Offers stay id-addressed (DP-12).
- `RfqSetting` registry — new `financing` SectionDef, panels:
  `general {enabled, requestExpiryDays, maxOffersPerRequest}` ·
  `fees {financierSuccessPercent (default 0.75, 0–5), originationPercentCap}` ·
  `distribution {defaultMode, requireVerifiedProfile}` ·
  `documents {allowedTypes, maxSizeMb}` ·
  `intake {requireConsent, wizardEnabled}`.
- `Notification.linkView` union (notifications/service.ts): += `'financing'`; new types:
  FINANCING_REQUEST_RECEIVED, OFFER_RECEIVED, OFFER_ACCEPTED, OFFER_DECLINED, OFFER_WITHDRAWN,
  DOC_VERIFIED / DOC_REJECTED, FEE_ACCRUED, AGREEMENT_STATUS_CHANGED, FINANCING_STATUS_CHANGED.

## 7. Field-level traceability — every wizard field → ONE home (no-JSON edition)

| Wizard field (step) | Home (exactly one) |
|---|---|
| Name, Email (1) | `User.name`, `User.email` — EXISTING |
| Date of birth, Gender, Marital status, Nationality (1) | `User.dateOfBirth/gender/maritalStatus/nationality` — NEW scalars |
| Phone, WhatsApp (1) | `User.phone`, `User.whatsappNumber` — NEW scalars |
| Residence street / city / district (1) | `User.residenceStreet/residenceCity/residenceDistrict` — NEW scalars (v3 Json REMOVED) |
| Residence type (1) | `User.residenceType` |
| ID type, ID number (1) | `User.identityType`, `User.identityNumber` |
| ID image (1) | `ApplicantDocument` (userId, requestId null, type ID_DOCUMENT) → `mediaId → MediaAsset` — uploaded ONCE |
| Data-transfer consent + terms (1, 2) | `FinancingRequest.consentAt` (stamped at submit) |
| Activity status (2) | `FinancingRequest.activityStatus` |
| Capital / Contribution / Installment capacity (2) | `capitalAmount` / `ownContributionAmount` / `monthlyInstallmentCapacity` |
| Previous financing (2) | `previousFinancing` Boolean |
| Other income sources (2) | `otherIncomeSources` |
| Activity type (2) | `activityCategory` (+ `activityCategoryOther` when OTHER) |
| Activity start date / name / description (2) | `activityStartDate` / `activityName` / `activityDescription` |
| Activity address / city / district (2) | `activityAddress` / `activityCity` / `activityDistrict` |
| Activity location type (2) | `activityLocationType` |
| Financing amount / currency (2) | `amountRequested` / `currency` |
| Financing purpose (2) | `purpose` |
| Guarantee type / status (2) | `guaranteeType` / `guaranteeStatus` (+ `*Other` free-text companions) |
| Attachments (2) | `ApplicantDocument` (requestId set) → `MediaAsset` |
| Notes (2) | `applicantNotes` |
| Review step (3) | NO storage — renders User + request by reference |
| Request number (post) | `number` via `FIN` sequence |
| Service provider / service name (post) | `product → FinancierProfile → organizationId → Organization` / `product` — no providerId column (reachable; open requests use the invite pool) |
| Request date (post) | `createdAt` / `submittedAt` |
| Status + note (post) | `status` + AuditLog.summary / Notification.body |
| Installments (post) | `FinancingOfferInstallment` rows on the accepted offer (frozen via DP-20) |
| Currency min/max (post) | `FinancingProduct.amountMin/amountMax` |
| `is_rating` (post) | deferred v2 (DP-17) |
| `branch` (post) | deferred v2 (DP-17) |
| B2B supplements (Flow 3) | `Organization.industry/taxId/registrationNumber/creditTermsDays` (EXISTING) + typed `ApplicantDocument` evidence — v3's `businessInfo` Json DELETED |

## 8. Duplication audit — every competitor structure → its ONE Vendora home

| Competitor structure | Their storage | Our single home | Duplicate avoided |
|---|---|---|---|
| City / district lookups (`city_id`, `district_id`, name tables) | geo reference tables | free strings: `User.residenceCity/District`, `FinancingRequest.activityCity/District`, `FinancierBranch.city/district` (DP-16; existing precedent: `Order.city`) | NO geo tables, NO city enums, NO copied governorate lists |
| Applicant personal profile | users + profile parts | `User` additive scalars (§3.1) | no `ApplicantProfile`/`FinancingApplicant` table |
| `identity_attachment[]` storage | per-user file rows | `MediaAsset` + `ApplicantDocument` (thin verification layer, `mediaId` FK) | no parallel storage subsystem — no storageKey/fileName/size duplicates |
| Provider identity (name, legal name, status, verified) | providers table | `Organization` (+ orgType BANK/MFI/EWALLET); `FinancierProfile` holds financing facts only | no legalName/status/verifiedAt re-storage |
| B2B applicant facts | request JSON blobs | `Organization` existing columns + typed `ApplicantDocument` docs | no `businessInfo` Json |
| Currency entity w/ min/max | currencies table | ISO-3 string + `FinancingProduct.amountMin/Max` | no currency table |
| `fund_order_statuses[]` history | status-history table | `AuditLog.summary` + `Notification.body` | no new table/column (DP-15) |
| `installments[]` on request | request rows | `FinancingOfferInstallment` (financier proposes; frozen at acceptance) | no schedule on the request, no snapshot copy on the agreement |
| Selected financiers list | request column | `FinancingRequestInvite` rows (FK → Organization) | no org-id array blob |
| Product features / conditions / collateral / docs / coverage lists | JSON columns | three trait child tables (§3.4a–c) | no Json, no enum tables |

## 9. Deliberate deviations from the competitor (documented rationale)

1. **4-part Arabic name → single `User.name`** — existing surfaces depend on it.
2. **Login by phone → login by email** — existing auth code; phone is a contact field.
3. **Single-provider request → multi-offer marketplace** — their "approved" = our OFFERED; we add
   comparison, sibling auto-decline, success fee. Their reject-with-note UX deferred to v2.
4. **Geo FK tables → free strings** (DP-16) — global platform, not a 22-governorate app.
5. **Currency entity → ISO string + product ranges.**
6. **`installments[]` on request → offer/agreement** — the schedule is the financier's proposal.
7. **`fund_order_statuses` → AuditLog + Notification.**
8. **`account {id,name}` reference** — matched and extended (org + product references).
9. **v4 additions (owner rulings):** zero JSON (R-1); substrate reuse (R-3) — documents over
   MediaAsset, slim FinancierProfile over Organization; agreement references the frozen offer
   instead of snapshotting terms (DP-20).

## 10. Open decisions (DP list additions)

- **DP-13**: Individual applicants — `organizationId` nullable. Recommend **YES**.
- **DP-14**: Additive `User` applicant-profile columns (§3.1 — 12 nullable scalars, no Json). Recommend **YES**.
- **DP-15**: Status notes via existing AuditLog + Notification substrate. Recommend **YES**.
- **DP-16**: No geo lookup tables in v1 (strings + normalized coverage matching). Recommend **YES**.
- **DP-17**: Financier ratings (`is_rating`) + branch-level request routing → v2 defer. Recommend **DEFER**.
- **DP-18 (NEW)**: **Zero-JSON doctrine for the financier domain** — every list a child table,
  every address typed scalars; legacy Json columns elsewhere frozen, not extended. Recommend **YES** (owner-set).
- **DP-19 (NEW)**: **One storage subsystem** — `ApplicantDocument` links `MediaAsset` via `mediaId`;
  no storage metadata duplication. Recommend **YES** (owner-set).
- **DP-20 (NEW)**: **Agreement references the accepted offer** — service freezes the offer +
  installments at acceptance; no terms snapshot copy. Recommend **YES**.
- **DP-21 (NEW)**: Product traits as three child tables (Attribute / Requirement / Coverage). Recommend **YES**.
- Carry-over: DP-10 (public directory), DP-11 (Islamic finance fields), DP-12 (offer numbering).
