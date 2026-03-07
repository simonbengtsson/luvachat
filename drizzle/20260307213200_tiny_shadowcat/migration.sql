CREATE TABLE `conversations` (
	`id` text PRIMARY KEY,
	`type` text DEFAULT 'channel' NOT NULL,
	`name` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY,
	`channel_id` text NOT NULL,
	`content` text NOT NULL,
	`date` text NOT NULL,
	CONSTRAINT `fk_messages_channel_id_conversations_id_fk` FOREIGN KEY (`channel_id`) REFERENCES `conversations`(`id`)
);
