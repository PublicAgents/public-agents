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
 *
 * Probe files are published verbatim at /evidence/<id>.json, so the
 * schema refuses anything that could carry a credential: header names
 * that carry sessions or keys, values or commands that look like a
 * token, a query parameter that names a key. A nonce or a challenge
 * that must be kept goes in as the literal `[redacted]` and the finding
 * says so.
 */

/**
 * The rules below are regexes wherever they can be, so the generated
 * JSON Schema carries them too (a negative lookahead is valid JSON
 * Schema regex); only the calendar check on `at` is repository-only.
 */
/** Header names that carry a session or a credential in either direction; never published, even redacted. */
const credentialHeaderName = /^(?!(?:authorization|proxy-authorization|cookie|set-cookie|x-api-key|api-key|x-auth-token|x-access-token|x-csrf-token|x-xsrf-token|x-amz-security-token|x-session-token|x-payment|payment-signature)$)[a-z0-9-]+$/;
/** Values that look like a bearer token, a JWT, a vendor key prefix, a cloud key id, a GitHub or Slack token. */
const credentialValue = /^(?![\s\S]*(?:[Bb][Ee][Aa][Rr][Ee][Rr]\s+[A-Za-z0-9._~+/=-]{8,}|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}|\b[sprk][kp]?[-_](?:live|test)?[-_]?[A-Za-z0-9]{16,}|\bsk-[A-Za-z0-9_-]{20,}|\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{20,}|\bxox[abpr]-[A-Za-z0-9-]{10,}))/;
/** Ways a credential rides in a command: a header flag, basic auth, or a query parameter that names a key. */
const noCredentialInCommand = /^(?![\s\S]*(?:-H\s*['"]?\s*(?:[Aa]uthorization|[Cc]ookie|[Xx]-[Aa][Pp][Ii]-[Kk]ey|[Aa]pi-[Kk]ey|[Xx]-[Aa]uth-[Tt]oken)\s*:|(?:^|\s)(?:-u|--user|--oauth2-bearer)\s|[?&](?:api[_-]?key|apikey|access[_-]?token|auth[_-]?token|token|secret|password|passwd|client[_-]?secret)=))/;
const noCredential = (label: string) =>
  z.string().max(2000).regex(credentialValue, `${label} looks like it carries a credential; replace it with [redacted] and say so in the finding`);

/** A real UTC minute, YYYY-MM-DDTHH:MMZ: fields in range by regex, then a round trip through Date for the calendar. */
const utcMinute = z
  .string()
  .regex(/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\dZ$/, "YYYY-MM-DDTHH:MMZ, a real UTC minute")
  .refine(v => {
    const d = new Date(`${v.slice(0, 16)}:00.000Z`);
    return !Number.isNaN(d.getTime()) && `${d.toISOString().slice(0, 16)}Z` === v;
  }, "not a real UTC minute");

export const probeSchema = z
  .strictObject({
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
      body: noCredential("request.body").pipe(shortText(600)).optional()
    }),
    observed: z.strictObject({
      status: z.number().int().min(100).max(599),
      /** Lowercased header names; values as received, nonces and challenges replaced by [redacted] where the finding says so. Credential-bearing headers are refused by name. */
      headers: z
        .record(z.string().regex(credentialHeaderName, "a lowercase header name; a credential-bearing header (authorization, cookie, set-cookie, an api key header) is never published, not even redacted"), noCredential("a header value"))
        .optional(),
      /** What a challenge decoded to: the accepted networks, amounts, the realm, the authorization server. */
      decoded: z.record(z.string(), z.union([noCredential("a decoded value"), z.number(), z.boolean(), z.null()])).optional(),
      /** Protocol ids from registry/payment-protocols.json the response spoke, for a payment probe. */
      protocols: z.array(paymentProtocolId).max(10).optional()
    }),
    finding: z.string().trim().min(20).max(1200),
    conductedBy: z.strictObject({ name: shortText(120), github: githubLogin, url: httpsUrl.optional() }),
    independence: z.enum(["independent", "self", "vendor-sponsored"]),
    reproducibility: z.strictObject({
      /** The command that re-runs it, with no credentials in it: no auth header flag, no basic auth, no key in the query string. */
      command: noCredential("reproducibility.command")
        .regex(noCredentialInCommand, "the re-run command carries a credential (an auth header, basic auth, or a key in the query string)")
        .pipe(shortText(600)),
      /** A dated artifact of the full response, when one is published. */
      artifactsUrl: httpsUrl.optional()
    }),
    /** When the request was made, to the minute, UTC. */
    at: utcMinute,
    /** The same disclosure every evidence file carries: who the prober is to the subject. */
    disclosure,
    ...lifecycle
  })
  .superRefine((value, ctx) => {
    if (value.at.slice(0, 10) > value.updated) {
      ctx.addIssue({ code: "custom", path: ["at"], message: "the request cannot postdate the file's updated date" });
    }
  });

export type CaseReport = z.infer<typeof caseReportSchema>;
export type Probe = z.infer<typeof probeSchema>;
export type Measured = z.infer<typeof measuredSchema>;
