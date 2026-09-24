# Vendora — FINANCIER DOMAIN SCHEMA v2.0 (competitor-extracted, code-grounded)

> THE data model for the financier module. Replaces the "too simple" 5-model draft.
> Source 1: **live extraction from ymp.ye** (rendered via browser — homepage, services catalog,
> product detail, providers directory, provider profile, request-CTA behavior).
> Source 2: our 6-flow spec + codebase conventions (recon file:line evidence).
> This is the schema layer of PLATFORM_PLAN P1; FINANCIER_PLAN.md §3 points here.

---

## 1. What the competitor actually stores (extracted evidence)

### 1.1 Provider profile page (ymp.ye/ar/service-providers/2 — Al-Kuraimi)
| Data on page | Evidence |
|---|---|
| Name + logo + institution type ("تمويل أصغر" microfinance) | heading h1 + logo + type chip |
| Rich about text (3 paragraphs, mission/history/values) | paragraphs |
| Tabs: **About / Services(6) / Agents & Branches(1) / Success Stories** | clickable headings w/ counts |
| Contact: email CS@kuraimibank.com, phone, physical address(es) | بيانات ومعلومات التواصل |
| **Geolocation on map** (Leaflet + OpenStreetMap, marker + zoom) | embedded map component |
| Branch/agent entries (name, kind وكيل=agent, location) | الوكلاء والفروع section |
| **Provider stats**: 11,449 visitors · 6 services | إحصائيات عن المزود |
| Success stories with dates | قصص النجاح links |
| Its products listed with links | الخدمات و التمويل |

### 1.2 Financing product detail page (ymp.ye/ar/services/70 — "مشروعي من الكريمي")
| Data on page | Evidence |
|---|---|
| Product name, owning provider (logo + link) | h1 + الخدمة مقدمة بواسطة |
| Category taxonomy (9): investment · individual · seasonal · corporate · agricultural · pension · housing · alternative-energy · electronic | filter chips on /services |
| Description + features ("مميزات الخدمة") | paragraphs |
| **Islamic rate model**: "معدل المرابحة السنوية لن يزيد عن 30%" (annual murabaha cap) + **min repayment 6 months** | strong text in details |
| **Conditions/eligibility** (rich list): nationality, residence, reputation, property proof, collateral | الشروط section |
| **Amount min / max in currency**: 99,996 – 100,000,000 YER | الحد الأدنى / الحد الأقصى |
| **Collateral types (5-value enum)**: personal guarantee · mortgage · bank guarantee · convertible securities · self-guarantee | أنواع الضمانات |
| **Geographic coverage**: 22 governorates list | أماكن تواجد الخدمة |
| **"طلب تمويل" (Request financing) CTA — auth-gated** (no form when logged out) | button behavior |
| Service tags (e.g. سبأكاش) | chip on card |

### 1.3 E-wallet providers (homepage cards)
E-wallets are first-class providers: جيب (Jeeb), موبايل موني (Mobile Money) — with services like
ATM withdrawal (سبأكاش), shopping, **payroll mass-payout service** (استلام الرواتب والمدفوعات الجماعية).

### 1.4 Content layer
Success stories (title+date), news, education center (course → lessons count + duration, e.g.
"الريادة وإدارة المشروعات الصغيرة — 6 دروس 19 دقيقة"), FAQ, privacy/terms.

---

## 2. The schema (Prisma-style, our conventions)

> Conventions honored: Decimal(12,2)/Json columns (no Prisma list types), string status enums
> w/ TS unions, Sequence numbers for business documents, `@unique` 1:1 links, org membership
> auth in services (guards.ts pattern), settings-scoped via existing RfqSetting registry.

### 2.1 FinancierProfile — the institution (1:1 Organization)
```prisma
model FinancierProfile {
  id                String   @id @default(cuid())
  organizationId    String   @unique                 // org with orgType BANK/MFI/EWALLET
  organization      Organization @relation(fields:[organizationId], references:[id])
  displayName       String   @db.VarChar(160)          // public name
  legalName         String?  @db.VarChar(200)
  institutionType   String   @default("MFI") @db.VarChar(16)   // BANK | MFI | EWALLET (mirror of orgType)
  licenseNumber     String?  @db.VarChar(64)
  regulator         String?  @db.VarChar(120)         // supervising authority
  about             String?  @db.Text                  // rich description (competitor: 3 paragraphs)
  logoMediaId       String?                          // media pipeline asset
  website           String?  @db.VarChar(255)
  contactEmail      String?  @db.VarChar(160)
  contactPhone      String?  @db.VarChar(40)
  hqAddress         Json?                             // {country, city, street, lat, lng}
  minTicket         Decimal  @default(0)  @db.Decimal(12,2)   // matching defaults
  maxTicket         Decimal  @default(0)  @db.Decimal(12,2)
  viewCount         Int      @default(0)              // competitor tracks visitor stats
  status            String   @default("PENDING_REVIEW") @db.VarChar(16)
                    // PENDING_REVIEW | ACTIVE | SUSPENDED | REJECTED
  verifiedAt        DateTime?
  verifiedById      String?                           // admin User
  notes             String?  @db.Text
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  branches          FinancierBranch[]
  products          FinancingProduct[]
  offers            FinancingOffer[]
  fees              FinancingFee[]
  programs          AccreditationProgram[]
}
```

### 2.2 FinancierBranch — agents & branches (competitor: "الوكلاء والفروع")
```prisma
model FinancierBranch {
  id                  String  @id @default(cuid())
  financierProfileId  String
  financierProfile    FinancierProfile @relation(fields:[financierProfileId], references:[id], onDelete: Cascade)
  name                String  @db.VarChar(160)
  kind                String  @default("BRANCH") @db.VarChar(16)   // BRANCH | AGENT | ATM
  address             Json?    // {city, street, lat, lng}
  phone               String? @db.VarChar(40)
  isActive            Boolean @default(true)
  createdAt           DateTime @default(now())
}
```

### 2.3 FinancingProduct — the offering (competitor: "الخدمات")
```prisma
model FinancingProduct {
  id                  String  @id @default(cuid())
  financierProfileId  String
  financierProfile    FinancierProfile @relation(fields:[financierProfileId], references:[id], onDelete: Cascade)
  name                String  @db.VarChar(160)
  description         String? @db.Text           // تفاصيل الخدمة
  features            String? @db.Text           // مميزات الخدمة
  category            String  @db.VarChar(24)
    // WORKING_CAPITAL | INVOICE_FINANCING | PO_FINANCING      (our B2B trio — Flows 2/3/5)
    // INVESTMENT | SEASONAL | AGRICULTURAL | HOUSING | ENERGY | EQUIPMENT  (competitor taxonomy)
  targetSegment       String  @default("SME") @db.VarChar(16)   // INDIVIDUAL | SME | CORPORATE
  currency            String  @default("USD") @db.VarChar(3)
  amountMin           Decimal @default(0) @db.Decimal(12,2)    // competitor: الحد الأدنى
  amountMax           Decimal @default(0) @db.Decimal(12,2)    // competitor: الحد الأقصى
  rateType            String  @default("MURABAHA_ANNUAL") @db.VarChar(16)
    // MURABAHA_ANNUAL (Islamic cost-plus) | FIXED_ANNUAL | FLAT_FEE
  rateMax             Decimal @default(0) @db.Decimal(6,3)     // competitor: murabaha cap 30%
  feeFlat             Decimal? @db.Decimal(12,2)               // one-off fee if FLAT_FEE
  tenorMinMonths      Int      @default(1)                     // competitor: min 6 months
  tenorMaxMonths      Int      @default(12)
  repaymentFrequency  String   @default("MONTHLY") @db.VarChar(12)  // MONTHLY | WEEKLY | QUARTERLY | BALLOON
  gracePeriodDays     Int      @default(0)
  shariaCompliant     Boolean  @default(false)
  collateralRequired  Boolean  @default(false)
  collateralTypes     Json?     // [PERSONAL_GUARANTEE | MORTGAGE | BANK_GUARANTEE |
                               //  CONVERTIBLE_SECURITIES | SELF_GUARANTEE | NONE]
  conditions          String?  @db.Text          // competitor: الشروط (eligibility list)
  documentsRequired   Json?     // [BUSINESS_LICENSE, FINANCIAL_STATEMENT, ...] doc-type keys
  processingDays      Int?                          // SLA
  coverageRegions     Json?     // ["SA","AD","TA",...] region codes (competitor: 22 governorates)
  status              String   @default("DRAFT") @db.VarChar(16)  // DRAFT | ACTIVE | ARCHIVED
  viewCount           Int      @default(0)
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
  offers              FinancingOffer[]
}
```

### 2.4 FinancingRequest — the application (number: FR-YYYY-###### via 'FIN' sequence)
```prisma
model FinancingRequest {
  id                String   @id @default(cuid())
  number            String   @unique @db.VarChar(32)
  organizationId    String                              // applicant org (buyer OR supplier org)
  organization      Organization @relation(fields:[organizationId], references:[id])
  createdById       String                              // User, member of org (OWNER/ADMIN/BUYER)
  productId         String?                             // direct application to a product (competitor CTA)
  product           FinancingProduct? @relation(fields:[productId], references:[id])
  targetType        String   @db.VarChar(16)
                    // WORKING_CAPITAL (Flow 3) | QUOTE | ORDER (Flow 5) | RFQ_LINE (Flow 2 super-cart line)
  targetId          String?                             // quote/order/rfqLine id
  category          String? @db.VarChar(24)             // mirrors product taxonomy
  amountRequested   Decimal  @db.Decimal(12,2)
  currency          String   @default("USD") @db.VarChar(3)
  tenorRequestedMonths Int?
  purpose           String?  @db.Text                    // free-text business purpose
  businessInfo      Json?    // {industry, yearsOperating, monthlyRevenue, employeeCount, existingDebt}
  collateralOffered Json?   // offered collateral types + description
  distributionMode  String   @default("OPEN") @db.VarChar(16)   // OPEN | BUYER_SELECTED
  selectedFinanciers Json?   // [orgId] when BUYER_SELECTED
  status            String   @default("DRAFT") @db.VarChar(16)
    // DRAFT | SUBMITTED | UNDER_REVIEW | INFO_REQUESTED | OFFERED | ACCEPTED
    // | DECLINED_ALL | EXPIRED | CANCELLED | WITHDRAWN
  expiresAt         DateTime?
  submittedAt       DateTime?
  closedAt          DateTime?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  documents         ApplicationDocument[]
  offers            FinancingOffer[]
  fees              FinancingFee[]
}
```

### 2.5 ApplicationDocument — the uploads (competitor: conditions demand proofs)
```prisma
model ApplicationDocument {
  id          String   @id @default(cuid())
  requestId   String
  request     FinancingRequest @relation(fields:[requestId], references:[id], onDelete: Cascade)
  type        String   @db.VarChar(32)
    // BUSINESS_LICENSE | ID_DOCUMENT | FINANCIAL_STATEMENT | BANK_STATEMENT
    // | TAX_REGISTRATION | PROPERTY_PROOF | INVOICE | PURCHASE_ORDER | OTHER
  storageKey  String   @db.VarChar(512)      // existing media pipeline (local-disk adapter)
  fileName    String   @db.VarChar(255)
  sizeBytes   Int?
  status      String   @default("PENDING") @db.VarChar(16)   // PENDING | VERIFIED | REJECTED
  reviewedById String?                        // financier staff User
  reviewedAt  DateTime?
  note        String?  @db.Text               // rejection/verification note
  createdAt   DateTime @default(now())
}
```

### 2.6 FinancingOffer — the bid (mirrors Quote lifecycle)
```prisma
model FinancingOffer {
  id                  String   @id @default(cuid())
  requestId           String
  request             FinancingRequest @relation(fields:[requestId], references:[id], onDelete: Cascade)
  financierProfileId  String
  financierProfile    FinancierProfile @relation(fields:[financierProfileId], references:[id])
  productId           String?
  product             FinancingProduct? @relation(fields:[productId], references:[id])
  amountOffered       Decimal  @db.Decimal(12,2)
  currency            String   @default("USD") @db.VarChar(3)
  rateType            String   @db.VarChar(16)          // mirrors product
  rate                Decimal  @db.Decimal(6,3)
  feeOrigination      Decimal  @default(0) @db.Decimal(12,2)   // financier's origination fee
  feeFlat             Decimal? @db.Decimal(12,2)
  tenorMonths         Int
  repaymentFrequency  String   @default("MONTHLY") @db.VarChar(12)
  repaymentSchedule   Json?    // [{installmentNo, dueDate, amount}] — generated preview grid
  gracePeriodDays     Int      @default(0)
  collateralRequired Json?
  conditions          String?  @db.Text          // offer-specific conditions
  validUntil          DateTime?
  status              String   @default("DRAFT") @db.VarChar(16)
    // DRAFT | SENT | INFO_REQUESTED | ACCEPTED | DECLINED | EXPIRED | WITHDRAWN
  acceptedAt          DateTime?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
  agreement           FinancingAgreement?
  fees                FinancingFee[]
}
```

### 2.7 FinancingAgreement — the accepted deal (number: AGR-YYYY-###### via 'AGR' sequence)
```prisma
model FinancingAgreement {
  id              String   @id @default(cuid())
  number          String   @unique @db.VarChar(32)
  offerId         String   @unique
  offer           FinancingOffer @relation(fields:[offerId], references:[id])
  startDate       DateTime?
  endDate         DateTime?
  status          String   @default("ACTIVE") @db.VarChar(16)
                  // ACTIVE | COMPLETED | DEFAULTED | RESTRUCTURED
  termsSnapshot   Json     // full offer snapshot at acceptance (immutable evidence)
  fundingStatus   String   @default("PENDING") @db.VarChar(16)
                  // PENDING | REPORTED_FUNDED | REPORTED_SETTLED  (financier-reported)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  events          FinancingEvent[]
}
```

### 2.8 FinancingEvent — TRACK-ONLY ledger (D-002: platform never holds funds)
```prisma
model FinancingEvent {
  id              String   @id @default(cuid())
  agreementId     String
  agreement       FinancingAgreement @relation(fields:[agreementId], references:[id], onDelete: Cascade)
  type            String   @db.VarChar(16)
                  // DISBURSEMENT | REPAYMENT | EARLY_SETTLEMENT | LATE_FEE | NOTE
  occurredAt      DateTime                            // when financier says it happened
  amount          Decimal? @db.Decimal(12,2)
  reference       String?  @db.VarChar(160)           // financier's own reference
  reportedById    String                              // financier staff User (audit trail)
  note            String?  @db.Text
  createdAt       DateTime @default(now())
}
```

### 2.9 FinancingFee — platform revenue (mirrors Payout; Flow 3 origination / Flow 5 success fee)
```prisma
model FinancingFee {
  id                  String   @id @default(cuid())
  offerId             String   @unique
  offer               FinancingOffer @relation(fields:[offerId], references:[id])
  financierProfileId  String
  financierProfile    FinancierProfile @relation(fields:[financierProfileId], references:[id])
  requestId           String
  request             FinancingRequest @relation(fields:[requestId], references:[id])
  feeType             String @default("SUCCESS") @db.VarChar(16)   // SUCCESS | ORIGINATION | ACCREDITATION
  basisAmount         Decimal @db.Decimal(12,2)
  percent             Decimal @db.Decimal(6,3)
  amountDue           Decimal @db.Decimal(12,2)
  status              String @default("ACCRUED") @db.VarChar(16)
                      // ACCRUED | INVOICED | PAID | WAIVED
  invoicedAt          DateTime?
  paidAt              DateTime?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
}
```

### 2.10 Accreditation (Flow 4 — criteria as DATA, not code)
```prisma
model AccreditationProgram {
  id                    String   @id @default(cuid())
  ownerProfileId        String?                       // null = platform-owned program
  ownerProfile          FinancierProfile? @relation(fields:[ownerProfileId], references:[id])
  name                  String   @db.VarChar(160)
  description           String?  @db.Text
  criteria              Json     // data-driven: {requiredDocs[], minYearsOperating, minMonthlyRevenue, industries[]}
  feeAmount             Decimal  @default(0) @db.Decimal(12,2)   // supplier pays platform (invoiced externally)
  validityMonths        Int      @default(12)
  status                String   @default("ACTIVE") @db.VarChar(16)   // DRAFT | ACTIVE | ARCHIVED
  createdAt             DateTime @default(now())
  accreditations        SupplierAccreditation[]
}

model SupplierAccreditation {
  id              String   @id @default(cuid())
  programId       String
  program         AccreditationProgram @relation(fields:[programId], references:[id])
  organizationId  String                       // supplier org
  organization    Organization @relation(fields:[organizationId], references:[id])
  documents       Json      // [{type, storageKey, fileName}] (or ApplicationDocument-style table later)
  status          String   @default("APPLIED") @db.VarChar(16)
                  // APPLIED | UNDER_REVIEW | VERIFIED | REJECTED | EXPIRED
  reviewNote      String?  @db.Text
  reviewedById    String?
  verifiedAt      DateTime?
  expiresAt       DateTime?                      // auto-pass on financing apps while valid
  feePaidAt       DateTime?                       // accreditation fee settlement record
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

## 3. Sequences & settings additions

- `SequencePrefix` union (sequences/service.ts:9 — closed type): add `'FIN' | 'AGR'`
  → `FR-YYYY-######` (requests), `AGR-YYYY-######` (agreements). Offers stay id-addressed like Quote? No — Quote uses QTE; keep offers id-addressed or add 'FNO' (decide at implementation; default: FIN only, offers referenced inside request context).
- RfqSetting registry: new `financing` SectionDef — panels:
  `general {enabled, requestExpiryDays, maxOffersPerRequest}` ·
  `fees {financierSuccessPercent (default 0.75, 0–5), originationPercentCap}` ·
  `distribution {defaultMode, requireVerifiedProfile}` ·
  `documents {allowedTypes, maxSizeMb}`.
- `Notification.linkView` union += `'financier'`; new types: FINANCING_REQUEST_RECEIVED,
  OFFER_RECEIVED, OFFER_ACCEPTED, OFFER_DECLINED, OFFER_WITHDRAWN, DOC_VERIFIED/REJECTED,
  FEE_ACCRUED, AGREEMENT_STATUS_CHANGED.

## 4. Competitor → our model mapping (traceability)

| Competitor artifact | Our entity.field |
|---|---|
| Provider name/logo/type/about/email/map/branches/stats | FinancierProfile.* + FinancierBranch + viewCount |
| 9 service categories (chips) | FinancingProduct.category (extended with our B2B trio) |
| "الحد الأدنى/الأقصى" amounts | FinancingProduct.amountMin/amountMax |
| Murabaha cap 30% annual + min 6-month repayment | rateType=MURABAHA_ANNUAL, rateMax=30.000, tenorMinMonths=6 |
| الشروط eligibility list | FinancingProduct.conditions |
| 5 collateral types | FinancingProduct.collateralTypes Json enum |
| 22-governorate coverage | FinancingProduct.coverageRegions Json |
| "طلب تمويل" CTA (auth-gated) | FinancingRequest.productId direct application flow |
| E-wallets w/ payroll services | orgType EWALLET orgs (already in taxonomy) |
| Success stories / news / education | OUT OF P1 SCOPE (DP-9 deferred content layer) |
| Payroll mass payouts | Out of scope (wallet ops violate D-002 custody rule) |

## 5. Open product decisions (fold into PLATFORM_PLAN DP list)

- **DP-10**: Public financier directory (competitor-style browsing of institutions+products) vs
  authenticated-only. Recommend: authenticated buyer/supplier-only in v1 (matches our B2B model);
  public directory as a later storefront section.
- **DP-11**: Islamic finance fields (shariaCompliant, MURABAHA_ANNUAL rateType) — competitor is
  Yemen/Islamic-finance-first. Recommend: keep (cheap, differentiating, harmless if unused).
- **DP-12**: Offer numbering — FIN-only sequences (requests) with offers id-addressed (like
  OrderItem) vs separate FNO- prefix. Recommend FIN-only.
