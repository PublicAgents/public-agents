import { z } from "zod";

/**
 * The grammar every entry shares (docs/TAXONOMY.md, docs/OWNERSHIP.md).
 * Ids are stable forever: a handle, a slug or a job id never renames.
 */

export const HANDLE = /^[A-Za-z0-9][A-Za-z0-9-]{1,31}$/;
export const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
export const FUNCTION_ID = /^[a-z]{2,6}$/;
export const JOB_ID = /^[a-z]{2,6}\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const EVIDENCE_ID = /^(m|cr)-\d{8}-[a-z0-9-]{3,60}$/;
export const GITHUB_LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
export const HOST = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
export const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const MONTH = /^\d{4}-\d{2}$/;

export const handle = z.string().regex(HANDLE, "a handle is 2 to 32 letters, digits or hyphens, starting with a letter or digit");
export const slug = z.string().regex(SLUG, "a slug is lowercase letters, digits and hyphens");
export const functionId = z.string().regex(FUNCTION_ID, "a function id is 2 to 6 lowercase letters");
export const jobId = z.string().regex(JOB_ID, "a job id is <function>.<outcome-slug>");
export const evidenceId = z.string().regex(EVIDENCE_ID, "an evidence id is m-YYYYMMDD-slug or cr-YYYYMMDD-slug");
export const githubLogin = z.string().regex(GITHUB_LOGIN, "a GitHub login");
export const host = z.string().regex(HOST, "a lowercase host name");
export const isoDate = z.string().regex(DATE, "YYYY-MM-DD");
export const isoMonth = z.string().regex(MONTH, "YYYY-MM");
export const httpsUrl = z.url({ protocol: /^https$/, hostname: z.regexes.domain });
export const httpsUrlOrNull = httpsUrl.nullable();
export const version = z.number().int().min(1);
export const shortText = (max: number) => z.string().trim().min(1).max(max);

/** Fields every dated, versioned record carries. */
export const lifecycle = {
  created: isoDate,
  updated: isoDate,
  version
};

export const solutionRef = z.strictObject({
  type: z.enum(["agent", "tool"]),
  id: z.string().min(1)
});

/** A solution's own claim to do a job: no tier, no evidence inline (docs/TAXONOMY.md). */
export const claim = z.strictObject({
  job: jobId,
  summary: shortText(300),
  source: httpsUrl.optional(),
  since: isoMonth.optional()
});

export const disclosure = z.strictObject({
  affiliation: z.enum(["none", "employee", "contractor", "investor", "operator", "partner", "other"]),
  affiliationDetail: shortText(300).optional(),
  compensation: z.enum(["none", "paid-by-vendor", "discounted", "credits", "other"]),
  compensationDetail: shortText(300).optional(),
  reseller: z.boolean(),
  resellerDetail: shortText(300).optional()
}).superRefine((value, ctx) => {
  if (value.affiliation !== "none" && !value.affiliationDetail) {
    ctx.addIssue({ code: "custom", path: ["affiliationDetail"], message: "required unless affiliation is none" });
  }
  if (value.compensation !== "none" && !value.compensationDetail) {
    ctx.addIssue({ code: "custom", path: ["compensationDetail"], message: "required unless compensation is none" });
  }
  if (value.reseller && !value.resellerDetail) {
    ctx.addIssue({ code: "custom", path: ["resellerDetail"], message: "required when reseller is true" });
  }
});
