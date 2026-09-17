import { agentSchema } from "./agent.ts";
import { caseReportSchema, measuredSchema, probeSchema } from "./evidence.ts";
import { functionsSchema, jobSchema } from "./job.ts";
import { paymentProtocolsSchema } from "./payments.ts";
import { toolSchema } from "./tool.ts";
import { wellKnownSchema } from "./well-known.ts";

export { agentSchema, caseReportSchema, functionsSchema, jobSchema, measuredSchema, paymentProtocolsSchema, probeSchema, toolSchema, wellKnownSchema };
export type { AgentEntry } from "./agent.ts";
export type { ToolEntry } from "./tool.ts";
export type { FunctionsFile, JobEntry } from "./job.ts";
export type { CaseReport, Measured, Probe } from "./evidence.ts";
export type { AgentPayments, PaymentProtocolsFile, ToolPayments } from "./payments.ts";
export type { WellKnown } from "./well-known.ts";

/** Every published schema, by the file name it is served under (/schemas/<name>.schema.json). */
export const SCHEMAS = {
  agent: { schema: agentSchema, description: "An agent entry (registry/agents/<handle>/agent.json)" },
  tool: { schema: toolSchema, description: "A tool entry (registry/tools/<slug>/tool.json)" },
  job: { schema: jobSchema, description: "A job (registry/jobs/<function>/<id>.json)" },
  function: { schema: functionsSchema, description: "The function list (registry/functions.json)" },
  "evidence-case-report": { schema: caseReportSchema, description: "A disclosed case report (registry/evidence/case-reports/<id>.json)" },
  "evidence-measured": { schema: measuredSchema, description: "A re-runnable measurement (registry/evidence/measured/<id>.json)" },
  "evidence-probe": { schema: probeSchema, description: "One unauthenticated, unpaid request and what it answered (registry/evidence/probes/<id>.json)" },
  "payment-protocols": { schema: paymentProtocolsSchema, description: "The payment protocol vocabulary (registry/payment-protocols.json)" },
  "well-known": { schema: wellKnownSchema, description: "The ownership file at https://<domain>/.well-known/public-agents.json" }
} as const;

export type SchemaName = keyof typeof SCHEMAS;
