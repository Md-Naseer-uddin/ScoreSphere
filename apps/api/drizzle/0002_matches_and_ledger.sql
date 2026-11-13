CREATE TABLE "match_event_rejections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"match_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"kind" varchar(12) NOT NULL,
	"payload" jsonb NOT NULL,
	"target_seq" integer,
	"lease_epoch" integer NOT NULL,
	"engine_version" integer NOT NULL,
	"device_id" varchar(64) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid,
	"outcome" varchar(20) NOT NULL,
	"code" varchar(40) NOT NULL,
	CONSTRAINT "match_event_rejections_event_unique" UNIQUE("match_id","event_id")
);
--> statement-breakpoint
CREATE TABLE "match_events" (
	"match_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"kind" varchar(12) NOT NULL,
	"payload" jsonb NOT NULL,
	"target_seq" integer,
	"lease_epoch" integer NOT NULL,
	"engine_version" integer NOT NULL,
	"device_id" varchar(64) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid,
	"flagged" boolean DEFAULT false NOT NULL,
	CONSTRAINT "match_events_match_id_seq_pk" PRIMARY KEY("match_id","seq"),
	CONSTRAINT "match_events_event_unique" UNIQUE("match_id","event_id")
);
--> statement-breakpoint
CREATE TABLE "match_share_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"match_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "match_share_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "match_side_participants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"match_id" uuid NOT NULL,
	"side" smallint NOT NULL,
	"position" smallint NOT NULL,
	"display_name" varchar(60) NOT NULL,
	"roster_member_id" uuid
);
--> statement-breakpoint
CREATE TABLE "match_sides" (
	"match_id" uuid NOT NULL,
	"side" smallint NOT NULL,
	"name" varchar(60) NOT NULL,
	"team_id" uuid,
	CONSTRAINT "match_sides_match_id_side_pk" PRIMARY KEY("match_id","side"),
	CONSTRAINT "match_sides_side_check" CHECK ("match_sides"."side" in (0, 1))
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"sport" varchar(20) NOT NULL,
	"engine_version" integer NOT NULL,
	"preset_key" varchar(60) NOT NULL,
	"preset_version" integer NOT NULL,
	"title" varchar(80),
	"resolved_config" jsonb NOT NULL,
	"current_state" jsonb,
	"status" varchar(12) DEFAULT 'scheduled' NOT NULL,
	"result" jsonb,
	"version" integer DEFAULT 0 NOT NULL,
	"lease_epoch" integer DEFAULT 1 NOT NULL,
	"lease_device_id" varchar(64),
	"lease_user_id" uuid,
	"scorer_seen_at" timestamp with time zone,
	"needs_review" boolean DEFAULT false NOT NULL,
	"created_by_user_id" uuid,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matches_status_check" CHECK ("matches"."status" in ('scheduled', 'live', 'paused', 'completed', 'abandoned'))
);
--> statement-breakpoint
ALTER TABLE "match_event_rejections" ADD CONSTRAINT "match_event_rejections_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_event_rejections" ADD CONSTRAINT "match_event_rejections_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_share_links" ADD CONSTRAINT "match_share_links_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_share_links" ADD CONSTRAINT "match_share_links_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_side_participants" ADD CONSTRAINT "match_side_participants_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_side_participants" ADD CONSTRAINT "match_side_participants_roster_member_id_roster_members_id_fk" FOREIGN KEY ("roster_member_id") REFERENCES "public"."roster_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_sides" ADD CONSTRAINT "match_sides_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_sides" ADD CONSTRAINT "match_sides_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_lease_user_id_users_id_fk" FOREIGN KEY ("lease_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_share_links_match_idx" ON "match_share_links" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "match_side_participants_match_idx" ON "match_side_participants" USING btree ("match_id","side","position");--> statement-breakpoint
CREATE INDEX "matches_workspace_updated_idx" ON "matches" USING btree ("workspace_id","updated_at");