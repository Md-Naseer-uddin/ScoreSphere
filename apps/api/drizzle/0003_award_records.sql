CREATE TABLE "award_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"match_id" uuid NOT NULL,
	"award_key" varchar(60) NOT NULL,
	"criteria_version" integer NOT NULL,
	"status" varchar(12) NOT NULL,
	"provenance" varchar(10) NOT NULL,
	"recipients" jsonb NOT NULL,
	"metrics" jsonb NOT NULL,
	"match_version" integer NOT NULL,
	"reason" varchar(200),
	"selected_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone,
	CONSTRAINT "award_records_status_check" CHECK ("award_records"."status" in ('PUBLISHED', 'STALE', 'SUPERSEDED')),
	CONSTRAINT "award_records_provenance_check" CHECK ("award_records"."provenance" in ('AUTO', 'MANUAL', 'OVERRIDE'))
);
--> statement-breakpoint
ALTER TABLE "award_records" ADD CONSTRAINT "award_records_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "award_records" ADD CONSTRAINT "award_records_selected_by_user_id_users_id_fk" FOREIGN KEY ("selected_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "award_records_match_idx" ON "award_records" USING btree ("match_id");--> statement-breakpoint
CREATE UNIQUE INDEX "award_records_published_unique" ON "award_records" USING btree ("match_id","award_key") WHERE "award_records"."status" in ('PUBLISHED', 'STALE');