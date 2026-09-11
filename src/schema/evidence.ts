import { z } from "zod";
import { disclosure, evidenceId, githubLogin, httpsUrl, isoDate, isoMonth, jobId, lifecycle, shortText, solutionRef } from "./common.ts";
import { paymentProtocolId } from "./payments.ts";

/**
 * Evidence lives in its own files, one of three kinds, never inline in
 * an entry (docs/TAXONOMY.md): a case report is a named reporter saying
 * they deployed a solution for a job, with disclosure; a measured result
 * is a re-runnable measurement with its protocol and artifacts; a probe
 * is one request with no credentials and no payment, and what came
 * back. The reporter's GitHub login must equal the pull request's
 * author.
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

/**
 * A probe answers a question no job can: what does this surface say to
 * a stranger? One request, no credentials, no payment, from one
 * network, on one day, with the status and the headers that came back.
 * It never sets a field on its subject and never counts as a claim or
 * as support for a job; it is the measurement behind an
 * `agentAccess` or `payments` block, kept apart from it.
 */
export const probeSchema = z.strictObject({
  $schema: z.literal("https://public-agents.com/schemas/evidence-probe.schema.json").optional(),
  schemaVersion: z.literal(1),
  id: evidenceId.regex(/^p-/, "a probe id starts with p-"),
  subject: solutionRef,
  /** The URL the request went to. */
  surface: httpsUrl,
  /** access: what must a human do first; payment: what does it cost inline; disclosure: does the surface say it is an agent. */
  question: z.enum(["access", "payment", "disclosure"]),
  request: z.strictObject({
    method: z.enum(["GET", "HEAD", "POST", "OPTIONS"]),
    credentials: z.literal("none"),
    payment: z.literal("none"),
    /** What kind of network the request left from; one IP is one sample and the field says so. */
    from: shortText(120),
    /** The request body, or a description of it, when the method carries one. */
    body: shortText(600).optional()
  }),
  observed: z.strictObject({
    status: z.number().int().min(100).max(599),
    /** Lowercased header names; values as received, secrets and nonces redacted and the finding says so. */
    headers: z.record(z.string().regex(/^[a-z0-9-]+$/, "a lowercase header name"), z.string().max(2000)).optional(),
    /** What a challenge decoded to: the accepted networks, amounts, the realm, the authorization server. */
    decoded: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
    /** Protocol ids from registry/payment-protocols.json the response spoke, for a payment probe. */
    protocols: z.array(paymentProtocolId).max(10).optional()
  }),
  finding: z.string().trim().min(20).max(1200),
  conductedBy: z.strictObject({ name: shortText(120), github: githubLogin, url: httpsUrl.optional() }),
  independence: z.enum(["independent", "self", "vendor-sponsored"]),
  reproducibility: z.strictObject({
    /** The command that re-runs it, with no credentials in it. */
    command: shortText(600),
    /** A dated artifact of the full response, when one is published. */
    artifactsUrl: httpsUrl.optional()
  }),
  /** When the request was made, to the minute, UTC. */
  at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/, "YYYY-MM-DDTHH:MMZ"),
  ...lifecycle
});

export type CaseReport = z.infer<typeof caseReportSchema>;
export type Probe = z.infer<typeof probeSchema>;
export type Measured = z.infer<typeof measuredSchema>;
