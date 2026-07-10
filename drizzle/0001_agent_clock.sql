CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`start_clock` integer NOT NULL,
	`end_clock` integer,
	`context` text
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_started_at` ON `sessions` (`started_at`);--> statement-breakpoint
ALTER TABLE `access_log` ADD `clock` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_access_log_clock` ON `access_log` (`clock`);--> statement-breakpoint
UPDATE `access_log` SET `clock` = (
	SELECT COUNT(*) FROM `access_log` AS a2
	WHERE a2.`accessed_at` < `access_log`.`accessed_at`
		OR (a2.`accessed_at` = `access_log`.`accessed_at` AND a2.`id` <= `access_log`.`id`)
);