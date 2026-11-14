ALTER TYPE "public"."user_status" ADD VALUE 'DELETED';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "phone_identity_id" DROP NOT NULL;