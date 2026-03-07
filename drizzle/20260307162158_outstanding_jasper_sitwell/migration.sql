CREATE TABLE `channels` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL UNIQUE,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY,
	`channel_id` text NOT NULL,
	`content` text NOT NULL,
	`date` text NOT NULL,
	CONSTRAINT `fk_messages_channel_id_channels_id_fk` FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`)
);
