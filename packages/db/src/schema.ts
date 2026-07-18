import { sql, type SQL } from "drizzle-orm";
import {
  boolean, customType, index, integer, pgEnum, pgTable, serial, text,
  timestamp, uniqueIndex,
} from "drizzle-orm/pg-core";

export const atsTypeEnum = pgEnum("ats_type", ["greenhouse", "lever", "ashby", "github_list"]);
export const digestFrequencyEnum = pgEnum("digest_frequency", ["daily", "weekly"]);

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  website: text("website"),
  atsType: atsTypeEnum("ats_type").notNull(),
  atsToken: text("ats_token"),
  logoColor: text("logo_color").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const listings = pgTable(
  "listings",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id").notNull().references(() => companies.id),
    companyName: text("company_name").notNull(),
    title: text("title").notNull(),
    titleNorm: text("title_norm").notNull(),
    applyUrl: text("apply_url").notNull(),
    urlCanon: text("url_canon").notNull(),
    descriptionSnippet: text("description_snippet").notNull().default(""),
    locations: text("locations").array().notNull().default(sql`'{}'::text[]`),
    isRemote: boolean("is_remote").notNull().default(false),
    season: text("season"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    qualityScore: integer("quality_score").notNull().default(0),
    source: atsTypeEnum("source").notNull(),
    externalId: text("external_id").notNull(),
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    isActive: boolean("is_active").notNull().default(true),
    search: tsvector("search").generatedAlwaysAs(
      (): SQL => sql`to_tsvector('english', coalesce(${listings.title}, '') || ' ' || coalesce(${listings.companyName}, ''))`,
    ),
  },
  (t) => [
    uniqueIndex("listings_source_external_id").on(t.source, t.externalId),
    index("listings_active_posted").on(t.isActive, t.postedAt),
    index("listings_search_idx").using("gin", t.search),
  ],
);

export const subscribers = pgTable("subscribers", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  frequency: digestFrequencyEnum("frequency").notNull().default("daily"),
  confirmToken: text("confirm_token").notNull(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  unsubscribeToken: text("unsubscribe_token").notNull(),
  lastDigestSentAt: timestamp("last_digest_sent_at", { withTimezone: true }),
  lastConfirmationSentAt: timestamp("last_confirmation_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
