CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`platform` text NOT NULL,
	`platform_uid` text NOT NULL,
	`nickname` text NOT NULL,
	`avatar` text,
	`access_token` text NOT NULL,
	`refresh_token` text,
	`token_expires_at` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`group_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_account_user_platform_uid` ON `accounts` (`user_id`,`platform`,`platform_uid`);--> statement-breakpoint
CREATE INDEX `idx_account_user_platform` ON `accounts` (`user_id`,`platform`);--> statement-breakpoint
CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`key_hash` text NOT NULL,
	`last_used_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_key_hash_unique` ON `api_keys` (`key_hash`);--> statement-breakpoint
CREATE TABLE `credit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`amount` integer NOT NULL,
	`balance_before` integer NOT NULL,
	`balance_after` integer NOT NULL,
	`description` text,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_cl_user_created` ON `credit_logs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `publish_records` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`platform` text NOT NULL,
	`flow_id` text,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`topics` text,
	`video_url` text,
	`cover_url` text,
	`image_urls` text,
	`publish_time` integer,
	`status` text DEFAULT 'waiting' NOT NULL,
	`queue_message_id` text,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`max_retries` integer DEFAULT 3 NOT NULL,
	`error_message` text,
	`work_url` text,
	`platform_work_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_pr_status_time` ON `publish_records` (`status`,`publish_time`);--> statement-breakpoint
CREATE INDEX `idx_pr_user_created` ON `publish_records` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_pr_flow_id` ON `publish_records` (`flow_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`salt` text NOT NULL,
	`name` text,
	`avatar` text,
	`status` text DEFAULT 'active' NOT NULL,
	`credits` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);