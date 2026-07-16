CREATE TYPE "public"."ats_type" AS ENUM('greenhouse', 'lever', 'ashby', 'github_list');--> statement-breakpoint
CREATE TYPE "public"."digest_frequency" AS ENUM('daily', 'weekly');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"website" text,
	"ats_type" "ats_type" NOT NULL,
	"ats_token" text,
	"logo_color" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "listings" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"company_name" text NOT NULL,
	"title" text NOT NULL,
	"title_norm" text NOT NULL,
	"apply_url" text NOT NULL,
	"url_canon" text NOT NULL,
	"description_snippet" text DEFAULT '' NOT NULL,
	"locations" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_remote" boolean DEFAULT false NOT NULL,
	"season" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"quality_score" integer DEFAULT 0 NOT NULL,
	"source" "ats_type" NOT NULL,
	"external_id" text NOT NULL,
	"posted_at" timestamp with time zone NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', coalesce("listings"."title", '') || ' ' || coalesce("listings"."company_name", ''))) STORED
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscribers" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"frequency" "digest_frequency" DEFAULT 'daily' NOT NULL,
	"confirm_token" text NOT NULL,
	"confirmed_at" timestamp with time zone,
	"unsubscribe_token" text NOT NULL,
	"last_digest_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscribers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "listings" ADD CONSTRAINT "listings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "listings_source_external_id" ON "listings" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "listings_active_posted" ON "listings" USING btree ("is_active","posted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "listings_search_idx" ON "listings" USING gin ("search");