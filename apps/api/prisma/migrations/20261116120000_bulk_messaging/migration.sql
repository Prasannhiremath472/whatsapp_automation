-- Bulk WhatsApp messaging: rich contacts + tags, MessageTemplate (replaces
-- broadcast_templates), campaign scheduling/pause/stats, delivery tracking.
--
-- Hand-adjusted from `prisma migrate diff` so it is safe on a database that
-- already holds M4 broadcast data: templates are copied across, enum values
-- are widened before being narrowed, and NOT NULL columns are back-filled.

-- DropForeignKey
ALTER TABLE `broadcast_templates` DROP FOREIGN KEY `broadcast_templates_tenantId_fkey`;

-- DropForeignKey
ALTER TABLE `broadcast_campaigns` DROP FOREIGN KEY `broadcast_campaigns_templateId_fkey`;

-- DropForeignKey
ALTER TABLE `broadcast_recipients` DROP FOREIGN KEY `broadcast_recipients_campaignId_fkey`;

-- DropForeignKey
ALTER TABLE `broadcast_recipients` DROP FOREIGN KEY `broadcast_recipients_contactId_fkey`;

-- AlterTable
ALTER TABLE `tenants` ADD COLUMN `timezone` VARCHAR(191) NOT NULL DEFAULT 'Asia/Kolkata';

-- AlterTable
ALTER TABLE `whatsapp_connections` ADD COLUMN `dailyMessageLimit` INTEGER NULL;

-- AlterTable
ALTER TABLE `contacts` ADD COLUMN `assignedUserId` VARCHAR(191) NULL,
    ADD COLUMN `email` VARCHAR(191) NULL,
    ADD COLUMN `lastInteractionAt` DATETIME(3) NULL,
    ADD COLUMN `leadStatus` VARCHAR(191) NOT NULL DEFAULT 'New',
    ADD COLUMN `location` VARCHAR(191) NULL,
    ADD COLUMN `notes` TEXT NULL,
    ADD COLUMN `optedOut` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `optedOutAt` DATETIME(3) NULL,
    ADD COLUMN `source` VARCHAR(191) NOT NULL DEFAULT 'Manual';

-- CreateTable
CREATE TABLE `message_templates` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `language` VARCHAR(191) NOT NULL DEFAULT 'en',
    `headerType` ENUM('none', 'text', 'image', 'video', 'document') NOT NULL DEFAULT 'none',
    `headerText` VARCHAR(191) NULL,
    `body` TEXT NOT NULL,
    `footer` VARCHAR(191) NULL,
    `buttons` JSON NOT NULL,
    `status` ENUM('draft', 'pending', 'approved', 'rejected') NOT NULL DEFAULT 'draft',
    `metaTemplateId` VARCHAR(191) NULL,
    `rejectionReason` VARCHAR(191) NULL,
    `submittedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `message_templates_tenantId_status_idx`(`tenantId`, `status`),
    UNIQUE INDEX `message_templates_tenantId_name_language_key`(`tenantId`, `name`, `language`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Copy existing broadcast templates (ids preserved so campaigns keep pointing
-- at them). Templates that were already linked to an approved Meta template
-- stay "approved"; free-text session templates become drafts, because only an
-- approved Meta template can be used for business-initiated bulk sends.
INSERT INTO `message_templates`
    (`id`, `tenantId`, `name`, `category`, `language`, `headerType`, `body`, `buttons`, `status`, `createdAt`, `updatedAt`)
SELECT
    `id`,
    `tenantId`,
    CASE
        WHEN `metaTemplateName` IS NOT NULL THEN `metaTemplateName`
        ELSE CONCAT(LEFT(LOWER(REGEXP_REPLACE(`name`, '[^a-zA-Z0-9]+', '_')), 150), '_', LEFT(`id`, 6))
    END,
    'Marketing',
    COALESCE(`metaTemplateLanguage`, 'en'),
    'none',
    `body`,
    '[]',
    CASE WHEN `metaTemplateName` IS NOT NULL THEN 'approved' ELSE 'draft' END,
    `createdAt`,
    `updatedAt`
FROM `broadcast_templates`;

-- AlterTable: broadcast_campaigns
ALTER TABLE `broadcast_campaigns` ADD COLUMN `audience` JSON NULL,
    ADD COLUMN `completedAt` DATETIME(3) NULL,
    ADD COLUMN `deliveredCount` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `description` TEXT NULL,
    ADD COLUMN `dispatcherLockedUntil` DATETIME(3) NULL,
    ADD COLUMN `failedCount` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `headerMediaUrl` TEXT NULL,
    ADD COLUMN `materializedAt` DATETIME(3) NULL,
    ADD COLUMN `objective` VARCHAR(191) NULL,
    ADD COLUMN `readCount` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `scheduledAt` DATETIME(3) NULL,
    ADD COLUMN `sentCount` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `skippedCount` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `startedAt` DATETIME(3) NULL,
    ADD COLUMN `statusReason` VARCHAR(191) NULL,
    ADD COLUMN `totalRecipients` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `variableMapping` JSON NULL;

-- Widen the status enum first so legacy 'sending' rows can be converted.
ALTER TABLE `broadcast_campaigns`
    MODIFY `status` ENUM('draft', 'sending', 'scheduled', 'running', 'paused', 'completed', 'failed', 'cancelled') NOT NULL DEFAULT 'draft';
UPDATE `broadcast_campaigns` SET `status` = 'running' WHERE `status` = 'sending';
ALTER TABLE `broadcast_campaigns`
    MODIFY `status` ENUM('draft', 'scheduled', 'running', 'paused', 'completed', 'failed', 'cancelled') NOT NULL DEFAULT 'draft';

-- Back-fill: legacy campaigns targeted explicit contacts, which are now the
-- recipient rows themselves.
UPDATE `broadcast_campaigns`
SET `audience` = '{"mode":"contacts","tags":[],"contactIds":[]}',
    `variableMapping` = '{}';
ALTER TABLE `broadcast_campaigns`
    MODIFY `audience` JSON NOT NULL,
    MODIFY `variableMapping` JSON NOT NULL;

-- AlterTable: broadcast_recipients (updatedAt added with a temporary default
-- so existing rows are valid; Prisma maintains it from the client afterwards).
ALTER TABLE `broadcast_recipients` DROP COLUMN `templateVariables`,
    ADD COLUMN `attempts` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `deliveredAt` DATETIME(3) NULL,
    ADD COLUMN `errorCode` VARCHAR(191) NULL,
    ADD COLUMN `readAt` DATETIME(3) NULL,
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `waMessageId` VARCHAR(191) NULL,
    MODIFY `status` ENUM('pending', 'sending', 'sent', 'delivered', 'read', 'failed', 'skipped') NOT NULL DEFAULT 'pending';
ALTER TABLE `broadcast_recipients` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- Back-fill campaign counters from existing recipient rows.
UPDATE `broadcast_campaigns` c SET
    c.`totalRecipients` = (SELECT COUNT(*) FROM `broadcast_recipients` r WHERE r.`campaignId` = c.`id`),
    c.`sentCount`       = (SELECT COUNT(*) FROM `broadcast_recipients` r WHERE r.`campaignId` = c.`id` AND r.`status` = 'sent'),
    c.`failedCount`     = (SELECT COUNT(*) FROM `broadcast_recipients` r WHERE r.`campaignId` = c.`id` AND r.`status` = 'failed');

-- Legacy campaigns already have their recipient rows.
UPDATE `broadcast_campaigns` SET `materializedAt` = `createdAt`;

-- DropTable
DROP TABLE `broadcast_templates`;

-- CreateTable
CREATE TABLE `tags` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `tags_tenantId_name_key`(`tenantId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contact_tags` (
    `contactId` VARCHAR(191) NOT NULL,
    `tagId` VARCHAR(191) NOT NULL,

    INDEX `contact_tags_tagId_idx`(`tagId`),
    PRIMARY KEY (`contactId`, `tagId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `contacts_tenantId_optedOut_idx` ON `contacts`(`tenantId`, `optedOut`);

-- CreateIndex
CREATE INDEX `contacts_tenantId_createdAt_idx` ON `contacts`(`tenantId`, `createdAt`);

-- CreateIndex
CREATE INDEX `broadcast_campaigns_status_scheduledAt_idx` ON `broadcast_campaigns`(`status`, `scheduledAt`);

-- CreateIndex
CREATE INDEX `broadcast_campaigns_tenantId_createdAt_idx` ON `broadcast_campaigns`(`tenantId`, `createdAt`);

-- CreateIndex
CREATE UNIQUE INDEX `broadcast_recipients_waMessageId_key` ON `broadcast_recipients`(`waMessageId`);

-- CreateIndex
CREATE INDEX `broadcast_recipients_status_updatedAt_idx` ON `broadcast_recipients`(`status`, `updatedAt`);

-- AddForeignKey
ALTER TABLE `contacts` ADD CONSTRAINT `contacts_assignedUserId_fkey` FOREIGN KEY (`assignedUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tags` ADD CONSTRAINT `tags_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contact_tags` ADD CONSTRAINT `contact_tags_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contact_tags` ADD CONSTRAINT `contact_tags_tagId_fkey` FOREIGN KEY (`tagId`) REFERENCES `tags`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `message_templates` ADD CONSTRAINT `message_templates_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `broadcast_campaigns` ADD CONSTRAINT `broadcast_campaigns_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `message_templates`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `broadcast_recipients` ADD CONSTRAINT `broadcast_recipients_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `broadcast_campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `broadcast_recipients` ADD CONSTRAINT `broadcast_recipients_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
