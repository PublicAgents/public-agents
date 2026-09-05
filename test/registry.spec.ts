import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadRegistry } from "../src/lib/registry.ts";
import { renderProfile } from "../src/lib/profile.ts";
import { classify } from "../src/scripts/pr-class.ts";
import { agentSchema, caseReportSchema, jobSchema, toolSchema } from "../src/schema/index.ts";

/** A registry on disk from a map of relative paths to contents; JSON values are canonicalised. */
function registry(files: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), "public-agents-"));
  const base: Record<string, unknown> = {
    "registry/functions.json": { functions: [{ id: "cs", name: "Customer service", description: "Answering, routing and resolving customer requests." }] },
    "registry/reserved-handles.json": ["admin", "reviewer"],
    "registry/image-hosts.json": ["images.example.com"],
    "registry/paid/README.md": "# closed\n"
  };
  for (const [path, value] of Object.entries({ ...base, ...files })) {
    const full = join(root, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n");
  }
  return root;
}

const JOB = {
  schemaVersion: 1,
  id: "cs.deflect-tier1",
  function: "cs",
  name: "Resolve tier-1 support requests without a human",
  outcome: "A routine customer request is answered correctly and closed with no agent handling it.",
  measures: ["deflection rate", "reopen rate within 7 days"],
  status: "active",
  created: "2026-09-05",
  updated: "2026-09-05",
  version: 1
};

const AGENT = {
  schemaVersion: 1,
  handle: "Prior",
  displayName: "Prior",
  kind: "autonomous",
  status: "active",
  purpose: "Grow an open-source A/B testing engine by experimenting in public.",
  operator: { name: "An Operator", kind: "person" },
  stack: { chassis: { name: "operon" }, harnesses: ["claude-code"], models: ["claude-fable-5-1"] },
  surfaces: { homepage: "https://prior.example-colony.com/" },
  domains: ["prior.example-colony.com"],
  maintainers: [{ github: "operator" }],
  jobs: [{ job: "cs.deflect-tier1", summary: "Answers routine questions on its own site." }],
  disclosure: { aiOperated: true, statement: "Prior is an autonomous agent; a human operator approves irreversible actions." },
  created: "2026-09-05",
  updated: "2026-09-05",
  version: 1
};

const TOOL = {
  schemaVersion: 1,
  slug: "exampleproduct",
  name: "ExampleProduct",
  kind: "open-source",
  status: "active",
  summary: "Adaptive A/B testing where the whole test lives in a URL.",
  vendor: { name: "Example", kind: "organization" },
  pricing: "open-source",
  surfaces: { homepage: "https://example.com/" },
  domains: ["example.com"],
  maintainers: [{ github: "operator" }],
  created: "2026-09-05",
  updated: "2026-09-05",
  version: 1
};

const codes = (root: string) => loadRegistry(root).refusals.map(r => r.code).sort();

describe("loadRegistry", () => {
  it("accepts a well-formed registry", () => {
    const root = registry({
      "registry/jobs/cs/cs.deflect-tier1.json": JOB,
      "registry/agents/prior/agent.json": AGENT,
      "registry/agents/prior/profile.md": "## In its own words\n\nI test things.\n",
      "registry/tools/exampleproduct/tool.json": TOOL,
      "registry/tools/exampleproduct/profile.md": "Stub.\n"
    });
    const loaded = loadRegistry(root);
    expect(loaded.refusals).toEqual([]);
    expect(loaded.agents[0].value.handle).toBe("Prior");
    expect(loaded.jobs[0].value.id).toBe("cs.deflect-tier1");
  });

  it("refuses by name: paths, uniqueness, reserved handles, references, profiles, the paid surface", () => {
    expect(codes(registry({ "registry/agents/someone/agent.json": AGENT, "registry/agents/someone/profile.md": "x\n" }))).toContain("PATH_MISMATCH");
    expect(codes(registry({ "registry/agents/prior/agent.json": AGENT }))).toContain("PROFILE_MISSING");
    expect(codes(registry({ "registry/agents/prior/agent.json": AGENT, "registry/agents/prior/profile.md": "x\n" }))).toContain("REF_UNRESOLVED");
    expect(
      codes(registry({ "registry/agents/reviewer/agent.json": { ...AGENT, handle: "reviewer" }, "registry/agents/reviewer/profile.md": "x\n", "registry/jobs/cs/cs.deflect-tier1.json": JOB }))
    ).toContain("HANDLE_RESERVED");
    expect(
      codes(registry({ "registry/agents/prior/agent.json": { ...AGENT, surfaces: { homepage: "https://elsewhere.example/" } }, "registry/agents/prior/profile.md": "x\n", "registry/jobs/cs/cs.deflect-tier1.json": JOB }))
    ).toContain("HOMEPAGE_NOT_IN_DOMAINS");
    expect(codes(registry({ "registry/paid/placement.json": {} }))).toContain("PAID_SURFACE_CLOSED");
    expect(codes(registry({ "registry/jobs/cs/cs.deflect-tier1.json": { ...JOB, extra: 1 } }))).toContain("UNKNOWN_FIELD");
    expect(codes(registry({ "registry/jobs/cs/cs.deflect-tier1.json": "{not json" }))).toContain("JSON_INVALID");
    expect(codes(registry({ "registry/jobs/cs/cs.deflect-tier1.json": JSON.stringify(JOB) }))).toContain("NOT_CANONICAL");
    expect(codes(registry({ "registry/jobs/hr/cs.deflect-tier1.json": JOB }))).toContain("PATH_MISMATCH");
    expect(codes(registry({ "registry/jobs/cs/cs.deflect-tier1.json": { ...JOB, function: "zz", id: "zz.deflect-tier1" } }))).toContain("FUNCTION_UNKNOWN");
    expect(codes(registry({ "registry/agents/prior/agent.json": AGENT, "registry/agents/prior/profile.md": "x\n", "registry/agents/prior/notes.txt": "x", "registry/jobs/cs/cs.deflect-tier1.json": JOB }))).toContain("STRAY_FILE");
  });

  it("refuses a supersede cycle and a duplicate handle", () => {
    const a = { ...JOB, status: "deprecated", supersededBy: "cs.other" };
    const b = { ...JOB, id: "cs.other", status: "deprecated", supersededBy: "cs.deflect-tier1" };
    expect(codes(registry({ "registry/jobs/cs/cs.deflect-tier1.json": a, "registry/jobs/cs/cs.other.json": b }))).toContain("SUPERSEDE_CYCLE");
    // Two directories cannot share a lowercase handle, but two files can
    // disagree with their directory: the uniqueness check still runs on
    // the normalized handle.
    const root = registry({
      "registry/jobs/cs/cs.deflect-tier1.json": JOB,
      "registry/agents/prior/agent.json": AGENT,
      "registry/agents/prior/profile.md": "x\n",
      "registry/agents/prior2/agent.json": { ...AGENT, handle: "PRIOR" },
      "registry/agents/prior2/profile.md": "x\n"
    });
    expect(codes(root)).toEqual(expect.arrayContaining(["HANDLE_TAKEN", "PATH_MISMATCH"]));
  });
});

describe("schemas", () => {
  it("require disclosure details when the enum is not none", () => {
    const report = {
      schemaVersion: 1,
      id: "cr-20260905-example",
      solution: { type: "tool", id: "exampleproduct" },
      job: "cs.deflect-tier1",
      reporter: { name: "Someone", github: "someone" },
      organization: { name: "Org", sizeBand: "1-10", industry: "software" },
      period: { from: "2026-08" },
      deployment: "An autonomous agent used the tool for every page it published for a month.",
      outcome: { verdict: "mixed", summary: "It worked, traffic was too low to conclude." },
      disclosure: { affiliation: "operator", compensation: "none", reseller: false },
      sources: ["https://example.com/"],
      created: "2026-09-05",
      updated: "2026-09-05",
      version: 1
    };
    const missing = caseReportSchema.safeParse(report);
    expect(missing.success).toBe(false);
    expect(missing.error?.issues.map(i => i.path.join("."))).toContain("disclosure.affiliationDetail");
    expect(caseReportSchema.safeParse({ ...report, disclosure: { ...report.disclosure, affiliationDetail: "runs both" } }).success).toBe(true);
  });

  it("pins the agent's disclosure, the tool's maintainers rule and the job's id prefix", () => {
    expect(agentSchema.safeParse({ ...AGENT, disclosure: { aiOperated: false, statement: AGENT.disclosure.statement } }).success).toBe(false);
    expect(toolSchema.safeParse({ ...TOOL, maintainers: [] }).success).toBe(false);
    expect(toolSchema.safeParse({ ...TOOL, maintainers: [], provenance: "third-party" }).success).toBe(true);
    expect(jobSchema.safeParse({ ...JOB, id: "hr.deflect-tier1" }).success).toBe(false);
    expect(jobSchema.safeParse({ ...JOB, status: "deprecated" }).success).toBe(false);
  });
});

describe("renderProfile", () => {
  const options = { file: "profile.md", ownDomains: ["prior.example-colony.com"], imageHosts: ["images.example.com"] };
  it("renders markdown and refuses html, h1, bad links and foreign images", () => {
    const ok = renderProfile("## Hello\n\nA [link](https://a.example) and ![i](https://prior.example-colony.com/x.png).\n", options);
    expect(ok.refusals).toEqual([]);
    expect(ok.html).toContain("<h2>Hello</h2>");
    const bad = renderProfile("# Title\n\n<script>x</script>\n\n[j](ftp://files.example/x) ![i](https://evil.example/x.png)\n", options);
    expect(bad.refusals.map(r => r.code).sort()).toEqual(["PROFILE_H1_FORBIDDEN", "PROFILE_HTML_FORBIDDEN", "PROFILE_IMAGE_HOST", "PROFILE_LINK_SCHEME"]);
    expect(bad.html).not.toContain("<script");
  });
  it("caps size and image count", () => {
    expect(renderProfile("x".repeat(17_000), options).refusals.map(r => r.code)).toContain("PROFILE_TOO_LARGE");
    const many = Array.from({ length: 9 }, (_, i) => `![${i}](https://images.example.com/${i}.png)`).join("\n\n");
    expect(renderProfile(many, options).refusals.map(r => r.code)).toContain("PROFILE_TOO_MANY_IMAGES");
  });
});

describe("classify", () => {
  it("is data only when every path is under the four data directories", () => {
    expect(classify(["registry/agents/prior/agent.json", "registry/jobs/cs/x.json"])).toBe("data");
    expect(classify(["registry/agents/prior/agent.json", "site/index.ts"])).toBe("code");
    expect(classify(["registry/functions.json"])).toBe("code");
    expect(classify([])).toBe("code");
  });
});
