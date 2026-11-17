-- Data-only: start the 24-hour reply window of existing conversations from the
-- customer's last inbound message (new messages maintain it from now on).
UPDATE `conversations` c
SET c.`windowExpiresAt` = (
  SELECT DATE_ADD(MAX(m.`createdAt`), INTERVAL 24 HOUR)
  FROM `messages` m
  WHERE m.`conversationId` = c.`id` AND m.`direction` = 'inbound'
)
WHERE c.`windowExpiresAt` IS NULL;
