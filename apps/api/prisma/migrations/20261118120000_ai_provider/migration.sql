-- AI agents can use OpenAI as well as Anthropic. Purely additive (one column, default keeps existing keys on Anthropic).

-- AlterTable
ALTER TABLE `ai_settings` ADD COLUMN `provider` VARCHAR(20) NOT NULL DEFAULT 'anthropic';

