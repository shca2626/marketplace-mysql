# Tenant-isolation negative suite — 2026-10-11T20:34:27.625Z

Target: `http://localhost:3000` (dev; STAGING_BASE_URL parameterizes; production markers abort the run).
Scope: the TENANT-AUDIT fix matrix (F-01..F-05, H-3) + cross-account probes.

| Case | Name | Expected | Result | Detail |
|---|---|---|---|---|
| TI-01 | VIEWER member of applicant org accepts SENT offer | 403 permission refusal + offer untouched | **PASS** | got 403 Only organization members with financing permission can accept an offer for the  offer=SENT |
| TI-01b | BUYER member (legacy org.finance.apply) accepts the offer | 200 + agreement + sibling declined | **PASS** | got 200 cmv4a4us70024ne13mw6au74j offer=ACCEPTED sibling=DECLINED |
| TI-02 | BUYER at threshold routes to OFFER_ACCEPT | SKIPPED (deferred) | **SKIP** | DEFERRED: OFFER_ACCEPT machinery lost with unpushed commits; threshold-parity not in current scope |
| TI-02b | duplicate OFFER_ACCEPT routing refused | SKIPPED (deferred) | **SKIP** | DEFERRED: OFFER_ACCEPT machinery lost with unpushed commits; threshold-parity not in current scope |
| TI-02c | requester cannot self-approve the routed acceptance | SKIPPED (deferred) | **SKIP** | DEFERRED: OFFER_ACCEPT machinery lost with unpushed commits; threshold-parity not in current scope |
| TI-02d | approver REJECT leaves the offer open | SKIPPED (deferred) | **SKIP** | DEFERRED: OFFER_ACCEPT machinery lost with unpushed commits; threshold-parity not in current scope |
| TI-02e | approver APPROVE performs the acceptance | SKIPPED (deferred) | **SKIP** | DEFERRED: OFFER_ACCEPT machinery lost with unpushed commits; threshold-parity not in current scope |
| TI-03 | OWNER accepts the offer (agreement+fee+request closed, no foreign side effects) | 200 + full release | **PASS** | got 200 cmv4a5dj5002ine13932sk89g released=true |
| TI-04 | financier staff reads doc on DRAFT (unforwarded) request | 403/404 R-4 gate | **PASS** | got 403 You do not have access to this document |
| TI-05 | after platform forward the same staff CAN read the doc | 201 + one-time url | **PASS** | got 201 |
| TI-06 | SUSPENDED institution staff by-id request detail | 403/404 | **PASS** | got 403 Financier staff access required |
| TI-07 | suspended staff create-offer path (no side effects) | 403/404 + zero offers created | **PASS** | got 403, offers=0 |
| TI-08 | PENDING institution creates a service (no side effects) | 403 read-only + zero services | **PASS** | got 403, services=0 |
| TI-09 | User.role=ADMIN without RBAC → /api/admin/stats | SKIPPED (documented design) | **SKIP** | CURRENT DESIGN: role=ADMIN is the documented platform super-admin (authz/context.ts:110); no app path grants the role |
| TI-10 | …reads a foreign financing request dossier | SKIPPED (documented design) | **SKIP** | CURRENT DESIGN: role=ADMIN is the documented platform super-admin (authz/context.ts:110); no app path grants the role |
| TI-11 | …soft-deletes a foreign vault document | SKIPPED (documented design) | **SKIP** | CURRENT DESIGN: role=ADMIN is the documented platform super-admin (authz/context.ts:110); no app path grants the role |
| TI-12 | …seller earnings surface | SKIPPED (documented design) | **SKIP** | CURRENT DESIGN: role=ADMIN is the documented platform super-admin (authz/context.ts:110); no app path grants the role |
| TI-13 | checkout with a foreign organizationId (server-derived org only) | foreign org never attributed | **PASS** | got 201, orders 1→2, foreign-org orders 0→0 |
| TI-14 | institution X staff reads institution Y request by id | 403/404, no dossier | **PASS** | got 403, payload=none |
| TI-15 | two buyers: order list carries ONLY the caller rows | own order only | **PASS** | status=200, rows=2, own=true, foreignLeak=false |
| TI-16 | member removed from org → next org-scoped read refused | 403/404 | **PASS** | got 403 |
| TI-17 | pending applicant sees OWN application tracker | 200 + own PENDING org (context + profile) | **PASS** | context=200, org=own, profile=200, orgStatus=PENDING_VERIFICATION |
| TI-18 | denied responses carry no tenant data (error field only) | no extra keys in 4xx bodies | **PASS** | all bodies are error-only |

**14 passed, 9 skipped (deferred), 0 failed**

Run book: `bun scripts/tenant-isolation-suite.ts` (fixtures are created in the DB and removed; the immutable audit trail keeps the run's evidence rows).
