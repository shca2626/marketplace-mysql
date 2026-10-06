-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `password` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `image` VARCHAR(191) NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT 'BUYER',
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `suspendedAt` DATETIME(3) NULL,
    `storeName` VARCHAR(191) NULL,
    `storeBio` TEXT NULL,
    `storeCover` VARCHAR(191) NULL,
    `commissionRate` DOUBLE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `sessionVersion` INTEGER NOT NULL DEFAULT 0,
    `emailVerifiedAt` DATETIME(3) NULL,
    `mfaRequired` BOOLEAN NOT NULL DEFAULT false,
    `isBreakGlass` BOOLEAN NOT NULL DEFAULT false,
    `verifiedAt` DATETIME(3) NULL,
    `phone` VARCHAR(191) NULL,
    `phoneVerifiedAt` DATETIME(3) NULL,
    `kycLevel` INTEGER NOT NULL DEFAULT 0,
    `merchantType` VARCHAR(191) NULL,
    `whatsappNumber` VARCHAR(191) NULL,
    `dateOfBirth` DATETIME(3) NULL,
    `gender` VARCHAR(191) NULL,
    `maritalStatus` VARCHAR(191) NULL,
    `nationality` VARCHAR(191) NULL,
    `identityType` VARCHAR(191) NULL,
    `identityNumber` VARCHAR(191) NULL,
    `residenceStreet` TEXT NULL,
    `residenceCity` VARCHAR(191) NULL,
    `residenceDistrict` VARCHAR(191) NULL,
    `residenceType` VARCHAR(191) NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    UNIQUE INDEX `User_phone_key`(`phone`),
    INDEX `User_role_idx`(`role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Category` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `icon` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `Category_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Brand` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `logoUrl` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `websiteUrl` VARCHAR(191) NULL,
    `originCountry` VARCHAR(191) NULL,
    `isVerified` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Brand_name_key`(`name`),
    UNIQUE INDEX `Brand_slug_key`(`slug`),
    INDEX `Brand_isVerified_idx`(`isVerified`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UnitOfMeasure` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `dimension` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UnitOfMeasure_code_key`(`code`),
    INDEX `UnitOfMeasure_dimension_idx`(`dimension`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrganizationType` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `icon` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `OrganizationType_key_key`(`key`),
    INDEX `OrganizationType_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Product` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `price` DOUBLE NOT NULL,
    `compareAtPrice` DOUBLE NULL,
    `images` VARCHAR(4000) NOT NULL DEFAULT '[]',
    `categoryId` VARCHAR(191) NOT NULL,
    `sellerId` VARCHAR(191) NULL,
    `curatedById` VARCHAR(191) NULL,
    `stock` INTEGER NOT NULL DEFAULT 10,
    `soldCount` INTEGER NOT NULL DEFAULT 0,
    `rating` DOUBLE NOT NULL DEFAULT 0,
    `reviewCount` INTEGER NOT NULL DEFAULT 0,
    `featured` BOOLEAN NOT NULL DEFAULT false,
    `sku` VARCHAR(191) NULL,
    `barcode` VARCHAR(191) NULL,
    `videoUrl` VARCHAR(191) NULL,
    `highlights` TEXT NULL,
    `specs` TEXT NULL,
    `materials` TEXT NULL,
    `care` TEXT NULL,
    `weightGrams` INTEGER NULL,
    `lengthCm` DOUBLE NULL,
    `widthCm` DOUBLE NULL,
    `heightCm` DOUBLE NULL,
    `processingDays` INTEGER NULL,
    `freeShipping` BOOLEAN NOT NULL DEFAULT false,
    `shippingFee` DOUBLE NULL,
    `shippingPolicy` TEXT NULL,
    `slug` VARCHAR(191) NULL,
    `metaTitle` VARCHAR(191) NULL,
    `metaDescription` TEXT NULL,
    `moq` INTEGER NULL,
    `priceTiers` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `brandId` VARCHAR(191) NULL,
    `gtin` VARCHAR(191) NULL,
    `mpn` VARCHAR(191) NULL,
    `isCurated` BOOLEAN NOT NULL DEFAULT false,
    `popularRank` INTEGER NULL,
    `reviewNote` TEXT NULL,
    `reviewedAt` DATETIME(3) NULL,
    `reviewedById` VARCHAR(191) NULL,
    `publicationAgreedAt` DATETIME(3) NULL,
    `publicationAgreementVersion` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Product_slug_key`(`slug`),
    INDEX `Product_categoryId_idx`(`categoryId`),
    INDEX `Product_sellerId_status_idx`(`sellerId`, `status`),
    INDEX `Product_status_soldCount_idx`(`status`, `soldCount`),
    INDEX `Product_featured_idx`(`featured`),
    INDEX `Product_brandId_idx`(`brandId`),
    INDEX `Product_gtin_idx`(`gtin`),
    INDEX `Product_isCurated_idx`(`isCurated`),
    INDEX `Product_popularRank_idx`(`popularRank`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProductOffer` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `sellerId` VARCHAR(191) NOT NULL,
    `sellerOrgId` VARCHAR(191) NULL,
    `price` DOUBLE NOT NULL,
    `compareAtPrice` DOUBLE NULL,
    `stock` INTEGER NOT NULL DEFAULT 0,
    `moq` INTEGER NULL,
    `sku` VARCHAR(191) NULL,
    `priceTiers` TEXT NULL,
    `freeShipping` BOOLEAN NOT NULL DEFAULT false,
    `shippingFee` DOUBLE NULL,
    `processingDays` INTEGER NULL,
    `leadTimeNote` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `soldCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ProductOffer_productId_status_idx`(`productId`, `status`),
    INDEX `ProductOffer_sellerId_status_idx`(`sellerId`, `status`),
    INDEX `ProductOffer_sellerOrgId_idx`(`sellerOrgId`),
    UNIQUE INDEX `ProductOffer_productId_sellerId_key`(`productId`, `sellerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Order` (
    `id` VARCHAR(191) NOT NULL,
    `buyerId` VARCHAR(191) NOT NULL,
    `total` DOUBLE NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PAID',
    `fullName` VARCHAR(191) NOT NULL,
    `address` TEXT NOT NULL,
    `city` VARCHAR(191) NOT NULL,
    `country` VARCHAR(191) NOT NULL,
    `zip` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `paymentStatus` VARCHAR(191) NOT NULL DEFAULT 'AWAITING_PAYMENT',
    `fulfillmentStatus` VARCHAR(191) NOT NULL DEFAULT 'UNFULFILLED',
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `organizationId` VARCHAR(191) NULL,
    `poNumber` VARCHAR(191) NULL,
    `costCenter` VARCHAR(191) NULL,
    `paymentTerms` VARCHAR(191) NULL,
    `sourceType` VARCHAR(191) NULL,
    `sourceQuoteId` VARCHAR(191) NULL,
    `financingAgreementId` VARCHAR(191) NULL,

    UNIQUE INDEX `Order_sourceQuoteId_key`(`sourceQuoteId`),
    INDEX `Order_buyerId_createdAt_idx`(`buyerId`, `createdAt`),
    INDEX `Order_status_idx`(`status`),
    INDEX `Order_paymentStatus_idx`(`paymentStatus`),
    INDEX `Order_fulfillmentStatus_idx`(`fulfillmentStatus`),
    INDEX `Order_organizationId_idx`(`organizationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrderItem` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `sellerId` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `price` DOUBLE NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `image` VARCHAR(191) NULL,
    `variantId` VARCHAR(191) NULL,
    `variantName` VARCHAR(191) NULL,
    `offerId` VARCHAR(191) NULL,
    `offerVariantId` VARCHAR(191) NULL,
    `sellerOrgId` VARCHAR(191) NULL,
    `payoutId` VARCHAR(191) NULL,

    INDEX `OrderItem_orderId_idx`(`orderId`),
    INDEX `OrderItem_productId_idx`(`productId`),
    INDEX `OrderItem_sellerId_idx`(`sellerId`),
    INDEX `OrderItem_sellerId_payoutId_idx`(`sellerId`, `payoutId`),
    INDEX `OrderItem_offerId_idx`(`offerId`),
    INDEX `OrderItem_payoutId_idx`(`payoutId`),
    INDEX `OrderItem_sellerOrgId_idx`(`sellerOrgId`),
    INDEX `OrderItem_offerVariantId_idx`(`offerVariantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProductVariant` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `options` TEXT NOT NULL,
    `price` DOUBLE NULL,
    `compareAtPrice` DOUBLE NULL,
    `stock` INTEGER NOT NULL DEFAULT 0,
    `sku` VARCHAR(191) NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `image` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ProductVariant_productId_isActive_idx`(`productId`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Review` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `rating` INTEGER NOT NULL,
    `comment` TEXT NOT NULL,
    `verified` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Review_userId_idx`(`userId`),
    UNIQUE INDEX `Review_productId_userId_key`(`productId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Favorite` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Favorite_productId_idx`(`productId`),
    UNIQUE INDEX `Favorite_userId_productId_key`(`userId`, `productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Organization` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `orgType` VARCHAR(191) NOT NULL DEFAULT 'COMPANY',
    `kycLevel` INTEGER NOT NULL DEFAULT 0,
    `merchantType` VARCHAR(191) NULL,
    `legalName` VARCHAR(191) NULL,
    `taxId` VARCHAR(191) NULL,
    `registrationNumber` VARCHAR(191) NULL,
    `industry` VARCHAR(191) NULL,
    `website` VARCHAR(191) NULL,
    `billingAddress` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING_VERIFICATION',
    `verifiedAt` DATETIME(3) NULL,
    `creditTermsDays` INTEGER NOT NULL DEFAULT 0,
    `creditLimit` DOUBLE NOT NULL DEFAULT 0,
    `approvalThreshold` DOUBLE NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Organization_slug_key`(`slug`),
    INDEX `Organization_status_idx`(`status`),
    INDEX `Organization_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrganizationMember` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT 'BUYER',
    `jobTitle` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OrganizationMember_userId_idx`(`userId`),
    UNIQUE INDEX `OrganizationMember_organizationId_userId_key`(`organizationId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CustomerGroup` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `priority` INTEGER NOT NULL DEFAULT 0,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `CustomerGroup_key_key`(`key`),
    INDEX `CustomerGroup_isDefault_idx`(`isDefault`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CustomerGroupUser` (
    `customerGroupId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,

    INDEX `CustomerGroupUser_userId_idx`(`userId`),
    PRIMARY KEY (`customerGroupId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CustomerGroupOrganization` (
    `customerGroupId` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,

    INDEX `CustomerGroupOrganization_organizationId_idx`(`organizationId`),
    PRIMARY KEY (`customerGroupId`, `organizationId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PriceList` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `scope` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `priority` INTEGER NOT NULL DEFAULT 0,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `startsAt` DATETIME(3) NULL,
    `endsAt` DATETIME(3) NULL,
    `organizationId` VARCHAR(191) NULL,
    `customerGroupId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PriceList_status_scope_idx`(`status`, `scope`),
    INDEX `PriceList_organizationId_idx`(`organizationId`),
    INDEX `PriceList_customerGroupId_idx`(`customerGroupId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PriceListEntry` (
    `id` VARCHAR(191) NOT NULL,
    `priceListId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `minQuantity` INTEGER NOT NULL DEFAULT 1,
    `unitPrice` DOUBLE NOT NULL,

    INDEX `PriceListEntry_productId_idx`(`productId`),
    UNIQUE INDEX `PriceListEntry_priceListId_productId_minQuantity_key`(`priceListId`, `productId`, `minQuantity`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Rfq` (
    `id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NULL,
    `title` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `submittedAt` DATETIME(3) NULL,
    `respondedAt` DATETIME(3) NULL,
    `closedAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `extendedCount` INTEGER NOT NULL DEFAULT 0,
    `sourceRecurringId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Rfq_number_key`(`number`),
    INDEX `Rfq_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `Rfq_organizationId_idx`(`organizationId`),
    INDEX `Rfq_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RfqLine` (
    `id` VARCHAR(191) NOT NULL,
    `rfqId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NULL,
    `productName` TEXT NOT NULL,
    `sku` VARCHAR(191) NULL,
    `variantId` VARCHAR(191) NULL,
    `variantName` VARCHAR(191) NULL,
    `offerId` VARCHAR(191) NULL,
    `offerVariantId` VARCHAR(191) NULL,
    `quantity` INTEGER NOT NULL,
    `targetPrice` DOUBLE NULL,
    `notes` TEXT NULL,

    INDEX `RfqLine_rfqId_idx`(`rfqId`),
    INDEX `RfqLine_productId_idx`(`productId`),
    INDEX `RfqLine_variantId_idx`(`variantId`),
    INDEX `RfqLine_offerVariantId_idx`(`offerVariantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Quote` (
    `id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `rfqId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `sellerId` VARCHAR(191) NULL,
    `sellerOrgId` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'SENT',
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `subtotal` DOUBLE NOT NULL,
    `discountTotal` DOUBLE NOT NULL DEFAULT 0,
    `shippingTotal` DOUBLE NOT NULL DEFAULT 0,
    `taxTotal` DOUBLE NOT NULL DEFAULT 0,
    `total` DOUBLE NOT NULL,
    `paymentTerms` VARCHAR(191) NULL,
    `validUntil` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `sentAt` DATETIME(3) NULL,
    `acceptedAt` DATETIME(3) NULL,
    `declinedAt` DATETIME(3) NULL,
    `convertedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Quote_number_key`(`number`),
    INDEX `Quote_rfqId_idx`(`rfqId`),
    INDEX `Quote_status_idx`(`status`),
    INDEX `Quote_sellerOrgId_idx`(`sellerOrgId`),
    INDEX `Quote_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ApprovalRequest` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NULL,
    `quoteId` VARCHAR(191) NULL,
    `rfqId` VARCHAR(191) NULL,
    `requesterId` VARCHAR(191) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `note` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `decidedById` VARCHAR(191) NULL,
    `decidedAt` DATETIME(3) NULL,
    `decisionNote` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ApprovalRequest_orderId_key`(`orderId`),
    UNIQUE INDEX `ApprovalRequest_quoteId_key`(`quoteId`),
    INDEX `ApprovalRequest_organizationId_status_idx`(`organizationId`, `status`),
    INDEX `ApprovalRequest_requesterId_idx`(`requesterId`),
    INDEX `ApprovalRequest_decidedById_idx`(`decidedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QuoteLine` (
    `id` VARCHAR(191) NOT NULL,
    `quoteId` VARCHAR(191) NOT NULL,
    `rfqLineId` VARCHAR(191) NULL,
    `productId` VARCHAR(191) NOT NULL,
    `variantId` VARCHAR(191) NULL,
    `variantName` VARCHAR(191) NULL,
    `offerId` VARCHAR(191) NULL,
    `offerVariantId` VARCHAR(191) NULL,
    `availableStock` INTEGER NULL,
    `quantity` INTEGER NOT NULL,
    `unitPrice` DOUBLE NOT NULL,

    INDEX `QuoteLine_quoteId_idx`(`quoteId`),
    INDEX `QuoteLine_productId_idx`(`productId`),
    INDEX `QuoteLine_rfqLineId_idx`(`rfqLineId`),
    INDEX `QuoteLine_offerId_idx`(`offerId`),
    INDEX `QuoteLine_offerVariantId_idx`(`offerVariantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `body` TEXT NULL,
    `linkView` VARCHAR(191) NOT NULL,
    `linkId` VARCHAR(191) NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_userId_readAt_idx`(`userId`, `readAt`),
    INDEX `Notification_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NotificationDigest` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `periodStart` DATETIME(3) NOT NULL,
    `periodEnd` DATETIME(3) NOT NULL,
    `itemCount` INTEGER NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `html` MEDIUMTEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'LOGGED',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `NotificationDigest_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserDigestPref` (
    `userId` VARCHAR(191) NOT NULL,
    `frequency` VARCHAR(191) NOT NULL DEFAULT 'OFF',

    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PasswordResetToken` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PasswordResetToken_tokenHash_key`(`tokenHash`),
    INDEX `PasswordResetToken_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmailVerificationToken` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `EmailVerificationToken_tokenHash_key`(`tokenHash`),
    INDEX `EmailVerificationToken_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RfqMessage` (
    `id` VARCHAR(191) NOT NULL,
    `rfqId` VARCHAR(191) NOT NULL,
    `authorId` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RfqMessage_rfqId_createdAt_idx`(`rfqId`, `createdAt`),
    INDEX `RfqMessage_authorId_idx`(`authorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MediaAsset` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `namespace` VARCHAR(191) NOT NULL DEFAULT 'public-media',
    `originalName` VARCHAR(191) NOT NULL,
    `mime` VARCHAR(191) NOT NULL,
    `size` INTEGER NOT NULL,
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `sha256` VARCHAR(191) NOT NULL,
    `variants` TEXT NULL,
    `uploadedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `MediaAsset_key_key`(`key`),
    INDEX `MediaAsset_uploadedById_createdAt_idx`(`uploadedById`, `createdAt`),
    UNIQUE INDEX `MediaAsset_namespace_sha256_key`(`namespace`, `sha256`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Dispute` (
    `id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `raisedById` VARCHAR(191) NOT NULL,
    `sellerId` VARCHAR(191) NOT NULL,
    `rfqId` VARCHAR(191) NULL,
    `reason` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `amount` DOUBLE NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'OPEN',
    `sellerResponse` TEXT NULL,
    `sellerRespondedAt` DATETIME(3) NULL,
    `escalateAt` DATETIME(3) NULL,
    `outcome` VARCHAR(191) NULL,
    `resolutionNote` TEXT NULL,
    `resolvedById` VARCHAR(191) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `closedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Dispute_number_key`(`number`),
    INDEX `Dispute_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `Dispute_raisedById_idx`(`raisedById`),
    INDEX `Dispute_sellerId_idx`(`sellerId`),
    INDEX `Dispute_orderId_idx`(`orderId`),
    INDEX `Dispute_resolvedById_idx`(`resolvedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RecurringRfq` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NULL,
    `title` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `frequency` VARCHAR(191) NOT NULL,
    `intervalDays` INTEGER NOT NULL DEFAULT 0,
    `lines` TEXT NOT NULL,
    `recipientIds` TEXT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `pausedUntil` DATETIME(3) NULL,
    `lastRunAt` DATETIME(3) NULL,
    `nextRunAt` DATETIME(3) NOT NULL,
    `previewNotifiedAt` DATETIME(3) NULL,
    `emptyCycles` INTEGER NOT NULL DEFAULT 0,
    `runCount` INTEGER NOT NULL DEFAULT 0,
    `lastRfqId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `RecurringRfq_userId_idx`(`userId`),
    INDEX `RecurringRfq_active_nextRunAt_idx`(`active`, `nextRunAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payment` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `method` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `amount` DOUBLE NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `reference` VARCHAR(191) NULL,
    `instructions` TEXT NULL,
    `dueAt` DATETIME(3) NULL,
    `paidAt` DATETIME(3) NULL,
    `capturedById` VARCHAR(191) NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Payment_orderId_key`(`orderId`),
    INDEX `Payment_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `Payment_method_status_idx`(`method`, `status`),
    INDEX `Payment_capturedById_idx`(`capturedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payout` (
    `id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `sellerId` VARCHAR(191) NOT NULL,
    `sellerOrgId` VARCHAR(191) NULL,
    `periodStart` DATETIME(3) NOT NULL,
    `periodEnd` DATETIME(3) NOT NULL,
    `itemCount` INTEGER NOT NULL DEFAULT 0,
    `grossAmount` DOUBLE NOT NULL DEFAULT 0,
    `commissionRate` DOUBLE NOT NULL,
    `commission` DOUBLE NOT NULL DEFAULT 0,
    `netAmount` DOUBLE NOT NULL DEFAULT 0,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `paidAt` DATETIME(3) NULL,
    `note` TEXT NULL,
    `transferReference` VARCHAR(191) NULL,
    `transferIdempotencyKey` VARCHAR(191) NULL,
    `executedById` VARCHAR(191) NULL,
    `executedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Payout_number_key`(`number`),
    UNIQUE INDEX `Payout_transferIdempotencyKey_key`(`transferIdempotencyKey`),
    INDEX `Payout_sellerId_status_idx`(`sellerId`, `status`),
    INDEX `Payout_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `Payout_sellerOrgId_idx`(`sellerOrgId`),
    INDEX `Payout_executedById_idx`(`executedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SellerProfile` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `ownerUserId` VARCHAR(191) NOT NULL,
    `verificationState` VARCHAR(191) NOT NULL DEFAULT 'UNVERIFIED',
    `verificationNote` TEXT NULL,
    `verifiedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SellerProfile_organizationId_key`(`organizationId`),
    INDEX `SellerProfile_verificationState_idx`(`verificationState`),
    INDEX `SellerProfile_ownerUserId_idx`(`ownerUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PayoutLine` (
    `id` VARCHAR(191) NOT NULL,
    `payoutId` VARCHAR(191) NOT NULL,
    `orderItemId` VARCHAR(191) NOT NULL,
    `linePurpose` VARCHAR(191) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `commission` DOUBLE NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `fxRate` DOUBLE NULL,
    `fxRateAt` DATETIME(3) NULL,
    `fxSource` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `claimKey` VARCHAR(191) NULL,
    `reversalOfLineId` VARCHAR(191) NULL,
    `effectiveAt` DATETIME(3) NULL,
    `reversedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PayoutLine_claimKey_key`(`claimKey`),
    INDEX `PayoutLine_payoutId_idx`(`payoutId`),
    INDEX `PayoutLine_orderItemId_idx`(`orderItemId`),
    INDEX `PayoutLine_status_idx`(`status`),
    INDEX `PayoutLine_reversalOfLineId_idx`(`reversalOfLineId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RecurringRfqRun` (
    `id` VARCHAR(191) NOT NULL,
    `scheduleId` VARCHAR(191) NOT NULL,
    `dueAt` DATETIME(3) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'CLAIMED',
    `leaseToken` VARCHAR(191) NOT NULL,
    `leaseExpiresAt` DATETIME(3) NOT NULL,
    `attempt` INTEGER NOT NULL DEFAULT 1,
    `rfqId` VARCHAR(191) NULL,
    `error` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `RecurringRfqRun_status_leaseExpiresAt_idx`(`status`, `leaseExpiresAt`),
    UNIQUE INDEX `RecurringRfqRun_scheduleId_dueAt_key`(`scheduleId`, `dueAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Currency` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `symbol` VARCHAR(191) NULL,
    `decimals` INTEGER NOT NULL DEFAULT 2,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Currency_code_key`(`code`),
    INDEX `Currency_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExchangeRate` (
    `id` VARCHAR(191) NOT NULL,
    `baseCode` VARCHAR(191) NOT NULL,
    `quoteCode` VARCHAR(191) NOT NULL,
    `rate` DOUBLE NOT NULL,
    `source` VARCHAR(191) NOT NULL DEFAULT 'ADMIN',
    `validFrom` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ExchangeRate_quoteCode_idx`(`quoteCode`),
    UNIQUE INDEX `ExchangeRate_baseCode_quoteCode_validFrom_key`(`baseCode`, `quoteCode`, `validFrom`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrderFulfillment` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `sellerOrgId` VARCHAR(191) NULL,
    `sellerId` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'UNFULFILLED',
    `carrier` VARCHAR(191) NULL,
    `trackingNumber` VARCHAR(191) NULL,
    `shippedAt` DATETIME(3) NULL,
    `deliveredAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `OrderFulfillment_orderId_idx`(`orderId`),
    INDEX `OrderFulfillment_sellerOrgId_idx`(`sellerOrgId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrderFulfillmentItem` (
    `id` VARCHAR(191) NOT NULL,
    `fulfillmentId` VARCHAR(191) NOT NULL,
    `orderItemId` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,

    UNIQUE INDEX `OrderFulfillmentItem_orderItemId_key`(`orderItemId`),
    INDEX `OrderFulfillmentItem_fulfillmentId_idx`(`fulfillmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Refund` (
    `id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `requestedById` VARCHAR(191) NOT NULL,
    `reason` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'REQUESTED',
    `decidedNote` TEXT NULL,
    `amountTotal` DOUBLE NOT NULL DEFAULT 0,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `paymentReference` VARCHAR(191) NULL,
    `approvedById` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `completedById` VARCHAR(191) NULL,
    `completedAt` DATETIME(3) NULL,
    `deniedAt` DATETIME(3) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Refund_number_key`(`number`),
    INDEX `Refund_orderId_idx`(`orderId`),
    INDEX `Refund_status_idx`(`status`),
    INDEX `Refund_requestedById_idx`(`requestedById`),
    INDEX `Refund_approvedById_idx`(`approvedById`),
    INDEX `Refund_completedById_idx`(`completedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RefundAllocation` (
    `id` VARCHAR(191) NOT NULL,
    `refundId` VARCHAR(191) NOT NULL,
    `orderItemId` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `amount` DOUBLE NOT NULL DEFAULT 0,
    `bucketShipping` DOUBLE NOT NULL DEFAULT 0,
    `bucketDiscounts` DOUBLE NOT NULL DEFAULT 0,
    `bucketTaxes` DOUBLE NOT NULL DEFAULT 0,

    INDEX `RefundAllocation_orderItemId_idx`(`orderItemId`),
    UNIQUE INDEX `RefundAllocation_refundId_orderItemId_key`(`refundId`, `orderItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OfferVariant` (
    `id` VARCHAR(191) NOT NULL,
    `offerId` VARCHAR(191) NOT NULL,
    `variantId` VARCHAR(191) NOT NULL,
    `price` DOUBLE NULL,
    `stock` INTEGER NOT NULL DEFAULT 0,
    `sku` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `OfferVariant_variantId_idx`(`variantId`),
    UNIQUE INDEX `OfferVariant_offerId_variantId_key`(`offerId`, `variantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `actorType` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NULL,
    `summary` TEXT NULL,
    `metadata` MEDIUMTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `AuditLog_createdAt_idx`(`createdAt`),
    INDEX `AuditLog_actorType_action_idx`(`actorType`, `action`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Sequence` (
    `key` VARCHAR(191) NOT NULL,
    `value` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Permission` (
    `key` VARCHAR(191) NOT NULL,
    `domain` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,

    INDEX `Permission_domain_idx`(`domain`),
    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Role` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `scope` VARCHAR(191) NOT NULL,
    `isSystem` BOOLEAN NOT NULL DEFAULT false,
    `isProtected` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Role_key_key`(`key`),
    INDEX `Role_scope_idx`(`scope`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RolePermission` (
    `roleId` VARCHAR(191) NOT NULL,
    `permissionKey` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`roleId`, `permissionKey`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserRole` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `roleId` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL DEFAULT '',
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `assignedBy` VARCHAR(191) NULL,

    INDEX `UserRole_userId_idx`(`userId`),
    INDEX `UserRole_organizationId_idx`(`organizationId`),
    UNIQUE INDEX `UserRole_userId_roleId_organizationId_key`(`userId`, `roleId`, `organizationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StaffInvitation` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `roleId` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL DEFAULT '',
    `tokenHash` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `invitedBy` VARCHAR(191) NOT NULL,
    `invitedByName` VARCHAR(191) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `acceptedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `StaffInvitation_tokenHash_key`(`tokenHash`),
    INDEX `StaffInvitation_email_idx`(`email`),
    INDEX `StaffInvitation_organizationId_status_idx`(`organizationId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MfaEnrollment` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `method` VARCHAR(191) NOT NULL DEFAULT 'TOTP',
    `secretEnc` TEXT NOT NULL,
    `confirmedAt` DATETIME(3) NULL,
    `lastTotpStep` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MfaEnrollment_userId_key`(`userId`),
    INDEX `MfaEnrollment_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MfaBackupCode` (
    `id` VARCHAR(191) NOT NULL,
    `enrollmentId` VARCHAR(191) NOT NULL,
    `codeHash` VARCHAR(191) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `MfaBackupCode_codeHash_key`(`codeHash`),
    INDEX `MfaBackupCode_enrollmentId_idx`(`enrollmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SessionRegistry` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `userAgent` VARCHAR(400) NULL,
    `ip` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastUsedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revokedAt` DATETIME(3) NULL,
    `revokedReason` VARCHAR(120) NULL,
    `mfaSatisfiedAt` DATETIME(3) NULL,

    UNIQUE INDEX `SessionRegistry_tokenHash_key`(`tokenHash`),
    INDEX `SessionRegistry_userId_idx`(`userId`),
    INDEX `SessionRegistry_userId_revokedAt_idx`(`userId`, `revokedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PlatformSetting` (
    `key` VARCHAR(191) NOT NULL,
    `value` MEDIUMTEXT NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BannerSlide` (
    `id` VARCHAR(191) NOT NULL,
    `eyebrow` VARCHAR(191) NULL,
    `title` VARCHAR(191) NULL,
    `subtitle` VARCHAR(191) NULL,
    `image` VARCHAR(191) NOT NULL,
    `ctaLabel` VARCHAR(191) NULL,
    `ctaView` VARCHAR(191) NULL,
    `ctaCategory` VARCHAR(191) NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `BannerSlide_active_position_idx`(`active`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RfqSetting` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `scopeType` VARCHAR(191) NOT NULL,
    `scopeId` VARCHAR(191) NOT NULL DEFAULT '',
    `value` MEDIUMTEXT NOT NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `RfqSetting_scopeType_scopeId_idx`(`scopeType`, `scopeId`),
    UNIQUE INDEX `RfqSetting_key_scopeType_scopeId_key`(`key`, `scopeType`, `scopeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SettingChange` (
    `id` VARCHAR(191) NOT NULL,
    `settingKey` VARCHAR(191) NOT NULL,
    `scopeType` VARCHAR(191) NOT NULL,
    `scopeId` VARCHAR(191) NOT NULL DEFAULT '',
    `field` VARCHAR(191) NOT NULL,
    `oldValue` TEXT NULL,
    `newValue` TEXT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `rollbackOfId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SettingChange_settingKey_scopeType_scopeId_createdAt_idx`(`settingKey`, `scopeType`, `scopeId`, `createdAt`),
    INDEX `SettingChange_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Coupon` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `percentOff` INTEGER NOT NULL,
    `minSubtotal` DOUBLE NOT NULL DEFAULT 0,
    `firstOrderOnly` BOOLEAN NOT NULL DEFAULT false,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Coupon_code_key`(`code`),
    INDEX `Coupon_active_idx`(`active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FinancierProfile` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `about` TEXT NULL,
    `licenseNumber` VARCHAR(191) NULL,
    `regulator` VARCHAR(191) NULL,
    `logoUrl` VARCHAR(191) NULL,
    `contactEmail` VARCHAR(191) NULL,
    `contactPhone` VARCHAR(191) NULL,
    `minTicket` DOUBLE NULL,
    `maxTicket` DOUBLE NULL,
    `viewCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `FinancierProfile_organizationId_key`(`organizationId`),
    INDEX `FinancierProfile_organizationId_idx`(`organizationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FinancierBranch` (
    `id` VARCHAR(191) NOT NULL,
    `financierProfileId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL DEFAULT 'BRANCH',
    `street` TEXT NULL,
    `city` VARCHAR(191) NULL,
    `district` VARCHAR(191) NULL,
    `latitude` DOUBLE NULL,
    `longitude` DOUBLE NULL,
    `phone` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `position` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FinancierBranch_financierProfileId_isActive_idx`(`financierProfileId`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FinancierService` (
    `id` VARCHAR(191) NOT NULL,
    `financierProfileId` VARCHAR(191) NOT NULL,
    `serviceKind` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `summary` TEXT NULL,
    `description` TEXT NULL,
    `targetSegment` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `currency` VARCHAR(191) NOT NULL DEFAULT 'YER',
    `amountMin` DOUBLE NULL,
    `amountMax` DOUBLE NULL,
    `rateType` VARCHAR(191) NULL,
    `rateMax` DOUBLE NULL,
    `feeFlat` DOUBLE NULL,
    `tenorMinMonths` INTEGER NULL,
    `tenorMaxMonths` INTEGER NULL,
    `repaymentFrequency` VARCHAR(191) NULL,
    `gracePeriodDays` INTEGER NULL,
    `shariaCompliant` BOOLEAN NOT NULL DEFAULT false,
    `processingDays` INTEGER NULL,
    `accreditationValidMonths` INTEGER NULL,
    `accreditationFeeAmount` DOUBLE NULL,
    `financingLimitText` TEXT NULL,
    `targetAudience` TEXT NULL,
    `termsNote` TEXT NULL,
    `guaranteeTypes` TEXT NULL,
    `financingPeriods` TEXT NULL,
    `viewCount` INTEGER NOT NULL DEFAULT 0,
    `reviewNote` TEXT NULL,
    `reviewedAt` DATETIME(3) NULL,
    `reviewedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FinancierService_financierProfileId_status_idx`(`financierProfileId`, `status`),
    INDEX `FinancierService_serviceKind_category_status_idx`(`serviceKind`, `category`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FinancierServiceAttribute` (
    `id` VARCHAR(191) NOT NULL,
    `serviceId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `text` TEXT NOT NULL,

    INDEX `FinancierServiceAttribute_serviceId_kind_idx`(`serviceId`, `kind`),
    UNIQUE INDEX `FinancierServiceAttribute_serviceId_kind_position_key`(`serviceId`, `kind`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FinancierServiceCoverage` (
    `id` VARCHAR(191) NOT NULL,
    `serviceId` VARCHAR(191) NOT NULL,
    `regionName` VARCHAR(191) NOT NULL,

    INDEX `FinancierServiceCoverage_serviceId_idx`(`serviceId`),
    UNIQUE INDEX `FinancierServiceCoverage_serviceId_regionName_key`(`serviceId`, `regionName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ConditionTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `scope` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NULL,
    `conditionType` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `profileFieldKey` VARCHAR(191) NULL,
    `documentType` VARCHAR(191) NULL,
    `validationMin` DOUBLE NULL,
    `validationMax` DOUBLE NULL,
    `validityMonths` INTEGER NULL,
    `isRepeatable` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ConditionTemplate_scope_organizationId_isActive_idx`(`scope`, `organizationId`, `isActive`),
    INDEX `ConditionTemplate_conditionType_isActive_idx`(`conditionType`, `isActive`),
    INDEX `ConditionTemplate_organizationId_idx`(`organizationId`),
    INDEX `ConditionTemplate_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ConditionOption` (
    `id` VARCHAR(191) NOT NULL,
    `conditionTemplateId` VARCHAR(191) NOT NULL,
    `value` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,

    INDEX `ConditionOption_conditionTemplateId_position_idx`(`conditionTemplateId`, `position`),
    UNIQUE INDEX `ConditionOption_conditionTemplateId_value_key`(`conditionTemplateId`, `value`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ServiceRequirement` (
    `id` VARCHAR(191) NOT NULL,
    `serviceId` VARCHAR(191) NOT NULL,
    `conditionTemplateId` VARCHAR(191) NOT NULL,
    `isRequired` BOOLEAN NOT NULL DEFAULT true,
    `displayOrder` INTEGER NOT NULL DEFAULT 0,
    `instructions` TEXT NULL,
    `autoPassAccredited` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ServiceRequirement_serviceId_isActive_displayOrder_idx`(`serviceId`, `isActive`, `displayOrder`),
    INDEX `ServiceRequirement_conditionTemplateId_idx`(`conditionTemplateId`),
    UNIQUE INDEX `ServiceRequirement_serviceId_conditionTemplateId_key`(`serviceId`, `conditionTemplateId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RequirementSubmission` (
    `id` VARCHAR(191) NOT NULL,
    `serviceRequirementId` VARCHAR(191) NOT NULL,
    `financingRequestId` VARCHAR(191) NULL,
    `accreditationRequestId` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `valueText` TEXT NULL,
    `valueNumber` DOUBLE NULL,
    `valueDate` DATETIME(3) NULL,
    `accountDocumentId` VARCHAR(191) NULL,
    `submittedAt` DATETIME(3) NULL,
    `verifiedAt` DATETIME(3) NULL,
    `verifiedById` VARCHAR(191) NULL,
    `decisionNote` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `RequirementSubmission_status_idx`(`status`),
    INDEX `RequirementSubmission_serviceRequirementId_idx`(`serviceRequirementId`),
    INDEX `RequirementSubmission_accountDocumentId_idx`(`accountDocumentId`),
    INDEX `RequirementSubmission_verifiedById_idx`(`verifiedById`),
    UNIQUE INDEX `RequirementSubmission_financingRequestId_serviceRequirementI_key`(`financingRequestId`, `serviceRequirementId`),
    UNIQUE INDEX `RequirementSubmission_accreditationRequestId_serviceRequirem_key`(`accreditationRequestId`, `serviceRequirementId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AccountDocument` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NULL,
    `mediaId` VARCHAR(191) NOT NULL,
    `documentType` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NULL,
    `issuedAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `reviewedById` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `note` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AccountDocument_userId_documentType_status_idx`(`userId`, `documentType`, `status`),
    INDEX `AccountDocument_organizationId_idx`(`organizationId`),
    INDEX `AccountDocument_mediaId_idx`(`mediaId`),
    INDEX `AccountDocument_reviewedById_idx`(`reviewedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VaultAccessGrant` (
    `id` VARCHAR(191) NOT NULL,
    `documentId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `nonce` VARCHAR(191) NOT NULL,
    `basis` VARCHAR(191) NOT NULL DEFAULT 'OWNER',
    `expiresAt` DATETIME(3) NOT NULL,
    `consumedAt` DATETIME(3) NULL,
    `issuedIp` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `VaultAccessGrant_nonce_key`(`nonce`),
    INDEX `VaultAccessGrant_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `VaultAccessGrant_documentId_createdAt_idx`(`documentId`, `createdAt`),
    INDEX `VaultAccessGrant_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RequestAttachment` (
    `id` VARCHAR(191) NOT NULL,
    `parentType` VARCHAR(191) NOT NULL,
    `parentId` VARCHAR(191) NOT NULL,
    `accountDocumentId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RequestAttachment_parentType_parentId_idx`(`parentType`, `parentId`),
    INDEX `RequestAttachment_accountDocumentId_idx`(`accountDocumentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FinancingRequest` (
    `id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `serviceId` VARCHAR(191) NOT NULL,
    `targetType` VARCHAR(191) NOT NULL,
    `targetId` VARCHAR(191) NULL,
    `multiGroupId` VARCHAR(191) NULL,
    `activityStatus` VARCHAR(191) NULL,
    `activityName` VARCHAR(191) NULL,
    `activityDescription` TEXT NULL,
    `activityStartDate` DATETIME(3) NULL,
    `activityCity` VARCHAR(191) NULL,
    `activityDistrict` VARCHAR(191) NULL,
    `activityAddress` TEXT NULL,
    `activityLocationType` VARCHAR(191) NULL,
    `activityCategory` VARCHAR(191) NULL,
    `activityCategoryOther` VARCHAR(191) NULL,
    `capitalAmount` DOUBLE NULL,
    `ownContributionAmount` DOUBLE NULL,
    `monthlyInstallmentCapacity` DOUBLE NULL,
    `previousFinancing` BOOLEAN NULL,
    `otherIncomeSources` TEXT NULL,
    `amountRequested` DOUBLE NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'YER',
    `purpose` TEXT NULL,
    `tenorRequestedMonths` INTEGER NULL,
    `guaranteeType` VARCHAR(191) NULL,
    `guaranteeTypeOther` VARCHAR(191) NULL,
    `guaranteeStatus` VARCHAR(191) NULL,
    `guaranteeStatusOther` VARCHAR(191) NULL,
    `applicantNotes` TEXT NULL,
    `consentAt` DATETIME(3) NULL,
    `platformReviewedById` VARCHAR(191) NULL,
    `platformReviewedAt` DATETIME(3) NULL,
    `platformNote` TEXT NULL,
    `returnedAt` DATETIME(3) NULL,
    `returnedReason` TEXT NULL,
    `forwardedAt` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `expiresAt` DATETIME(3) NULL,
    `submittedAt` DATETIME(3) NULL,
    `closedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `FinancingRequest_number_key`(`number`),
    INDEX `FinancingRequest_organizationId_status_idx`(`organizationId`, `status`),
    INDEX `FinancingRequest_createdById_createdAt_idx`(`createdById`, `createdAt`),
    INDEX `FinancingRequest_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `FinancingRequest_serviceId_idx`(`serviceId`),
    INDEX `FinancingRequest_multiGroupId_idx`(`multiGroupId`),
    INDEX `FinancingRequest_targetType_targetId_idx`(`targetType`, `targetId`),
    INDEX `FinancingRequest_activityCity_idx`(`activityCity`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FinancingOffer` (
    `id` VARCHAR(191) NOT NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'YER',
    `rateType` VARCHAR(191) NULL,
    `ratePercent` DOUBLE NULL,
    `feeFlat` DOUBLE NULL,
    `tenorMonths` INTEGER NOT NULL,
    `collateralRequired` TEXT NULL,
    `notes` TEXT NULL,
    `validUntil` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `sentAt` DATETIME(3) NULL,
    `acceptedAt` DATETIME(3) NULL,
    `declinedAt` DATETIME(3) NULL,
    `withdrawnAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FinancingOffer_requestId_status_idx`(`requestId`, `status`),
    INDEX `FinancingOffer_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FinancingOfferInstallment` (
    `id` VARCHAR(191) NOT NULL,
    `offerId` VARCHAR(191) NOT NULL,
    `installmentNo` INTEGER NOT NULL,
    `dueDate` DATETIME(3) NOT NULL,
    `amount` DOUBLE NOT NULL,

    INDEX `FinancingOfferInstallment_offerId_dueDate_idx`(`offerId`, `dueDate`),
    UNIQUE INDEX `FinancingOfferInstallment_offerId_installmentNo_key`(`offerId`, `installmentNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FinancingAgreement` (
    `id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `offerId` VARCHAR(191) NOT NULL,
    `fundingStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `acceptedAt` DATETIME(3) NOT NULL,
    `fundedReportedAt` DATETIME(3) NULL,
    `settledReportedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `FinancingAgreement_number_key`(`number`),
    UNIQUE INDEX `FinancingAgreement_offerId_key`(`offerId`),
    INDEX `FinancingAgreement_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FinancingEvent` (
    `id` VARCHAR(191) NOT NULL,
    `agreementId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `eventDate` DATETIME(3) NOT NULL,
    `amount` DOUBLE NULL,
    `note` TEXT NULL,
    `reportedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FinancingEvent_agreementId_eventDate_idx`(`agreementId`, `eventDate`),
    INDEX `FinancingEvent_reportedById_idx`(`reportedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FinancingFee` (
    `id` VARCHAR(191) NOT NULL,
    `agreementId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `baseAmount` DOUBLE NOT NULL,
    `percentApplied` DOUBLE NOT NULL,
    `amount` DOUBLE NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACCRUED',
    `invoicedAt` DATETIME(3) NULL,
    `paidAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FinancingFee_agreementId_type_status_idx`(`agreementId`, `type`, `status`),
    INDEX `FinancingFee_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AccreditationRequest` (
    `id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `submittedById` VARCHAR(191) NOT NULL,
    `serviceId` VARCHAR(191) NOT NULL,
    `multiGroupId` VARCHAR(191) NULL,
    `scopeNotes` TEXT NULL,
    `consentAt` DATETIME(3) NULL,
    `platformReviewedById` VARCHAR(191) NULL,
    `platformReviewedAt` DATETIME(3) NULL,
    `platformNote` TEXT NULL,
    `returnedAt` DATETIME(3) NULL,
    `returnedReason` TEXT NULL,
    `forwardedAt` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `submittedAt` DATETIME(3) NULL,
    `decidedById` VARCHAR(191) NULL,
    `decidedAt` DATETIME(3) NULL,
    `decisionNote` TEXT NULL,
    `accreditedAt` DATETIME(3) NULL,
    `validUntil` DATETIME(3) NULL,
    `revokedById` VARCHAR(191) NULL,
    `revokedAt` DATETIME(3) NULL,
    `revocationReason` TEXT NULL,
    `expiresAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `activeKey` INTEGER NULL,
    `supersedesId` VARCHAR(191) NULL,

    UNIQUE INDEX `AccreditationRequest_number_key`(`number`),
    INDEX `AccreditationRequest_organizationId_status_idx`(`organizationId`, `status`),
    INDEX `AccreditationRequest_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `AccreditationRequest_multiGroupId_idx`(`multiGroupId`),
    INDEX `AccreditationRequest_validUntil_idx`(`validUntil`),
    INDEX `AccreditationRequest_supersedesId_idx`(`supersedesId`),
    INDEX `AccreditationRequest_submittedById_idx`(`submittedById`),
    INDEX `AccreditationRequest_platformReviewedById_idx`(`platformReviewedById`),
    INDEX `AccreditationRequest_decidedById_idx`(`decidedById`),
    INDEX `AccreditationRequest_revokedById_idx`(`revokedById`),
    UNIQUE INDEX `AccreditationRequest_serviceId_organizationId_activeKey_key`(`serviceId`, `organizationId`, `activeKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ContactMessage` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `topic` VARCHAR(191) NOT NULL DEFAULT 'general',
    `message` TEXT NOT NULL,
    `handled` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ContactMessage_createdAt_idx`(`createdAt`),
    INDEX `ContactMessage_handled_idx`(`handled`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FaqItem` (
    `id` VARCHAR(191) NOT NULL,
    `topic` VARCHAR(191) NOT NULL DEFAULT 'GENERAL',
    `question` VARCHAR(191) NOT NULL,
    `answer` TEXT NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `featured` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,

    INDEX `FaqItem_topic_position_idx`(`topic`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FinancierSocialLink` (
    `id` VARCHAR(191) NOT NULL,
    `financierProfileId` VARCHAR(191) NOT NULL,
    `platform` VARCHAR(191) NOT NULL,
    `url` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FinancierSocialLink_financierProfileId_idx`(`financierProfileId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FundingStory` (
    `id` VARCHAR(191) NOT NULL,
    `financierProfileId` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `summary` TEXT NOT NULL,
    `body` TEXT NULL,
    `imageUrl` VARCHAR(191) NULL,
    `sector` VARCHAR(191) NULL,
    `location` VARCHAR(191) NULL,
    `year` INTEGER NULL,
    `amountFinanced` DOUBLE NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'YER',
    `peopleImpacted` INTEGER NULL,
    `co2AvoidedTonnes` DOUBLE NULL,
    `featured` BOOLEAN NOT NULL DEFAULT false,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PUBLISHED',
    `position` INTEGER NOT NULL DEFAULT 0,
    `publishedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FundingStory_status_featured_idx`(`status`, `featured`),
    INDEX `FundingStory_financierProfileId_idx`(`financierProfileId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InsightPost` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `excerpt` TEXT NOT NULL,
    `body` TEXT NOT NULL,
    `coverUrl` VARCHAR(191) NULL,
    `authorName` VARCHAR(191) NULL,
    `authorTitle` VARCHAR(191) NULL,
    `topic` VARCHAR(191) NOT NULL DEFAULT 'GUIDE',
    `tags` VARCHAR(191) NULL,
    `readMinutes` INTEGER NOT NULL DEFAULT 4,
    `featured` BOOLEAN NOT NULL DEFAULT false,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PUBLISHED',
    `publishedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `InsightPost_slug_key`(`slug`),
    INDEX `InsightPost_status_publishedAt_idx`(`status`, `publishedAt`),
    INDEX `InsightPost_topic_idx`(`topic`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LegalDocument` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `summary` TEXT NULL,
    `body` TEXT NOT NULL,
    `version` VARCHAR(191) NOT NULL DEFAULT '1.0',
    `effectiveAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `LegalDocument_slug_key`(`slug`),
    INDEX `LegalDocument_slug_idx`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Partner` (
    `id` VARCHAR(191) NOT NULL,
    `financierProfileId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `monogram` VARCHAR(191) NULL,
    `accentColor` VARCHAR(191) NULL,
    `websiteUrl` VARCHAR(191) NULL,
    `kind` VARCHAR(191) NOT NULL DEFAULT 'PARTNER',
    `position` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Partner_isActive_idx`(`isActive`),
    INDEX `Partner_financierProfileId_idx`(`financierProfileId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SiteStep` (
    `id` VARCHAR(191) NOT NULL,
    `page` VARCHAR(191) NOT NULL,
    `track` VARCHAR(191) NOT NULL DEFAULT 'MAIN',
    `position` INTEGER NOT NULL DEFAULT 0,
    `icon` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `subtitle` VARCHAR(191) NULL,
    `body` TEXT NULL,
    `stat` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SiteStep_page_track_position_idx`(`page`, `track`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Solution` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `tagline` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `audience` VARCHAR(191) NOT NULL DEFAULT 'HOME',
    `icon` VARCHAR(191) NULL,
    `imageUrl` VARCHAR(191) NULL,
    `accentColor` VARCHAR(191) NULL,
    `categorySlug` VARCHAR(191) NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Solution_slug_key`(`slug`),
    INDEX `Solution_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SolutionFeature` (
    `id` VARCHAR(191) NOT NULL,
    `solutionId` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `icon` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `body` TEXT NULL,

    INDEX `SolutionFeature_solutionId_idx`(`solutionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OtpCode` (
    `id` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `purpose` VARCHAR(191) NOT NULL,
    `codeHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `consumedAt` DATETIME(3) NULL,
    `ip` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OtpCode_phone_purpose_createdAt_idx`(`phone`, `purpose`, `createdAt`),
    INDEX `OtpCode_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WhatsAppSender` (
    `id` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `phoneNumber` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING_PAIRING',
    `credsJson` MEDIUMTEXT NULL,
    `pairingCode` VARCHAR(191) NULL,
    `codeIssuedAt` DATETIME(3) NULL,
    `qrExpiresAt` DATETIME(3) NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `lastUsedAt` DATETIME(3) NULL,
    `lastError` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `WhatsAppSender_phoneNumber_key`(`phoneNumber`),
    INDEX `WhatsAppSender_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WhatsAppMessage` (
    `id` VARCHAR(191) NOT NULL,
    `senderId` VARCHAR(191) NULL,
    `toPhone` VARCHAR(191) NOT NULL,
    `template` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'QUEUED',
    `error` TEXT NULL,
    `userId` VARCHAR(191) NULL,
    `notificationId` VARCHAR(191) NULL,
    `campaignId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `sentAt` DATETIME(3) NULL,

    INDEX `WhatsAppMessage_toPhone_createdAt_idx`(`toPhone`, `createdAt`),
    INDEX `WhatsAppMessage_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `WhatsAppMessage_userId_idx`(`userId`),
    INDEX `WhatsAppMessage_campaignId_idx`(`campaignId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WhatsAppTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL DEFAULT 'MARKETING',
    `language` VARCHAR(191) NOT NULL DEFAULT 'ar',
    `body` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `useCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `WhatsAppTemplate_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatbotRule` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `matchType` VARCHAR(191) NOT NULL DEFAULT 'CONTAINS',
    `pattern` TEXT NOT NULL,
    `reply` TEXT NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `priority` INTEGER NOT NULL DEFAULT 100,
    `hits` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BulkCampaign` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `variables` TEXT NULL,
    `templateId` VARCHAR(191) NULL,
    `audience` VARCHAR(191) NOT NULL DEFAULT 'CUSTOM',
    `phones` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `total` INTEGER NOT NULL DEFAULT 0,
    `sent` INTEGER NOT NULL DEFAULT 0,
    `failed` INTEGER NOT NULL DEFAULT 0,
    `createdBy` VARCHAR(191) NULL,
    `scheduledAt` DATETIME(3) NULL,
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `BulkCampaign_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WhatsAppChatThread` (
    `id` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `waJid` VARCHAR(191) NULL,
    `source` VARCHAR(191) NOT NULL DEFAULT 'WHATSAPP',
    `name` VARCHAR(191) NOT NULL DEFAULT '',
    `publicToken` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `unreadCount` INTEGER NOT NULL DEFAULT 0,
    `lastMessageAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastMessageBody` TEXT NULL,
    `autoReply` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `WhatsAppChatThread_publicToken_key`(`publicToken`),
    INDEX `WhatsAppChatThread_lastMessageAt_idx`(`lastMessageAt`),
    INDEX `WhatsAppChatThread_source_idx`(`source`),
    INDEX `WhatsAppChatThread_publicToken_idx`(`publicToken`),
    UNIQUE INDEX `WhatsAppChatThread_waJid_key`(`waJid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WhatsAppChatMessage` (
    `id` VARCHAR(191) NOT NULL,
    `threadId` VARCHAR(191) NOT NULL,
    `direction` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `author` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `WhatsAppChatMessage_threadId_createdAt_idx`(`threadId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserNotificationPref` (
    `userId` VARCHAR(191) NOT NULL,
    `whatsapp` BOOLEAN NOT NULL DEFAULT true,
    `email` BOOLEAN NOT NULL DEFAULT true,
    `sms` BOOLEAN NOT NULL DEFAULT false,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProductCertification` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `mediaId` VARCHAR(191) NULL,
    `url` VARCHAR(191) NULL,
    `issuedBy` VARCHAR(191) NULL,
    `issuedAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `verifiedById` VARCHAR(191) NULL,
    `verifiedAt` DATETIME(3) NULL,
    `note` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ProductCertification_productId_kind_status_idx`(`productId`, `kind`, `status`),
    INDEX `ProductCertification_verifiedById_idx`(`verifiedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SpecAttribute` (
    `id` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NULL,
    `key` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `dataType` VARCHAR(191) NOT NULL DEFAULT 'TEXT',
    `unit` VARCHAR(191) NULL,
    `options` TEXT NULL,
    `required` BOOLEAN NOT NULL DEFAULT false,
    `position` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SpecAttribute_isActive_position_idx`(`isActive`, `position`),
    UNIQUE INDEX `SpecAttribute_categoryId_key_key`(`categoryId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ModuleDefinition` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `domain` VARCHAR(191) NOT NULL DEFAULT 'STOREFRONT',
    `core` BOOLEAN NOT NULL DEFAULT false,
    `defaultOn` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ModuleDefinition_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ModuleActivation` (
    `id` VARCHAR(191) NOT NULL,
    `moduleKey` VARCHAR(191) NOT NULL,
    `scopeType` VARCHAR(191) NOT NULL,
    `scopeId` VARCHAR(191) NOT NULL DEFAULT '',
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `note` TEXT NULL,
    `changedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ModuleActivation_scopeType_scopeId_idx`(`scopeType`, `scopeId`),
    UNIQUE INDEX `ModuleActivation_moduleKey_scopeType_scopeId_key`(`moduleKey`, `scopeType`, `scopeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PublicationAgreementTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `version` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT false,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PublicationAgreementTemplate_version_key`(`version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PublicationConsent` (
    `id` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NOT NULL,
    `productTitle` VARCHAR(191) NULL,
    `acceptedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ipAddress` VARCHAR(191) NULL,

    INDEX `PublicationConsent_templateId_idx`(`templateId`),
    INDEX `PublicationConsent_userId_idx`(`userId`),
    UNIQUE INDEX `PublicationConsent_templateId_userId_productId_key`(`templateId`, `userId`, `productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InstallmentPayment` (
    `id` VARCHAR(191) NOT NULL,
    `agreementId` VARCHAR(191) NOT NULL,
    `receivedAt` DATETIME(3) NOT NULL,
    `channel` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(191) NULL,
    `amount` DOUBLE NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'YER',
    `fxRateToAgreement` DOUBLE NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'RECEIVED',
    `note` TEXT NULL,
    `recordedById` VARCHAR(191) NOT NULL,
    `reversalOfId` VARCHAR(191) NULL,
    `reconciledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `InstallmentPayment_agreementId_receivedAt_idx`(`agreementId`, `receivedAt`),
    INDEX `InstallmentPayment_status_idx`(`status`),
    INDEX `InstallmentPayment_recordedById_idx`(`recordedById`),
    INDEX `InstallmentPayment_reversalOfId_idx`(`reversalOfId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InstallmentAllocation` (
    `id` VARCHAR(191) NOT NULL,
    `paymentId` VARCHAR(191) NOT NULL,
    `installmentId` VARCHAR(191) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `InstallmentAllocation_installmentId_idx`(`installmentId`),
    UNIQUE INDEX `InstallmentAllocation_paymentId_installmentId_key`(`paymentId`, `installmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentReconciliation` (
    `id` VARCHAR(191) NOT NULL,
    `agreementId` VARCHAR(191) NOT NULL,
    `batchDate` DATETIME(3) NOT NULL,
    `railExpected` DOUBLE NOT NULL,
    `ledgerActual` DOUBLE NOT NULL,
    `difference` DOUBLE NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'OPEN',
    `resolutionNote` TEXT NULL,
    `resolvedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolvedAt` DATETIME(3) NULL,

    INDEX `PaymentReconciliation_status_batchDate_idx`(`status`, `batchDate`),
    UNIQUE INDEX `PaymentReconciliation_agreementId_batchDate_key`(`agreementId`, `batchDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DisbursementRecord` (
    `id` VARCHAR(191) NOT NULL,
    `agreementId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'QUEUED',
    `currency` VARCHAR(191) NOT NULL DEFAULT 'YER',
    `amount` DOUBLE NOT NULL,
    `rail` VARCHAR(191) NULL,
    `reference` VARCHAR(191) NULL,
    `exchangeRateId` VARCHAR(191) NULL,
    `fxRate` DOUBLE NULL,
    `note` TEXT NULL,
    `queuedById` VARCHAR(191) NOT NULL,
    `confirmedAt` DATETIME(3) NULL,
    `confirmedById` VARCHAR(191) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `DisbursementRecord_agreementId_key`(`agreementId`),
    INDEX `DisbursementRecord_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `DisbursementRecord_queuedById_idx`(`queuedById`),
    INDEX `DisbursementRecord_confirmedById_idx`(`confirmedById`),
    INDEX `DisbursementRecord_exchangeRateId_idx`(`exchangeRateId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RiskConfig` (
    `id` VARCHAR(191) NOT NULL,
    `financierProfileId` VARCHAR(191) NOT NULL,
    `autoDecisionEnabled` BOOLEAN NOT NULL DEFAULT false,
    `autoApproveThreshold` DOUBLE NOT NULL DEFAULT 80,
    `autoDeclineThreshold` DOUBLE NOT NULL DEFAULT 30,
    `weightAmount` INTEGER NOT NULL DEFAULT 20,
    `weightTenor` INTEGER NOT NULL DEFAULT 10,
    `weightGuarantee` INTEGER NOT NULL DEFAULT 20,
    `weightCapacity` INTEGER NOT NULL DEFAULT 20,
    `weightHistory` INTEGER NOT NULL DEFAULT 15,
    `weightDocuments` INTEGER NOT NULL DEFAULT 15,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `RiskConfig_financierProfileId_key`(`financierProfileId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RiskAssessment` (
    `id` VARCHAR(191) NOT NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `score` DOUBLE NOT NULL,
    `band` VARCHAR(191) NOT NULL,
    `factors` MEDIUMTEXT NOT NULL,
    `decision` VARCHAR(191) NOT NULL DEFAULT 'DECISION_SUPPORT',
    `computedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `RiskAssessment_requestId_key`(`requestId`),
    INDEX `RiskAssessment_computedById_idx`(`computedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ShariaCertification` (
    `id` VARCHAR(191) NOT NULL,
    `financierProfileId` VARCHAR(191) NOT NULL,
    `scholarName` VARCHAR(191) NOT NULL,
    `scholarInstitution` VARCHAR(191) NOT NULL,
    `certificateRef` VARCHAR(191) NOT NULL,
    `scope` TEXT NULL,
    `issuedAt` DATETIME(3) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `reminderSentAt` DATETIME(3) NULL,
    `documentUrl` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ShariaCertification_financierProfileId_expiresAt_idx`(`financierProfileId`, `expiresAt`),
    UNIQUE INDEX `ShariaCertification_financierProfileId_certificateRef_key`(`financierProfileId`, `certificateRef`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FinancingContractTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `financierProfileId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL DEFAULT 'FINANCING_AGREEMENT',
    `version` INTEGER NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `sha256` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FinancingContractTemplate_financierProfileId_status_idx`(`financierProfileId`, `status`),
    INDEX `FinancingContractTemplate_createdById_idx`(`createdById`),
    UNIQUE INDEX `FinancingContractTemplate_financierProfileId_kind_version_key`(`financierProfileId`, `kind`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ESignatureExecution` (
    `id` VARCHAR(191) NOT NULL,
    `agreementId` VARCHAR(191) NOT NULL,
    `contractTemplateId` VARCHAR(191) NOT NULL,
    `documentSha256` VARCHAR(191) NOT NULL,
    `signerId` VARCHAR(191) NOT NULL,
    `signerMfaVerifiedAt` DATETIME(3) NULL,
    `consentText` TEXT NOT NULL,
    `acceptedAt` DATETIME(3) NOT NULL,
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` VARCHAR(191) NULL,
    `signatureImageId` VARCHAR(191) NULL,
    `evidence` MEDIUMTEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ESignatureExecution_agreementId_key`(`agreementId`),
    INDEX `ESignatureExecution_signerId_idx`(`signerId`),
    INDEX `ESignatureExecution_contractTemplateId_idx`(`contractTemplateId`),
    INDEX `ESignatureExecution_signatureImageId_idx`(`signatureImageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UnderwritingLimit` (
    `id` VARCHAR(191) NOT NULL,
    `financierProfileId` VARCHAR(191) NOT NULL,
    `scopeKey` VARCHAR(191) NOT NULL,
    `branchId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `maxAmount` DOUBLE NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'YER',
    `updatedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UnderwritingLimit_scopeKey_key`(`scopeKey`),
    INDEX `UnderwritingLimit_financierProfileId_idx`(`financierProfileId`),
    INDEX `UnderwritingLimit_branchId_idx`(`branchId`),
    INDEX `UnderwritingLimit_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FeeRule` (
    `id` VARCHAR(191) NOT NULL,
    `event` VARCHAR(191) NOT NULL,
    `actorType` VARCHAR(191) NOT NULL,
    `scopeType` VARCHAR(191) NOT NULL DEFAULT 'PLATFORM',
    `scopeId` VARCHAR(191) NOT NULL DEFAULT '',
    `dimension` VARCHAR(191) NOT NULL DEFAULT 'PERCENT',
    `value` DOUBLE NOT NULL,
    `currency` VARCHAR(191) NULL,
    `precedence` INTEGER NOT NULL DEFAULT 0,
    `effectiveFrom` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `effectiveTo` DATETIME(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `note` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `changedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FeeRule_event_isActive_scopeType_idx`(`event`, `isActive`, `scopeType`),
    INDEX `FeeRule_scopeType_scopeId_idx`(`scopeType`, `scopeId`),
    UNIQUE INDEX `FeeRule_event_scopeType_scopeId_version_key`(`event`, `scopeType`, `scopeId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FeeAssessment` (
    `id` VARCHAR(191) NOT NULL,
    `idempotencyKey` VARCHAR(191) NOT NULL,
    `event` VARCHAR(191) NOT NULL,
    `ruleId` VARCHAR(191) NULL,
    `ruleVersion` INTEGER NULL,
    `ruleSnapshot` MEDIUMTEXT NULL,
    `actorType` VARCHAR(191) NOT NULL,
    `actorOrgId` VARCHAR(191) NULL,
    `refType` VARCHAR(191) NULL,
    `refId` VARCHAR(191) NULL,
    `baseAmount` DOUBLE NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `fxRateToUsd` DOUBLE NOT NULL DEFAULT 1,
    `calcInputs` MEDIUMTEXT NULL,
    `amount` DOUBLE NOT NULL,
    `reversalOfId` VARCHAR(191) NULL,
    `reversalReason` TEXT NULL,
    `changedById` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'APPLIED',
    `assessedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `FeeAssessment_idempotencyKey_key`(`idempotencyKey`),
    INDEX `FeeAssessment_event_assessedAt_idx`(`event`, `assessedAt`),
    INDEX `FeeAssessment_actorOrgId_event_idx`(`actorOrgId`, `event`),
    INDEX `FeeAssessment_refType_refId_idx`(`refType`, `refId`),
    INDEX `FeeAssessment_reversalOfId_idx`(`reversalOfId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SubscriptionPlan` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `priceMonthly` DOUBLE NOT NULL DEFAULT 0,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `modules` MEDIUMTEXT NOT NULL,
    `limits` MEDIUMTEXT NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `changedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SubscriptionPlan_key_key`(`key`),
    INDEX `SubscriptionPlan_isActive_sortOrder_idx`(`isActive`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SellerSubscription` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `planId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `currentPeriodStart` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `currentPeriodEnd` DATETIME(3) NOT NULL,
    `graceEndsAt` DATETIME(3) NULL,
    `graceDays` INTEGER NOT NULL DEFAULT 7,
    `cancelledAt` DATETIME(3) NULL,
    `cancelReason` TEXT NULL,
    `changedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SellerSubscription_organizationId_key`(`organizationId`),
    INDEX `SellerSubscription_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SubscriptionInvoice` (
    `id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `subscriptionId` VARCHAR(191) NOT NULL,
    `planKey` VARCHAR(191) NOT NULL,
    `planName` VARCHAR(191) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `status` VARCHAR(191) NOT NULL DEFAULT 'PAID',
    `periodStart` DATETIME(3) NOT NULL,
    `periodEnd` DATETIME(3) NOT NULL,
    `paidAt` DATETIME(3) NULL,
    `failedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `SubscriptionInvoice_number_key`(`number`),
    INDEX `SubscriptionInvoice_subscriptionId_createdAt_idx`(`subscriptionId`, `createdAt`),
    INDEX `SubscriptionInvoice_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `KycProviderConfig` (
    `id` VARCHAR(191) NOT NULL,
    `docType` VARCHAR(191) NOT NULL,
    `mode` VARCHAR(191) NOT NULL DEFAULT 'MANUAL',
    `providerKey` VARCHAR(191) NOT NULL DEFAULT 'mock',
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `timeoutMs` INTEGER NOT NULL DEFAULT 30000,
    `settings` MEDIUMTEXT NULL,
    `changedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `KycProviderConfig_docType_key`(`docType`),
    INDEX `KycProviderConfig_enabled_mode_idx`(`enabled`, `mode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `KycCase` (
    `id` VARCHAR(191) NOT NULL,
    `documentId` VARCHAR(191) NOT NULL,
    `docType` VARCHAR(191) NOT NULL,
    `providerKey` VARCHAR(191) NOT NULL,
    `configId` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `providerCaseRef` VARCHAR(191) NULL,
    `submittedAt` DATETIME(3) NULL,
    `decisionAt` DATETIME(3) NULL,
    `errorDetail` TEXT NULL,
    `transmittedFields` MEDIUMTEXT NULL,
    `lastEventId` VARCHAR(191) NULL,
    `decidedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `KycCase_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `KycCase_documentId_idx`(`documentId`),
    INDEX `KycCase_providerKey_status_idx`(`providerKey`, `status`),
    INDEX `KycCase_decidedById_idx`(`decidedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `KycWebhookEvent` (
    `id` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `providerKey` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NULL,
    `eventType` VARCHAR(191) NOT NULL,
    `payload` MEDIUMTEXT NOT NULL,
    `signatureValid` BOOLEAN NOT NULL DEFAULT false,
    `replayed` BOOLEAN NOT NULL DEFAULT false,
    `nonce` VARCHAR(191) NULL,
    `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `processedAt` DATETIME(3) NULL,

    INDEX `KycWebhookEvent_providerKey_receivedAt_idx`(`providerKey`, `receivedAt`),
    INDEX `KycWebhookEvent_caseId_idx`(`caseId`),
    UNIQUE INDEX `KycWebhookEvent_providerKey_eventId_key`(`providerKey`, `eventId`),
    UNIQUE INDEX `KycWebhookEvent_providerKey_nonce_key`(`providerKey`, `nonce`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_sellerId_fkey` FOREIGN KEY (`sellerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_curatedById_fkey` FOREIGN KEY (`curatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_brandId_fkey` FOREIGN KEY (`brandId`) REFERENCES `Brand`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductOffer` ADD CONSTRAINT `ProductOffer_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductOffer` ADD CONSTRAINT `ProductOffer_sellerId_fkey` FOREIGN KEY (`sellerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductOffer` ADD CONSTRAINT `ProductOffer_sellerOrgId_fkey` FOREIGN KEY (`sellerOrgId`) REFERENCES `Organization`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_buyerId_fkey` FOREIGN KEY (`buyerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_financingAgreementId_fkey` FOREIGN KEY (`financingAgreementId`) REFERENCES `FinancingAgreement`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderItem` ADD CONSTRAINT `OrderItem_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderItem` ADD CONSTRAINT `OrderItem_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderItem` ADD CONSTRAINT `OrderItem_offerVariantId_fkey` FOREIGN KEY (`offerVariantId`) REFERENCES `OfferVariant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderItem` ADD CONSTRAINT `OrderItem_sellerOrgId_fkey` FOREIGN KEY (`sellerOrgId`) REFERENCES `Organization`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderItem` ADD CONSTRAINT `OrderItem_payoutId_fkey` FOREIGN KEY (`payoutId`) REFERENCES `Payout`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductVariant` ADD CONSTRAINT `ProductVariant_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Review` ADD CONSTRAINT `Review_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Review` ADD CONSTRAINT `Review_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Favorite` ADD CONSTRAINT `Favorite_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Favorite` ADD CONSTRAINT `Favorite_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrganizationMember` ADD CONSTRAINT `OrganizationMember_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrganizationMember` ADD CONSTRAINT `OrganizationMember_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CustomerGroupUser` ADD CONSTRAINT `CustomerGroupUser_customerGroupId_fkey` FOREIGN KEY (`customerGroupId`) REFERENCES `CustomerGroup`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CustomerGroupUser` ADD CONSTRAINT `CustomerGroupUser_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CustomerGroupOrganization` ADD CONSTRAINT `CustomerGroupOrganization_customerGroupId_fkey` FOREIGN KEY (`customerGroupId`) REFERENCES `CustomerGroup`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CustomerGroupOrganization` ADD CONSTRAINT `CustomerGroupOrganization_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PriceList` ADD CONSTRAINT `PriceList_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PriceList` ADD CONSTRAINT `PriceList_customerGroupId_fkey` FOREIGN KEY (`customerGroupId`) REFERENCES `CustomerGroup`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PriceListEntry` ADD CONSTRAINT `PriceListEntry_priceListId_fkey` FOREIGN KEY (`priceListId`) REFERENCES `PriceList`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PriceListEntry` ADD CONSTRAINT `PriceListEntry_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Rfq` ADD CONSTRAINT `Rfq_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Rfq` ADD CONSTRAINT `Rfq_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RfqLine` ADD CONSTRAINT `RfqLine_offerId_fkey` FOREIGN KEY (`offerId`) REFERENCES `ProductOffer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RfqLine` ADD CONSTRAINT `RfqLine_offerVariantId_fkey` FOREIGN KEY (`offerVariantId`) REFERENCES `OfferVariant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RfqLine` ADD CONSTRAINT `RfqLine_rfqId_fkey` FOREIGN KEY (`rfqId`) REFERENCES `Rfq`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RfqLine` ADD CONSTRAINT `RfqLine_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Quote` ADD CONSTRAINT `Quote_sellerOrgId_fkey` FOREIGN KEY (`sellerOrgId`) REFERENCES `Organization`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Quote` ADD CONSTRAINT `Quote_rfqId_fkey` FOREIGN KEY (`rfqId`) REFERENCES `Rfq`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Quote` ADD CONSTRAINT `Quote_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApprovalRequest` ADD CONSTRAINT `ApprovalRequest_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApprovalRequest` ADD CONSTRAINT `ApprovalRequest_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApprovalRequest` ADD CONSTRAINT `ApprovalRequest_quoteId_fkey` FOREIGN KEY (`quoteId`) REFERENCES `Quote`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApprovalRequest` ADD CONSTRAINT `ApprovalRequest_requesterId_fkey` FOREIGN KEY (`requesterId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApprovalRequest` ADD CONSTRAINT `ApprovalRequest_decidedById_fkey` FOREIGN KEY (`decidedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuoteLine` ADD CONSTRAINT `QuoteLine_offerId_fkey` FOREIGN KEY (`offerId`) REFERENCES `ProductOffer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuoteLine` ADD CONSTRAINT `QuoteLine_offerVariantId_fkey` FOREIGN KEY (`offerVariantId`) REFERENCES `OfferVariant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuoteLine` ADD CONSTRAINT `QuoteLine_quoteId_fkey` FOREIGN KEY (`quoteId`) REFERENCES `Quote`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuoteLine` ADD CONSTRAINT `QuoteLine_rfqLineId_fkey` FOREIGN KEY (`rfqLineId`) REFERENCES `RfqLine`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuoteLine` ADD CONSTRAINT `QuoteLine_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NotificationDigest` ADD CONSTRAINT `NotificationDigest_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserDigestPref` ADD CONSTRAINT `UserDigestPref_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PasswordResetToken` ADD CONSTRAINT `PasswordResetToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmailVerificationToken` ADD CONSTRAINT `EmailVerificationToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RfqMessage` ADD CONSTRAINT `RfqMessage_rfqId_fkey` FOREIGN KEY (`rfqId`) REFERENCES `Rfq`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RfqMessage` ADD CONSTRAINT `RfqMessage_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MediaAsset` ADD CONSTRAINT `MediaAsset_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Dispute` ADD CONSTRAINT `Dispute_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Dispute` ADD CONSTRAINT `Dispute_raisedById_fkey` FOREIGN KEY (`raisedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Dispute` ADD CONSTRAINT `Dispute_sellerId_fkey` FOREIGN KEY (`sellerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Dispute` ADD CONSTRAINT `Dispute_resolvedById_fkey` FOREIGN KEY (`resolvedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RecurringRfq` ADD CONSTRAINT `RecurringRfq_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_capturedById_fkey` FOREIGN KEY (`capturedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payout` ADD CONSTRAINT `Payout_sellerId_fkey` FOREIGN KEY (`sellerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payout` ADD CONSTRAINT `Payout_sellerOrgId_fkey` FOREIGN KEY (`sellerOrgId`) REFERENCES `Organization`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payout` ADD CONSTRAINT `Payout_executedById_fkey` FOREIGN KEY (`executedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SellerProfile` ADD CONSTRAINT `SellerProfile_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SellerProfile` ADD CONSTRAINT `SellerProfile_ownerUserId_fkey` FOREIGN KEY (`ownerUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PayoutLine` ADD CONSTRAINT `PayoutLine_payoutId_fkey` FOREIGN KEY (`payoutId`) REFERENCES `Payout`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PayoutLine` ADD CONSTRAINT `PayoutLine_orderItemId_fkey` FOREIGN KEY (`orderItemId`) REFERENCES `OrderItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PayoutLine` ADD CONSTRAINT `PayoutLine_reversalOfLineId_fkey` FOREIGN KEY (`reversalOfLineId`) REFERENCES `PayoutLine`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExchangeRate` ADD CONSTRAINT `ExchangeRate_baseCode_fkey` FOREIGN KEY (`baseCode`) REFERENCES `Currency`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExchangeRate` ADD CONSTRAINT `ExchangeRate_quoteCode_fkey` FOREIGN KEY (`quoteCode`) REFERENCES `Currency`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderFulfillment` ADD CONSTRAINT `OrderFulfillment_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderFulfillment` ADD CONSTRAINT `OrderFulfillment_sellerOrgId_fkey` FOREIGN KEY (`sellerOrgId`) REFERENCES `Organization`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderFulfillmentItem` ADD CONSTRAINT `OrderFulfillmentItem_fulfillmentId_fkey` FOREIGN KEY (`fulfillmentId`) REFERENCES `OrderFulfillment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderFulfillmentItem` ADD CONSTRAINT `OrderFulfillmentItem_orderItemId_fkey` FOREIGN KEY (`orderItemId`) REFERENCES `OrderItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Refund` ADD CONSTRAINT `Refund_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Refund` ADD CONSTRAINT `Refund_requestedById_fkey` FOREIGN KEY (`requestedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Refund` ADD CONSTRAINT `Refund_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Refund` ADD CONSTRAINT `Refund_completedById_fkey` FOREIGN KEY (`completedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RefundAllocation` ADD CONSTRAINT `RefundAllocation_refundId_fkey` FOREIGN KEY (`refundId`) REFERENCES `Refund`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RefundAllocation` ADD CONSTRAINT `RefundAllocation_orderItemId_fkey` FOREIGN KEY (`orderItemId`) REFERENCES `OrderItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OfferVariant` ADD CONSTRAINT `OfferVariant_offerId_fkey` FOREIGN KEY (`offerId`) REFERENCES `ProductOffer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OfferVariant` ADD CONSTRAINT `OfferVariant_variantId_fkey` FOREIGN KEY (`variantId`) REFERENCES `ProductVariant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_permissionKey_fkey` FOREIGN KEY (`permissionKey`) REFERENCES `Permission`(`key`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserRole` ADD CONSTRAINT `UserRole_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserRole` ADD CONSTRAINT `UserRole_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffInvitation` ADD CONSTRAINT `StaffInvitation_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MfaEnrollment` ADD CONSTRAINT `MfaEnrollment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MfaBackupCode` ADD CONSTRAINT `MfaBackupCode_enrollmentId_fkey` FOREIGN KEY (`enrollmentId`) REFERENCES `MfaEnrollment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SessionRegistry` ADD CONSTRAINT `SessionRegistry_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SettingChange` ADD CONSTRAINT `SettingChange_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinancierProfile` ADD CONSTRAINT `FinancierProfile_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinancierBranch` ADD CONSTRAINT `FinancierBranch_financierProfileId_fkey` FOREIGN KEY (`financierProfileId`) REFERENCES `FinancierProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinancierService` ADD CONSTRAINT `FinancierService_financierProfileId_fkey` FOREIGN KEY (`financierProfileId`) REFERENCES `FinancierProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinancierServiceAttribute` ADD CONSTRAINT `FinancierServiceAttribute_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `FinancierService`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinancierServiceCoverage` ADD CONSTRAINT `FinancierServiceCoverage_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `FinancierService`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConditionTemplate` ADD CONSTRAINT `ConditionTemplate_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConditionTemplate` ADD CONSTRAINT `ConditionTemplate_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConditionOption` ADD CONSTRAINT `ConditionOption_conditionTemplateId_fkey` FOREIGN KEY (`conditionTemplateId`) REFERENCES `ConditionTemplate`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ServiceRequirement` ADD CONSTRAINT `ServiceRequirement_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `FinancierService`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ServiceRequirement` ADD CONSTRAINT `ServiceRequirement_conditionTemplateId_fkey` FOREIGN KEY (`conditionTemplateId`) REFERENCES `ConditionTemplate`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RequirementSubmission` ADD CONSTRAINT `RequirementSubmission_serviceRequirementId_fkey` FOREIGN KEY (`serviceRequirementId`) REFERENCES `ServiceRequirement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RequirementSubmission` ADD CONSTRAINT `RequirementSubmission_financingRequestId_fkey` FOREIGN KEY (`financingRequestId`) REFERENCES `FinancingRequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RequirementSubmission` ADD CONSTRAINT `RequirementSubmission_accreditationRequestId_fkey` FOREIGN KEY (`accreditationRequestId`) REFERENCES `AccreditationRequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RequirementSubmission` ADD CONSTRAINT `RequirementSubmission_accountDocumentId_fkey` FOREIGN KEY (`accountDocumentId`) REFERENCES `AccountDocument`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RequirementSubmission` ADD CONSTRAINT `RequirementSubmission_verifiedById_fkey` FOREIGN KEY (`verifiedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AccountDocument` ADD CONSTRAINT `AccountDocument_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AccountDocument` ADD CONSTRAINT `AccountDocument_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AccountDocument` ADD CONSTRAINT `AccountDocument_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `MediaAsset`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AccountDocument` ADD CONSTRAINT `AccountDocument_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VaultAccessGrant` ADD CONSTRAINT `VaultAccessGrant_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `AccountDocument`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VaultAccessGrant` ADD CONSTRAINT `VaultAccessGrant_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RequestAttachment` ADD CONSTRAINT `RequestAttachment_accountDocumentId_fkey` FOREIGN KEY (`accountDocumentId`) REFERENCES `AccountDocument`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinancingRequest` ADD CONSTRAINT `FinancingRequest_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinancingRequest` ADD CONSTRAINT `FinancingRequest_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinancingRequest` ADD CONSTRAINT `FinancingRequest_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `FinancierService`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinancingRequest` ADD CONSTRAINT `FinancingRequest_platformReviewedById_fkey` FOREIGN KEY (`platformReviewedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinancingOffer` ADD CONSTRAINT `FinancingOffer_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `FinancingRequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinancingOffer` ADD CONSTRAINT `FinancingOffer_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinancingOfferInstallment` ADD CONSTRAINT `FinancingOfferInstallment_offerId_fkey` FOREIGN KEY (`offerId`) REFERENCES `FinancingOffer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinancingAgreement` ADD CONSTRAINT `FinancingAgreement_offerId_fkey` FOREIGN KEY (`offerId`) REFERENCES `FinancingOffer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinancingEvent` ADD CONSTRAINT `FinancingEvent_agreementId_fkey` FOREIGN KEY (`agreementId`) REFERENCES `FinancingAgreement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinancingEvent` ADD CONSTRAINT `FinancingEvent_reportedById_fkey` FOREIGN KEY (`reportedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinancingFee` ADD CONSTRAINT `FinancingFee_agreementId_fkey` FOREIGN KEY (`agreementId`) REFERENCES `FinancingAgreement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AccreditationRequest` ADD CONSTRAINT `AccreditationRequest_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AccreditationRequest` ADD CONSTRAINT `AccreditationRequest_submittedById_fkey` FOREIGN KEY (`submittedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AccreditationRequest` ADD CONSTRAINT `AccreditationRequest_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `FinancierService`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AccreditationRequest` ADD CONSTRAINT `AccreditationRequest_platformReviewedById_fkey` FOREIGN KEY (`platformReviewedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AccreditationRequest` ADD CONSTRAINT `AccreditationRequest_decidedById_fkey` FOREIGN KEY (`decidedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AccreditationRequest` ADD CONSTRAINT `AccreditationRequest_revokedById_fkey` FOREIGN KEY (`revokedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AccreditationRequest` ADD CONSTRAINT `AccreditationRequest_supersedesId_fkey` FOREIGN KEY (`supersedesId`) REFERENCES `AccreditationRequest`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinancierSocialLink` ADD CONSTRAINT `FinancierSocialLink_financierProfileId_fkey` FOREIGN KEY (`financierProfileId`) REFERENCES `FinancierProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FundingStory` ADD CONSTRAINT `FundingStory_financierProfileId_fkey` FOREIGN KEY (`financierProfileId`) REFERENCES `FinancierProfile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Partner` ADD CONSTRAINT `Partner_financierProfileId_fkey` FOREIGN KEY (`financierProfileId`) REFERENCES `FinancierProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SolutionFeature` ADD CONSTRAINT `SolutionFeature_solutionId_fkey` FOREIGN KEY (`solutionId`) REFERENCES `Solution`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WhatsAppMessage` ADD CONSTRAINT `WhatsAppMessage_senderId_fkey` FOREIGN KEY (`senderId`) REFERENCES `WhatsAppSender`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BulkCampaign` ADD CONSTRAINT `BulkCampaign_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `WhatsAppTemplate`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WhatsAppChatMessage` ADD CONSTRAINT `WhatsAppChatMessage_threadId_fkey` FOREIGN KEY (`threadId`) REFERENCES `WhatsAppChatThread`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserNotificationPref` ADD CONSTRAINT `UserNotificationPref_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductCertification` ADD CONSTRAINT `ProductCertification_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductCertification` ADD CONSTRAINT `ProductCertification_verifiedById_fkey` FOREIGN KEY (`verifiedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SpecAttribute` ADD CONSTRAINT `SpecAttribute_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ModuleActivation` ADD CONSTRAINT `ModuleActivation_moduleKey_fkey` FOREIGN KEY (`moduleKey`) REFERENCES `ModuleDefinition`(`key`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PublicationAgreementTemplate` ADD CONSTRAINT `PublicationAgreementTemplate_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PublicationConsent` ADD CONSTRAINT `PublicationConsent_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `PublicationAgreementTemplate`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PublicationConsent` ADD CONSTRAINT `PublicationConsent_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PublicationConsent` ADD CONSTRAINT `PublicationConsent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InstallmentPayment` ADD CONSTRAINT `InstallmentPayment_agreementId_fkey` FOREIGN KEY (`agreementId`) REFERENCES `FinancingAgreement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InstallmentPayment` ADD CONSTRAINT `InstallmentPayment_recordedById_fkey` FOREIGN KEY (`recordedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InstallmentPayment` ADD CONSTRAINT `InstallmentPayment_reversalOfId_fkey` FOREIGN KEY (`reversalOfId`) REFERENCES `InstallmentPayment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InstallmentAllocation` ADD CONSTRAINT `InstallmentAllocation_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `InstallmentPayment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InstallmentAllocation` ADD CONSTRAINT `InstallmentAllocation_installmentId_fkey` FOREIGN KEY (`installmentId`) REFERENCES `FinancingOfferInstallment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentReconciliation` ADD CONSTRAINT `PaymentReconciliation_agreementId_fkey` FOREIGN KEY (`agreementId`) REFERENCES `FinancingAgreement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentReconciliation` ADD CONSTRAINT `PaymentReconciliation_resolvedById_fkey` FOREIGN KEY (`resolvedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DisbursementRecord` ADD CONSTRAINT `DisbursementRecord_agreementId_fkey` FOREIGN KEY (`agreementId`) REFERENCES `FinancingAgreement`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DisbursementRecord` ADD CONSTRAINT `DisbursementRecord_exchangeRateId_fkey` FOREIGN KEY (`exchangeRateId`) REFERENCES `ExchangeRate`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DisbursementRecord` ADD CONSTRAINT `DisbursementRecord_queuedById_fkey` FOREIGN KEY (`queuedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DisbursementRecord` ADD CONSTRAINT `DisbursementRecord_confirmedById_fkey` FOREIGN KEY (`confirmedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RiskConfig` ADD CONSTRAINT `RiskConfig_financierProfileId_fkey` FOREIGN KEY (`financierProfileId`) REFERENCES `FinancierProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RiskConfig` ADD CONSTRAINT `RiskConfig_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RiskAssessment` ADD CONSTRAINT `RiskAssessment_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `FinancingRequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RiskAssessment` ADD CONSTRAINT `RiskAssessment_computedById_fkey` FOREIGN KEY (`computedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ShariaCertification` ADD CONSTRAINT `ShariaCertification_financierProfileId_fkey` FOREIGN KEY (`financierProfileId`) REFERENCES `FinancierProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinancingContractTemplate` ADD CONSTRAINT `FinancingContractTemplate_financierProfileId_fkey` FOREIGN KEY (`financierProfileId`) REFERENCES `FinancierProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinancingContractTemplate` ADD CONSTRAINT `FinancingContractTemplate_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ESignatureExecution` ADD CONSTRAINT `ESignatureExecution_agreementId_fkey` FOREIGN KEY (`agreementId`) REFERENCES `FinancingAgreement`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ESignatureExecution` ADD CONSTRAINT `ESignatureExecution_contractTemplateId_fkey` FOREIGN KEY (`contractTemplateId`) REFERENCES `FinancingContractTemplate`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ESignatureExecution` ADD CONSTRAINT `ESignatureExecution_signerId_fkey` FOREIGN KEY (`signerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ESignatureExecution` ADD CONSTRAINT `ESignatureExecution_signatureImageId_fkey` FOREIGN KEY (`signatureImageId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UnderwritingLimit` ADD CONSTRAINT `UnderwritingLimit_financierProfileId_fkey` FOREIGN KEY (`financierProfileId`) REFERENCES `FinancierProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UnderwritingLimit` ADD CONSTRAINT `UnderwritingLimit_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `FinancierBranch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UnderwritingLimit` ADD CONSTRAINT `UnderwritingLimit_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UnderwritingLimit` ADD CONSTRAINT `UnderwritingLimit_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FeeAssessment` ADD CONSTRAINT `FeeAssessment_ruleId_fkey` FOREIGN KEY (`ruleId`) REFERENCES `FeeRule`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FeeAssessment` ADD CONSTRAINT `FeeAssessment_actorOrgId_fkey` FOREIGN KEY (`actorOrgId`) REFERENCES `Organization`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FeeAssessment` ADD CONSTRAINT `FeeAssessment_reversalOfId_fkey` FOREIGN KEY (`reversalOfId`) REFERENCES `FeeAssessment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SellerSubscription` ADD CONSTRAINT `SellerSubscription_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SellerSubscription` ADD CONSTRAINT `SellerSubscription_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `SubscriptionPlan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SubscriptionInvoice` ADD CONSTRAINT `SubscriptionInvoice_subscriptionId_fkey` FOREIGN KEY (`subscriptionId`) REFERENCES `SellerSubscription`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `KycCase` ADD CONSTRAINT `KycCase_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `AccountDocument`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `KycCase` ADD CONSTRAINT `KycCase_configId_fkey` FOREIGN KEY (`configId`) REFERENCES `KycProviderConfig`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `KycCase` ADD CONSTRAINT `KycCase_decidedById_fkey` FOREIGN KEY (`decidedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `KycWebhookEvent` ADD CONSTRAINT `KycWebhookEvent_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `KycCase`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

