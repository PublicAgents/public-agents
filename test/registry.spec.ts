import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadRegistry } from "../src/lib/registry.ts";
import { coverage, independenceLabel } from "../src/lib/coverage.ts";
import { profileUrls, renderProfile } from "../src/lib/profile.ts";
import { linkTargets } from "../src/lib/link-targets.ts";
import { canonicalUrl } from "../src/lib/links.ts";
import { classify } from "../src/scripts/pr-class.ts";
import { agentSchema, caseReportSchema, jobSchema, probeSchema, toolSchema } from "../src/schema/index.ts";

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

  it("carries a claim's sources through to the coverage cell", () => {
    const claim = { job: "cs.deflect-tier1", summary: "Answers routine questions; \"from $1 per outcome\" (pricing page).", source: "https://example.com/", sources: ["https://example.com/pricing"] };
    const root = registry({
      "registry/jobs/cs/cs.deflect-tier1.json": JOB,
      "registry/tools/exampleproduct/tool.json": { ...TOOL, jobs: [claim] },
      "registry/tools/exampleproduct/profile.md": "Stub.\n"
    });
    const loaded = loadRegistry(root);
    expect(loaded.refusals).toEqual([]);
    const cell = coverage(loaded).get("cs.deflect-tier1")?.cells.find(c => c.solution.type === "tool" && c.solution.id === "exampleproduct");
    expect(cell?.type).toBe("claim");
    expect(cell?.claim).toEqual({ summary: claim.summary, source: claim.source, sources: claim.sources });
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

  it("refuses a related edge that reads from only one end", () => {
    const a = { ...JOB, related: ["cs.other"] };
    const b = { ...JOB, id: "cs.other" };
    expect(codes(registry({ "registry/jobs/cs/cs.deflect-tier1.json": a, "registry/jobs/cs/cs.other.json": b }))).toContain("RELATED_NOT_SYMMETRIC");
    const back = { ...b, related: ["cs.deflect-tier1"] };
    expect(codes(registry({ "registry/jobs/cs/cs.deflect-tier1.json": a, "registry/jobs/cs/cs.other.json": back }))).not.toContain("RELATED_NOT_SYMMETRIC");
    // An unresolved id is one refusal, not two: it cannot name anyone back.
    const dangling = codes(registry({ "registry/jobs/cs/cs.deflect-tier1.json": { ...JOB, related: ["cs.nobody"] } }));
    expect(dangling).toContain("REF_UNRESOLVED");
    expect(dangling).not.toContain("RELATED_NOT_SYMMETRIC");
    // The refusal is a repair instruction, so the file and the detail are
    // the part that has to be right: they say which id to add and where.
    const refused = loadRegistry(registry({ "registry/jobs/cs/cs.deflect-tier1.json": a, "registry/jobs/cs/cs.other.json": b }))
      .refusals.filter(r => r.code === "RELATED_NOT_SYMMETRIC");
    expect(refused).toEqual([
      { code: "RELATED_NOT_SYMMETRIC", file: join("registry", "jobs", "cs", "cs.deflect-tier1.json"), detail: "related cs.other: add cs.deflect-tier1 to cs.other" }
    ]);
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

const PROBE = {
  schemaVersion: 1,
  id: "p-20260911-exampleproduct-402",
  subject: { type: "tool", id: "exampleproduct" },
  surface: "https://example.com/api/paid",
  question: "payment",
  request: { method: "GET", credentials: "none", payment: "none", from: "a cloud container, one IP" },
  observed: { status: 402, headers: { "payment-required": "eyJ4NDAyVmVyc2lvbiI6Mn0=" }, decoded: { x402Version: 2 }, protocols: ["x402"] },
  finding: "Answers 402 with an x402 version 2 challenge to a request with no credentials and no payment; no payment was made.",
  conductedBy: { name: "Researcher", github: "researcher" },
  independence: "independent",
  reproducibility: { command: "curl -s -D - -o /dev/null https://example.com/api/paid" },
  at: "2026-09-11T18:08Z",
  disclosure: { affiliation: "none", compensation: "none", reseller: false },
  created: "2026-09-11",
  updated: "2026-09-11",
  version: 1
};

describe("independence beside disclosure", () => {
  const label = (independence: string, disclosure: Record<string, unknown>) =>
    independenceLabel({ independence, disclosure } as never);

  it("never prints independent beside a disclosed affiliation", () => {
    expect(label("independent", { affiliation: "operator", compensation: "none", reseller: false }))
      .toBe("affiliated (declared independent; the disclosure above overrides it)");
    expect(label("independent", { affiliation: "none", compensation: "paid", reseller: false }))
      .toBe("affiliated (declared independent; the disclosure above overrides it)");
    expect(label("independent", { affiliation: "none", compensation: "none", reseller: true }))
      .toBe("affiliated (declared independent; the disclosure above overrides it)");
  });

  it("leaves an undisputed declaration alone, and never weakens a stronger admission", () => {
    expect(label("independent", { affiliation: "none", compensation: "none", reseller: false })).toBe("independent");
    expect(label("self", { affiliation: "vendor", compensation: "none", reseller: false })).toBe("self");
    expect(label("vendor-sponsored", { affiliation: "vendor", compensation: "paid", reseller: false })).toBe("vendor-sponsored");
  });
});

const PROTOCOLS = {
  protocols: [{ id: "x402", name: "x402", url: "https://x402.org/", summary: "HTTP 402 with a PAYMENT-REQUIRED header; the client retries with a signed payment.", source: "https://docs.x402.org/introduction" }]
};

describe("payments and probes", () => {
  it("loads the protocol vocabulary, a payments block and a probe, and refuses unknown or missing protocols by name", () => {
    const paid = { ...TOOL, payments: { machinePayable: true, protocols: ["x402"], methods: ["stablecoin"], humanBilling: "none", priceList: "https://example.com/pricing" } };
    const good = registry({
      "registry/payment-protocols.json": PROTOCOLS,
      "registry/tools/exampleproduct/tool.json": paid,
      "registry/tools/exampleproduct/profile.md": "Paid per request.\n",
      "registry/agents/prior/agent.json": { ...AGENT, jobs: undefined, payments: { sells: null, pays: { protocols: ["x402"], methods: ["stablecoin"], source: "https://prior.example-colony.com/CHARTER.md", spendGate: "First payment to a new merchant is held for the operator." } } },
      "registry/agents/prior/profile.md": "Prior.\n",
      "registry/evidence/probes/p-20260911-exampleproduct-402.json": PROBE
    });
    const loaded = loadRegistry(good);
    expect(loaded.refusals).toEqual([]);
    expect(loaded.paymentProtocols.protocols.map(p => p.id)).toEqual(["x402"]);
    expect(loaded.probes.map(p => p.value.id)).toEqual(["p-20260911-exampleproduct-402"]);

    const bad = registry({
      "registry/payment-protocols.json": { protocols: [...PROTOCOLS.protocols, ...PROTOCOLS.protocols] },
      "registry/tools/exampleproduct/tool.json": { ...paid, payments: { ...paid.payments, protocols: ["mpp"] } },
      "registry/tools/exampleproduct/profile.md": "Paid per request.\n",
      "registry/tools/other/tool.json": { ...TOOL, slug: "other", payments: { machinePayable: true, protocols: [], methods: [], humanBilling: "unknown" } },
      "registry/tools/other/profile.md": "Other.\n",
      "registry/evidence/probes/p-20260911-exampleproduct-402.json": { ...PROBE, subject: { type: "tool", id: "nobody" }, observed: { ...PROBE.observed, protocols: ["nope"] } }
    });
    expect(codes(bad)).toEqual(["PAYMENT_PROTOCOL_MISSING", "PAYMENT_PROTOCOL_TAKEN", "PAYMENT_PROTOCOL_UNKNOWN", "PAYMENT_PROTOCOL_UNKNOWN", "REF_UNRESOLVED"]);
  });

  it("pins the probe's shape: no credentials, no payment, a p- id, a minute-precise time", () => {
    expect(probeSchema.safeParse(PROBE).success).toBe(true);
    expect(probeSchema.safeParse({ ...PROBE, request: { ...PROBE.request, credentials: "api-key" } }).success).toBe(false);
    expect(probeSchema.safeParse({ ...PROBE, id: "m-20260911-exampleproduct-402" }).success).toBe(false);
    expect(probeSchema.safeParse({ ...PROBE, at: "2026-09-11" }).success).toBe(false);
    expect(probeSchema.safeParse({ ...PROBE, job: "cs.deflect-tier1" }).success).toBe(false);
  });

  it("refuses a probe that could publish a credential, an impossible minute, or no disclosure", () => {
    const { disclosure: _d, ...undisclosed } = PROBE;
    expect(probeSchema.safeParse(undisclosed).success).toBe(false);
    const messages = (p: unknown) => probeSchema.safeParse(p).error?.issues.map(i => i.message).join(" ") ?? "";
    // credential-bearing header names are refused even with a placeholder value
    expect(probeSchema.safeParse({ ...PROBE, observed: { ...PROBE.observed, headers: { "set-cookie": "[redacted]" } } }).success).toBe(false);
    expect(probeSchema.safeParse({ ...PROBE, observed: { ...PROBE.observed, headers: { authorization: "[redacted]" } } }).success).toBe(false);
    // values that look like a token are refused wherever they sit; the look-alikes are assembled at
    // run time so this file never carries one (the secret sweep on the way in refuses them too)
    const fakeBearer = ["Bearer", "abcdefghijklmnop.qrstuvwxyz"].join(" ");
    const fakeJwt = ["eyJhbGciOiJIUzI1NiJ9", "eyJzdWIiOiIxIn0", "abcdefghijklmnop"].join(".");
    expect(messages({ ...PROBE, observed: { ...PROBE.observed, headers: { "www-authenticate": fakeBearer } } })).toMatch(/credential/);
    expect(messages({ ...PROBE, observed: { ...PROBE.observed, decoded: { token: fakeJwt } } })).toMatch(/credential/);
    expect(messages({ ...PROBE, reproducibility: { command: `curl -H '${["Authorization:", fakeBearer].join(" ")}' https://example.com/api/paid` } })).toMatch(/credential/);
    expect(messages({ ...PROBE, reproducibility: { command: "curl -u user:pass https://example.com/api/paid" } })).toMatch(/credential/);
    expect(messages({ ...PROBE, reproducibility: { command: `curl 'https://example.com/api/paid?${["api", "key"].join("_")}=abc123'` } })).toMatch(/credential/);
    // a redacted challenge in a non-credential header is fine
    expect(probeSchema.safeParse({ ...PROBE, observed: { ...PROBE.observed, headers: { "www-authenticate": "Payment method=\"tempo\", nonce=[redacted]" } } }).success).toBe(true);
    // a real UTC minute, and not after the file's updated date
    expect(messages({ ...PROBE, at: "2026-13-40T99:99Z" })).toMatch(/real UTC minute/);
    // the published JSON Schema carries the same refusals as patterns, so an external validator agrees
    const published = JSON.parse(readFileSync("schemas/evidence-probe.schema.json", "utf8"));
    const headerNamePattern = new RegExp(published.properties.observed.properties.headers.propertyNames.pattern);
    expect(headerNamePattern.test("set-cookie")).toBe(false);
    expect(headerNamePattern.test("www-authenticate")).toBe(true);
    const valuePattern = new RegExp(published.properties.observed.properties.headers.additionalProperties.pattern);
    expect(valuePattern.test(fakeBearer)).toBe(false);
    expect(valuePattern.test("Payment method=\"tempo\", nonce=[redacted]")).toBe(true);
    // the patterns carry no flags, so case folding is spelled out: mixed-case look-alikes fail too
    const mixedCase = [
      ["GHp", "abcdefghijklmnopqrstuv"].join("_"),
      ["XOXB", "abcdefghijklmnop"].join("-"),
      ["SK_LIVE", "abcdefghijklmnopqrst"].join("_"),
      ["BEARER", "abcdefghijklmnop"].join(" ")
    ];
    for (const value of mixedCase) {
      expect(valuePattern.test(value)).toBe(false);
      expect(messages({ ...PROBE, observed: { ...PROBE.observed, headers: { "www-authenticate": value } } })).toMatch(/credential/);
    }
    const commandPattern = new RegExp(published.properties.reproducibility.properties.command.pattern);
    expect(commandPattern.test(`curl 'https://example.com/api/paid?${["API", "KEY"].join("_")}=abc123'`)).toBe(false);
    expect(commandPattern.test("curl -H 'AUTHORIZATION: [redacted]' https://example.com/api/paid")).toBe(false);
    expect(commandPattern.test("curl -U user:pass https://example.com/api/paid")).toBe(false);
    expect(commandPattern.test("curl -sI https://example.com/api/paid")).toBe(true);
    // the calendar is in the pattern too: month lengths and leap days
    const atPattern = new RegExp(published.properties.at.pattern);
    expect(atPattern.test("2026-13-40T99:99Z")).toBe(false);
    expect(atPattern.test("2026-02-30T10:00Z")).toBe(false);
    expect(atPattern.test("2026-04-31T10:00Z")).toBe(false);
    expect(atPattern.test("2026-02-29T10:00Z")).toBe(false);
    expect(atPattern.test("2028-02-29T10:00Z")).toBe(true);
    expect(atPattern.test("2100-02-29T10:00Z")).toBe(false);
    expect(atPattern.test("2000-02-29T10:00Z")).toBe(true);
    expect(atPattern.test("2026-12-31T23:59Z")).toBe(true);
    expect(messages({ ...PROBE, at: "2026-02-30T10:00Z" })).toMatch(/real UTC minute/);
    expect(messages({ ...PROBE, at: "2026-09-12T00:00Z" })).toMatch(/postdate/);
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

  it("lets a claim name the other pages it quotes, https only, one to eight", () => {
    const claim = { job: "cs.deflect-tier1", summary: "Answers routine questions; \"from $1 per outcome\" (pricing page).", source: "https://example.com/" };
    const withSources = (sources: unknown) => toolSchema.safeParse({ ...TOOL, jobs: [{ ...claim, sources }] }).success;
    expect(withSources(["https://example.com/pricing"])).toBe(true);
    expect(withSources(["https://example.com/pricing", "https://example.com/docs"])).toBe(true);
    expect(withSources([])).toBe(false);
    expect(withSources(["http://example.com/pricing"])).toBe(false);
    expect(withSources(Array.from({ length: 9 }, (_, i) => `https://example.com/${i}`))).toBe(false);
    expect(withSources("https://example.com/pricing")).toBe(false);
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

describe("profileUrls", () => {
  it("returns the links and images the renderer renders, and nothing that only looks like one", () => {
    const markdown = [
      "## Sources",
      "",
      "A [page](https://a.example/docs) and the same [page again](https://a.example/docs), an",
      "[endpoint](https://mcp.a.example/mcp), a [desk](mailto:help@a.example) and",
      "![shot](https://images.example.com/x.png).",
      "",
      "Quoted markup stays quoted: `[rate limits](/docs/api.md#rate-limiting)`, and a bare",
      "https://bare.example/not-a-link is prose, because linkify is off.",
      ""
    ].join("\n");
    expect(profileUrls(markdown)).toEqual([
      "https://a.example/docs",
      "https://mcp.a.example/mcp",
      "mailto:help@a.example",
      "https://images.example.com/x.png"
    ]);
  });
  it("finds a link inside a table cell and a blockquote", () => {
    const markdown = "| a | b |\n| --- | --- |\n| x | [t](https://t.example) |\n\n> quoting [s](https://s.example)\n";
    expect(profileUrls(markdown)).toEqual(["https://t.example", "https://s.example"]);
  });
});

describe("linkTargets", () => {
  // One entry with a live JSON URL and a profile whose citations are
  // somewhere else: the two halves are gated separately and that is the
  // whole point of the function.
  const entry = {
    file: "registry/tools/x/tool.json",
    value: { surfaces: { homepage: "https://x.example/" }, $schema: "https://public-agents.com/schemas/tool.schema.json" },
    profileFile: "registry/tools/x/profile.md",
    profile: "## Sources\n\nA [quoted page](https://docs.x.example/pricing) and a [desk](mailto:hi@x.example).\n"
  };
  const urls = (changed?: Set<string>) => linkTargets([entry], { changed }).map(t => `${t.file} ${t.url}`);

  it("fetches both halves when nothing is gated", () => {
    expect(urls()).toEqual([
      "registry/tools/x/tool.json https://x.example/",
      "registry/tools/x/profile.md https://docs.x.example/pricing"
    ]);
  });
  it("checks a profile when only the profile changed, which is the defect this closes", () => {
    expect(urls(new Set(["registry/tools/x/profile.md"]))).toEqual([
      "registry/tools/x/profile.md https://docs.x.example/pricing"
    ]);
  });
  it("checks the JSON when only the JSON changed", () => {
    expect(urls(new Set(["registry/tools/x/tool.json"]))).toEqual([
      "registry/tools/x/tool.json https://x.example/"
    ]);
  });
  it("checks nothing when neither half changed", () => {
    expect(urls(new Set(["docs/TAXONOMY.md"]))).toEqual([]);
  });
  it("compares a Windows loader path with git's forward slashes", () => {
    const windows = { ...entry, file: "registry\\tools\\x\\tool.json", profileFile: "registry\\tools\\x\\profile.md" };
    const got = linkTargets([windows], { changed: new Set(["registry/tools/x/profile.md"]) });
    expect(got.map(t => t.url)).toEqual(["https://docs.x.example/pricing"]);
  });
  it("flags surfaces.mcp for the protocol retry, in the JSON and in the profile that quotes it, and never surfaces.api", () => {
    const served = {
      file: "registry/tools/m/tool.json",
      value: { surfaces: { homepage: "https://m.example/", mcp: "https://mcp.m.example", api: "https://api.m.example/v1" } },
      profileFile: "registry/tools/m/profile.md",
      profile: "The server lives at [https://mcp.m.example/](https://mcp.m.example/) and its REST base at [https://api.m.example/v1](https://api.m.example/v1).\n"
    };
    const flags = Object.fromEntries(linkTargets([served]).map(t => [`${t.file} ${canonicalUrl(t.url)}`, t.mcp === true]));
    expect(flags["registry/tools/m/tool.json https://mcp.m.example/"]).toBe(true);
    expect(flags["registry/tools/m/profile.md https://mcp.m.example/"]).toBe(true);
    expect(flags["registry/tools/m/tool.json https://api.m.example/v1"]).toBe(false);
    expect(flags["registry/tools/m/tool.json https://m.example/"]).toBe(false);
  });
  it("keeps an uppercase scheme rather than dropping it silently, in JSON and in a profile alike", () => {
    const shouty = {
      file: "registry/tools/y/tool.json",
      value: { surfaces: { homepage: "HTTPS://y.example/" } },
      profileFile: "registry/tools/y/profile.md",
      profile: "A [page](HTTPS://docs.y.example/p) and the schema it cites, [schema](HTTPS://public-agents.com/schemas/tool.schema.json).\n"
    };
    expect(linkTargets([shouty]).map(t => t.url)).toEqual(["HTTPS://y.example/", "HTTPS://docs.y.example/p"]);
  });
  it("leaves mailto and http alone, and never fetches this registry's own schemas", () => {
    const mixed = {
      file: "registry/tools/z/tool.json",
      value: { a: "http://z.example/", b: "mailto:hi@z.example", c: "https://public-agents.com/schemas/tool.schema.json", d: "https://z.example/live" },
      profileFile: "registry/tools/z/profile.md",
      profile: "A [desk](mailto:hi@z.example) and an [old page](http://z.example/old).\n"
    };
    expect(linkTargets([mixed]).map(t => t.url)).toEqual(["https://z.example/live"]);
  });
  it("marks surfaces.mcp and surfaces.api as endpoints wherever the entry names them, and nothing else", () => {
    const e = {
      file: "registry/tools/w/tool.json",
      // The JSON spells the endpoint without a trailing slash and in capitals; the profile spells it the other way. Same server.
      value: { surfaces: { homepage: "https://w.example/", docs: "https://docs.w.example/", mcp: "HTTPS://mcp.w.example", api: "https://api.w.example/v1" } },
      profileFile: "registry/tools/w/profile.md",
      profile: "Measured at [the server](https://mcp.w.example/) and read on [the docs](https://docs.w.example/), not [v1's parent](https://api.w.example/).\n"
    };
    const got = linkTargets([e]).map(t => `${t.endpoint ? "endpoint" : "page"} ${t.url}`);
    expect(got).toEqual([
      "page https://w.example/",
      "page https://docs.w.example/",
      "endpoint HTTPS://mcp.w.example",
      "endpoint https://api.w.example/v1",
      "endpoint https://mcp.w.example/",
      "page https://docs.w.example/",
      "page https://api.w.example/"
    ]);
    const vocabulary = linkTargets([], { paymentProtocols: { protocols: [{ url: "https://x402.example/" }] } });
    expect(vocabulary.map(t => t.endpoint)).toEqual([false]);
  });
  it("gives a probe's own surface the record's POST and every other URL of the record none", () => {
    const probe = {
      file: "registry/evidence/probes/p-1.json",
      // The record spells its surface without a trailing slash in one place and with one in another: one server, so the method follows the URL.
      value: {
        id: "p-1",
        surface: "https://mcp.p.example/mcp",
        request: { method: "POST", credentials: "none", payment: "none", from: "x" },
        conductedBy: { url: "https://plumb.example/" },
        reproducibility: { command: "sh probe.sh https://mcp.p.example/mcp", artifactsUrl: "https://plumb.example/e/1.txt" }
      }
    };
    const got = linkTargets([probe]).map(t => `${t.method ?? "page"} ${t.url}`);
    expect(got).toEqual(["POST https://mcp.p.example/mcp", "page https://plumb.example/", "page https://plumb.example/e/1.txt"]);
    // No key at all on an ordinary target, so nothing downstream has to read `undefined`.
    expect(Object.keys(linkTargets([probe])[1])).toEqual(["file", "url", "endpoint"]);
    // A probe measured with a GET keeps the checker's own pair, and so does a tool entry however it names its endpoint.
    const asGet = { ...probe, value: { ...probe.value, request: { ...probe.value.request, method: "GET" } } };
    expect(linkTargets([asGet]).every(t => t.method === undefined)).toBe(true);
    const tool = { file: "registry/tools/t/tool.json", value: { surfaces: { mcp: "https://mcp.p.example/mcp" } } };
    expect(linkTargets([tool]).map(t => `${t.endpoint} ${t.method}`)).toEqual(["true undefined"]);
  });
  it("checks the payment-protocol vocabulary on its own path", () => {
    const opts = { paymentProtocols: { protocols: [{ url: "https://x402.example/" }] } };
    expect(linkTargets([], opts).map(t => t.url)).toEqual(["https://x402.example/"]);
    expect(linkTargets([], { ...opts, changed: new Set(["registry/payment-protocols.json"]) })).toHaveLength(1);
    expect(linkTargets([], { ...opts, changed: new Set(["docs/TAXONOMY.md"]) })).toHaveLength(0);
  });
});

describe("classify", () => {
  it("is data only when every path is under the four data directories", () => {
    const m = (path: string) => ({ path, status: "M" });
    expect(classify([m("registry/agents/prior/agent.json"), m("registry/jobs/cs/x.json")])).toBe("data");
    expect(classify([m("registry/agents/prior/agent.json"), m("site/index.ts")])).toBe("code");
    expect(classify([m("registry/functions.json")])).toBe("code");
    // A deletion is code-class whatever its path; a rename's old side is a deletion.
    expect(classify([{ path: "registry/evidence/case-reports/x.json", status: "D" }])).toBe("code");
    expect(classify([{ path: "registry/jobs/cs/old.json", status: "D" }, { path: "registry/jobs/cs/new.json", status: "A" }])).toBe("code");
    expect(classify([])).toBe("code");
    expect(classify([])).toBe("code");
  });
});

describe("generated schemas", () => {
  it("carry the https constraint on every URL field that validate enforces it on (issue #99)", async () => {
    const { z } = await import("zod");
    const { SCHEMAS } = await import("../src/schema/index.ts");
    const { httpsUrl } = await import("../src/schema/common.ts");
    // The runtime check is unchanged by the pattern: the scheme is case-insensitive, the protocol is not.
    expect(httpsUrl.safeParse("https://example.com/").success).toBe(true);
    expect(httpsUrl.safeParse("HTTPS://example.com/").success).toBe(true);
    expect(httpsUrl.safeParse("http://example.com/").success).toBe(false);
    const HTTPS = /^\^\[Hh\]\[Tt\]\[Tt\]\[Pp\]\[Ss\]:/;
    const walk = (node: unknown, path: string, out: { format: string[]; pattern: string[]; both: string[] }) => {
      if (Array.isArray(node)) node.forEach((n, i) => walk(n, `${path}[${i}]`, out));
      else if (node && typeof node === "object") {
        const o = node as Record<string, unknown>;
        const format = o.format === "uri";
        const pattern = typeof o.pattern === "string" && HTTPS.test(o.pattern);
        if (format) out.format.push(path);
        if (pattern) out.pattern.push(path);
        if (format && pattern) out.both.push(path);
        for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`, out);
      }
    };
    const counts: Record<string, number> = {};
    for (const [name, entry] of Object.entries(SCHEMAS)) {
      const out: { format: string[]; pattern: string[]; both: string[] } = { format: [], pattern: [], both: [] };
      walk(z.toJSONSchema(entry.schema, { target: "draft-2020-12", unrepresentable: "any" }), name, out);
      // Every URL field carries both annotations, or the walk names the one that lost either.
      expect(out.format).toEqual(out.both);
      expect(out.pattern).toEqual(out.both);
      counts[name] = out.both.length;
    }
    // Pinned per schema, so a field that loses both annotations fails here; a schema that gains a URL field updates this on purpose
    // (claim.sources added one to agent and tool: the items of the array are a URL field too).
    expect(counts).toEqual({ agent: 17, tool: 12, job: 0, function: 0, "evidence-case-report": 2, "evidence-measured": 3, "evidence-probe": 3, "payment-protocols": 3, "well-known": 0 });
  });
});
