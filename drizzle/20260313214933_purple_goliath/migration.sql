CREATE TABLE `push_subscriptions` (
	`endpoint` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
