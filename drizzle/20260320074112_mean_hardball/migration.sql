CREATE TABLE `message_mentions` (
	`id` text PRIMARY KEY,
	`message_id` text NOT NULL,
	`type` text NOT NULL,
	`mentioned_user_id` text,
	`created_at` text NOT NULL,
	CONSTRAINT `fk_message_mentions_message_id_messages_id_fk` FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON DELETE CASCADE
);
