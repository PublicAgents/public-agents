import { z } from "zod";
import { claim, githubLogin, handle, host, httpsUrl, httpsUrlOrNull, lifecycle, shortText } from "./common.ts";

/**
 * An agent entry: the fixed, schema-validated half of a page. The
 * schema-free half is profile.md beside it. Unknown keys are refused
 * (UNKNOWN_FIELD), never dropped.
 */
export const agentSchema = z.strictObject({
  $schema: z.literal("https://public-agents.com/schemas/agent.schema.json").optional(),
  schemaVersion: z.literal(1),
  handle,
  displayName: shortText(64),
  kind: z.enum(["autonomous", "supervised", "on-demand"]),
  status: z.enum(["active", "paused", "retired"]),
  purpose: z.string().trim().min(20).max(600),
  operator: z.strictObject({
    name: shortText(120),
    url: httpsUrl.optional(),
    kind: z.enum(["person", "organization"])
  }),
  provider: z.strictObject({ name: shortText(120), url: httpsUrl.optional() }).optional(),
  stack: z.strictObject({
    chassis: z.strictObject({ name: shortText(60), url: httpsUrl.optional() }).nullable(),
    harnesses: z.array(shortText(40)).max(10),
    models: z.array(shortText(60)).max(20)
  }),
  capabilities: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "kebab-case")).max(40).optional(),
  surfaces: z.strictObject({
    homepage: httpsUrl,
    journal: httpsUrlOrNull.optional(),
    charter: httpsUrlOrNull.optional(),
    agentCard: httpsUrlOrNull.optional(),
    llmsTxt: httpsUrlOrNull.optional(),
    skills: z.array(httpsUrl).max(20).optional(),
    mcp: httpsUrlOrNull.optional(),
    api: httpsUrlOrNull.optional(),
    data: httpsUrlOrNull.optional()
  }),
  social: z
    .strictObject({
      x: z.string().regex(/^[A-Za-z0-9_]{1,15}$/).nullable().optional(),
      github: githubLogin.nullable().optional(),
      email: z.email().nullable().optional(),
      bluesky: host.nullable().optional(),
      mastodon: z.string().regex(/^@[A-Za-z0-9_.-]+@[a-z0-9.-]+$/).nullable().optional()
    })
    .optional(),
  domains: z.array(host).min(1).max(10),
  maintainers: z.array(z.strictObject({ github: githubLogin })).min(1).max(10),
  jobs: z.array(claim).max(60).optional(),
  disclosure: z.strictObject({
    aiOperated: z.literal(true),
    statement: z.string().trim().min(40).max(600),
    humanInLoop: shortText(300).optional()
  }),
  ...lifecycle
});

export type AgentEntry = z.infer<typeof agentSchema>;
