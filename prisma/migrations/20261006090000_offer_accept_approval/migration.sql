-- TENANT-AUDIT follow-up (REPORT.md §8.1): OFFER_ACCEPT approval type —
-- financing-offer acceptance by below-threshold BUYER members routes through
-- the org approval machinery instead of being denied.

-- AlterTable
ALTER TABLE `ApprovalRequest` ADD COLUMN `offerId` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `ApprovalRequest_offerId_key` ON `ApprovalRequest`(`offerId`);

-- AddForeignKey
ALTER TABLE `ApprovalRequest` ADD CONSTRAINT `ApprovalRequest_offerId_fkey` FOREIGN KEY (`offerId`) REFERENCES `FinancingOffer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
