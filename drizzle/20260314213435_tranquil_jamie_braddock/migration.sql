ALTER TABLE `messages` RENAME COLUMN `author_id` TO `user_id`;--> statement-breakpoint
CREATE TABLE `__new_message_attachments` (
	`id` text PRIMARY KEY,
	`message_id` text NOT NULL,
	`user_id` text NOT NULL,
	`storage_key` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT `fk_message_attachments_message_id_messages_id_fk` FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON DELETE CASCADE
);--> statement-breakpoint
INSERT INTO `__new_message_attachments` (
	`id`,
	`message_id`,
	`user_id`,
	`storage_key`,
	`file_name`,
	`content_type`,
	`size_bytes`,
	`created_at`
)
SELECT
	`message_attachments`.`id`,
	`message_attachments`.`message_id`,
	`messages`.`user_id`,
	`message_attachments`.`storage_key`,
	`message_attachments`.`file_name`,
	`message_attachments`.`content_type`,
	`message_attachments`.`size_bytes`,
	`message_attachments`.`created_at`
FROM `message_attachments`
INNER JOIN `messages`
	ON `messages`.`id` = `message_attachments`.`message_id`;--> statement-breakpoint
DROP TABLE `message_attachments`;--> statement-breakpoint
ALTER TABLE `__new_message_attachments` RENAME TO `message_attachments`;
