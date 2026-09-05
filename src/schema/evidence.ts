import { z } from "zod";
import { disclosure, evidenceId, githubLogin, httpsUrl, isoDate, isoMonth, jobId, lifecycle, shortText, solutionRef } from "./common.ts";

/**
 * Evidence lives in its own files, one of two kinds, never inline in an
 * entry (docs/TAXONOMY.md): a case report is a named reporter saying
 * they deployed a solution for a job, with disclosure; a measured result
 * is a re-runnable measurement with its protocol and artifacts. The
 * reporter's GitHub login must equal the pull request's author.
 */

const period = z.strictObject({ from: isoMonth, to: isoMonth.optional() });

export const caseReportSchema = z.strictObject({
  $schema: z.literal("https://public-agents.com/schemas/evidence-case-report.schema.json").optional(),
  schemaVersion: z.literal(1),
  id: evidenceId.regex(/^cr-/, "a case report id starts with cr-"),
  solution: solutionRef,
  job: jobId,
  reporter: z.strictObject({ name: shortText(120), github: githubLogin, url: httpsUrl.optional() }),
  organization: z.strictObject({
    name: shortText(120),
    sizeBand: z.enum(["1-10", "11-50", "51-200", "201-1000", "1001-10000", "10000+"]),
    industry: shortText(60)
  }),
  period,
  deployment: z.string().trim().min(40).max(2000),
  outcome: z.strictObject({
    verdict: z.enum(["positive", "mixed", "negative", "inconclusive"]),
    summary: z.string().trim().min(20).max(1200),
    metrics: z.array(z.strictObject({ name: shortText(80), value: shortText(80), unit: shortText(40).optional() })).max(12).optional()
  }),
  disclosure,
  sources: z.array(httpsUrl).min(1).max(12),
  ...lifecycle
});

export const measuredSchema = z.strictObject({
  $schema: z.literal("https://public-agents.com/schemas/evidence-measured.schema.json").optional(),
  schemaVersion: z.literal(1),
  id: evidenceId.regex(/^m-/, "a measured id starts with m-"),
  solution: solutionRef,
  job: jobId,
  conductedBy: z.strictObject({ name: shortText(120), github: githubLogin, url: httpsUrl.optional() }),
  independence: z.enum(["independent", "self", "vendor-sponsored"]),
  method: z.strictObject({
    summary: z.string().trim().min(40).max(2000),
    protocolUrl: httpsUrl,
    dataset: shortText(300).optional(),
    sampleSize: z.number().int().min(1).optional(),
    period: z.strictObject({ from: isoDate, to: isoDate })
  }),
  results: z
    .array(
      z.strictObject({
        metric: shortText(80),
        value: z.number(),
        unit: shortText(40).optional(),
        baseline: z.number().optional(),
        interval: shortText(80).optional(),
        /** Whether a higher value is better; the build reads outcome from it. */
        higherIsBetter: z.boolean().optional()
      })
    )
    .min(1)
    .max(20),
  reproducibility: z.strictObject({ artifactsUrl: httpsUrl, license: shortText(60).optional() }),
  disclosure,
  ...lifecycle
});

export type CaseReport = z.infer<typeof caseReportSchema>;
export type Measured = z.infer<typeof measuredSchema>;
