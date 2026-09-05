import { z } from "zod";
import { githubLogin, handle, slug } from "./common.ts";

/**
 * /.well-known/public-agents.json on an entry's first domain: the proof
 * that whoever controls the domain acknowledges the entry and names
 * who may maintain it (docs/OWNERSHIP.md). The binding between a handle
 * and its maintainers comes from here, never from the pull request.
 */
export const wellKnownSchema = z.strictObject({
  $schema: z.literal("https://public-agents.com/schemas/well-known.schema.json").optional(),
  version: z.literal(1),
  agents: z.array(handle).max(50).default([]),
  tools: z.array(slug).max(50).default([]),
  maintainers: z.array(githubLogin).min(1).max(20),
  /** Optional sha256 of the entry file as served, per handle or slug. */
  pins: z.record(z.string(), z.string().regex(/^sha256:[a-f0-9]{64}$/)).optional()
});

export type WellKnown = z.infer<typeof wellKnownSchema>;
