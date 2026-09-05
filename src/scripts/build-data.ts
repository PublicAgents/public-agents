#!/usr/bin/env node
/**
 * Everything the site serves that is not a page, written from the
 * registry into site/public/ (the machine endpoints, the text surfaces,
 * the schemas, the well-knowns) and into site/src/data/ (what the pages
 * read). One build, one source. Refuses to build an invalid registry.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { coverage, solutionsOf } from "../lib/coverage.ts";
import { renderLlmsFullTxt, renderLlmsTxt, renderRobotsTxt, SITE } from "../lib/docs.ts";
import { normalizeHandle } from "../lib/handles.ts";
import { renderProfile } from "../lib/profile.ts";
import { loadRegistry } from "../lib/registry.ts";
import { formatRefusal } from "../lib/refusals.ts";
import { withConcurrency } from "../lib/net.ts";
import { decideWithProof, fetchProof } from "../lib/ownership.ts";

const root = process.cwd();
const pub = join(root, "site", "public");
const data = join(root, "site", "src", "data");
const registry = loadRegistry(root);
if (registry.refusals.length > 0) {
  console.error(`✗ the registry does not build: ${registry.refusals.length} refusal(s)`);
  for (const r of registry.refusals) console.error(`  ${formatRefusal(r)}`);
  process.exit(1);
}

const commit = (() => {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
})();
const generatedAt = new Date().toISOString();
/**
 * Verification status is computed at build time and published with the
 * site (agents.json and tools.json carry it): with PA_VERIFY_AT_BUILD=1
 * every entry's domain proof is re-fetched; without it the status is
 * carried over from the live site so a plain build does not fetch.
 */
type Status = { verifiedAt: string; method: string; ok: boolean };
const verification: { entries: Record<string, Status> } = { entries: {} };
async function carryOver(kind: "agents" | "tools") {
  try {
    const response = await fetch(`${SITE}/${kind}.json`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return;
    const body = (await response.json()) as { agents?: Array<{ handle: string; verification: { ok: boolean; method: string; checkedAt: string | null } }>; tools?: Array<{ slug: string; verification: { ok: boolean; method: string; checkedAt: string | null } }> };
    for (const a of body.agents ?? []) if (a.verification.checkedAt) verification.entries[a.handle.toLowerCase()] = { verifiedAt: a.verification.checkedAt, method: a.verification.method, ok: a.verification.ok };
    for (const t of body.tools ?? []) if (t.verification.checkedAt) verification.entries[t.slug] = { verifiedAt: t.verification.checkedAt, method: t.verification.method, ok: t.verification.ok };
  } catch {
    /* no live site yet: nothing to carry over */
  }
}
if (process.env.PA_VERIFY_AT_BUILD === "1") {
  const targets = [
    ...registry.agents.map(a => ({ name: a.value.handle, domain: a.value.domains[0], maintainers: a.value.maintainers.map(m => m.github) })),
    ...registry.tools.filter(t => t.value.provenance !== "third-party").map(t => ({ name: t.value.slug, domain: t.value.domains[0], maintainers: t.value.maintainers.map(m => m.github) }))
  ];
  await withConcurrency(4, targets.map(target => async () => {
    const proof = await fetchProof(target.domain, target.name, {});
    const author = target.maintainers[0] ?? "";
    const decision = decideWithProof({ name: target.name, author, maintainers: target.maintainers, proof });
    verification.entries[target.name.toLowerCase()] = { verifiedAt: generatedAt, method: "reason" in proof ? proof.reason : proof.method, ok: decision.ok };
  }));
  console.log(`✓ verified ${targets.length} entr(y/ies) against their domains`);
} else {
  await carryOver("agents");
  await carryOver("tools");
}

// A clean public/: generated files only, nothing stale from a previous build.
for (const dir of ["agents", "tools", "jobs", "functions", "evidence", "schemas", "skills", ".well-known"]) rmSync(join(pub, dir), { recursive: true, force: true });
mkdirSync(pub, { recursive: true });
mkdirSync(data, { recursive: true });
const write = (rel: string, content: string) => {
  const file = join(pub, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
};
const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
const sha256 = (text: string) => `sha256:${createHash("sha256").update(text).digest("hex")}`;

const cov = coverage(registry);
const solutions = solutionsOf(registry);
const verificationOf = (name: string) => {
  const record = verification.entries?.[name.toLowerCase()];
  return record ? { ok: record.ok, method: record.method, checkedAt: record.verifiedAt } : { ok: false, method: "none", checkedAt: null };
};

// ---- agents ---------------------------------------------------------------
const agentsIndex = registry.agents.map(agent => {
  const a = agent.value;
  const lower = normalizeHandle(a.handle);
  return {
    handle: a.handle,
    displayName: a.displayName,
    kind: a.kind,
    status: a.status,
    operator: a.operator,
    purpose: a.purpose,
    homepage: a.surfaces.homepage,
    domains: a.domains,
    verification: verificationOf(a.handle),
    jobs: (a.jobs ?? []).map(claim => ({ job: claim.job, type: cov.get(claim.job)?.cells.find(c => c.solution.type === "agent" && c.solution.id === lower)?.type ?? "claim" })),
    updated: a.updated,
    version: a.version,
    urls: { html: `${SITE}/@${a.handle}`, json: `${SITE}/@${a.handle}.json`, card: `${SITE}/@${a.handle}/card.json`, profile: `${SITE}/@${a.handle}/profile.md` }
  };
});
write("agents.json", json({ generatedAt, commit, count: agentsIndex.length, agents: agentsIndex }));
for (const agent of registry.agents) {
  const a = agent.value;
  const lower = normalizeHandle(a.handle);
  write(`agents/${lower}.json`, agent.raw);
  write(`agents/${lower}/profile.md`, agent.profile);
  write(
    `agents/${lower}/card.json`,
    json({
      registry: SITE,
      handle: a.handle,
      url: `${SITE}/@${a.handle}`,
      displayName: a.displayName,
      kind: a.kind,
      status: a.status,
      purpose: a.purpose,
      operator: a.operator,
      provider: a.provider ?? null,
      stack: a.stack,
      surfaces: a.surfaces,
      social: a.social ?? {},
      domains: a.domains,
      verification: verificationOf(a.handle),
      claims: (a.jobs ?? []).map(claim => {
        const cell = cov.get(claim.job)?.cells.find(c => c.solution.type === "agent" && c.solution.id === lower);
        return { job: claim.job, summary: claim.summary, type: cell?.type ?? "claim", supports: cell?.supports ?? 0, contradicts: cell?.contradicts ?? 0, evidence: cell?.evidence.map(e => ({ id: e.id, type: e.type, outcome: e.outcome, independence: e.independence, url: `${SITE}${e.url}` })) ?? [] };
      }),
      disclosure: a.disclosure,
      /** The agent's own A2A card, when it publishes one, is the authoritative one; this is the registry's. */
      agentCard: a.surfaces.agentCard ?? null,
      updated: a.updated,
      version: a.version,
      entryDigest: sha256(agent.raw)
    })
  );
  const md = [
    `# @${a.handle}: ${a.displayName}`,
    "",
    a.purpose,
    "",
    `- kind: ${a.kind}`,
    `- status: ${a.status}`,
    `- operator: ${a.operator.name}${a.operator.url ? ` (${a.operator.url})` : ""}`,
    `- stack: chassis ${a.stack.chassis?.name ?? "none"}; harnesses ${a.stack.harnesses.join(", ") || "none"}; models ${a.stack.models.join(", ") || "none"}`,
    `- homepage: ${a.surfaces.homepage}`,
    ...Object.entries(a.surfaces).filter(([k, v]) => k !== "homepage" && v && typeof v === "string").map(([k, v]) => `- ${k}: ${v}`),
    `- domains: ${a.domains.join(", ")} (verification: ${verificationOf(a.handle).ok ? "verified" : "unverified"})`,
    `- disclosure: ${a.disclosure.statement}`,
    "",
    "## Jobs claimed",
    "",
    ...(a.jobs ?? []).map(claim => `- ${claim.job}: ${claim.summary}`),
    "",
    "## In its own words",
    "",
    agent.profile.trim(),
    ""
  ].join("\n");
  write(`agents/${lower}.md`, md);
}

// ---- tools ----------------------------------------------------------------
const toolsIndex = registry.tools.map(tool => {
  const t = tool.value;
  return {
    slug: t.slug,
    name: t.name,
    kind: t.kind,
    status: t.status,
    vendor: t.vendor,
    summary: t.summary,
    pricing: t.pricing,
    agentAccess: t.agentAccess ?? null,
    provenance: t.provenance ?? "vendor",
    homepage: t.surfaces.homepage,
    domains: t.domains,
    verification: t.provenance === "third-party" ? { ok: false, method: "unclaimed", checkedAt: null } : verificationOf(t.slug),
    jobs: (t.jobs ?? []).map(claim => ({ job: claim.job, type: cov.get(claim.job)?.cells.find(c => c.solution.type === "tool" && c.solution.id === t.slug)?.type ?? "claim" })),
    updated: t.updated,
    version: t.version,
    urls: { html: `${SITE}/tools/${t.slug}`, json: `${SITE}/tools/${t.slug}.json`, profile: `${SITE}/tools/${t.slug}/profile.md` }
  };
});
write("tools.json", json({ generatedAt, commit, count: toolsIndex.length, tools: toolsIndex }));
for (const tool of registry.tools) {
  write(`tools/${tool.value.slug}.json`, tool.raw);
  write(`tools/${tool.value.slug}/profile.md`, tool.profile);
  const t = tool.value;
  write(
    `tools/${t.slug}.md`,
    [
      `# ${t.name}`,
      "",
      t.summary,
      "",
      `- kind: ${t.kind}; pricing: ${t.pricing}; vendor: ${t.vendor.name}`,
      `- homepage: ${t.surfaces.homepage}`,
      ...(t.agentAccess ? [`- agent access: ${t.agentAccess.noAccountNeeded ? "no account needed" : "account needed"}, auth ${t.agentAccess.auth}`] : []),
      "",
      "## Jobs claimed",
      "",
      ...(t.jobs ?? []).map(claim => `- ${claim.job}: ${claim.summary}`),
      "",
      "## In its own words",
      "",
      tool.profile.trim(),
      ""
    ].join("\n")
  );
}

// ---- jobs and functions ----------------------------------------------------
write("functions.json", json(registry.functions));
const jobsIndex = registry.jobs.map(job => {
  const c = cov.get(job.value.id)!;
  return { id: job.value.id, function: job.value.function, name: job.value.name, outcome: job.value.outcome, status: job.value.status, coverage: c.counts, url: `${SITE}/jobs/${job.value.id}` };
});
write("jobs.json", json({ generatedAt, commit, functions: registry.functions.functions, count: jobsIndex.length, jobs: jobsIndex }));
for (const job of registry.jobs) {
  const c = cov.get(job.value.id)!;
  write(
    `jobs/${job.value.id}.json`,
    json({
      generatedAt,
      job: job.value,
      solutions: c.cells.map(cell => ({
        type: cell.solution.type,
        id: cell.solution.id,
        name: cell.solution.name,
        url: `${SITE}${cell.solution.url}`,
        claim: cell.claim,
        evidenceType: cell.type,
        supports: cell.supports,
        contradicts: cell.contradicts,
        evidence: cell.evidence.map(e => ({ ...e, url: `${SITE}${e.url}` }))
      })),
      evidenceWithoutClaim: c.cells.filter(cell => !cell.claim && cell.evidence.length > 0).map(cell => ({ type: cell.solution.type, id: cell.solution.id, name: cell.solution.name }))
    })
  );
}
for (const fn of registry.functions.functions) {
  write(`functions/${fn.id}.json`, json({ function: fn, jobs: jobsIndex.filter(j => j.function === fn.id) }));
}

// ---- evidence -------------------------------------------------------------
for (const item of [...registry.caseReports, ...registry.measured]) write(`evidence/${item.value.id}.json`, item.raw);

// ---- changes and search ---------------------------------------------------
const changes = [
  ...registry.agents.map(a => ({ kind: "agent", id: a.value.handle, version: a.value.version, updated: a.value.updated, url: `${SITE}/@${a.value.handle}` })),
  ...registry.tools.map(t => ({ kind: "tool", id: t.value.slug, version: t.value.version, updated: t.value.updated, url: `${SITE}/tools/${t.value.slug}` })),
  ...registry.jobs.map(j => ({ kind: "job", id: j.value.id, version: j.value.version, updated: j.value.updated, url: `${SITE}/jobs/${j.value.id}` })),
  ...[...registry.caseReports, ...registry.measured].map(e => ({ kind: "evidence", id: e.value.id, version: e.value.version, updated: e.value.updated, url: `${SITE}/evidence/${e.value.id}` }))
]
  .sort((a, b) => b.updated.localeCompare(a.updated))
  .slice(0, 100);
write("changes.json", json({ generatedAt, changes }));
const searchIndex = [
  ...registry.agents.map(a => ({ kind: "agent", id: a.value.handle, title: `@${a.value.handle} ${a.value.displayName}`, text: `${a.value.purpose} ${(a.value.capabilities ?? []).join(" ")} ${a.value.operator.name}`, url: `/@${a.value.handle}` })),
  ...registry.tools.map(t => ({ kind: "tool", id: t.value.slug, title: t.value.name, text: `${t.value.summary} ${t.value.vendor.name}`, url: `/tools/${t.value.slug}` })),
  ...registry.jobs.map(j => ({ kind: "job", id: j.value.id, title: j.value.name, text: `${j.value.outcome} ${(j.value.aliases ?? []).join(" ")} ${j.value.function}`, url: `/jobs/${j.value.id}` }))
];
write("search-index.json", json(searchIndex));

// ---- text surfaces, schemas, skill, well-knowns ---------------------------
write("llms.txt", renderLlmsTxt(registry));
write("llms-full.txt", renderLlmsFullTxt(registry, cov));
write("robots.txt", renderRobotsTxt());
cpSync(join(root, "schemas"), join(pub, "schemas"), { recursive: true });
const skill = readFileSync(join(root, "skills/public-agents/SKILL.md"), "utf8");
write("skills/public-agents/SKILL.md", skill);
write("SKILL.md", skill);
write(
  ".well-known/agent-skills/index.json",
  json({
    $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
    skills: [{ name: "public-agents", type: "skill-md", description: "How to read the Public Agents registry and register yourself in it.", url: "/skills/public-agents/SKILL.md", digest: sha256(skill) }]
  })
);
write(
  ".well-known/api-catalog",
  json({
    linkset: [
      {
        anchor: `${SITE}/`,
        "service-desc": [{ href: `${SITE}/openapi.json`, type: "application/openapi+json" }],
        "service-doc": [{ href: `${SITE}/contributing`, type: "text/html" }],
        describedby: [{ href: `${SITE}/llms.txt`, type: "text/markdown" }]
      }
    ]
  })
);
write(
  "openapi.json",
  json({
    openapi: "3.1.0",
    info: { title: "Public Agents registry", version: "1", description: "Read-only views of the registry. Changes are pull requests on https://github.com/PublicAgents/public-agents." },
    servers: [{ url: SITE }],
    paths: Object.fromEntries(
      [
        ["/agents.json", "Every agent, with its verification status and claimed jobs"],
        ["/@{handle}.json", "One agent entry as filed (validates against agent.schema.json)"],
        ["/@{handle}/card.json", "The registry's card for one agent"],
        ["/tools.json", "Every tool"],
        ["/tools/{slug}.json", "One tool entry as filed"],
        ["/jobs.json", "Every job with its coverage counts"],
        ["/jobs/{id}.json", "One job with every solution that claims it and the evidence by type, outcome and independence"],
        ["/functions.json", "The function list"],
        ["/evidence/{id}.json", "One evidence file as filed"],
        ["/changes.json", "The last hundred changes"],
        ["/search-index.json", "The search index"]
      ].map(([path, summary]) => [
        path,
        {
          get: {
            summary,
            parameters: [...path.matchAll(/\{(\w+)\}/g)].map(m => ({ name: m[1], in: "path", required: true, schema: { type: "string" } })),
            responses: { "200": { description: "OK", content: { "application/json": {} } } }
          }
        }
      ])
    )
  })
);

// ---- what the pages read ---------------------------------------------------
writeFileSync(
  join(data, "registry.json"),
  json({
    generatedAt,
    commit,
    functions: registry.functions.functions,
    agents: registry.agents.map(a => ({
      ...a.value,
      profileHtml: renderProfile(a.profile, { file: a.profileFile, ownDomains: a.value.domains, imageHosts: registry.imageHosts }).html,
      verification: verificationOf(a.value.handle)
    })),
    tools: registry.tools.map(t => ({
      ...t.value,
      profileHtml: renderProfile(t.profile, { file: t.profileFile, ownDomains: t.value.domains, imageHosts: registry.imageHosts }).html,
      verification: t.value.provenance === "third-party" ? { ok: false, method: "unclaimed", checkedAt: null } : verificationOf(t.value.slug)
    })),
    jobs: registry.jobs.map(j => j.value),
    evidence: [...registry.caseReports.map(e => ({ kind: "case-report", ...e.value })), ...registry.measured.map(e => ({ kind: "measured", ...e.value }))],
    coverage: Object.fromEntries([...cov.entries()].map(([id, c]) => [id, { counts: c.counts, cells: c.cells }])),
    solutions,
    changes
  })
);
const pages = [
  "/", "/agents", "/tools", "/jobs", "/search", "/register", "/contributing", "/about", "/schemas",
  ...registry.agents.map(a => `/@${a.value.handle}`),
  ...registry.tools.map(t => `/tools/${t.value.slug}`),
  ...registry.jobs.map(j => `/jobs/${j.value.id}`),
  ...registry.functions.functions.map(f => `/functions/${f.id}`),
  ...[...registry.caseReports, ...registry.measured].map(e => `/evidence/${e.value.id}`)
];
write(
  "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map(p => `  <url><loc>${SITE}${p}</loc></url>`).join("\n")}\n</urlset>\n`
);
writeFileSync(join(data, "handles.json"), json(Object.fromEntries(registry.agents.map(a => [normalizeHandle(a.value.handle), a.value.handle]))));
write("handles.json", json(Object.fromEntries(registry.agents.map(a => [normalizeHandle(a.value.handle), a.value.handle]))));

console.log(`✓ built data: ${registry.agents.length} agent(s), ${registry.tools.length} tool(s), ${registry.jobs.length} job(s), ${registry.caseReports.length + registry.measured.length} evidence item(s), ${searchIndex.length} search entries`);
