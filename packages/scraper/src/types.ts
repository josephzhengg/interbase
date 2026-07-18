import { z } from "zod";

export const rawListingSchema = z.object({
  source: z.enum(["greenhouse", "lever", "ashby", "github_list"]),
  externalId: z.string().min(1),
  companyName: z.string().min(1),
  companySlug: z.string().min(1),
  title: z.string().min(1),
  applyUrl: z.string().url().refine((u) => /^https?:\/\//i.test(u), "applyUrl must be http(s)"),
  locations: z.array(z.string()).default([]),
  isRemote: z.boolean().default(false),
  descriptionText: z.string().default(""),
  hasCompensationData: z.boolean().default(false),
  sponsorship: z.enum(["yes", "no"]).nullable().default(null),
  season: z.string().nullable().default(null),
  postedAt: z.coerce.date().nullable().default(null),
});
export type RawListing = z.infer<typeof rawListingSchema>;

export const seedCompanySchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  website: z.string().url().refine((u) => /^https?:\/\//i.test(u), "website must be http(s)").optional(),
  atsType: z.enum(["greenhouse", "lever", "ashby"]),
  atsToken: z.string().min(1),
});
export type SeedCompany = z.infer<typeof seedCompanySchema>;
