-- Webhook inbox: Meta webhook payloads are stored here before processing so the
-- API no longer needs Redis. Purely additive.

-- CreateTable
CREATE TABLE `webhook_events` (
    `id` VARCHAR(191) NOT NULL,
    `payload` JSON NOT NULL,
    `status` ENUM('pending', 'processing', 'failed') NOT NULL DEFAULT 'pending',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `runAfter` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lockedUntil` DATETIME(3) NULL,
    `lastError` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `webhook_events_status_runAfter_idx`(`status`, `runAfter`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
