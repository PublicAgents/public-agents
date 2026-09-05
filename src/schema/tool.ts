import { z } from "zod";
import { claim, githubLogin, host, httpsUrl, httpsUrlOrNull, lifecycle, shortText, slug } from "./common.ts";

/**
 * A tool entry: a product, service, model or framework that claims jobs.
 * `agentAccess` is the field the registry is about: can an agent use
 * this without a human making an account? A tool filed by a researcher
 * without the vendor's proof is an unclaimed listing
 * (provenance: third-party, maintainers: []) until the vendor claims it
 * with domain proof (docs/OWNERSHIP.md).
 */
export const toolSchema = z
  .strictObject({
    $schema: z.literal("https://public-agents.com/schemas/tool.schema.json").optional(),
    schemaVersion: z.literal(1),
    slug,
    name: shortText(80),
    kind: z.enum(["product", "open-source", "service", "model", "framework"]),
    status: z.enum(["active", "deprecated", "retired"]),
    summary: z.string().trim().min(20).max(600),
    vendor: z.strictObject({
      name: shortText(120),
      url: httpsUrl.optional(),
      kind: z.enum(["person", "organization"])
    }),
    license: shortText(60).optional(),
    pricing: z.enum(["free", "freemium", "paid", "open-source", "unknown"]),
    agentAccess: z
      .strictObject({
        noAccountNeeded: z.boolean(),
        auth: z.enum(["none", "api-key", "oauth", "session", "other"]),
        notes: shortText(300).optional()
      })
      .optional(),
    surfaces: z.strictObject({
      homepage: httpsUrl,
      docs: httpsUrlOrNull.optional(),
      llmsTxt: httpsUrlOrNull.optional(),
      skills: z.array(httpsUrl).max(20).optional(),
      mcp: httpsUrlOrNull.optional(),
      api: httpsUrlOrNull.optional(),
      openapi: httpsUrlOrNull.optional(),
      source: httpsUrlOrNull.optional()
    }),
    social: z
      .strictObject({
        x: z.string().regex(/^[A-Za-z0-9_]{1,15}$/).nullable().optional(),
        github: z.string().regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/).nullable().optional()
      })
      .optional(),
    domains: z.array(host).min(1).max(10),
    /** Empty only with provenance: third-party (an unclaimed listing). */
    maintainers: z.array(z.strictObject({ github: githubLogin })).max(10),
    provenance: z.enum(["vendor", "third-party"]).optional(),
    jobs: z.array(claim).max(60).optional(),
    disclosure: z
      .strictObject({
        aiOperated: z.boolean(),
        statement: z.string().trim().min(20).max(600)
      })
      .optional(),
    ...lifecycle
  })
  .superRefine((value, ctx) => {
    const thirdParty = value.provenance === "third-party";
    if (value.maintainers.length === 0 && !thirdParty) {
      ctx.addIssue({ code: "custom", path: ["maintainers"], message: "at least one maintainer unless provenance is third-party" });
    }
  });

export type ToolEntry = z.infer<typeof toolSchema>;
