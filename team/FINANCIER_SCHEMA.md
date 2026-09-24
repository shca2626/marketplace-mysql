# Vendora — FINANCIER DOMAIN SCHEMA v3.0 (wizard-complete, single-entry, code-grounded)

> THE data model for the financier module. Supersedes v2.0 (which covered only public pages).
> Three evidence sources, all field-level:
> 1. **Owner's wizard walk-through** (3-step financing application, submitted test request #3763).
> 2. **Live authenticated extraction** (agent-browser, owner-provided account): `/api/profile`,
>    `/api/fund-orders`, `/api/fund-order/3763` raw JSON, localStorage `userInfo` model, wizard DOM
>    input types + select option codes, "My requests" list + detail rendering.
> 3. **Our codebase recon** (schema.prisma, sequences/service.ts:9, notifications/service.ts:43,
>    guards.ts pattern, settings registry, MediaAsset/local-disk storage).
> This is the schema layer of PLATFORM_PLAN P1; FINANCIER_PLAN.md points here.
>
> **GOVERNING RULE (owner directive): integrity, no duplication — every data point lives in
> EXACTLY ONE place and is referenced everywhere else.** §2 formalizes this.

---

## 1. Extraction evidence (what the competitor actually stores)

### 1.1 Provider profile page (public — unchanged from v2)
Name + logo + institution type · rich about · tabs About/Services/Agents&Branches/Success-Stories ·
contact email/phone/addresses · Leaflet map w/ marker · branch & agent entries · visitor stats
(11,449 views) · products list.

### 1.2 Financing product detail page (public — unchanged from v2)
Name + owning provider · category taxonomy · description + features · **murabaha annual cap 30% +
min 6-month repayment** · eligibility conditions list · **amountMin/amountMax in currency**
(99,996 – 100,000,000 YER) · **collateral-type enum (5)** · **geographic coverage (22 governorates)** ·
auth-gated "طلب تمويل" CTA · service tags.

### 1.3 E-wallet providers (public — unchanged from v2)
E-wallets are first-class providers (Jeeb, Mobile Money) incl. payroll mass-payout services.

### 1.4 Content layer (public — unchanged from v2)
Success stories, news, education center (courses→lessons/duration), FAQ, privacy/terms. Deferred (DP-9).

### 1.5 Financing application wizard (auth-gated — NEW in v3)
3 steps, 22 controls, extracted from the live DOM (types + option codes):

**Step 1 — personal data review + consent.** NOT a form: the applicant's profile is rendered
read-only from the account, with one checkbox `info_agree` = "I have reviewed my personal
data / approval of personal data transfer" and an **"Edit profile"** button that navigates to the
profile editor. Personal data is therefore edited ONCE at the account level and only REFERENCED
by every application.

**Step 2 — activity data and financing amount (22 controls, in DOM order):**

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
| 16 | Financing purpose (الغرض) | textarea | free text ("زيادة الضمار" increase income) |
| 17 | Activity location type (نوع مكان النشاط) | select | `ownership` ملك · `rent` إيجار |
| 18 | Guarantee type (نوع الضمانة) | select | 59 personal · 345 bank · 346 gold · 347 commercial · 1 other |
| 19 | Guarantee status (حالة الضمانة) | select | 7 available · 8 partially · 9 unavailable · 1 other |
| 20 | Attachments (مرفقات) | file | optional multi — "guarantee documents, studies, project files" |
| 21 | Notes (ملاحظات) | textarea | free ("يا نجازاه") |
| 22 | Terms + privacy agreement | checkbox | required |

**Step 3 — review.** Renders every field from steps 1–2 grouped Personal / Residence / Identity /
Activity + financing — then submit → request appears in "My financing requests" (طلبات التمويل)
in the user dashboard with detail + "Cancel request" action.

### 1.6 Authenticated user model (NEW in v3 — localStorage `userInfo`, verbatim)
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
Profile page renders it as two read-only sections — **Personal data** (name, DOB, nationality,
gender, marital status, address, residence type, city, district, ID type, **ID number**,
ID image link) and **Contact** (WhatsApp, phone, email) — plus avatar upload. Login is **by phone**.

### 1.7 Financing request API model (NEW in v3 — `/api/fund-order/3763`, verbatim, decoded)
```json
{ "data": {
  "id": 3763, "account_id": 5967, "provider_id": 3,
  "account":   { "id": 5967, "name": "ali ali moh sa;" },          // ← REFERENCE ONLY, no profile copy
  "provider":  { "id": 3,   "name": { "ar": "بنك الأمل…", "en": "Alamal Bank" } },
  "service":   { "id": 62,  "name": { "ar": "الأمل تمويل الكتروني", "en": "Electronic loan product (E-Loan)" } },
  "project_title": "بقالة", "project_details": "بقالة",
  "project_starting_date": "2025-07-28", "project_address": "ش الرباط",
  "project_type":   { "id": 14, "name": { "ar": "تمويل الطاقة الخضراء", "en": "Green energy financing" } },
  "project_location_type": { "slug": "ownership", "name": { "ar": "ملك", "en": "Own" } },
  "district": { "id": 52, "name": { "ar": "آزَاْل", "en": "Azal" } },
  "city":     { "ar": "أمانة العاصمة", "en": "Amant Al-Asmah" },
  "amount": 500000,
  "currency": { "id": 64, "name": { "ar": "ريال يمني", "en": "Yemeni Riyal" },
                "minimum_amount": 30000, "maximum_amount": 500000 },   // ← product range surfaced via currency
  "purpose": "زيادة الضمار",
  "guarantee":        { "id": 59, "name": { "ar": "ضمانة شخصية", "en": "Personal guarantee" } },
  "guarantee_status": { "id": 7,  "name": { "ar": "متوفرة", "en": "Available" } },
  "guarantee_type_other": null, "guarantee_status_other": null, "project_type_other": null,
  "note": "يا نجازاه",                       // ← applicant's wizard note
  "attachment": [],                           // request evidence files
  "installments": [],                         // repayment schedule (empty at application)
  "branch": null,                             // optional provider branch reference
  "is_rating": false,                         // customer-rated-the-service flag
  "status": { "status": { "ar": "تم الغاء الطلب آلياً", "en": "Fund was canceled automatically" },
              "code": "auto-rejected" },
  "fund_order_statuses": [                    // ← STATUS HISTORY with per-transition note
    { "status": { "ar": "تم الغاء الطلب آلياً", "en": "Fund was canceled automatically" },
      "checked": true, "code": "rejected", "updated_at": "2026-09-05T19:22:02Z",
      "note": "عزيزنا العميل، نعتذر عن التأخير… يمكنك الآن التقدم على خدمات أخرى" } ],
  "created_at": "2026-08-31T19:21:39Z", "updated_at": "2026-09-05T19:22:02Z" } }
```
Note the **`account: {id, name}` only** — the competitor does NOT copy profile data into the
request. This is the single-entry architecture we must match (and improve on).

### 1.8 Request list card + statuses (NEW in v3)
"My financing requests" card shows: activity name (title) · request number · provider name ·
service (product) name · request date · status chip · latest status note.
Full status set (display names + API codes):
`under-review` → `under-study` → `approved` → `paid` → `completed`, plus
`rejected`, `auto-rejected` (تم الغاء الطلب آلياً), `cancelled-by-customer`.

---

## 2. The single-entry doctrine (owner directive, formalized)

1. **Personal data lives on `User` — nowhere else.** Applications render it by reference;
   the wizard's step 1 is a profile REVIEW + consent (with an "edit profile" escape hatch), never a
   second copy. (Competitor proof: `fund-order.account = {id, name}`.)
2. **Identity/KYC documents live at user level, uploaded once** (`ApplicantDocument` with
   `requestId = null`), and are reused by every future application. Request evidence
   (guarantee docs, studies) attaches to the request via the SAME table — one document subsystem.
3. **Activity, underwriting, ask and guarantee data live on `FinancingRequest`** — they are
   per-application facts, collected once per application.
4. **Money schedules live on the offer/agreement, never on the request** — the financier
   proposes `repaymentSchedule`; the accepted snapshot is frozen in `FinancingAgreement.termsSnapshot`.
5. **Status history and notes live in the existing audit substrate** (`AuditLog` rows +
   `Notification.body` delivery) — no new column, no new event table at request level.

Consequence: our `FinancingRequest` v2 below REPLACES the v2.4 generic buckets
(`businessInfo`, `collateralOffered`) with typed columns where the competitor has real fields,
and keeps ONE slim Json for B2B-only supplements that the competitor doesn't model.

---

## 3. The schema (Prisma-style, our conventions)

> Conventions honored: Decimal(12,2)/Json columns (no Prisma list types), string status enums
> w/ TS unions, Sequence numbers for business documents, `@unique` 1:1 links, org membership
> auth in services (guards.ts pattern), settings via existing RfqSetting registry.

### 3.1 User — additive applicant profile (the ONLY existing model we touch)

```prisma
model User {
  // … all existing fields & relations unchanged (id, email, password, name, image, role, …) …

  // ── Applicant profile (competitor step 1) — SINGLE source, additive, all nullable;
  //    B2C buyers are unaffected until they apply for financing ──
  phone          String?   @db.VarChar(40)    // رقم الهاتف — contact only; login stays email-based
  whatsappNumber String?   @db.VarChar(40)    // رقم الواتس اب
  dateOfBirth    DateTime?                     // تاريخ الميلاد
  gender         String?   @db.VarChar(16)    // MALE | FEMALE | OTHER          (male | female)
  maritalStatus  String?   @db.VarChar(16)    // SINGLE | MARRIED | DIVORCED | WIDOWED (single…)
  nationality    String?   @db.VarChar(64)    // country name/code (يمني → "Yemen")
  identityType   String?   @db.VarChar(16)    // NATIONAL_ID | PASSPORT | RESIDENCE_PERMIT | OTHER (personalCard → NATIONAL_ID)
  identityNumber String?   @db.VarChar(64)    // رقم الهوية (10101254747)
  residence      Json?                         // { street, district, city, country, building?, lat?, lng? }
  residenceType  String?   @db.VarChar(16)    // OWNED | RENTED (own/ownership → OWNED; rent → RENTED)

  applicantDocuments ApplicantDocument[] @relation("ApplicantDocuments")   // user-level KYC (requestId = null)
  financingRequests   FinancingRequest[]  @relation("FinancingRequests")   // requests created by this user
}
```
Deliberate deviation: competitor splits `name` into 4 Arabic name parts — we keep the single
existing `User.name` (auth, checkout and every surface already depend on it; display-only concern).

### 3.2 FinancierProfile — unchanged from v2.0
1:1 Organization (orgType BANK/MFI/EWALLET) · displayName/legalName/institutionType ·
licenseNumber/regulator · about · logo · website/contactEmail/contactPhone · hqAddress Json ·
minTicket/maxTicket · viewCount · status PENDING_REVIEW|ACTIVE|SUSPENDED|REJECTED · verifiedAt/
verifiedById · notes · relations branches/products/offers/fees/programs. (§2.2 of v2.)

### 3.3 FinancierBranch — unchanged from v2.0
name · kind BRANCH|AGENT|ATM · address Json {city, street, lat, lng} · phone · isActive. (§2.2 of v2.)

### 3.4 FinancingProduct — v3 delta: category list + coverage semantics
```prisma
model FinancingProduct {
  // … unchanged from v2.0 (name, description, features, targetSegment, currency,
  //    amountMin/amountMax — competitor's currency.min/max folds HERE, per product —
  //    rateType MURABAHA_ANNUAL|FIXED_ANNUAL|FLAT_FEE, rateMax, feeFlat,
  //    tenorMinMonths/tenorMaxMonths, repaymentFrequency, gracePeriodDays, shariaCompliant,
  //    collateralRequired, collateralTypes Json, conditions, documentsRequired Json,
  //    processingDays, status, viewCount) …
  category  String  @db.VarChar(24)
    // OUR B2B trio:  WORKING_CAPITAL | INVOICE_FINANCING | PO_FINANCING
    // competitor taxonomy: INVESTMENT | RURAL | GREEN_ENERGY(=ENERGY) | HOUSING | FISHERIES
    //                      | AGRICULTURAL | SEASONAL | EQUIPMENT | OTHER
    // (wizard ids 12,13,14,15,16,1 + public-page taxonomy, merged)
  coverageRegions Json?  // ["Sana'a","Aden",…] — city/region NAMES, matched case-insensitively
                         // (normalized equality) against FinancingRequest.activityCity. No geo
                         // lookup tables in v1 (DP-16).
}
```

### 3.5 FinancingRequest v2 — the application (number: `FR-YYYY-######` via `'FIN'` sequence)

```prisma
model FinancingRequest {
  id        String  @id @default(cuid())
  number    String  @unique @db.VarChar(32)

  // ── WHO — references ONLY, never copies of profile data ──
  organizationId String?                          // applicant org (B2B flows); null = individual applicant (DP-13)
  organization   Organization? @relation(fields:[organizationId], references:[id])
  createdById    String                           // submitting User (org member or the individual)
  createdBy       User @relation("FinancingRequests", fields:[createdById], references:[id])
  productId       String?                         // direct application to a product (competitor CTA "طلب تمويل")
  product         FinancingProduct? @relation(fields:[productId], references:[id])
  targetType      String @db.VarChar(16)           // WORKING_CAPITAL | QUOTE | ORDER | RFQ_LINE
  targetId        String?                         // quote/order/rfqLine id

  // ── ACTIVITY (wizard step 2, fields 1,7–13,17 — typed & queryable) ──
  activityStatus       String?    @db.VarChar(16)   // NEW | EXISTING            (new | existing)
  activityName         String?    @db.VarChar(160)  // بقالة
  activityDescription  String?    @db.Text          // وصف النشاط
  activityStartDate    DateTime?                    // تاريخ بدء النشاط (null = not started yet)
  activityCity         String?    @db.VarChar(120)  // المدينة — matches product coverageRegions
  activityDistrict     String?    @db.VarChar(120)  // المديرية
  activityAddress      String?    @db.VarChar(255)  // عنوان النشاط (street/landmark)
  activityLocationType String?    @db.VarChar(16)   // OWNED | RENTED            (ownership | rent)
  category             String?    @db.VarChar(24)   // mirrors FinancingProduct taxonomy (نوع النشاط)
  categoryOther        String?    @db.VarChar(160)  // free text when category = OTHER (project_type_other)

  // ── UNDERWRITING INPUTS (wizard step 2, fields 2–6) ──
  capitalAmount              Decimal? @db.Decimal(12,2)   // رأس المال
  ownContributionAmount      Decimal? @db.Decimal(12,2)   // customer contribution to the project
  monthlyInstallmentCapacity Decimal? @db.Decimal(12,2)   // installment capacity (monthly)
  previousFinancing          Boolean?                      // هل من تمويلات سابقة (false | true)
  otherIncomeSources         String?  @db.VarChar(500)     // other income sources
  businessInfo               Json?                         // B2B supplement ONLY (Flow 3):
                                                             // { industry, employeeCount, monthlyRevenue }
                                                             // — zero overlap with the typed columns above

  // ── THE ASK (wizard step 2, fields 14–16) ──
  amountRequested      Decimal  @db.Decimal(12,2)          // مبلغ التمويل
  currency             String   @default("USD") @db.VarChar(3)  // ISO-4217; NO currency table (ranges are product-level)
  purpose              String?  @db.Text                    // الغرض من التمويل ("increase income")
  tenorRequestedMonths Int?

  // ── GUARANTEE (wizard step 2, fields 18–19) — typed; enum + "other" companions ──
  guaranteeType        String? @db.VarChar(24)
    // PERSONAL_GUARANTEE | MORTGAGE | BANK_GUARANTEE | GOLD | COMMERCIAL
    // | CONVERTIBLE_SECURITIES | SELF_GUARANTEE | OTHER   (wizard + product-page enums, merged)
  guaranteeTypeOther   String? @db.VarChar(160)              // free text when guaranteeType = OTHER
  guaranteeStatus      String? @db.VarChar(24)
    // AVAILABLE | PARTIALLY_AVAILABLE | UNAVAILABLE | OTHER
  guaranteeStatusOther String? @db.VarChar(160)              // free text when guaranteeStatus = OTHER

  // ── FREE TEXT + CONSENT + DISTRIBUTION (wizard fields 20–22) ──
  applicantNotes    String?   @db.Text                       // ملاحظات (يا نجازاه)
  consentAt         DateTime?                                // step-1 data-transfer consent + step-2 terms agreement, stamped at submit
  distributionMode  String    @default("OPEN") @db.VarChar(16)  // OPEN | BUYER_SELECTED
  selectedFinanciers Json?                                    // [orgId] when BUYER_SELECTED

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
  offers    FinancingOffer[]
  fees      FinancingFee[]

  @@index([organizationId, status])
  @@index([createdById, createdAt])
  @@index([status, createdAt])
  @@index([productId])
  @@index([targetType, targetId])
  @@index([activityCity])
}
```
Removed vs v2.4: `businessInfo` shrunk to B2B-supplement-only (typed columns replace its
applicant-side keys); `collateralOffered Json` DELETED (replaced by the typed guarantee block —
the applicant's side is enums + other-text; the financier's side already lives in
`FinancingOffer.collateralRequired`).

### 3.6 ApplicantDocument — ONE document subsystem, dual scope (replaces v2.5 ApplicationDocument)

```prisma
model ApplicantDocument {
  id          String   @id @default(cuid())
  userId      String                                // owner/uploader — ALWAYS set (single entry at user level)
  user        User     @relation("ApplicantDocuments", fields:[userId], references:[id], onDelete: Cascade)
  requestId   String?                               // null = user-level KYC (ID image — uploaded ONCE, reused)
                                                    // set  = request evidence (guarantee docs, studies…)
  request     FinancingRequest? @relation(fields:[requestId], references:[id], onDelete: Cascade)
  type        String   @db.VarChar(32)
    // user-scope:   ID_DOCUMENT
    // request-scope: BUSINESS_LICENSE | FINANCIAL_STATEMENT | BANK_STATEMENT | TAX_REGISTRATION
    //               | PROPERTY_PROOF | INVOICE | PURCHASE_ORDER | GUARANTEE_DOC | FEASIBILITY_STUDY | OTHER
  storageKey  String   @db.VarChar(512)            // local-disk storage adapter (containment-guarded)
  fileName    String   @db.VarChar(255)
  sizeBytes   Int?
  status      String   @default("PENDING") @db.VarChar(16)  // PENDING | VERIFIED | REJECTED
  reviewedById String?                              // financier/admin staff User
  reviewedAt  DateTime?
  note        String?  @db.Text                     // verification/rejection note
  createdAt   DateTime @default(now())

  @@index([userId])
  @@index([requestId])
  @@index([userId, type, status])
}
```

### 3.7 FinancingOffer — unchanged from v2.0 (competitor-confirmed)
`installments[]` on the competitor's request maps to **`repaymentSchedule Json`
[{installmentNo, dueDate, amount}]** on OUR offer (the financier proposes it), frozen into
`FinancingAgreement.termsSnapshot` at acceptance. Amount/rate/fees/tenor/validity/status
(DRAFT|SENT|INFO_REQUESTED|ACCEPTED|DECLINED|EXPIRED|WITHDRAWN) as in v2 §2.6.

### 3.8 FinancingAgreement — unchanged from v2.0 (§2.7)
`AGR-YYYY-######` via `'AGR'` sequence · termsSnapshot (immutable) · fundingStatus
PENDING|REPORTED_FUNDED|REPORTED_SETTLED (financier-reported).

### 3.9 FinancingEvent — unchanged from v2.0 (§2.8, track-only ledger, D-002)
DISBURSEMENT | REPAYMENT | EARLY_SETTLEMENT | LATE_FEE | NOTE.

### 3.10 FinancingFee — unchanged from v2.0 (§2.9)
SUCCESS | ORIGINATION | ACCREDITATION · ACCRUED|INVOICED|PAID|WAIVED.

### 3.11 Accreditation (Flow 4) — unchanged from v2.0 (§2.10)
AccreditationProgram (criteria as data) + SupplierAccreditation.

---

## 4. Enum code mapping (competitor ⇄ Vendora)

| Concept | Competitor (API/DOM) | Vendora value |
|---|---|---|
| Activity status | `new` / `existing` | `NEW` / `EXISTING` |
| Previous financing | `false` / `true` | Boolean |
| Activity type | 12 project · 13 rural · 14 green-energy · 15 housing · 16 fisheries · 1 other | category `INVESTMENT`/`RURAL`/`ENERGY`/`HOUSING`/`FISHERIES`/`OTHER` (+ our B2B trio & catalog extras) |
| Location/residence type | `ownership` / `own` / `rent` | `OWNED` / `RENTED` |
| Guarantee type | 59 personal · 345 bank · 346 gold · 347 commercial · 1 other (+ page: mortgage, convertible, self) | `PERSONAL_GUARANTEE`/`BANK_GUARANTEE`/`GOLD`/`COMMERCIAL`/`MORTGAGE`/`CONVERTIBLE_SECURITIES`/`SELF_GUARANTEE`/`OTHER` |
| Guarantee status | 7 · 8 · 9 · 1 | `AVAILABLE`/`PARTIALLY_AVAILABLE`/`UNAVAILABLE`/`OTHER` |
| Identity type | `personalCard` | `NATIONAL_ID` |
| Gender / marital | `male` / `single` | `MALE` / `SINGLE` |
| Currency | id 179 YER (+min/max) | ISO string `YER` — ranges on product |

## 5. Status lifecycle mapping (competitor ⇄ Vendora)

| Competitor state (code) | Vendora state | Notes |
|---|---|---|
| — (not submitted) | `DRAFT` | wizard in progress |
| Under review | `SUBMITTED` | initial triage; distribution to pool / direct product target |
| Under study | `UNDER_REVIEW` | credit analysis (financier-side work state) |
| — (ours only) | `INFO_REQUESTED` | financier asks for missing docs/info |
| Approved (terms issued) | `OFFERED` | approval materializes as a **FinancingOffer** in our marketplace model |
| — (ours only) | `ACCEPTED` | buyer accepts one offer; siblings auto-decline; `FinancingFee` accrues |
| Paid (disbursed) | `ACCEPTED` + `FinancingAgreement.fundingStatus = REPORTED_FUNDED` + `FinancingEvent(DISBURSEMENT)` | money NEVER on platform (D-002) |
| Completed | `FinancingAgreement.status = COMPLETED` | via reported repayment events |
| Rejected (provider) | no v1 action — a non-bidding financier simply sends no offer; request reaches `DECLINED_ALL` only if all sent offers are declined | competitor's single-provider reject UX noted for v2 |
| Automatically cancelled (`auto-rejected`) | `EXPIRED` | lazy sweep at `expiresAt` (mirrors `sweepDisputes`) |
| Cancelled by customer | `CANCELLED` (pre-acceptance) / `WITHDRAWN` | wizard "Cancel request" action |

**Status history + notes** (competitor `fund_order_statuses[] {code, updated_at, note}` — incl.
the provider apology note and the "apply to other services" advice): recorded as `AuditLog`
rows (`action: FINANCING_STATUS_CHANGED`, `metadata: {from, to, note}`) and delivered to the
applicant as `Notification` (`body` = note). NO new column/table — existing substrate, one entry.

## 6. Sequences, settings & notification additions

- `SequencePrefix` union (sequences/service.ts:9): += `'FIN' | 'AGR'` → `FR-YYYY-######`, `AGR-YYYY-######`.
  Offers stay id-addressed (DP-12).
- RfqSetting registry — new `financing` SectionDef, panels:
  `general {enabled, requestExpiryDays, maxOffersPerRequest}` ·
  `fees {financierSuccessPercent (default 0.75, 0–5), originationPercentCap}` ·
  `distribution {defaultMode, requireVerifiedProfile}` ·
  `documents {allowedTypes, maxSizeMb}` ·
  `intake {requireConsent, wizardEnabled}`.
- `Notification.linkView` union (notifications/service.ts:43): += `'financing'`; new types:
  FINANCING_REQUEST_RECEIVED, OFFER_RECEIVED, OFFER_ACCEPTED, OFFER_DECLINED, OFFER_WITHDRAWN,
  DOC_VERIFIED / DOC_REJECTED, FEE_ACCRUED, AGREEMENT_STATUS_CHANGED, FINANCING_STATUS_CHANGED.

## 7. Field-level traceability — the no-duplication proof (every wizard field → ONE home)

| Wizard field (step) | Home (exactly one) |
|---|---|
| Name, Email (1) | `User.name`, `User.email` — EXISTING |
| Date of birth, Gender, Marital status, Nationality (1) | `User.dateOfBirth/gender/maritalStatus/nationality` — NEW |
| Phone, WhatsApp (1) | `User.phone`, `User.whatsappNumber` — NEW |
| City, District, Address (residence) (1) | `User.residence` Json {city, district, street…} — NEW |
| Residence type (1) | `User.residenceType` — NEW |
| ID type, ID number (1) | `User.identityType`, `User.identityNumber` — NEW |
| ID image (1) | `ApplicantDocument` (userId, requestId **null**, type ID_DOCUMENT) — uploaded ONCE |
| "I reviewed my personal data" + terms agree (1,2) | `FinancingRequest.consentAt` (stamped at submit) |
| Activity status (2) | `FinancingRequest.activityStatus` |
| Capital / Contribution / Installment capacity (2) | `capitalAmount` / `ownContributionAmount` / `monthlyInstallmentCapacity` |
| Previous financing (2) | `previousFinancing` Boolean |
| Other income sources (2) | `otherIncomeSources` |
| Activity type (2) | `category` (+ `categoryOther` when OTHER) |
| Activity start date / name / description (2) | `activityStartDate` / `activityName` / `activityDescription` |
| Activity address / city / district (2) | `activityAddress` / `activityCity` / `activityDistrict` |
| Activity location type (2) | `activityLocationType` |
| Financing amount / currency (2) | `amountRequested` / `currency` |
| Financing purpose (2) | `purpose` |
| Guarantee type / status (2) | `guaranteeType` / `guaranteeStatus` (+ `*Other` free-text companions) |
| Attachments (2) | `ApplicantDocument` (requestId **set**) |
| Notes (2) | `applicantNotes` |
| Review step (3) | NO storage — renders User + request by reference |
| Request number (post) | `number` via `FIN` sequence (richer than competitor's bare `3763`) |
| Service provider / service name (post) | `product → FinancierProfile` / `productId → FinancingProduct` (no providerId column — reachable via product; open requests use the distribution pool) |
| Request date (post) | `createdAt` / `submittedAt` |
| Status + note (post) | `status` + AuditLog/Notification (§5) |
| Installments (post) | `FinancingOffer.repaymentSchedule` → `FinancingAgreement.termsSnapshot` |
| Currency min/max (post) | `FinancingProduct.amountMin/amountMax` |
| `is_rating` (post) | deferred v2 (DP-17) |
| `branch` (post) | deferred v2 |
| `service_categories` (user) | out of scope (interest matching) |

## 8. Deliberate deviations from the competitor (documented rationale)

1. **4-part Arabic name → single `User.name`** — every existing surface (auth, checkout, reviews)
   depends on it; splitting is a display concern.
2. **Login by phone → login by email** (existing auth code); phone is a contact field.
3. **Single-provider request → multi-offer marketplace** — their "approved" = our OFFERED; we add
   comparison, sibling auto-decline, success fee. Their reject-with-note UX deferred to v2.
4. **Geo FK tables (city_id/district_id) → free strings** — we are a global platform, not a
   22-governorate app; product `coverageRegions` matches `activityCity` by normalized equality (DP-16).
5. **Currency entity w/ min/max → ISO string + product-level ranges** — ranges are per-product facts.
6. **`installments[]` on request → offer/agreement** — the schedule is the financier's proposal.
7. **`fund_order_statuses` table → AuditLog + Notification** — one substrate, no near-duplicate table.
8. **`account {id,name}` reference** — matched, and extended: our requests also reference the
   org (B2B) and product (direct CTA) where applicable.

## 9. Open product decisions (add to PLATFORM_PLAN DP list)

- **DP-13**: Individual applicants — make `FinancingRequest.organizationId` nullable (null =
  individual/sole-proprietor application, competitor-proven; prerequisite of Flow 5 consumer
  financing). Recommend **YES**.
- **DP-14**: Additive `User` profile columns (§3.1 — 11 nullable fields; B2C unaffected; required
  by the single-entry rule). Recommend **YES**.
- **DP-15**: Status notes via existing AuditLog + Notification substrate (no new column/table). Recommend **YES**.
- **DP-16**: No geo lookup tables in v1 (strings + normalized coverage matching). Recommend **YES**.
- **DP-17**: Financier ratings (`is_rating`) + branch-level request routing → v2 defer. Recommend **DEFER**.
- Carry-over: DP-10 (public directory), DP-11 (Islamic finance fields), DP-12 (offer numbering).
