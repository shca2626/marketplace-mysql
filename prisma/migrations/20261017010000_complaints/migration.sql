-- COMPLAINT-1: company complaints / trust reports — the order-agnostic trust &
-- safety surface (the order-bound refund flow lives in Dispute). Any
-- authenticated user reports a COMPANY; the target org gets one response;
-- platform staff triage severity and close.
-- Additive-only narrow migration: one new table, zero changes to existing
-- tables. Backup taken first (db/backups/2026-10-17T00-13-12).

-- CreateTable
CREATE TABLE `Complaint` (
    `id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `targetOrgId` VARCHAR(191) NOT NULL,
    `raisedById` VARCHAR(191) NOT NULL,
    `raisedByOrgId` VARCHAR(191) NULL,
    `orderId` VARCHAR(191) NULL,
    `productId` VARCHAR(191) NULL,
    `category` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'OPEN',
    `orgResponse` TEXT NULL,
    `orgRespondedAt` DATETIME(3) NULL,
    `severity` VARCHAR(191) NOT NULL DEFAULT 'NORMAL',
    `resolutionNote` TEXT NULL,
    `resolvedById` VARCHAR(191) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Complaint_number_key`(`number`),
    INDEX `Complaint_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `Complaint_targetOrgId_status_idx`(`targetOrgId`, `status`),
    INDEX `Complaint_raisedById_idx`(`raisedById`),
    INDEX `Complaint_raisedByOrgId_idx`(`raisedByOrgId`),
    INDEX `Complaint_orderId_idx`(`orderId`),
    INDEX `Complaint_productId_idx`(`productId`),
    INDEX `Complaint_resolvedById_idx`(`resolvedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Complaint` ADD CONSTRAINT `Complaint_targetOrgId_fkey` FOREIGN KEY (`targetOrgId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Complaint` ADD CONSTRAINT `Complaint_raisedById_fkey` FOREIGN KEY (`raisedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Complaint` ADD CONSTRAINT `Complaint_raisedByOrgId_fkey` FOREIGN KEY (`raisedByOrgId`) REFERENCES `Organization`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Complaint` ADD CONSTRAINT `Complaint_resolvedById_fkey` FOREIGN KEY (`resolvedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
