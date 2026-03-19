CREATE TABLE `conversation_members` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`joined_at` text NOT NULL,
	CONSTRAINT `fk_conversation_members_conversation_id_conversations_id_fk` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`)
);
