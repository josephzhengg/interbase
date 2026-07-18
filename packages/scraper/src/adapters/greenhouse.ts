import { z } from "zod";
import { htmlToText } from "../normalize";
import { rawListingSchema, type RawListing, type SeedCompany } from "../types";

const ghResponse = z.object({
  jobs: z.array(
    z.object({
      id: z.number(),
      title: z.string(),
      absolute_url: z.string().url(),
      updated_at: z.string().nullish(),
      location: z.object({ name: z.string() }).nullish(),
      content: z.string().nullish(),
    }),
  ),
});

export async function fetchGreenhouse(
  company: SeedCompany,
  fetchFn: typeof fetch = fetch,
): Promise<RawListing[]> {
  const res = await fetchFn(
    `https://boards-api.greenhouse.io/v1/boards/${company.atsToken}/jobs?content=true`,
  );
  if (!res.ok) throw new Error(`greenhouse ${company.slug}: HTTP ${res.status}`);
  const data = ghResponse.parse(await res.json());
  return data.jobs.flatMap((j) => {
    const candidate = rawListingSchema.safeParse({
      source: "greenhouse",
      externalId: String(j.id),
      companyName: company.name,
      companySlug: company.slug,
      title: j.title,
      applyUrl: j.absolute_url,
      locations: j.location?.name ? [j.location.name] : [],
      isRemote: /remote/i.test(j.location?.name ?? ""),
      descriptionText: htmlToText(j.content ?? ""),
      hasCompensationData: false,
      postedAt: j.updated_at ? new Date(j.updated_at) : null,
    });
    return candidate.success ? [candidate.data] : [];
  });
}
