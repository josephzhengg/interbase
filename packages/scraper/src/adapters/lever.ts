import { z } from "zod";
import { htmlToText } from "../normalize";
import { rawListingSchema, type RawListing, type SeedCompany } from "../types";

const leverResponse = z.array(
  z.object({
    id: z.string(),
    text: z.string(),
    hostedUrl: z.string().url(),
    createdAt: z.number().nullish(),
    categories: z.object({ location: z.string().nullish() }).nullish(),
    workplaceType: z.string().nullish(),
    descriptionPlain: z.string().nullish(),
    description: z.string().nullish(),
    salaryRange: z.object({}).passthrough().nullish(),
  }),
);

export async function fetchLever(
  company: SeedCompany,
  fetchFn: typeof fetch = fetch,
): Promise<RawListing[]> {
  const res = await fetchFn(`https://api.lever.co/v0/postings/${company.atsToken}?mode=json`);
  if (!res.ok) throw new Error(`lever ${company.slug}: HTTP ${res.status}`);
  const postings = leverResponse.parse(await res.json());
  return postings.flatMap((p) => {
    const location = p.categories?.location ?? "";
    const candidate = rawListingSchema.safeParse({
      source: "lever",
      externalId: p.id,
      companyName: company.name,
      companySlug: company.slug,
      title: p.text,
      applyUrl: p.hostedUrl,
      locations: location ? [location] : [],
      isRemote: p.workplaceType === "remote" || /remote/i.test(location),
      descriptionText: p.descriptionPlain ?? htmlToText(p.description ?? ""),
      hasCompensationData: p.salaryRange != null,
      postedAt: p.createdAt ? new Date(p.createdAt) : null,
    });
    return candidate.success ? [candidate.data] : [];
  });
}
