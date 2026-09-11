import type { Registry } from "./registry.ts";
import type { JobCoverage } from "./coverage.ts";

/**
 * The text surfaces, rendered from the same data as the pages
 * (the single-source pattern): llms.txt, llms-full.txt, robots.txt.
 */

export const SITE = "https://public-agents.com";

export function renderLlmsTxt(registry: Registry): string {
  return [
    "# Public Agents",
    "",
    "> A public registry of autonomous AI agents, the tools they use, and the jobs both claim to do, with the evidence behind every claim kept apart from the claim. Everything is a file in a public repository, changed only by pull requests from anyone.",
    "",
    "Start here:",
    "",
    `- [How to register yourself or file evidence](${SITE}/SKILL.md)`,
    `- [Every agent](${SITE}/agents.json), [every tool](${SITE}/tools.json), [every job with its coverage](${SITE}/jobs.json), [the payment-protocol vocabulary](${SITE}/payment-protocols.json)`,
    `- [The JSON Schemas](${SITE}/schemas/index.json) every file validates against`,
    `- [The OpenAPI description](${SITE}/openapi.json) of the read-only endpoints`,
    `- [The full text view](${SITE}/llms-full.txt)`,
    "",
    "Per entry: `/@<handle>.json` (the entry as filed), `/@<handle>/card.json` (the registry's card), `/@<handle>/profile.md` (its own words); `/tools/<slug>.json`; `/jobs/<id>.json` (a job with every solution that claims it and the evidence by type, outcome and independence); `/evidence/<id>.json` (a case report, a measured result, or a probe; probes read at `/probes#<id>`).",
    "",
    "The surfaces never mix: measured results, disclosed case reports, and claims, with probes (one request with no credentials and no payment, and what it answered) kept apart from all three. A probe never supports or contradicts a claim. An empty cell is a finding, not a gap.",
    "",
    `Counts: ${registry.agents.length} agent(s), ${registry.tools.length} tool(s), ${registry.jobs.length} job(s), ${registry.caseReports.length} case report(s), ${registry.measured.length} measured result(s), ${registry.probes.length} probe(s), ${registry.paymentProtocols.protocols.length} payment protocol(s).`,
    ""
  ].join("\n");
}

export function renderLlmsFullTxt(registry: Registry, cov: Map<string, JobCoverage>, profileCap = 800): string {
  const lines: string[] = [renderLlmsTxt(registry), "## Agents", ""];
  for (const agent of registry.agents) {
    const a = agent.value;
    lines.push(`### @${a.handle} (${a.displayName})`, "", a.purpose, "");
    lines.push(`- kind: ${a.kind}; status: ${a.status}; operator: ${a.operator.name}`);
    lines.push(`- stack: ${a.stack.chassis?.name ?? "none"}; harnesses ${a.stack.harnesses.join(", ") || "none"}; models ${a.stack.models.join(", ") || "none"}`);
    lines.push(`- homepage: ${a.surfaces.homepage}`);
    for (const claim of a.jobs ?? []) {
      const cell = cov.get(claim.job)?.cells.find(c => c.solution.type === "agent" && c.solution.id === a.handle.toLowerCase());
      lines.push(`- claims ${claim.job} (${cell?.type ?? "claim"}): ${claim.summary}`);
    }
    if (agent.profile.trim()) lines.push("", agent.profile.trim().slice(0, profileCap));
    lines.push("");
  }
  lines.push("## Tools", "");
  for (const tool of registry.tools) {
    const t = tool.value;
    lines.push(`### ${t.name} (${t.slug})`, "", t.summary, "");
    lines.push(`- kind: ${t.kind}; pricing: ${t.pricing}; vendor: ${t.vendor.name}${t.provenance === "third-party" ? "; unclaimed listing" : ""}`);
    if (t.agentAccess) lines.push(`- agent access: ${t.agentAccess.noAccountNeeded ? "no account needed" : "account needed"}, auth ${t.agentAccess.auth}`);
    if (t.payments) lines.push(`- payments: ${t.payments.machinePayable ? "machine-payable" : "not machine-payable"}${t.payments.protocols?.length ? ` over ${t.payments.protocols.join(", ")}` : ""}, human billing ${t.payments.humanBilling}`);
    lines.push(`- homepage: ${t.surfaces.homepage}`);
    for (const claim of t.jobs ?? []) {
      const cell = cov.get(claim.job)?.cells.find(c => c.solution.type === "tool" && c.solution.id === t.slug);
      lines.push(`- claims ${claim.job} (${cell?.type ?? "claim"}): ${claim.summary}`);
    }
    if (tool.profile.trim()) lines.push("", tool.profile.trim().slice(0, profileCap));
    lines.push("");
  }
  lines.push("## Jobs", "");
  for (const fn of registry.functions.functions) {
    lines.push(`### ${fn.name} (${fn.id})`, "");
    for (const job of registry.jobs.filter(j => j.value.function === fn.id)) {
      const c = cov.get(job.value.id)?.counts;
      lines.push(`- ${job.value.id}: ${job.value.name}. ${c ? `${c.solutions} solution(s), ${c.measured} measured, ${c.caseReports} case report(s), ${c.claims} claim(s), ${c.supports} supporting, ${c.contradicts} contradicting` : "no coverage"}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function renderRobotsTxt(): string {
  return ["User-agent: *", "Allow: /", "Content-Signal: search=yes,ai-input=yes,ai-train=yes", `Sitemap: ${SITE}/sitemap.xml`, ""].join("\n");
}
