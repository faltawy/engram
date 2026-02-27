CREATE TABLE `access_log` (
	`id` text PRIMARY KEY NOT NULL,
	`memory_id` text NOT NULL,
	`accessed_at` integer NOT NULL,
	`access_type` text NOT NULL,
	FOREIGN KEY (`memory_id`) REFERENCES `memories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_access_log_memory_id` ON `access_log` (`memory_id`);--> statement-breakpoint
CREATE INDEX `idx_access_log_accessed_at` ON `access_log` (`accessed_at`);--> statement-breakpoint
CREATE TABLE `associations` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`target_id` text NOT NULL,
	`strength` real DEFAULT 0.5 NOT NULL,
	`formed_at` integer NOT NULL,
	`type` text NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `memories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_id`) REFERENCES `memories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_associations_source` ON `associations` (`source_id`);--> statement-breakpoint
CREATE INDEX `idx_associations_target` ON `associations` (`target_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `unique_source_target` ON `associations` (`source_id`,`target_id`);--> statement-breakpoint
CREATE TABLE `consolidation_log` (
	`id` text PRIMARY KEY NOT NULL,
	`ran_at` integer NOT NULL,
	`memories_strengthened` integer DEFAULT 0 NOT NULL,
	`memories_pruned` integer DEFAULT 0 NOT NULL,
	`facts_extracted` integer DEFAULT 0 NOT NULL,
	`associations_discovered` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `memories` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`content` text NOT NULL,
	`encoded_at` integer NOT NULL,
	`last_recalled_at` integer,
	`recall_count` integer DEFAULT 0 NOT NULL,
	`activation` real DEFAULT 0 NOT NULL,
	`emotion` text DEFAULT 'neutral' NOT NULL,
	`emotion_weight` real DEFAULT 0 NOT NULL,
	`context` text,
	`chunk_id` text,
	`reconsolidation_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_memories_type` ON `memories` (`type`);--> statement-breakpoint
CREATE INDEX `idx_memories_activation` ON `memories` (`activation`);--> statement-breakpoint
CREATE INDEX `idx_memories_encoded_at` ON `memories` (`encoded_at`);--> statement-breakpoint
CREATE INDEX `idx_memories_context` ON `memories` (`context`);--> statement-breakpoint
CREATE INDEX `idx_memories_chunk_id` ON `memories` (`chunk_id`);--> statement-breakpoint
CREATE TABLE `working_memory` (
	`slot` integer PRIMARY KEY NOT NULL,
	`memory_ref` text,
	`content` text NOT NULL,
	`pushed_at` integer NOT NULL
);
