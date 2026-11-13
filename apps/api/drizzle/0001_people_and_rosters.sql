CREATE TYPE "public"."person_status" AS ENUM('PENDING_CLAIM', 'CLAIMED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."roster_link_status" AS ENUM('NONE', 'LINKED', 'PENDING_CONSENT', 'PENDING_CLAIM', 'AWAITING_APPROVAL');--> statement-breakpoint
CREATE TYPE "public"."roster_member_status" AS ENUM('ACTIVE', 'ARCHIVED');--> statement-breakpoint
CREATE TABLE "persons" (
	"id" uuid PRIMARY KEY NOT NULL,
	"phone_identity_id" uuid,
	"user_id" uuid,
	"status" "person_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "persons_phone_identity_id_unique" UNIQUE("phone_identity_id"),
	CONSTRAINT "persons_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "roster_members" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"person_id" uuid,
	"link_status" "roster_link_status" DEFAULT 'NONE' NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"jersey_number" varchar(4),
	"status" "roster_member_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roster_members_link_matches_person" CHECK (("roster_members"."link_status" = 'NONE') = ("roster_members"."person_id" is null))
);
--> statement-breakpoint
CREATE TABLE "team_memberships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"team_id" uuid NOT NULL,
	"roster_member_id" uuid NOT NULL,
	"jersey_number" varchar(4),
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"short_name" varchar(12),
	"sport_keys" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "persons" ADD CONSTRAINT "persons_phone_identity_id_phone_identities_id_fk" FOREIGN KEY ("phone_identity_id") REFERENCES "public"."phone_identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persons" ADD CONSTRAINT "persons_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_members" ADD CONSTRAINT "roster_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_members" ADD CONSTRAINT "roster_members_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_members" ADD CONSTRAINT "roster_members_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_roster_member_id_roster_members_id_fk" FOREIGN KEY ("roster_member_id") REFERENCES "public"."roster_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "roster_members_workspace_person_unique" ON "roster_members" USING btree ("workspace_id","person_id") WHERE "roster_members"."person_id" is not null;--> statement-breakpoint
CREATE INDEX "roster_members_workspace_updated_idx" ON "roster_members" USING btree ("workspace_id","updated_at");--> statement-breakpoint
CREATE INDEX "roster_members_person_idx" ON "roster_members" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_memberships_active_unique" ON "team_memberships" USING btree ("team_id","roster_member_id") WHERE "team_memberships"."left_at" is null;--> statement-breakpoint
CREATE INDEX "team_memberships_team_idx" ON "team_memberships" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_workspace_name_unique" ON "teams" USING btree ("workspace_id",lower("name")) WHERE "teams"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "teams_workspace_updated_idx" ON "teams" USING btree ("workspace_id","updated_at");