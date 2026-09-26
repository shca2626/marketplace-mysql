# FIN-2 — Backend developer (financier module)

Commit: 39f66e7 — "FIN-2: requirements engine + documents vault + submission lifecycle services…"

## What was built
`src/server/modules/financing/` (NEW):
- `shared.ts` — FinancingError / GateBlockedError(422+missing), status unions, R-4 visibility sets,
  financier-staff context (OrganizationMember OWNER|ADMIN — DP-1), applicant guards.
- `conditions.ts` — ConditionTemplate CRUD w/ scope guards (GENERAL admin-only, FINANCIER
  org-scoped), 8-kind shape rules, global code uniqueness, ConditionOption rows, composer
  visibility query, ServiceRequirement attach/update/soft-detach w/ maxRequirementsPerService cap.
- `documents.ts` — AccountDocument vault through the EXISTING media pipeline
  (processImageUpload→MediaAsset), settings-enforced allowedTypes/maxSizeMb, verify-ONCE
  (PENDING→VERIFIED/REJECTED, note on reject), soft delete, org-scope membership checks.
- `submissions.ts` — typed answers per conditionType, PROFILE_FIELD auto-eval (closed set),
  autoPassAccredited (live grant → system-VERIFIED), platform verdicts (notes required on
  reject/waive), THE GATE check (findGateMissing/gateStatus/assertGateComplete),
  generateChecklist + applyChecklistAnswers.

Plus `scripts/fin2-smoke.ts` (unit-level, self-cleaning) — 20/20 PASS. Lint + scoped tsc clean.

## Notes for the next agents (FIN-3+)
- `GateBlockedError` carries `missing: GateMissingItem[]` — forward route must serialize it (422).
- Verdicts (verify/reject/waive) are open while parent request status ∈ {SUBMITTED, UNDER_PLATFORM_REVIEW}.
- `generateChecklist(parentType, parentId, serviceId, financierOrganizationId, {applicantUserId,
  organizationId, answers})` is the submit-time checklist engine (used by requests/accreditation).
- Detach = soft deactivate (isActive=false) so submissions survive (schema cascade would eat them).
- Sweeps (`sweepFinancing`/`sweepAccreditations`) land in FIN-3's requests/accreditation services.
- Worklog entry appended (FIN-2 section) with the standing template.
