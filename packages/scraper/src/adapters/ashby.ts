import { z } from "zod";
import { htmlToText } from "../normalize";
import { rawListingSchema, type RawListing, type SeedCompany } from "../types";

const ashbyResponse = z.object({
  jobs: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      location: z.string().nullish(),
      secondaryLocations: z.array(z.object({ location: z.string() })).nullish(),
      isRemote: z.boolean().nullish(),
      publishedAt: z.string().nullish(),
      jobUrl: z.string().url(),
      applyUrl: z.string().url().nullish(),
      descriptionHtml: z.string().nullish(),
      descriptionPlain: z.string().nullish(),
      compensation: z.object({}).passthrough().nullish(),
    }),
  ),
});

export async function fetchAshby(
  company: SeedCompany,
  fetchFn: typeof fetch = fetch,
): Promise<RawListing[]> {
  const res = await fetchFn(
    `https://api.ashbyhq.com/posting-api/job-board/${company.atsToken}?includeCompensation=true`,
  );
  if (!res.ok) throw new Error(`ashby ${company.slug}: HTTP ${res.status}`);
  const data = ashbyResponse.parse(await res.json());
  return data.jobs.map((j) => {
    const locations = [j.location, ...(j.secondaryLocations ?? []).map((l) => l.location)]
      .filter((l): l is string => !!l);
    return rawListingSchema.parse({
      source: "ashby",
      externalId: j.id,
      companyName: company.name,
      companySlug: company.slug,
      title: j.title,
      applyUrl: j.applyUrl ?? j.jobUrl,
      locations,
      isRemote: j.isRemote ?? locations.some((l) => /remote/i.test(l)),
      descriptionText: j.descriptionPlain ?? htmlToText(j.descriptionHtml ?? ""),
      hasCompensationData: j.compensation != null,
      postedAt: j.publishedAt ? new Date(j.publishedAt) : null,
    });
  });
}
