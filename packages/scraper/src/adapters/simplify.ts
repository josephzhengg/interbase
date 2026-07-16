import { z } from "zod";
import { slugify } from "../normalize";
import { rawListingSchema, type RawListing } from "../types";

const simplifyResponse = z.array(
  z.object({
    id: z.string(),
    company_name: z.string(),
    title: z.string(),
    locations: z.array(z.string()).default([]),
    terms: z.array(z.string()).default([]),
    sponsorship: z.string().nullish(),
    active: z.boolean().default(true),
    is_visible: z.boolean().default(true),
    url: z.string().url(),
    date_posted: z.number().nullish(),
  }),
);

function mapSponsorship(s: string | null | undefined): "yes" | "no" | null {
  if (s === "Offers Sponsorship") return "yes";
  if (s === "Does Not Offer Sponsorship" || s === "U.S. Citizenship is Required") return "no";
  return null;
}

export async function fetchSimplify(
  repo: string,
  fetchFn: typeof fetch = fetch,
): Promise<RawListing[]> {
  const res = await fetchFn(`https://raw.githubusercontent.com/${repo}/dev/.github/scripts/listings.json`);
  if (!res.ok) throw new Error(`simplify ${repo}: HTTP ${res.status}`);
  const entries = simplifyResponse.parse(await res.json());
  return entries
    .filter((e) => e.active && e.is_visible)
    .map((e) =>
      rawListingSchema.parse({
        source: "github_list",
        externalId: e.id,
        companyName: e.company_name,
        companySlug: slugify(e.company_name),
        title: e.title,
        applyUrl: e.url,
        locations: e.locations,
        isRemote: e.locations.some((l) => /remote/i.test(l)),
        descriptionText: "",
        hasCompensationData: false,
        sponsorship: mapSponsorship(e.sponsorship),
        season: e.terms[0] ?? null,
        postedAt: e.date_posted ? new Date(e.date_posted * 1000) : null,
      }),
    );
}
