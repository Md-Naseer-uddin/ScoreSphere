CREATE TABLE "ruleset_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"ruleset_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"engine_version" integer NOT NULL,
	"base_preset_key" varchar(60) NOT NULL,
	"config" jsonb NOT NULL,
	"rules" jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ruleset_versions_version_unique" UNIQUE("ruleset_id","version")
);
--> statement-breakpoint
CREATE TABLE "rulesets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"sport" varchar(20) NOT NULL,
	"name" varchar(80) NOT NULL,
	"latest_version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "ruleset_version_id" uuid;--> statement-breakpoint
ALTER TABLE "ruleset_versions" ADD CONSTRAINT "ruleset_versions_ruleset_id_rulesets_id_fk" FOREIGN KEY ("ruleset_id") REFERENCES "public"."rulesets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ruleset_versions" ADD CONSTRAINT "ruleset_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rulesets" ADD CONSTRAINT "rulesets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rulesets" ADD CONSTRAINT "rulesets_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rulesets_workspace_name_unique" ON "rulesets" USING btree ("workspace_id",lower("name")) WHERE "rulesets"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "rulesets_workspace_updated_idx" ON "rulesets" USING btree ("workspace_id","updated_at");--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_ruleset_version_id_ruleset_versions_id_fk" FOREIGN KEY ("ruleset_version_id") REFERENCES "public"."ruleset_versions"("id") ON DELETE set null ON UPDATE no action;