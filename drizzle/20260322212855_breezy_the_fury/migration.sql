ALTER TABLE `thread_memberships` RENAME TO `thread_members`;--> statement-breakpoint
DROP INDEX IF EXISTS `thread_memberships_conversation_user_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `thread_memberships_thread_root_user_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `thread_memberships_user_thread_root_idx`;--> statement-breakpoint
CREATE INDEX `thread_members_conversation_user_idx` ON `thread_members` (`conversation_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `thread_members_thread_root_user_idx` ON `thread_members` (`thread_root_message_id`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `thread_members_user_thread_root_idx` ON `thread_members` (`user_id`,`thread_root_message_id`);