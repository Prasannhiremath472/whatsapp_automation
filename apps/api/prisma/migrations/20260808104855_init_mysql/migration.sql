-- CreateTable
CREATE TABLE `tenants` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `business_category` VARCHAR(191) NULL,
    `status` ENUM('active', 'suspended', 'pending_onboarding') NOT NULL DEFAULT 'pending_onboarding',
    `commerceBotEnabled` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tenants_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `role` ENUM('super_admin', 'tenant_admin', 'agent') NOT NULL DEFAULT 'agent',
    `displayName` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `users_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `users_tenantId_email_key`(`tenantId`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `refresh_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `refresh_tokens_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `whatsapp_connections` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `wabaId` VARCHAR(191) NULL,
    `phoneNumberId` VARCHAR(191) NOT NULL,
    `displayPhoneNumber` VARCHAR(191) NULL,
    `accessTokenEncrypted` VARCHAR(191) NULL,
    `tokenExpiresAt` DATETIME(3) NULL,
    `connectionStatus` ENUM('connected', 'disconnected', 'pending') NOT NULL DEFAULT 'pending',
    `isMock` BOOLEAN NOT NULL DEFAULT true,
    `webhookVerifyToken` VARCHAR(191) NULL,
    `connectedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `whatsapp_connections_tenantId_key`(`tenantId`),
    UNIQUE INDEX `whatsapp_connections_phoneNumberId_key`(`phoneNumberId`),
    INDEX `whatsapp_connections_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contacts` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `waId` VARCHAR(191) NOT NULL,
    `displayName` VARCHAR(191) NULL,
    `profileName` VARCHAR(191) NULL,
    `metadata` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `contacts_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `contacts_tenantId_waId_key`(`tenantId`, `waId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `conversations` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `contactId` VARCHAR(191) NOT NULL,
    `whatsappConnectionId` VARCHAR(191) NOT NULL,
    `status` ENUM('open', 'pending', 'closed') NOT NULL DEFAULT 'open',
    `assignedAgentId` VARCHAR(191) NULL,
    `lastMessageAt` DATETIME(3) NULL,
    `unreadCount` INTEGER NOT NULL DEFAULT 0,
    `windowExpiresAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `conversations_tenantId_status_idx`(`tenantId`, `status`),
    INDEX `conversations_tenantId_lastMessageAt_idx`(`tenantId`, `lastMessageAt`),
    INDEX `conversations_contactId_idx`(`contactId`),
    INDEX `conversations_whatsappConnectionId_idx`(`whatsappConnectionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `messages` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `direction` ENUM('inbound', 'outbound') NOT NULL,
    `senderType` ENUM('customer', 'agent', 'bot', 'system') NOT NULL,
    `senderUserId` VARCHAR(191) NULL,
    `waMessageId` VARCHAR(191) NULL,
    `messageType` ENUM('text', 'image', 'document', 'audio', 'video', 'interactive_button', 'interactive_list', 'template') NOT NULL,
    `content` JSON NOT NULL,
    `status` ENUM('queued', 'sent', 'delivered', 'read', 'failed') NOT NULL DEFAULT 'queued',
    `errorDetail` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `messages_waMessageId_key`(`waMessageId`),
    INDEX `messages_tenantId_conversationId_createdAt_idx`(`tenantId`, `conversationId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `broadcast_templates` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `body` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `broadcast_templates_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `broadcast_templates_tenantId_name_key`(`tenantId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `broadcast_campaigns` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `status` ENUM('draft', 'sending', 'completed', 'failed') NOT NULL DEFAULT 'draft',
    `createdByUserId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `broadcast_campaigns_tenantId_status_idx`(`tenantId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `broadcast_recipients` (
    `id` VARCHAR(191) NOT NULL,
    `campaignId` VARCHAR(191) NOT NULL,
    `contactId` VARCHAR(191) NOT NULL,
    `status` ENUM('pending', 'sent', 'failed') NOT NULL DEFAULT 'pending',
    `messageId` VARCHAR(191) NULL,
    `errorDetail` JSON NULL,
    `sentAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `broadcast_recipients_campaignId_status_idx`(`campaignId`, `status`),
    UNIQUE INDEX `broadcast_recipients_campaignId_contactId_key`(`campaignId`, `contactId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bot_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `contactId` VARCHAR(191) NOT NULL,
    `currentStep` ENUM('START', 'MAIN_MENU', 'BROWSE_CATEGORY', 'BROWSE_MACHINE_LIST', 'MACHINE_DETAIL', 'AWAITING_QUANTITY', 'CONFIG_SELECTION', 'AWAITING_ADDRESS_CHOICE', 'COLLECTING_ADDRESS_NAME', 'COLLECTING_ADDRESS_COMPANY', 'COLLECTING_ADDRESS_MOBILE', 'COLLECTING_ADDRESS_EMAIL', 'COLLECTING_ADDRESS_GST', 'COLLECTING_ADDRESS_LINE', 'COLLECTING_ADDRESS_CITY', 'COLLECTING_ADDRESS_STATE', 'COLLECTING_ADDRESS_PIN', 'ORDER_SUMMARY', 'COMPLETED', 'HANDED_OFF') NOT NULL DEFAULT 'START',
    `contextData` JSON NOT NULL,
    `draftOrderId` VARCHAR(191) NULL,
    `lastInteractionAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `bot_sessions_conversationId_key`(`conversationId`),
    UNIQUE INDEX `bot_sessions_draftOrderId_key`(`draftOrderId`),
    INDEX `bot_sessions_tenantId_idx`(`tenantId`),
    INDEX `bot_sessions_tenantId_currentStep_idx`(`tenantId`, `currentStep`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `machine_categories` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `machine_categories_tenantId_isActive_sortOrder_idx`(`tenantId`, `isActive`, `sortOrder`),
    UNIQUE INDEX `machine_categories_tenantId_name_key`(`tenantId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `machines` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `model` VARCHAR(191) NOT NULL,
    `basePrice` DECIMAL(12, 2) NOT NULL,
    `availability` ENUM('in_stock', 'made_to_order', 'out_of_stock') NOT NULL DEFAULT 'in_stock',
    `specs` JSON NOT NULL,
    `imageMediaId` VARCHAR(191) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `machines_tenantId_categoryId_isActive_sortOrder_idx`(`tenantId`, `categoryId`, `isActive`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `machine_config_groups` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `machineId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `isRequired` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `machine_config_groups_tenantId_machineId_sortOrder_idx`(`tenantId`, `machineId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `machine_config_options` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `groupId` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `priceDelta` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `machine_config_options_tenantId_groupId_sortOrder_idx`(`tenantId`, `groupId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `orders` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `contactId` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `machineId` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `selectedConfig` JSON NOT NULL,
    `unitPrice` DECIMAL(12, 2) NOT NULL,
    `subtotal` DECIMAL(12, 2) NOT NULL,
    `gstAmount` DECIMAL(12, 2) NOT NULL,
    `totalAmount` DECIMAL(12, 2) NOT NULL,
    `deliveryAddress` JSON NOT NULL,
    `status` ENUM('DRAFT', 'CONFIRMED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `confirmedAt` DATETIME(3) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `orders_tenantId_status_idx`(`tenantId`, `status`),
    INDEX `orders_tenantId_contactId_idx`(`tenantId`, `contactId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `refresh_tokens_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `whatsapp_connections` ADD CONSTRAINT `whatsapp_connections_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contacts` ADD CONSTRAINT `contacts_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_whatsappConnectionId_fkey` FOREIGN KEY (`whatsappConnectionId`) REFERENCES `whatsapp_connections`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_assignedAgentId_fkey` FOREIGN KEY (`assignedAgentId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `messages` ADD CONSTRAINT `messages_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `messages` ADD CONSTRAINT `messages_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `conversations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `messages` ADD CONSTRAINT `messages_senderUserId_fkey` FOREIGN KEY (`senderUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `broadcast_templates` ADD CONSTRAINT `broadcast_templates_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `broadcast_campaigns` ADD CONSTRAINT `broadcast_campaigns_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `broadcast_campaigns` ADD CONSTRAINT `broadcast_campaigns_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `broadcast_templates`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `broadcast_campaigns` ADD CONSTRAINT `broadcast_campaigns_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `broadcast_recipients` ADD CONSTRAINT `broadcast_recipients_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `broadcast_campaigns`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `broadcast_recipients` ADD CONSTRAINT `broadcast_recipients_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bot_sessions` ADD CONSTRAINT `bot_sessions_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bot_sessions` ADD CONSTRAINT `bot_sessions_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `conversations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bot_sessions` ADD CONSTRAINT `bot_sessions_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bot_sessions` ADD CONSTRAINT `bot_sessions_draftOrderId_fkey` FOREIGN KEY (`draftOrderId`) REFERENCES `orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `machine_categories` ADD CONSTRAINT `machine_categories_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `machines` ADD CONSTRAINT `machines_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `machines` ADD CONSTRAINT `machines_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `machine_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `machine_config_groups` ADD CONSTRAINT `machine_config_groups_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `machine_config_groups` ADD CONSTRAINT `machine_config_groups_machineId_fkey` FOREIGN KEY (`machineId`) REFERENCES `machines`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `machine_config_options` ADD CONSTRAINT `machine_config_options_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `machine_config_options` ADD CONSTRAINT `machine_config_options_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `machine_config_groups`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `conversations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_machineId_fkey` FOREIGN KEY (`machineId`) REFERENCES `machines`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
