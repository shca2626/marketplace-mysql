# Vendora — FINANCIER DOMAIN SCHEMA v5.0 (services · platform gate · flexible requirements)

> THE data model for the financier module. Supersedes v4.0.
> **v5.0 exists because of five owner rulings (2026-09, verbatim intent):**
> 1. **"FINANCIER have services, not products"** — the competitor's own URL space is
>    `/en/services/145` and its API returns `service: {id, name}` on every fund-order (§1.7).
>    v4.0 called the offering `FinancingProduct`. v5.0 renames the concept **`FinancierService`**
>    and makes an accreditation program a service too (`serviceKind`).
> 2. **"The platform management must verify the conditions required for any service applicant …
>    incomplete or incorrect requests must not be sent — this is the essence of the platform's
>    operation."** — v4.0 forwarded requests to financiers on submit. v5.0 inserts the
>    **PLATFORM VERIFICATION GATE**: every request (financing AND accreditation) passes through
>    platform review; only fully-verified requests are forwarded; incomplete/incorrect ones are
>    RETURNED to the applicant with per-requirement notes.
> 3. **"Each funder adds their own conditions based on the service … general conditions required in
>    several services by multiple funders, and specific conditions unique to the funder and the
>    service … high flexibility … flexible, easy, comprehensive management interface."** — v5.0
>    introduces the **REQUIREMENTS ENGINE**: a platform-curated GENERAL condition library +
>    financier-private custom conditions, attached per-service, with 8 typed condition kinds and
>    per-request verification tracking (§3.5–§3.6).
> 4. **"Qualification and Accreditation Management [is] one of main services that this system will
>    provide"** — accreditation moves from a side flow (v4 §3.12) to a first-class MAIN flow with
>    its own request lifecycle, platform gate, and RFQ-unlock effects (§3.13).
> 5. **"Documents management … needed for all users and accounts"** — v4's applicant-scoped
>    `ApplicantDocument` becomes the **universal `AccountDocument`** (every user, every org,
>    verified once, reused by every request type) (§3.7).
>
> Evidence base (field-level, unchanged): owner's wizard walk-through + live authenticated
> extraction (`/api/profile`, `/api/fund-order/3763`, localStorage `userInfo`, wizard DOM option
> codes) + codebase recon (schema.prisma, sequences, notifications, settings registry,
> MediaAsset pipeline, AuditLog). This file is the schema layer of PLATFORM_PLAN P1.

---

## 0. What changed v4.0 → v5.0 (model migration table)

| v4.0 model | v5.0 fate | Why |
|---|---|---|
| `FinancingProduct` | **RENAMED + EXTENDED** → `FinancierService` (+ `serviceKind` FINANCING\|ACCREDITATION) | Owner ruling #1 — services, not products |
| `FinancingProductAttribute` | renamed → `FinancierServiceAttribute` | follows the rename |
| `FinancingProductCoverage` | renamed → `FinancierServiceCoverage` | follows the rename |
| `FinancingProductRequirement` | **DELETED** — replaced by the requirements engine (§3.5) | Owner ruling #3 — collateral/doc enums are not flexible enough; general+specific conditions with types, ordering, per-service attachment |
| `FinancingRequestInvite` | **DELETED** | Owner routing model is exclusive-vs-multi; multi = sibling requests sharing `multiGroupId` (DP-25). v4's open-to-matching (DP-4) is deferred (DP-28) |
| `ApplicantDocument` | **REPLACED** → `AccountDocument` (universal: all users + orgs, verification + expiry tracking) + thin `RequestAttachment` link | Owner ruling #5 |
| `AccreditationProgram` | **DELETED** — an accreditation program IS a `FinancierService` (`serviceKind=ACCREDITATION`) | Owner ruling #4 — the financier's acceptance requirements come from their service, one engine |
| `AccreditationCriterion` | **DELETED** — replaced by `ConditionTemplate` + `ServiceRequirement` | Same engine serves financing + accreditation |
| `SupplierAccreditation` | **REPLACED** → `AccreditationRequest` (full lifecycle incl. platform gate, grant-on-request, revocation, renewal) | Owner ruling #2+#4 |
| `FinancingRequest` | **v3** — `serviceId` required, platform-gate fields, `multiGroupId`, gate status machine | Owner rulings #1+#2 |
| `FinancierProfile`, `FinancierBranch`, `FinancingOffer(+Installment)`, `FinancingAgreement`, `FinancingEvent`, `FinancingFee` | carried over unchanged (relations re-pointed) | still correct |
| **NEW** | `ConditionTemplate`, `ConditionOption`, `ServiceRequirement`, `RequirementSubmission`, `AccountDocument`, `RequestAttachment`, `AccreditationRequest` | the engine + gate + universal docs |

Model count: v4 = 17 → **v5 = 18** (net: −5 deleted, +6 added, 1 renamed pair).

---

## 1. Extraction evidence (what the competitor actually stores — retained from v4, re-read through the SERVICES lens)

### 1.1 Provider profile page (public)
Name + logo + institution type · rich about · tabs About/Services/Agents&Branches/Success-Stories ·
contact email/phone/addresses · Leaflet map marker · branch & agent entries · visitor stats · **services list**.

### 1.2 Financing service detail page (public — URL `/en/services/145`)
Name + owning provider · category taxonomy · description + features · murabaha annual cap 30% +
min 6-month repayment · **eligibility conditions list** · amountMin/amountMax in currency
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
`service_categories: []` on the account — the account-to-service-category relationship exists
in their model; v5 carries it as `FinancierService.category` + wizard selection, not account data.

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
  "guarantee_status": { "id": 7, "name": { "ar": "متوفرة", "en": "Available" } },
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
      "note": "عزيزنا العميل، نعتذر عن التأخير… يمكنك الآن التقدم على خدمات أخرى" } ] } }
```
**Note the field name: `service` — the competitor's own data model never says "product".
v4's `FinancingProduct.productId` was OUR mislabel; v5 fixes it (DP-22).**

### 1.8 Request list card + statuses
Activity name · request number · provider name · **service name** · request date · status chip ·
latest status note. Status set (codes): `under-review` → `under-study` → `approved` → `paid` →
`completed`, plus `rejected`, `auto-rejected`, `cancelled-by-customer`.
**Their `under-review` happens at the AGGREGATOR (the platform) before the provider studies the
file — exactly our PLATFORM GATE (§5.1). The competitor does it passively; v5 makes it an
enforced workflow (DP-23).**

---

## 2. The five owner rules, formalized (governing this domain)

**R-1 — ZERO JSON.** No `Json` columns, no JSON-in-`Text` blobs, anywhere in the financier domain.
Every list is a **child table** with FKs; every address is **typed scalar columns**; every
schedule is an **installment table**; every select option is a **ConditionOption row**. (Legacy
Json columns elsewhere — `Product.images`, `Organization.billingAddress`, `AuditLog.metadata`,
`RfqSetting.value`, … — are FROZEN legacy, not extended. Financing status notes use
`AuditLog.summary` text, never `AuditLog.metadata`.)

**R-2 — SINGLE ENTRY.** Every data point lives in EXACTLY ONE place and is referenced everywhere
else. Personal data on `User`; documents on `AccountDocument` (uploaded + verified ONCE, reused
by every request); per-application facts on the request; money schedules on the offer; status
history in the existing audit substrate. The competitor's own API proves the pattern:
`fund-order.account = {id, name}` — reference only.

**R-3 — REUSE THE EXISTING SUBSTRATE.** Before adding any column or table, prove no existing
home exists. v5.0 reuses: `Organization` (legal identity, orgType, status, verifiedAt, industry,
taxId), `OrganizationMember` (financier staff — DP-1), `MediaAsset` (the ONLY upload/storage
subsystem), `Sequence` (`FIN`/`AGR`/`ACC`), `AuditLog` + `Notification` (status history + notes),
`RfqSetting` (financing settings panels), `Rfq`/`Quote` (financier↔vendor quotation workflows —
owner capability "manage price quotations … mirroring existing B2B workflows" needs ZERO new
tables; see §9.10). New tables carry ONLY facts with no home — each justified in §8.

**R-4 — THE PLATFORM GATE (new — the essence of the platform's operation).**
No financing or accreditation request is EVER visible to a financier until platform management
has verified **all required conditions** for the applied-for service — documents and eligibility
criteria. Requests failing verification are **RETURNED_FOR_COMPLETION** to the applicant with
per-requirement decision notes; incomplete or incorrect requests are **never forwarded**.
Enforced structurally (status machine §5.1) AND at query level (financier inbox queries filter
`FORWARDED_TO_FINANCIER` and later states only — a financier literally cannot list a request
that has not passed the gate).

**R-5 — FLEXIBLE REQUIREMENTS (new).**
Conditions come in exactly two flavors, both first-class:
- **GENERAL** — platform-curated, reusable across many services and many financiers ("valid
  commercial registration", "6-month bank statement", "valid national ID"). ONE definition,
  many attachments.
- **FINANCIER-SPECIFIC** — created privately by a financier for their own services.
Both attach to a financier's **service** via `ServiceRequirement` (with per-attachment config:
required/optional, ordering, instructions, validity window, auto-pass flag). Eight typed
condition kinds (§3.5) cover documents, profile completeness, declarations, free answers, and
choices — with ZERO JSON. The management interfaces (admin library + financier composer) must
be flexible, easy, and comprehensive (FINANCIER_PLAN §5).

---

## 3. The schema

> Conventions honored: MySQL `@db.*` types, `Decimal(12,2)` money, string status enums validated by
> TS unions + zod (matches every existing model), `Sequence` service for business numbers
> (D-006), org-membership auth in services (guards pattern), settings via `RfqSetting` registry.
> **Zero `Json` columns below — by construction.**

### 3.0 Reused existing models — NOTHING duplicated on top of them

| Existing model | What this domain uses it for | What we deliberately DO NOT add |
|---|---|---|
| `User` | Applicant identity + additive profile scalars (§3.1); financier staff via org membership | No `ApplicantProfile` table — profile data stays on `User` |
| `Organization` | Financier legal identity: `name`, `legalName`, `orgType` (BANK\|MFI\|EWALLET), `website`, `taxId`, `registrationNumber`, `industry`, `status` (PENDING_VERIFICATION\|ACTIVE\|SUSPENDED\|REJECTED), `verifiedAt`, `notes` | No second name/legalName/status/verifiedAt on `FinancierProfile`; no `businessInfo.industry` — `Organization.industry` exists |
| `OrganizationMember` | Financier staff access (OWNER\|ADMIN\|BUYER\|APPROVER\|VIEWER) — no new global role (DP-1); financier orgs may ALSO participate in `Rfq`/`Quote` as any member (vendor-quotes capability, §9.10) | No `FINANCIER` role |
| `MediaAsset` | ALL uploads: KYC, guarantee docs, studies, logos — sha256-deduped, rendition-processed | No storageKey/fileName/size on `AccountDocument` — that IS `MediaAsset` |
| `Sequence` | `FIN` → `FR-YYYY-######`, `AGR` → `AGR-YYYY-######`, `ACC` → `ACC-YYYY-######` (D-006) | No per-domain counters; offers stay id-addressed (DP-12) |
| `AuditLog` + `Notification` | Status history + platform/financier/applicant notes (DP-15) — every gate action is audited | No `financing_status_history` table |
| `RfqSetting` | `financing` section panels (§6) | No new settings table |
| `Rfq` / `Quote` / `Order` | `targetType` references for QUOTE / ORDER / RFQ_LINE financing; the financier↔vendor quotation capability (§9.10) | No copy of quote/order data into requests |

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

  // ── financing-domain relations (pure declarations) ──
  accountDocuments        AccountDocument[]        @relation("AccountDocumentsOwner")
  documentsReviewed       AccountDocument[]        @relation("AccountDocumentsReviewedBy")
  financingRequests       FinancingRequest[]       @relation("FinancingRequests")
  financingOffers         FinancingOffer[]         @relation("FinancingOffers")
  financingEventsReported FinancingEvent[]         @relation("FinancingEventsReportedBy")
  accreditationsSubmitted AccreditationRequest[]   @relation("AccreditationsSubmitted")
  accreditationsDecided   AccreditationRequest[]   @relation("AccreditationsDecidedBy")
  accreditationsRevoked   AccreditationRequest[]   @relation("AccreditationsRevokedBy")
  gateReviewsFinancing    FinancingRequest[]       @relation("FinancingPlatformReviews")
  gateReviewsAccreditation AccreditationRequest[] @relation("AccreditationPlatformReviews")
  submissionsVerified     RequirementSubmission[]   @relation("RequirementSubmissionsVerifiedBy")
  conditionTemplatesCreated ConditionTemplate[]    @relation("ConditionTemplatesCreatedBy")
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
  minTicket      Decimal?      @db.Decimal(12, 2) // routing hint; service-level ranges remain authoritative
  maxTicket      Decimal?      @db.Decimal(12, 2)
  viewCount      Int           @default(0)        // public profile stats (competitor: 11,449 views)
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  branches                   FinancierBranch[]
  services                    FinancierService[]
  conditionTemplates          ConditionTemplate[]   @relation("FinancierConditionTemplates")

  @@index([organizationId])
}
```

### 3.3 FinancierBranch — typed address columns (no Json, no geo tables)

```prisma
model FinancierBranch {
  id                 String          @id @default(cuid())
  financierProfileId String
  financierProfile   FinancierProfile @relation(fields: [financierProfileId], references: [id], onDelete: Cascade)
  name               String          @db.VarChar(160)
  kind               String          @default("BRANCH") @db.VarChar(16) // BRANCH | AGENT | ATM
  street             String?         @db.VarChar(255)
  city               String?         @db.VarChar(120)
  district           String?         @db.VarChar(120)
  latitude           Decimal?        @db.Decimal(9, 6)
  longitude          Decimal?        @db.Decimal(9, 6)
  phone              String?         @db.VarChar(40)
  isActive           Boolean         @default(true)
  position           Int             @default(0)
  createdAt          DateTime        @default(now())
  updatedAt          DateTime        @updatedAt

  @@index([financierProfileId, isActive])
}
```

### 3.4 FinancierService — THE offering (renamed from FinancingProduct — DP-22)

> A financier's catalog consists of SERVICES. A service is either a **FINANCING** service
> (working capital, invoice financing, PO financing, equipment, vehicle, …) or an
> **ACCREDITATION** service (the financier's supplier-qualification program — its acceptance
> requirements live on it, §3.5). Every application — financing or accreditation — targets
> exactly ONE service, which is what makes the requirements checklist ALWAYS well-defined (R-4).

```prisma
model FinancierService {
  id                 String          @id @default(cuid())
  financierProfileId String
  financierProfile   FinancierProfile @relation(fields: [financierProfileId], references: [id], onDelete: Cascade)
  serviceKind        String          @db.VarChar(16)   // FINANCING | ACCREDITATION (DP-22/DP-26)
  category           String          @db.VarChar(24)
    // FINANCING kinds — OUR B2B trio + market taxonomy:
    //   WORKING_CAPITAL | INVOICE_FINANCING | PO_FINANCING | EQUIPMENT | VEHICLE | HOME
    //   | EDUCATION | AGRICULTURE | MICROENTERPRISE | SME | OTHER
    //   (competitor taxonomy: INVESTMENT | RURAL | ENERGY(green) | HOUSING | FISHERIES | AGRICULTURAL
    //    | SEASONAL | EQUIPMENT | OTHER — wizard ids 12..16, 1; folded into the set above)
    // ACCREDITATION kinds — SUPPLIER_QUALIFICATION | VENDOR_APPROVAL (v1 uses SUPPLIER_QUALIFICATION)
  name               String          @db.VarChar(160)
  summary            String?         @db.VarChar(500)  // one-line card text
  description        String?         @db.Text
  targetSegment      String?         @db.VarChar(16)   // BUSINESS | INDIVIDUAL | BOTH (DP-13)
  status             String          @default("ACTIVE") @db.VarChar(16) // DRAFT | ACTIVE | ARCHIVED
  currency           String          @default("YER") @db.VarChar(3)    // ISO-4217; NO currency table
  amountMin          Decimal?        @db.Decimal(12, 2)                 // null = open (ACCREDITATION kinds)
  amountMax          Decimal?        @db.Decimal(12, 2)                 // competitor's currency.min/max folds HERE
  rateType           String?         @db.VarChar(24) // MURABAHA_ANNUAL | FIXED_ANNUAL | FLAT_FEE
  rateMax            Decimal?        @db.Decimal(6, 3)  // e.g. 30.000 = 30%/yr cap (murabaha)
  feeFlat            Decimal?        @db.Decimal(12, 2)
  tenorMinMonths     Int?            // e.g. 6 (competitor floor)
  tenorMaxMonths     Int?
  repaymentFrequency String?         @db.VarChar(16) // MONTHLY | QUARTERLY | LUMP_SUM
  gracePeriodDays    Int?
  shariaCompliant    Boolean         @default(false)
  processingDays     Int?
  accreditationValidMonths Int?       // ACCREDITATION kind: lifetime of the grant once ACCREDITED
  accreditationFeeAmount  Decimal?   @db.Decimal(12, 2) // ACCREDITATION kind: fee (invoiced externally, D-002)
  viewCount          Int             @default(0)
  createdAt          DateTime        @default(now())
  updatedAt          DateTime        @updatedAt

  attributes            FinancierServiceAttribute[]   // features + eligibility text bullets (§3.4a)
  coverage              FinancierServiceCoverage[]     // geographic coverage (§3.4b)
  requirements          ServiceRequirement[]           // THE acceptance requirements (§3.5)
  financingRequests     FinancingRequest[]            // kind = FINANCING (service-enforced)
  accreditationRequests AccreditationRequest[]        // kind = ACCREDITATION (service-enforced)

  @@index([financierProfileId, status])
  @@index([serviceKind, category, status])
}
```

#### 3.4a FinancierServiceAttribute — text-bullet traits (competitor "features" + "eligibility conditions" list)
```prisma
model FinancierServiceAttribute {
  id        String           @id @default(cuid())
  serviceId String
  service   FinancierService @relation(fields: [serviceId], references: [id], onDelete: Cascade)
  kind      String           @db.VarChar(24) // FEATURE | ELIGIBILITY_CONDITION
  position  Int              @default(0)
  text      String           @db.VarChar(500)

  @@unique([serviceId, kind, position])
  @@index([serviceId, kind])
}
```
*(v4's `FinancingProductRequirement` (COLLATERAL_ACCEPTED / DOCUMENT_REQUIRED enum traits) is
DELETED — superseded by the flexible requirements engine below.)*

#### 3.4b FinancierServiceCoverage — geographic coverage, region NAMES (DP-16: no geo tables in v1)
```prisma
model FinancierServiceCoverage {
  id         String           @id @default(cuid())
  serviceId  String
  service    FinancierService @relation(fields: [serviceId], references: [id], onDelete: Cascade)
  regionName String           @db.VarChar(120) // normalized (trim/case-fold) at write; matched
                                               // case-insensitively vs FinancingRequest.activityCity

  @@unique([serviceId, regionName])
  @@index([serviceId])
}
```

### 3.5 THE REQUIREMENTS ENGINE — ConditionTemplate + ConditionOption + ServiceRequirement (R-5)

> This is the subsystem the owner called **"the essence of the platform's operation"**'s sibling:
> the flexible conditions machinery the platform gate verifies against. Two flavors (R-5):
> templates with `scope = GENERAL` form the platform-curated shared library (used by many
> financiers on many services); templates with `scope = FINANCIER` are private to one financier.
> Both attach to a service via `ServiceRequirement` rows — one definition, many attachments.

```prisma
model ConditionTemplate {
  id              String   @id @default(cuid())
  scope           String   @db.VarChar(16)  // GENERAL | FINANCIER (R-5)
  organizationId  String?                    // null  = GENERAL — platform library, admin-managed
                                            // set  = FINANCIER — private to that financier org
  organization    Organization? @relation("FinancierConditionTemplates", fields: [organizationId], references: [id])
  conditionType   String   @db.VarChar(16)
    // DOCUMENT       → applicant must attach an AccountDocument of documentType
    // PROFILE_FIELD  → applicant's User/Organization profile must contain a field (auto-evaluable)
    // DECLARATION    → applicant must assert a statement (checkbox, stamped)
    // TEXT           → free-text answer
    // NUMBER         → numeric answer (optionally min/max via validationRuleMin/Max)
    // DATE           → date answer (e.g. license issue date)
    // SELECT         → single choice from ConditionOption rows (R-1 — no Json options!)
    // MULTI_SELECT   → multiple choices from ConditionOption rows
  code            String?  @db.VarChar(32)   // optional stable ref, e.g. "COM-REG" (uniqueness
                                              // enforced in service layer — MySQL allows NULL dupes)
  title           String   @db.VarChar(160)  // e.g. "Valid commercial registration"
  description     String?  @db.Text          // instructions shown to the applicant
  profileFieldKey String?  @db.VarChar(64)   // PROFILE_FIELD only — closed set, zod-validated:
                                              //   user.phone | user.identityNumber | user.dateOfBirth
                                              //   | org.taxId | org.registrationNumber | org.industry
  documentType    String?  @db.VarChar(32)   // DOCUMENT only — expected AccountDocument.documentType
  validationMin   Decimal? @db.Decimal(12, 2) // NUMBER only — inclusive lower bound
  validationMax   Decimal? @db.Decimal(12, 2) // NUMBER only — inclusive upper bound
  validityMonths  Int?                       // evidence freshness window (e.g. bank statement ≤ 3 months old)
  isRepeatable    Boolean  @default(false)   // DOCUMENT only — multiple docs allowed (e.g. 6× monthly statements)
  isActive        Boolean  @default(true)
  createdById     String                     // admin (GENERAL) or financier staff (FINANCIER)
  createdBy       User @relation("ConditionTemplatesCreatedBy", fields: [createdById], references: [id])
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  options             ConditionOption[]
  serviceRequirements ServiceRequirement[]

  @@index([scope, organizationId, isActive])
  @@index([conditionType, isActive])
}

// SELECT / MULTI_SELECT choices — every list a table (R-1).
model ConditionOption {
  id                  String           @id @default(cuid())
  conditionTemplateId String
  conditionTemplate   ConditionTemplate @relation(fields: [conditionTemplateId], references: [id], onDelete: Cascade)
  value               String           @db.VarChar(160) // stored + displayed (e.g. "Sana'a")
  position            Int              @default(0)

  @@unique([conditionTemplateId, value])
  @@index([conditionTemplateId, position])
}

// The attachment: ONE template on ONE service, with per-service config.
model ServiceRequirement {
  id                  String           @id @default(cuid())
  serviceId           String
  service             FinancierService @relation(fields: [serviceId], references: [id], onDelete: Cascade)
  conditionTemplateId String
  conditionTemplate   ConditionTemplate @relation(fields: [conditionTemplateId], references: [id])
  isRequired          Boolean          @default(true)  // optional conditions inform but never gate
  displayOrder        Int              @default(0)
  instructions        String?          @db.VarChar(500) // financier's per-service override text
  autoPassAccredited  Boolean          @default(false)  // auto-VERIFIED when the applicant org holds
                                                        // a live accreditation from THIS financier (DP-26)
  isActive            Boolean          @default(true)
  createdAt           DateTime         @default(now())
  updatedAt           DateTime         @updatedAt

  submissions RequirementSubmission[]

  @@unique([serviceId, conditionTemplateId])
  @@index([serviceId, isActive, displayOrder])
}
```

**Worked example — one general condition, three funders, one service each:**
`ConditionTemplate(scope=GENERAL, conditionType=DOCUMENT, documentType=COMMERCIAL_REG,
title="Valid commercial registration")` — attached to Al-Amal Bank's "E-Loan" service, Al-Kuraimi's
"Working Capital" service, and Thamar's "SME Growth" service as three `ServiceRequirement` rows
(different `isRequired`/`instructions` per service). The definition lives ONCE; each financier
also adds their own `scope=FINANCIER` templates ("2 guarantors on staff", "Al-Kuraimi account ≥ 6
months") that nobody else can see or attach.

### 3.6 RequirementSubmission — per-request checklist row + THE GATE's verification unit

> One row per (request × service-requirement). This is what the platform admin verifies
> item-by-item, and what MUST be all-`VERIFIED` (or `WAIVED` with a note) before the request can
> be forwarded (R-4). Answers are TYPED columns — zero JSON (R-1).

```prisma
model RequirementSubmission {
  id                  String   @id @default(cuid())
  serviceRequirementId String
  serviceRequirement  ServiceRequirement @relation(fields: [serviceRequirementId], references: [id], onDelete: Cascade)

  // ── parent: EXACTLY ONE set (service-enforced; both FKs keep cascade integrity) ──
  financingRequestId    String?
  financingRequest      FinancingRequest?   @relation(fields: [financingRequestId], references: [id], onDelete: Cascade)
  accreditationRequestId String?
  accreditationRequest  AccreditationRequest? @relation(fields: [accreditationRequestId], references: [id], onDelete: Cascade)

  status          String    @default("PENDING") @db.VarChar(16)
    // PENDING | SUBMITTED | VERIFIED | REJECTED | WAIVED
    //   PENDING  — checklist item visible, nothing supplied yet
    //   SUBMITTED — applicant supplied answer/document (or PROFILE_FIELD auto-evaluated true)
    //   VERIFIED — PLATFORM verified it (the gate's per-item verdict)
    //   REJECTED — PLATFORM rejected it — decisionNote is REQUIRED in this state
    //   WAIVED   — platform waived an OPTIONAL requirement — decisionNote REQUIRED
  valueText       String?   @db.VarChar(500)   // TEXT / DECLARATION / SELECT answers
  valueNumber     Decimal?  @db.Decimal(12, 2) // NUMBER answers
  valueDate       DateTime?                    // DATE answers
  accountDocumentId String?                    // DOCUMENT evidence — REUSE of an AccountDocument
  accountDocument AccountDocument? @relation(fields: [accountDocumentId], references: [id])
                                               // (uploaded ONCE at account level, attached here — R-2)
  submittedAt     DateTime?
  verifiedAt      DateTime?
  verifiedById    String?                     // the platform admin (or system for autoPass)
  verifiedBy      User? @relation("RequirementSubmissionsVerifiedBy", fields: [verifiedById], references: [id])
  decisionNote    String?   @db.VarChar(500)  // rejection reason / waiver reason — shown to applicant
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@unique([financingRequestId, serviceRequirementId])
  @@unique([accreditationRequestId, serviceRequirementId])
  @@index([status])
}
```

**Gate completeness rule (service-layer, R-4):** a request may move to `FORWARDED_TO_FINANCIER`
only when every `RequirementSubmission` whose `serviceRequirement.isRequired = true` is in state
`VERIFIED` (or `WAIVED` with a decisionNote). `PENDING`/`SUBMITTED`/`REJECTED` items block the
transition — enforced in the transition guard + a DB-level pre-check in the same transaction.

### 3.7 AccountDocument + RequestAttachment — universal documents (R-2, DP-27)

> **Documents management for ALL users and accounts** (owner ruling #5): every user — buyer,
> seller, financier staff, individual applicant — and every organization owns a document vault.
> KYC evidence is uploaded ONCE, verified ONCE by the platform, and reused by every financing /
> accreditation / general KYC flow. Requests never own document bytes; they REFERENCE.

```prisma
model AccountDocument {
  id              String   @id @default(cuid())
  userId          String                  // owner/uploader — ALWAYS set (all users, not just applicants)
  user            User @relation("AccountDocumentsOwner", fields: [userId], references: [id], onDelete: Cascade)
  organizationId  String?                 // org-scope docs (company registry papers); null = personal
  organization    Organization? @relation("OrganizationAccountDocuments", fields: [organizationId], references: [id])
  mediaId         String                  // ← THE storage entry: MediaAsset carries
  media           MediaAsset @relation("AccountDocumentMedia", fields: [mediaId], references: [id])
                                          //    key/originalName/mime/size/sha256/renditions
  documentType    String   @db.VarChar(32)
    // NATIONAL_ID | PASSPORT | RESIDENCE_PERMIT | COMMERCIAL_REG | TAX_CARD | BUSINESS_LICENSE
    // | BANK_STATEMENT | FINANCIAL_STATEMENT | PROOF_OF_ADDRESS | GUARANTEE_DOC
    // | FEASIBILITY_STUDY | INVOICE | PURCHASE_ORDER | PROJECT_FILE | OTHER
  title           String?  @db.VarChar(160)
  issuedAt        DateTime?                // document's own issue date
  expiresAt       DateTime?                // freshness vs ConditionTemplate.validityMonths
  status          String   @default("PENDING") @db.VarChar(16) // PENDING | VERIFIED | REJECTED
  reviewedById    String?
  reviewedBy      User? @relation("AccountDocumentsReviewedBy", fields: [reviewedById], references: [id])
  reviewedAt      DateTime?
  note            String?  @db.Text         // verification / rejection note
  isActive        Boolean  @default(true)   // soft-delete (replaced by a newer version of the doc)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  submissions RequirementSubmission[]       // reuse links from request checklists

  @@index([userId, documentType, status])
  @@index([organizationId])
  @@index([mediaId])
}

// Free-form request attachments (wizard field 20: guarantee documents, studies, project files)
// that are NOT tied to a specific requirement. Loose-parent pattern (Dispute precedent) so ONE
// table serves both request types. The document itself still lives in AccountDocument (R-2).
model RequestAttachment {
  id                String  @id @default(cuid())
  parentType        String  @db.VarChar(24) // FINANCING_REQUEST | ACCREDITATION_REQUEST
  parentId          String  @db.VarChar(64)                    // loose FK (Dispute pattern)
  accountDocumentId String
  accountDocument   AccountDocument @relation("RequestAttachmentDocument", fields: [accountDocumentId], references: [id], onDelete: Cascade)
  kind              String  @db.VarChar(24) // GUARANTEE_DOC | STUDY | PROJECT_FILE | OTHER
  createdAt         DateTime @default(now())

  @@index([parentType, parentId])
  @@index([accountDocumentId])
}
```

### 3.8 FinancingRequest v3 — the financing application (`FR-YYYY-######` via `Sequence 'FIN'`)

```prisma
model FinancingRequest {
  id        String  @id @default(cuid())
  number    String  @unique @db.VarChar(32)

  // ── WHO — references ONLY, never copies of profile data (R-2) ──
  organizationId String?                         // applicant org (B2B); null = individual (DP-13)
  organization   Organization? @relation("FinancingRequestsByOrg", fields: [organizationId], references: [id])
  createdById    String                          // submitting User (org member or the individual)
  createdBy      User @relation("FinancingRequests", fields: [createdById], references: [id])

  // ── WHAT SERVICE — REQUIRED, service-scoped applications (DP-22; the competitor's
  //    fund-order always carries provider + service) ──
  serviceId       String
  service         FinancierService @relation(fields: [serviceId], references: [id])
                                             // serviceKind = FINANCING enforced in service layer
  targetType      String @db.VarChar(16)         // WORKING_CAPITAL | QUOTE | ORDER | RFQ_LINE
  targetId        String? @db.VarChar(64)        // quote/order/rfqLine id (loose FK, Dispute pattern)

  // ── MULTI-FINANCIER ROUTING (DP-25): EXCLUSIVE = null (default — this request goes to the
  //    service's owning financier only). MULTI = set — the wizard created N sibling requests
  //    (one per selected financier's matching service) sharing this groupId; the UI groups
  //    them for side-by-side offer comparison and tracking. ──
  multiGroupId    String? @db.VarChar(32)

  // ── ACTIVITY (wizard step 2, fields 1, 7–13, 17) ──
  activityStatus       String?    @db.VarChar(16)   // NEW | EXISTING
  activityName         String?    @db.VarChar(160)
  activityDescription  String?    @db.Text
  activityStartDate    DateTime?                     // null = not started yet
  activityCity         String?    @db.VarChar(120)   // matches service coverage (string, DP-16)
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
  //  financial evidence comes as typed AccountDocuments, e.g. FINANCIAL_STATEMENT)

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

  // ── CONSENT (wizard fields 21–22) ──
  applicantNotes   String?   @db.Text
  consentAt        DateTime?                  // step-1 data-transfer consent + terms, stamped at submit

  // ── THE PLATFORM GATE (R-4, DP-23) ──
  platformReviewedById String?                // the admin working the gate
  platformReviewedBy   User? @relation("FinancingPlatformReviews", fields: [platformReviewedById], references: [id])
  platformReviewedAt   DateTime?
  platformNote         String? @db.Text       // public-to-applicant review summary
  returnedAt           DateTime?              // set when RETURNED_FOR_COMPLETION
  returnedReason       String? @db.VarChar(500) // what was missing/incorrect (aggregate; per-item notes
                                                // live on RequirementSubmission.decisionNote)
  forwardedAt          DateTime?              // set when the gate PASSED — financier visibility starts HERE

  // ── LIFECYCLE (§5.1) ──
  status      String    @default("DRAFT") @db.VarChar(24)
    // DRAFT | SUBMITTED | UNDER_PLATFORM_REVIEW | RETURNED_FOR_COMPLETION
    // | FORWARDED_TO_FINANCIER | UNDER_FINANCIER_REVIEW | OFFERED | ACCEPTED
    // | DECLINED | EXPIRED | CANCELLED
  expiresAt   DateTime?
  submittedAt DateTime?
  closedAt    DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  submissions RequirementSubmission[]         // THE checklist (gate verifies these)
  offers    FinancingOffer[]

  @@index([organizationId, status])
  @@index([createdById, createdAt])
  @@index([status, createdAt])                 // gate queue: SUBMITTED + UNDER_PLATFORM_REVIEW
  @@index([serviceId])
  @@index([multiGroupId])
  @@index([targetType, targetId])
  @@index([activityCity])
}
```

### 3.9 FinancingOffer + installments (schedule proposed by the financier — R-1)

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
  collateralRequired String? @db.VarChar(24)  // enum from the guarantee taxonomy (§3.8)
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
**Offer comparison & tracking (owner capability):** within one request the financier may send
multiple offers (revised terms — applicant compares revisions); ACROSS financiers the applicant
compares the latest SENT offer of each sibling request sharing a `multiGroupId` (the "Apply to
multiple financiers" wizard outcome). Both surfaces render from these rows — no snapshot table.

### 3.10 FinancingAgreement — references the accepted offer; NO terms snapshot (DP-20)

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

### 3.11 FinancingEvent — track-only ledger (D-002; distinct from AuditLog: typed money facts)

```prisma
model FinancingEvent {
  id           String             @id @default(cuid())
  agreementId  String
  agreement    FinancingAgreement  @relation(fields: [agreementId], references: [id], onDelete: Cascade)
  type         String             @db.VarChar(24) // DISBURSEMENT | REPAYMENT | EARLY_SETTLEMENT | LATE_FEE | NOTE
  eventDate    DateTime
  amount       Decimal?           @db.Decimal(12, 2)
  note         String?           @db.VarChar(500)
  reportedById String?                              // financier staff who reported it
  reportedBy   User?              @relation("FinancingEventsReportedBy", fields: [reportedById], references: [id])
  createdAt     DateTime           @default(now())

  @@index([agreementId, eventDate])
}
```

### 3.12 FinancingFee — commission accounting, invoiced externally, admin marks PAID (D-001/002)

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

### 3.13 AccreditationRequest — the QUALIFICATION & ACCREDITATION flow (MAIN service — DP-26)

> A company seeks qualification/accreditation by a financier. It selects the financing
> financier (the owner's words), completes any missing requirements not already in its profile,
> the PLATFORM verifies and forwards once all conditions are met, and the financier grants or
> rejects. The grant itself lives ON the request (`status = ACCREDITED` + `validUntil`) — no
> separate grant entity (single entry). A live accreditation (a) unlocks RFQ send/receive
> participation with that financier (§9.10) and (b) auto-passes `autoPassAccredited` requirements
> on the financier's other services.

```prisma
model AccreditationRequest {
  id             String   @id @default(cuid())
  number         String   @unique @db.VarChar(32)   // ACC-YYYY-###### via Sequence 'ACC'

  // ── WHO — companies only (accreditation qualifies ORGANIZATIONS; individuals use financing) ──
  organizationId String                        // the applicant company
  organization    Organization @relation("AccreditationRequestsByOrg", fields: [organizationId], references: [id])
  submittedById   String                        // org member user
  submittedBy     User @relation("AccreditationsSubmitted", fields: [submittedById], references: [id])

  // ── WHAT — the financier's ACCREDITATION-kind service (their qualification program) ──
  serviceId      String
  service        FinancierService @relation(fields: [serviceId], references: [id])
                                            // serviceKind = ACCREDITATION enforced in service layer

  // ── MULTI-FINANCIER ROUTING (DP-25): EXCLUSIVE = null; MULTI = shared groupId across
  //    sibling accreditation requests (one per selected financier's program) ──
  multiGroupId   String? @db.VarChar(32)

  scopeNotes     String?  @db.VarChar(500)   // what the accreditation covers (e.g. "IT equipment suppliers")
  consentAt      DateTime?                    // data-transfer consent, stamped at submit

  // ── THE PLATFORM GATE (R-4) — same fields as FinancingRequest ──
  platformReviewedById String?
  platformReviewedBy   User? @relation("AccreditationPlatformReviews", fields: [platformReviewedById], references: [id])
  platformReviewedAt   DateTime?
  platformNote         String? @db.Text
  returnedAt           DateTime?
  returnedReason       String? @db.VarChar(500)
  forwardedAt          DateTime?

  // ── LIFECYCLE (§5.2) ──
  status         String   @default("DRAFT") @db.VarChar(24)
    // DRAFT | SUBMITTED | UNDER_PLATFORM_REVIEW | RETURNED_FOR_COMPLETION
    // | FORWARDED_TO_FINANCIER | UNDER_FINANCIER_REVIEW | ACCREDITED | REJECTED
    // | EXPIRED | REVOKED | CANCELLED
  submittedAt    DateTime?
  decidedById    String?                     // the financier's deciding staff user
  decidedBy      User? @relation("AccreditationsDecidedBy", fields: [decidedById], references: [id])
  decidedAt      DateTime?
  decisionNote   String?  @db.VarChar(500)   // financier's grant/reject note
  accreditedAt   DateTime?                    // grant stamp (ACCREDITED only)
  validUntil     DateTime?                    // grant lifetime — service.accreditationValidMonths default
  revokedById    String?                     // revocation (financier or platform admin)
  revokedBy      User? @relation("AccreditationsRevokedBy", fields: [revokedById], references: [id])
  revokedAt      DateTime?
  revocationReason String? @db.VarChar(500)
  expiresAt      DateTime?                    // REQUEST-level expiry (pre-decision), lazy sweep
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  submissions RequirementSubmission[]          // THE checklist (gate verifies these)

  @@unique([serviceId, organizationId])       // one accreditation record per financier-program per org;
                                              // renewals allowed after EXPIRED/REVOKED/REJECTED/CANCELLED
                                              // (service-enforced — Prisma partial unique unavailable)
  @@index([organizationId, status])
  @@index([status, createdAt])
  @@index([multiGroupId])
  @@index([validUntil])
}
```

---

## 4. Enum code mapping (competitor ⇄ Vendora)

| Concept | Competitor (API/DOM) | Vendora value |
|---|---|---|
| The offering | `service: {id, name}` (fund-order API) · `/en/services/{id}` | `FinancierService` (DP-22) |
| Activity status | `new` / `existing` | `NEW` / `EXISTING` |
| Previous financing | `false` / `true` | Boolean |
| Activity type | 12 project · 13 rural · 14 green-energy · 15 housing · 16 fisheries · 1 other | `INVESTMENT`/`RURAL`/`ENERGY`/`HOUSING`/`FISHERIES`/`OTHER` (+ our B2B trio & catalog extras) |
| Location/residence type | `ownership` / `own` / `rent` | `OWNED` / `RENTED` |
| Guarantee type | 59 personal · 345 bank · 346 gold · 347 commercial · 1 other (+ page: mortgage, convertible, self) | `PERSONAL_GUARANTEE`/`BANK_GUARANTEE`/`GOLD`/`COMMERCIAL`/`MORTGAGE`/`CONVERTIBLE_SECURITIES`/`SELF_GUARANTEE`/`OTHER` |
| Guarantee status | 7 · 8 · 9 · 1 | `AVAILABLE`/`PARTIALLY_AVAILABLE`/`UNAVAILABLE`/`OTHER` |
| Identity type | `personalCard` | `NATIONAL_ID` |
| Gender / marital | `male` / `single` | `MALE` / `SINGLE` |
| Currency | id 179 YER (+min/max) | ISO string `YER` — ranges on `FinancierService` |
| First status after submit | `under-review` (at the aggregator) | `UNDER_PLATFORM_REVIEW` (our ENFORCED gate — DP-23) |
| Provider study | `under-study` (at the provider) | `UNDER_FINANCIER_REVIEW` |

## 5. Status lifecycles (three machines — all gate-first)

### 5.1 FinancingRequest v3 — the gate is structural

```
                         ┌──────────────────────────(applicant edits + resubmits)──────────────┐
                         ▼                                                                    │
 DRAFT ──submit──▶ SUBMITTED ──admin opens──▶ UNDER_PLATFORM_REVIEW ──items missing/rejected──▶ RETURNED_FOR_COMPLETION
                                            │  (per-RequirementSubmission verification)
                                            │ ALL required items VERIFIED/WAIVED (R-4)
                                            ▼
                                   FORWARDED_TO_FINANCIER ──financier opens──▶ UNDER_FINANCIER_REVIEW
                                            │                                       │
                                            │ offer sent                        decline / no offer + expiresAt
                                            ▼                                       ▼
                                          OFFERED ──applicant accepts──▶ ACCEPTED │ DECLINED / EXPIRED
                                            │ applicant rejects/ignores
                                            ▼
                                    (offer DECLINED/EXPIRED; request may stay OFFERED for other offers
                                     or close via applicant CANCELLED)
 Any pre-acceptance state ──applicant cancels──▶ CANCELLED        (lazy sweep at expiresAt → EXPIRED)
 ACCEPTED ──▶ FinancingAgreement (AGR-) + FinancingFee(SUCCESS) accrued
```
- `FORWARDED_TO_FINANCIER` is the ONLY state from which a financier inbox query can see a request
  (statuses ≥ FORWARDED on the forward-ordered index). **A SUBMITTED request is platform-private
  by construction** (R-4).
- Re-submit after RETURNED_FOR_COMPLETION goes straight back to UNDER_PLATFORM_REVIEW (admin
  re-verifies; previously VERIFIED items may be preserved by the service when the resubmission
  didn't touch their evidence — documented behavior, FIN-3 DoD).

### 5.2 AccreditationRequest

```
 DRAFT ──▶ SUBMITTED ──▶ UNDER_PLATFORM_REVIEW ──▶ RETURNED_FOR_COMPLETION ⇄ (resubmit)
                                │ all required items VERIFIED/WAIVED
                                ▼
                     FORWARDED_TO_FINANCIER ──▶ UNDER_FINANCIER_REVIEW
                                │ grant                                │ reject
                                ▼                                      ▼
                           ACCREDITED ──(validUntil passes)──▶ EXPIRED   REJECTED
                                │
                                │ financier/platform revoke (reason REQUIRED)
                                ▼
                             REVOKED
 Any pre-decision state ──applicant──▶ CANCELLED
```
- ACCREDITED + validUntil in the future = **live accreditation** → RFQ participation unlock +
  `autoPassAccredited` requirement auto-verification on that financier's services (DP-26).
- Renewal = a NEW AccreditationRequest for the same service (old one EXPIRED/REVOKED) — the
  `@@unique([serviceId, organizationId])` constraint permits exactly one record per pair.

### 5.3 RequirementSubmission (the gate's unit)

```
 PENDING ──applicant supplies (answer / account-doc attach / profile-field auto-eval)──▶ SUBMITTED
 SUBMITTED ──platform verifies──▶ VERIFIED        (verifiedAt + verifiedById stamped)
 SUBMITTED ──platform rejects──▶ REJECTED          (decisionNote REQUIRED — shown to applicant)
 REJECTED ──applicant re-supplies──▶ SUBMITTED     (verifiedAt cleared)
 optional item ──platform waives──▶ WAIVED          (decisionNote REQUIRED)
 autoPassAccredited item + live accreditation from this financier ──system──▶ VERIFIED (verifiedById = null)
```

## 6. Sequences, settings, notifications & audit additions

- `SequencePrefix` union (sequences/service.ts:9): += `'FIN' | 'AGR' | 'ACC'` →
  `FR-YYYY-######`, `AGR-YYYY-######`, `ACC-YYYY-######`. Offers stay id-addressed (DP-12).
- `RfqSetting` registry — new `financing` SectionDef, panels:
  `general {enabled, requestExpiryDays, maxOffersPerRequest, platformReviewRequired (default TRUE — R-4), autoForwardWhenAllVerified}` ·
  `fees {financierSuccessPercent (default 0.75, 0–5), originationPercentCap}` ·
  `requirements {allowFinancierCustomConditions (default true), defaultValidityMonths, maxRequirementsPerService (default 40)}` ·
  `documents {allowedTypes, maxSizeMb}` ·
  `intake {requireConsent, wizardEnabled}` ·
  `accreditation {defaultValidMonths (default 12), allowMultiFinancier (default true)}`.
- `Notification.linkView` union (notifications/service.ts): += `'financing' | 'financier'`; new types:
  **PLATFORM_RETURNED_REQUEST, PLATFORM_FORWARDED_REQUEST, REQUIREMENT_VERIFIED, REQUIREMENT_REJECTED,
  DOCUMENT_VERIFIED, DOCUMENT_REJECTED**, FINANCING_REQUEST_RECEIVED (financier — fired at forward),
  OFFER_RECEIVED, OFFER_ACCEPTED, OFFER_DECLINED, OFFER_WITHDRAWN, ACCREDITATION_RECEIVED,
  ACCREDITATION_GRANTED, ACCREDITATION_REJECTED, ACCREDITATION_REVOKED, ACCREDITATION_EXPIRING,
  FEE_ACCRUED, AGREEMENT_STATUS_CHANGED, FINANCING_STATUS_CHANGED.
- `AuditLog` actions (UPPER_SNAKE, metadata Json NEVER used — R-1): PLATFORM_REVIEW_STARTED,
  REQUEST_RETURNED, REQUEST_FORWARDED, REQUIREMENT_VERIFIED / _REJECTED / _WAIVED,
  DOCUMENT_VERIFIED / _REJECTED, ACCREDITATION_GRANTED / _REJECTED / _REVOKED, OFFER_SENT /
  _ACCEPTED / _DECLINED / _WITHDRAWN, FEE_ACCRUED / _INVOICED / _PAID, FINANCING_STATUS_CHANGED.

## 7. Field-level traceability — every wizard field → ONE home (no-JSON edition)

| Wizard field (step) | Home (exactly one) |
|---|---|
| Name, Email (1) | `User.name`, `User.email` — EXISTING |
| Date of birth, Gender, Marital status, Nationality (1) | `User.dateOfBirth/gender/maritalStatus/nationality` — NEW scalars |
| Phone, WhatsApp (1) | `User.phone`, `User.whatsappNumber` — NEW scalars |
| Residence street / city / district (1) | `User.residenceStreet/residenceCity/residenceDistrict` — NEW scalars (v3 Json REMOVED) |
| Residence type (1) | `User.residenceType` |
| ID type, ID number (1) | `User.identityType`, `User.identityNumber` |
| ID image (1) | `AccountDocument` (userId, type NATIONAL_ID) → `mediaId → MediaAsset` — uploaded ONCE, reused by every request |
| Data-transfer consent + terms (1, 2) | `FinancingRequest.consentAt` / `AccreditationRequest.consentAt` (stamped at submit) |
| Service provider / service name (post) | `service → FinancierProfile → organizationId → Organization` / `service.name` — ONE reference chain |
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
| Attachments (2) | `RequestAttachment` → `AccountDocument` → `MediaAsset` |
| Service's required conditions (competitor page list) | `ServiceRequirement` + `ConditionTemplate` (§3.5 — the flexible engine) |
| Notes (2) | `applicantNotes` |
| Review step (3) | NO storage — renders User + request + checklist by reference |
| Request number (post) | `number` via `FIN` sequence (`ACC` for accreditation) |
| Request date (post) | `createdAt` / `submittedAt` |
| Status + note (post) | `status` + AuditLog.summary / Notification.body |
| Installments (post) | `FinancingOfferInstallment` rows on the accepted offer (frozen via DP-20) |
| Currency min/max (post) | `FinancierService.amountMin/amountMax` |
| `is_rating` (post) | deferred v2 (DP-17) |
| `branch` (post) | deferred v2 (DP-17) |
| B2B supplements (Flow 3) | `Organization.industry/taxId/registrationNumber/creditTermsDays` (EXISTING) + typed `AccountDocument` docs — v3's `businessInfo` Json DELETED |

## 8. Duplication audit — every competitor/owner structure → its ONE Vendora home

| Structure | Their storage | Our single home | Duplicate avoided |
|---|---|---|---|
| City / district lookups (`city_id`, `district_id`, name tables) | geo reference tables | free strings: `User.residenceCity/District`, `FinancingRequest.activityCity/District`, `FinancierBranch.city/district` (DP-16; existing precedent: `Order.city`) | NO geo tables, NO city enums, NO copied governorate lists |
| Applicant personal profile | users + profile parts | `User` additive scalars (§3.1) | no `ApplicantProfile`/`FinancingApplicant` table |
| `identity_attachment[]` storage | per-user file rows | `MediaAsset` + `AccountDocument` (thin verification layer, `mediaId` FK) | no parallel storage subsystem — no storageKey/fileName/size duplicates |
| Provider identity (name, legal name, status, verified) | providers table | `Organization` (+ orgType BANK/MFI/EWALLET); `FinancierProfile` holds financing facts only | no legalName/status/verifiedAt re-storage |
| B2B applicant facts | request JSON blobs | `Organization` existing columns + typed `AccountDocument` docs | no `businessInfo` Json |
| Currency entity w/ min/max | currencies table | ISO-3 string + `FinancierService.amountMin/Max` | no currency table |
| `fund_order_statuses[]` history | status-history table | `AuditLog.summary` + `Notification.body` | no new table/column (DP-15) |
| `installments[]` on request | request rows | `FinancingOfferInstallment` (financier proposes; frozen at acceptance) | no schedule on the request, no snapshot copy on the agreement |
| **General conditions reused by N funders (owner ruling #3)** | — (new requirement) | `ConditionTemplate(scope=GENERAL)` — ONE definition; N `ServiceRequirement` attachments | N financiers do NOT re-type the same condition; N services do NOT copy it |
| **Funder-specific conditions** | — (new requirement) | `ConditionTemplate(scope=FINANCIER, organizationId)` + `ServiceRequirement` | private library per financier; no cross-leak; no per-service re-typing |
| Condition select options | (would be Json arrays) | `ConditionOption` child rows (R-1) | no options blobs |
| Request requirement answers | (would be Json answers) | `RequirementSubmission` typed value columns + accountDocumentId link | no answers blobs; documents reused, not re-uploaded |
| Selected financiers list (multi routing) | request column | sibling requests sharing `multiGroupId` (DP-25) | no org-id array blob, no invite rows, no per-financier requirement ambiguity |
| Accreditation program + criteria + grant | 3 tables (v4) | `FinancierService(serviceKind=ACCREDITATION)` + the SAME requirements engine + `AccreditationRequest` | no parallel criteria table; one engine for both flows |
| KYC docs per request | per-request file rows | `AccountDocument` (account level, verified once) + `RequirementSubmission.accountDocumentId` / `RequestAttachment` links | same ID image uploaded ONCE across all requests (owner: "complete any missing requirements NOT ALREADY AVAILABLE in their profile") |

## 9. Deliberate deviations from the competitor (documented rationale)

1. **4-part Arabic name → single `User.name`** — existing surfaces depend on it.
2. **Login by phone → login by email** — existing auth code; phone is a contact field.
3. **Single-provider request → service-scoped + multi-financier sibling groups** — their
   "approved" = our OFFERED; we add offer comparison (within request revisions + across
   `multiGroupId` siblings), success fee, agreement tracking. Their reject-with-note UX noted for v2.
4. **Geo FK tables → free strings** (DP-16) — global platform, not a 22-governorate app.
5. **Currency entity → ISO string + service ranges.**
6. **`installments[]` on request → offer/agreement** — the schedule is the financier's proposal.
7. **`fund_order_statuses` → AuditLog + Notification.**
8. **`account {id,name}` reference** — matched and extended (org + service references).
9. **v4 additions (owner rulings):** zero JSON (R-1); substrate reuse (R-3) — documents over
   MediaAsset, slim FinancierProfile over Organization; agreement references the frozen offer
   instead of snapshotting terms (DP-20).
10. **v5 additions (owner rulings):** services not products — the competitor's own API field is
    `service` (§1.7) (DP-22); the PLATFORM GATE is structural, not a courtesy step (DP-23); the
    requirements engine is general+specific with 8 typed kinds (DP-24); multi-financier routing
    is sibling requests sharing `multiGroupId` (DP-25); accreditation is a MAIN service with
    grant-on-request, RFQ unlock, auto-pass (DP-26); documents are universal to all users and
    orgs (DP-27). **Vendor-quotes capability ("receiving quotes from approved vendors, relaying
    customer quote requests to these companies") deliberately needs ZERO new tables** —
    financier orgs already participate in the `Rfq`/`Quote` engine as members (RFQ creation is
    not role-restricted — verified), and "approved vendors" = orgs with a live ACCREDITED
    AccreditationRequest at that financier. The relay is a UX affordance on the
    financier console (create RFQ / invite accredited vendors), not schema.

## 10. Open decisions (DP list additions & supersessions)

- **DP-13**: Individual applicants — `FinancingRequest.organizationId` nullable. Recommend **YES** (kept from v4).
- **DP-14**: Additive `User` applicant-profile columns (§3.1 — 12 nullable scalars, no Json). Recommend **YES** (kept).
- **DP-15**: Status notes via existing AuditLog + Notification substrate. Recommend **YES** (kept).
- **DP-16**: No geo lookup tables in v1. Recommend **YES** (kept).
- **DP-17**: Financier ratings (`is_rating`) + branch-level request routing → v2 defer. Recommend **DEFER** (kept).
- **DP-18**: Zero-JSON doctrine. **YES — owner-set** (kept).
- **DP-19**: One storage subsystem (`mediaId → MediaAsset`). **YES — owner-set** (kept; `AccountDocument` inherits it).
- **DP-20**: Agreement references the frozen accepted offer. Recommend **YES** (kept).
- **DP-21** (v4 — product traits as three child tables): **SUPERSEDED by DP-22/DP-24** — Attribute/Coverage survive as trait tables; the Requirement trait table is replaced by the requirements engine.
- **DP-22 (NEW, owner-set)**: **Financiers offer SERVICES, not products** — `FinancierService` with `serviceKind` FINANCING | ACCREDITATION; competitor's own API field is `service`. **YES — owner-set.**
- **DP-23 (NEW, owner-set)**: **Platform verification gate is the essence of the platform** — no request reaches a financier without platform verification of ALL required conditions; incomplete/incorrect → RETURNED_FOR_COMPLETION with per-requirement notes; financier inbox queries structurally exclude un-forwarded requests. **YES — owner-set.**
- **DP-24 (NEW, owner-set)**: **Requirements engine** — GENERAL (platform-curated library) + FINANCIER-specific (private) condition templates, attached per-service via `ServiceRequirement`; 8 typed kinds (DOCUMENT / PROFILE_FIELD / DECLARATION / TEXT / NUMBER / DATE / SELECT / MULTI_SELECT); options as `ConditionOption` rows; per-request tracking in `RequirementSubmission`. **YES — owner-set** ("high flexibility … flexible, easy, and comprehensive management interface" = the admin library manager + financier composer in FINANCIER_PLAN §5).
- **DP-25 (NEW)**: **Multi-financier routing = sibling requests sharing `multiGroupId`** (EXCLUSIVE = single request; MULTI = N siblings created by one wizard session, grouped for comparison). v4's invite-table design REJECTED: with per-financier requirement checklists, a single shared request has no well-defined checklist/verdict. Recommend **YES**.
- **DP-26 (NEW, owner-set)**: **Accreditation as a MAIN service** — modeled as `FinancierService(serviceKind=ACCREDITATION)` + `AccreditationRequest`; grant lives on the request (ACCREDITED + validUntil + revocation); live grant unlocks RFQ participation with that financier and auto-passes `autoPassAccredited` requirements on their other services. **YES — owner-set.**
- **DP-27 (NEW, owner-set)**: **Universal document management** — `AccountDocument` for ALL users and organizations (not applicant-scoped), verified once, reused by all request types; free attachments via `RequestAttachment` link rows. **YES — owner-set.**
- **DP-28 (NEW)**: **v4 DP-4 (open-to-matching distribution) SUPERSEDED/deferred** — v1 requests are service-scoped (`serviceId` required). A future "open request" mode would need a category-level baseline checklist design. Recommend **DEFER to v2**.
- Carry-over: DP-10 (public directory), DP-11 (Islamic finance fields), DP-12 (offer numbering).
