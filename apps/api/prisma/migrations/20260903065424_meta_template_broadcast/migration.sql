-- AlterTable
ALTER TABLE `broadcast_recipients` ADD COLUMN `templateVariables` JSON NULL;

-- AlterTable
ALTER TABLE `broadcast_templates` ADD COLUMN `metaTemplateLanguage` VARCHAR(191) NULL,
    ADD COLUMN `metaTemplateName` VARCHAR(191) NULL,
    ADD COLUMN `metaVariableCount` INTEGER NULL;
