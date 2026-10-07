# Tenant-isolation negative suite — 2026-10-06T23:40:03.010Z

Target: `http://localhost:3000` (dev; STAGING_BASE_URL parameterizes; production markers abort the run).
Scope: the TENANT-AUDIT fix matrix (F-01..F-05, H-3) + cross-account probes.

| Case | Name | Expected | Result | Detail |
|---|---|---|---|---|
| TI-01 | VIEWER member of applicant org accepts SENT offer | 403 approver-role refusal | **PASS** | got 403 Only organization owners, admins and approvers can accept financing offers on be |
| TI-02 | BUYER at threshold routes to OFFER_ACCEPT (no agreement yet) | 200 approvalRequested | **PASS** | got 200  offer=SENT |
| TI-02b | duplicate OFFER_ACCEPT routing refused | 409 already awaiting | **PASS** | got 409 This offer acceptance is already awaiting approval |
| TI-02c | requester cannot self-approve the routed acceptance | 403 | **PASS** | got 403 |
| TI-02d | approver REJECT leaves the offer open (no agreement) | 200 + offer stays SENT | **PASS** | got 200 offer=SENT |
| TI-02e | approver APPROVE performs the acceptance (agreement+fee+sibling decline) | released | **PASS** | routed=true released=true |
| TI-03 | OWNER accepts the offer (positive control) | 200 + agreementId | **PASS** | got 200 cmuxblbsb0096q0pquvy7318p |
| TI-04 | financier staff reads doc on DRAFT (unforwarded) request | 403/404 R-4 gate | **PASS** | got 403 You do not have access to this document |
| TI-05 | after platform forward the same staff CAN read the doc | 201 + one-time url | **PASS** | got 201 |
| TI-06 | SUSPENDED institution staff by-id request detail | 403/404 | **PASS** | got 404 Request not found |
| TI-07 | suspended staff create-offer path (no side effects) | 403/404 + zero offers created | **PASS** | got 404, offers=0 |
| TI-08 | PENDING institution creates a service (no side effects) | 403 read-only + zero services | **PASS** | got 403, services=0 |
| TI-09 | User.role=ADMIN without RBAC → /api/admin/stats | 403 | **PASS** | got 403 |
| TI-10 | …reads a foreign financing request dossier | 403/404, no dossier | **PASS** | got 403, payload=none |
| TI-11 | …soft-deletes a foreign vault document (no side effects) | 403 + document untouched | **PASS** | got 403, isActive=true |
| TI-12 | …seller earnings surface | 403 | **PASS** | got 403 |
| TI-13 | checkout with a foreign organizationId (no side effects) | 403 membership refusal + zero orders | **PASS** | got 403, orders 1→1 |
| TI-14 | institution X staff reads institution Y request by id | 403/404, no dossier | **PASS** | got 404, payload=none |
| TI-15 | two buyers: order list carries ONLY the caller rows | own order only | **PASS** | status=200, rows=1, own=true, foreignLeak=false |
| TI-16 | member removed from org → next org-scoped read refused | 403/404 | **PASS** | got 403 |
| TI-17 | pending applicant sees OWN application tracker | 200 + own PENDING org | **PASS** | status=200, org=own, state=PENDING_VERIFICATION |
| TI-18 | denied responses carry no tenant data (error field only) | no extra keys in 4xx bodies | **PASS** | all bodies are error-only |

**22/22 passed** — all green

Run book: `bun scripts/tenant-isolation-suite.ts` (fixtures are created in the DB and removed; the immutable audit trail keeps the run's evidence rows).
