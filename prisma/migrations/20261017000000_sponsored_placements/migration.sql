-- SPONSOR-1: sponsored/pinned listings — a company pays (fee-engine SPONSORSHIP
-- event, FLAT per-day rules, org-scoped overrides honored) to pin one of its
-- APPROVED shared-catalog products to the top of the storefront default sort
-- with a "Sponsored" badge. Additive-only narrow migration: one new table,
-- zero changes to existing tables. Backup taken first (db/backups/2026-10-16T23-03-33).

-- CreateTable
CREATE TABLE `SponsoredPlacement` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `sellerId` VARCHAR(191) NOT NULL,
    `days` INTEGER NOT NULL,
    `amount` DOUBLE NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `paymentMethod` VARCHAR(191) NOT NULL DEFAULT 'CARD',
    `paymentStatus` VARCHAR(191) NOT NULL DEFAULT 'PAID',
    `startsAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `endsAt` DATETIME(3) NOT NULL,
    `feeAssessmentId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SponsoredPlacement_status_endsAt_idx`(`status`, `endsAt`),
    INDEX `SponsoredPlacement_productId_status_idx`(`productId`, `status`),
    INDEX `SponsoredPlacement_organizationId_status_idx`(`organizationId`, `status`),
    INDEX `SponsoredPlacement_sellerId_idx`(`sellerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SponsoredPlacement` ADD CONSTRAINT `SponsoredPlacement_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `SponsoredPlacement` ADD CONSTRAINT `SponsoredPlacement_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `SponsoredPlacement` ADD CONSTRAINT `SponsoredPlacement_sellerId_fkey` FOREIGN KEY (`sellerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
