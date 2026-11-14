CREATE TABLE "tournament_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tournament_id" uuid NOT NULL,
	"team_id" uuid,
	"roster_member_id" uuid,
	"display_name" varchar(120) NOT NULL,
	"seed" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tournament_entries_one_kind" CHECK (("tournament_entries"."team_id" is null) <> ("tournament_entries"."roster_member_id" is null))
);
--> statement-breakpoint
CREATE TABLE "tournament_fixtures" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tournament_id" uuid NOT NULL,
	"round" integer NOT NULL,
	"position" integer NOT NULL,
	"side1_entry_id" uuid,
	"side2_entry_id" uuid,
	"bye" boolean DEFAULT false NOT NULL,
	"match_id" uuid,
	"winner_entry_id" uuid,
	"next_round" integer,
	"next_position" integer,
	"next_slot" smallint,
	"needs_decision" boolean DEFAULT false NOT NULL,
	"decided_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tournament_fixtures_match_id_unique" UNIQUE("match_id")
);
--> statement-breakpoint
CREATE TABLE "tournaments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"sport" varchar(20) NOT NULL,
	"format" varchar(20) NOT NULL,
	"engine_version" integer NOT NULL,
	"preset_key" varchar(60) NOT NULL,
	"preset_version" integer NOT NULL,
	"config" jsonb NOT NULL,
	"points" jsonb NOT NULL,
	"tie_breaks" jsonb NOT NULL,
	"status" varchar(12) DEFAULT 'draft' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tournaments_format_check" CHECK ("tournaments"."format" in ('round_robin', 'single_elimination')),
	CONSTRAINT "tournaments_status_check" CHECK ("tournaments"."status" in ('draft', 'active', 'completed'))
);
--> statement-breakpoint
ALTER TABLE "award_records" ALTER COLUMN "match_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "award_records" ADD COLUMN "tournament_id" uuid;--> statement-breakpoint
ALTER TABLE "tournament_entries" ADD CONSTRAINT "tournament_entries_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_entries" ADD CONSTRAINT "tournament_entries_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_entries" ADD CONSTRAINT "tournament_entries_roster_member_id_roster_members_id_fk" FOREIGN KEY ("roster_member_id") REFERENCES "public"."roster_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_fixtures" ADD CONSTRAINT "tournament_fixtures_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_fixtures" ADD CONSTRAINT "tournament_fixtures_side1_entry_id_tournament_entries_id_fk" FOREIGN KEY ("side1_entry_id") REFERENCES "public"."tournament_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_fixtures" ADD CONSTRAINT "tournament_fixtures_side2_entry_id_tournament_entries_id_fk" FOREIGN KEY ("side2_entry_id") REFERENCES "public"."tournament_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_fixtures" ADD CONSTRAINT "tournament_fixtures_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_fixtures" ADD CONSTRAINT "tournament_fixtures_winner_entry_id_tournament_entries_id_fk" FOREIGN KEY ("winner_entry_id") REFERENCES "public"."tournament_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_fixtures" ADD CONSTRAINT "tournament_fixtures_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_entries_team_unique" ON "tournament_entries" USING btree ("tournament_id","team_id") WHERE "tournament_entries"."team_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_entries_member_unique" ON "tournament_entries" USING btree ("tournament_id","roster_member_id") WHERE "tournament_entries"."roster_member_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_fixtures_slot_unique" ON "tournament_fixtures" USING btree ("tournament_id","round","position");--> statement-breakpoint
CREATE INDEX "tournament_fixtures_tournament_idx" ON "tournament_fixtures" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "tournaments_workspace_idx" ON "tournaments" USING btree ("workspace_id","updated_at");--> statement-breakpoint
ALTER TABLE "award_records" ADD CONSTRAINT "award_records_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "award_records_tournament_idx" ON "award_records" USING btree ("tournament_id");--> statement-breakpoint
CREATE UNIQUE INDEX "award_records_tournament_published_unique" ON "award_records" USING btree ("tournament_id","award_key") WHERE "award_records"."status" in ('PUBLISHED', 'STALE') and "award_records"."tournament_id" is not null;--> statement-breakpoint
ALTER TABLE "award_records" ADD CONSTRAINT "award_records_one_scope" CHECK (("award_records"."match_id" is null) <> ("award_records"."tournament_id" is null));