-- CONFIG-1 (workflow sequence agreements): ServiceRequirement.phase —
-- financiers and companies run DIFFERENT agreement/workflow sequences; the
-- checklist of a financing service can now be structured into named stages
-- ("Pre-approval", "Due diligence", "Contracting"…). NULL = ungrouped, which
-- preserves every existing flat checklist byte-for-byte.

-- AlterTable
ALTER TABLE `ServiceRequirement` ADD COLUMN `phase` VARCHAR(191) NULL;
