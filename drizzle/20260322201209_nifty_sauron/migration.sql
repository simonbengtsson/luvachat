CREATE TABLE `activity_events` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`message_id` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT `fk_activity_events_conversation_id_conversations_id_fk` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`),
	CONSTRAINT `fk_activity_events_message_id_messages_id_fk` FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `message_reactions` (
	`id` text PRIMARY KEY,
	`message_id` text NOT NULL,
	`user_id` text NOT NULL,
	`emoji` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT `fk_message_reactions_message_id_messages_id_fk` FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `activity_events_user_created_at_idx` ON `activity_events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `activity_events_message_id_idx` ON `activity_events` (`message_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `activity_events_user_source_idx` ON `activity_events` (`user_id`,`source_type`,`source_id`);--> statement-breakpoint
CREATE INDEX `conversation_members_conversation_user_idx` ON `conversation_members` (`conversation_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `conversation_members_user_conversation_idx` ON `conversation_members` (`user_id`,`conversation_id`);--> statement-breakpoint
CREATE INDEX `conversation_user_state_conversation_user_idx` ON `conversation_user_state` (`conversation_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `message_attachments_message_created_at_idx` ON `message_attachments` (`message_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `message_mentions_message_created_at_idx` ON `message_mentions` (`message_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `message_mentions_user_created_at_idx` ON `message_mentions` (`mentioned_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `message_reactions_message_id_idx` ON `message_reactions` (`message_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `message_reactions_message_user_emoji_idx` ON `message_reactions` (`message_id`,`user_id`,`emoji`);--> statement-breakpoint
CREATE INDEX `messages_conversation_parent_created_at_idx` ON `messages` (`conversation_id`,`parent_message_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `messages_parent_created_at_idx` ON `messages` (`parent_message_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `push_subscriptions_user_idx` ON `push_subscriptions` (`user_id`);