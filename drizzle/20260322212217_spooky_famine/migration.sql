CREATE TABLE `thread_memberships` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`thread_root_message_id` text NOT NULL,
	`joined_at` text NOT NULL,
	`last_viewed_at` text,
	CONSTRAINT `fk_thread_memberships_conversation_id_conversations_id_fk` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`),
	CONSTRAINT `fk_thread_memberships_thread_root_message_id_messages_id_fk` FOREIGN KEY (`thread_root_message_id`) REFERENCES `messages`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE `messages` RENAME COLUMN `parent_message_id` TO `thread_root_message_id`;--> statement-breakpoint
ALTER TABLE `conversation_members` ADD `last_viewed_at` text;--> statement-breakpoint
DROP INDEX IF EXISTS `messages_conversation_parent_created_at_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `messages_parent_created_at_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `conversation_user_state_conversation_user_idx`;--> statement-breakpoint
CREATE INDEX `messages_conversation_thread_root_created_at_idx` ON `messages` (`conversation_id`,`thread_root_message_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `messages_thread_root_created_at_idx` ON `messages` (`thread_root_message_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `thread_memberships_conversation_user_idx` ON `thread_memberships` (`conversation_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `thread_memberships_thread_root_user_idx` ON `thread_memberships` (`thread_root_message_id`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `thread_memberships_user_thread_root_idx` ON `thread_memberships` (`user_id`,`thread_root_message_id`);--> statement-breakpoint
DROP TABLE `conversation_user_state`;