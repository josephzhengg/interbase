import type { RawListing } from "./types";

const INTERN_RE = /\b(intern(ship)?|co[- ]?op)\b/i;
const NEW_GRAD_RE = /\b(new grad(uate)?|university grad(uate)?|early career|entry[- ]level)\b/i;
const EXCLUDE_RE = /\b(senior|staff|principal|lead|manager|director|architect|phd|mba)\b/i;

export function isEntryLevel(title: string): boolean {
  return (INTERN_RE.test(title) || NEW_GRAD_RE.test(title)) && !EXCLUDE_RE.test(title);
}

const PAID_RE = /\$\s?\d|\/(hour|hr)\b|hourly|stipend/i;
const NO_SPONSOR_RE = /\b(?:unable|not|cannot|can['']t|won['']t|no|never|don['']t|doesn['']t)\s+(?:\w+\s+){0,3}sponsor|\bsponsor\w*\s+(?:\w+\s+){0,3}(?:not\b|unavailable)/i;
const SPONSOR_RE = /sponsor(ship)?|\bCPT\b|\bOPT\b/i;
const FRESHMAN_RE = /freshman|sophomore|all years|underclassmen|first[- ]year students/i;

export function extractTags(raw: RawListing): string[] {
  const d = raw.descriptionText;
  const tags: string[] = [];
  if (raw.hasCompensationData || PAID_RE.test(d)) tags.push("paid");
  const noSponsor = raw.sponsorship === "no" || NO_SPONSOR_RE.test(d);
  if (noSponsor) tags.push("no-sponsorship");
  else if (raw.sponsorship === "yes" || SPONSOR_RE.test(d)) tags.push("sponsors-visa");
  if (NEW_GRAD_RE.test(raw.title) || NEW_GRAD_RE.test(d)) tags.push("new-grad-ok");
  if (FRESHMAN_RE.test(d)) tags.push("freshman-ok");
  return tags;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function scoreListing(args: {
  raw: RawListing; tags: string[]; isKnownCompany: boolean; now: Date;
}): number {
  const { raw, tags, isKnownCompany, now } = args;
  let score = 0;
  if (isKnownCompany) score += 30;
  if (tags.includes("paid")) score += 20;
  if (tags.includes("sponsors-visa") || tags.includes("no-sponsorship")) score += 15;
  if (raw.locations.length > 0 || raw.isRemote) score += 10;
  if (raw.descriptionText.length >= 300) score += 10;
  const posted = raw.postedAt ?? now;
  if (now.getTime() - posted.getTime() <= WEEK_MS) score += 15;
  return score;
}
