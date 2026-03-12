CREATE TABLE `conversation_user_state` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`last_viewed_at` text NOT NULL,
	CONSTRAINT `fk_conversation_user_state_conversation_id_conversations_id_fk` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`)
);
