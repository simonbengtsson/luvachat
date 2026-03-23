CREATE VIRTUAL TABLE `message_search` USING fts5(
	`message_id` UNINDEXED,
	`conversation_id` UNINDEXED,
	`thread_root_message_id` UNINDEXED,
	`user_id` UNINDEXED,
	`created_at` UNINDEXED,
	`content`
);--> statement-breakpoint
INSERT INTO `message_search` (
	`message_id`,
	`conversation_id`,
	`thread_root_message_id`,
	`user_id`,
	`created_at`,
	`content`
)
SELECT
	`id`,
	`conversation_id`,
	`thread_root_message_id`,
	`user_id`,
	`created_at`,
	`content`
FROM `messages`
WHERE `content` <> '';--> statement-breakpoint
CREATE TRIGGER `messages_search_after_insert`
AFTER INSERT ON `messages`
WHEN new.`content` <> ''
BEGIN
	INSERT INTO `message_search` (
		`message_id`,
		`conversation_id`,
		`thread_root_message_id`,
		`user_id`,
		`created_at`,
		`content`
	) VALUES (
		new.`id`,
		new.`conversation_id`,
		new.`thread_root_message_id`,
		new.`user_id`,
		new.`created_at`,
		new.`content`
	);
END;--> statement-breakpoint
CREATE TRIGGER `messages_search_after_delete`
AFTER DELETE ON `messages`
BEGIN
	DELETE FROM `message_search`
	WHERE `message_id` = old.`id`;
END;--> statement-breakpoint
CREATE TRIGGER `messages_search_after_update`
AFTER UPDATE ON `messages`
BEGIN
	DELETE FROM `message_search`
	WHERE `message_id` = old.`id`;
	INSERT INTO `message_search` (
		`message_id`,
		`conversation_id`,
		`thread_root_message_id`,
		`user_id`,
		`created_at`,
		`content`
	)
	SELECT
		new.`id`,
		new.`conversation_id`,
		new.`thread_root_message_id`,
		new.`user_id`,
		new.`created_at`,
		new.`content`
	WHERE new.`content` <> '';
END;
