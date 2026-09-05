import { z } from "zod";
import { functionId, jobId, lifecycle, shortText } from "./common.ts";

/**
 * A job: an outcome a solution can plausibly claim, written in our own
 * words with the measures that would show it done (docs/TAXONOMY.md).
 * Never deleted: deprecated with a successor, and the old page redirects.
 */
export const jobSchema = z
  .strictObject({
    $schema: z.literal("https://public-agents.com/schemas/job.schema.json").optional(),
    schemaVersion: z.literal(1),
    id: jobId,
    function: functionId,
    name: z.string().trim().min(10).max(90),
    outcome: z.string().trim().min(20).max(400),
    description: shortText(1200).optional(),
    measures: z.array(shortText(120)).min(2).max(8),
    aliases: z.array(shortText(80)).max(12).optional(),
    related: z.array(jobId).max(12).optional(),
    status: z.enum(["active", "deprecated"]),
    supersededBy: jobId.nullable().optional(),
    ...lifecycle
  })
  .superRefine((value, ctx) => {
    if (!value.id.startsWith(`${value.function}.`)) {
      ctx.addIssue({ code: "custom", path: ["id"], message: `must start with "${value.function}."` });
    }
    if (value.status === "deprecated" && !value.supersededBy) {
      ctx.addIssue({ code: "custom", path: ["supersededBy"], message: "a deprecated job names its successor" });
    }
    if (value.status === "active" && value.supersededBy) {
      ctx.addIssue({ code: "custom", path: ["supersededBy"], message: "only a deprecated job has a successor" });
    }
  });

export type JobEntry = z.infer<typeof jobSchema>;

export const functionsSchema = z.strictObject({
  $schema: z.literal("https://public-agents.com/schemas/function.schema.json").optional(),
  functions: z
    .array(
      z.strictObject({
        id: functionId,
        name: shortText(60),
        description: shortText(300)
      })
    )
    .min(1)
});

export type FunctionsFile = z.infer<typeof functionsSchema>;
