# Negative authorization suite — 2026-10-04T16:44:26.997Z

Target: `http://localhost:3000` (dev; STAGING_BASE_URL parameterizes; production markers abort the run).

| Case | Name | Expected | Result | Detail |
|---|---|---|---|---|
| NEG-01 | cross-tenant read (org A member → org B profile) | 403/404 | **PASS** | got 403 |
| NEG-02 | cross-tenant write (org A member adds org B member) | 403/404 | **PASS** | got 403 |
| NEG-03 | cross-tenant approval (org A approver decides org B request) | 403 ApprovalServiceError | **PASS** | 403 Only organization owners, admins and approvers can decide |
| NEG-04 | buyer-vs-approver (plain member decides) | 403 | **PASS** | 403 Only organization owners, admins and approvers can decide |
| NEG-05 | self-approval (requester decides own request) | 403 own-request refusal | **PASS** | 403 You cannot approve your own request — ask another approver |
| NEG-06 | immediate revocation (role revoked → next call refused) | 200 then 401/403 | **PASS** | before=200 after=401 |
| NEG-07 | non-member org-role assignment (M2) | 403/400 active-membership refusal | **PASS** | got 403 That account is not an active member of the target organization (membership missing, user su |
| NEG-08 | disabled module at API (rfq off → 403 MODULE_DISABLED, then restored) | 403 MODULE_DISABLED | **PASS** | off=200 probe=403(MODULE_DISABLED) restore=200/200 |
| NEG-09 | unknown module key fails closed | {unknown: true, enabled: false} | **PASS** | {"enabled":false,"unknown":true} |
| NEG-10 | privileged action without MFA (payouts.generate) | 403 MFA_* | **PASS** | got 403 MFA_ENROLLMENT_REQUIRED This action requires multi-factor authentication. Enroll a |
| NEG-11 | last-active-owner invariant (revoke final org.owner seat) | 409 last-active-owner | **PASS** | got 409 This is the last active owner of the organization. Assign another active owner FIR |
| NEG-12 | break-glass login is alerted + audited | BREAK_GLASS_LOGIN audit row | **PASS** | BREAK-GLASS account sign-in from ::1 |
| NEG-13 | vault key via public media route | 404 (structural, pre-storage) | **PASS** | got 404 |
| NEG-14 | vault proxy without a session | 401 | **PASS** | got 401 |
| NEG-15 | member fetches owner-issued one-time URL | 403 NOT_GRANTED_TO_USER | **PASS** | got 403 |
| NEG-16 | one-time nonce (owner fetch 200 png + replay 410) | 200 image/* then 410 | **PASS** | first=200 (image/png), replay=410 |
| NEG-17 | expired one-time URL | 410 EXPIRED | **PASS** | got 410 {"error":"This document link has expired |
| NEG-18 | org member requests identity-class document | 403 (6.8 matrix) | **PASS** | got 403 |
| NEG-19 | org B owner requests org A identity document | 403 (cross-tenant) | **PASS** | got 403 |
| NEG-20 | org member retrieves ORG_INTERNAL document (positive control) | issue 201 + fetch 200 | **PASS** | issue=201, fetch=200 |

**20/20 passed** — all green

Run book: `bun scripts/negative-authz-suite.ts` (fixtures are created in the DB and removed; the immutable audit trail keeps the run's evidence rows).
