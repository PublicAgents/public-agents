import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { ZodType } from "zod";
import { agentSchema, caseReportSchema, functionsSchema, jobSchema, measuredSchema, toolSchema } from "../schema/index.ts";
import type { AgentEntry, CaseReport, FunctionsFile, JobEntry, Measured, ToolEntry } from "../schema/index.ts";
import { isReserved, normalizeHandle } from "./handles.ts";
import { renderProfile } from "./profile.ts";
import { refusal, type Refusal } from "./refusals.ts";

/**
 * Read registry/ from disk into typed entries plus every refusal the
 * layout, the schemas and the cross-references produce. Pure over the
 * file system: the validate script prints, the build renders, both
 * from this.
 */

export const ENTRY_MAX_BYTES = 32_000;

export interface Loaded<T> {
  file: string;
  raw: string;
  value: T;
}

export interface Registry {
  root: string;
  functions: FunctionsFile;
  reserved: string[];
  imageHosts: string[];
  agents: Array<Loaded<AgentEntry> & { profile: string; profileFile: string }>;
  tools: Array<Loaded<ToolEntry> & { profile: string; profileFile: string }>;
  jobs: Loaded<JobEntry>[];
  caseReports: Loaded<CaseReport>[];
  measured: Loaded<Measured>[];
  refusals: Refusal[];
}

function readJson<T>(root: string, file: string, schema: ZodType<T>, refusals: Refusal[]): Loaded<T> | undefined {
  const rel = relative(root, file);
  const raw = readFileSync(file, "utf8");
  if (Buffer.byteLength(raw) > ENTRY_MAX_BYTES) refusals.push(refusal("FILE_TOO_LARGE", rel));
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    refusals.push(refusal("JSON_INVALID", rel, String(error).slice(0, 200)));
    return undefined;
  }
  const canonical = JSON.stringify(parsed, null, 2) + "\n";
  if (canonical !== raw) refusals.push(refusal("NOT_CANONICAL", rel));
  const result = schema.safeParse(parsed);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const path = issue.path.map(String).join(".") || "(root)";
      const code = issue.code === "unrecognized_keys" ? "UNKNOWN_FIELD" : "SCHEMA_INVALID";
      refusals.push(refusal(code, rel, `${path}: ${issue.message}`));
    }
    return undefined;
  }
  return { file: rel, raw, value: result.data };
}

function listDirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(name => !name.startsWith(".") && statSync(join(dir, name)).isDirectory())
    .sort();
}

function listFiles(dir: string, suffix: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(name => name.endsWith(suffix))
    .sort()
    .map(name => join(dir, name));
}

export function loadRegistry(root: string): Registry {
  const refusals: Refusal[] = [];
  const dir = (...parts: string[]) => join(root, "registry", ...parts);

  const functions = readJson(root, dir("functions.json"), functionsSchema, refusals)?.value ?? { functions: [] };
  const reserved = JSON.parse(readFileSync(dir("reserved-handles.json"), "utf8")) as string[];
  const imageHosts = JSON.parse(readFileSync(dir("image-hosts.json"), "utf8")) as string[];
  const functionIds = new Set(functions.functions.map(f => f.id));

  // Agents: one directory per lowercase handle, agent.json + profile.md.
  const agents: Registry["agents"] = [];
  for (const name of listDirs(dir("agents"))) {
    const file = dir("agents", name, "agent.json");
    const rel = relative(root, file);
    if (!existsSync(file)) {
      refusals.push(refusal("STRAY_FILE", relative(root, dir("agents", name)), "a directory without agent.json"));
      continue;
    }
    for (const stray of readdirSync(dir("agents", name))) {
      if (stray !== "agent.json" && stray !== "profile.md") refusals.push(refusal("STRAY_FILE", relative(root, dir("agents", name, stray))));
    }
    const loaded = readJson(root, file, agentSchema, refusals);
    if (!loaded) continue;
    if (normalizeHandle(loaded.value.handle) !== name) refusals.push(refusal("PATH_MISMATCH", rel, `handle ${loaded.value.handle} in directory ${name}`));
    if (isReserved(loaded.value.handle, reserved)) refusals.push(refusal("HANDLE_RESERVED", rel, loaded.value.handle));
    const profileFile = dir("agents", name, "profile.md");
    if (!existsSync(profileFile)) {
      refusals.push(refusal("PROFILE_MISSING", relative(root, profileFile)));
      agents.push({ ...loaded, profile: "", profileFile: relative(root, profileFile) });
      continue;
    }
    const profile = readFileSync(profileFile, "utf8");
    refusals.push(...renderProfile(profile, { file: relative(root, profileFile), ownDomains: loaded.value.domains, imageHosts }).refusals);
    agents.push({ ...loaded, profile, profileFile: relative(root, profileFile) });
  }

  const tools: Registry["tools"] = [];
  for (const name of listDirs(dir("tools"))) {
    const file = dir("tools", name, "tool.json");
    const rel = relative(root, file);
    if (!existsSync(file)) {
      refusals.push(refusal("STRAY_FILE", relative(root, dir("tools", name)), "a directory without tool.json"));
      continue;
    }
    for (const stray of readdirSync(dir("tools", name))) {
      if (stray !== "tool.json" && stray !== "profile.md") refusals.push(refusal("STRAY_FILE", relative(root, dir("tools", name, stray))));
    }
    const loaded = readJson(root, file, toolSchema, refusals);
    if (!loaded) continue;
    if (loaded.value.slug !== name) refusals.push(refusal("PATH_MISMATCH", rel, `slug ${loaded.value.slug} in directory ${name}`));
    const profileFile = dir("tools", name, "profile.md");
    if (!existsSync(profileFile)) {
      refusals.push(refusal("PROFILE_MISSING", relative(root, profileFile)));
      tools.push({ ...loaded, profile: "", profileFile: relative(root, profileFile) });
      continue;
    }
    const profile = readFileSync(profileFile, "utf8");
    refusals.push(...renderProfile(profile, { file: relative(root, profileFile), ownDomains: loaded.value.domains, imageHosts }).refusals);
    tools.push({ ...loaded, profile, profileFile: relative(root, profileFile) });
  }

  const jobs: Registry["jobs"] = [];
  for (const fn of listDirs(dir("jobs"))) {
    for (const file of listFiles(dir("jobs", fn), ".json")) {
      const loaded = readJson(root, file, jobSchema, refusals);
      if (!loaded) continue;
      const expected = `${loaded.value.id}.json`;
      if (!file.endsWith(`/${fn}/${expected}`)) refusals.push(refusal("PATH_MISMATCH", loaded.file, `expected registry/jobs/${loaded.value.function}/${expected}`));
      if (loaded.value.function !== fn) refusals.push(refusal("PATH_MISMATCH", loaded.file, `function ${loaded.value.function} in directory ${fn}`));
      if (!functionIds.has(loaded.value.function)) refusals.push(refusal("FUNCTION_UNKNOWN", loaded.file, loaded.value.function));
      jobs.push(loaded);
    }
  }

  const caseReports: Registry["caseReports"] = [];
  for (const file of listFiles(dir("evidence", "case-reports"), ".json")) {
    const loaded = readJson(root, file, caseReportSchema, refusals);
    if (!loaded) continue;
    if (!file.endsWith(`/${loaded.value.id}.json`)) refusals.push(refusal("PATH_MISMATCH", loaded.file, loaded.value.id));
    caseReports.push(loaded);
  }
  const measured: Registry["measured"] = [];
  for (const file of listFiles(dir("evidence", "measured"), ".json")) {
    const loaded = readJson(root, file, measuredSchema, refusals);
    if (!loaded) continue;
    if (!file.endsWith(`/${loaded.value.id}.json`)) refusals.push(refusal("PATH_MISMATCH", loaded.file, loaded.value.id));
    measured.push(loaded);
  }

  // The paid surface is closed in v1: nothing but its README.
  if (existsSync(dir("paid"))) {
    for (const name of readdirSync(dir("paid"))) {
      if (name !== "README.md") refusals.push(refusal("PAID_SURFACE_CLOSED", relative(root, dir("paid", name))));
    }
  }

  // Uniqueness.
  unique(agents.map(a => [normalizeHandle(a.value.handle), a.file]), "HANDLE_TAKEN", refusals);
  unique(tools.map(t => [t.value.slug, t.file]), "SLUG_TAKEN", refusals);
  unique(jobs.map(j => [j.value.id, j.file]), "JOB_ID_TAKEN", refusals);
  unique([...caseReports, ...measured].map(e => [e.value.id, e.file]), "EVIDENCE_ID_TAKEN", refusals);

  // Cross-references.
  const jobIds = new Set(jobs.map(j => j.value.id));
  const agentHandles = new Set(agents.map(a => normalizeHandle(a.value.handle)));
  const toolSlugs = new Set(tools.map(t => t.value.slug));
  for (const entry of [...agents, ...tools]) {
    for (const claim of entry.value.jobs ?? []) {
      if (!jobIds.has(claim.job)) refusals.push(refusal("REF_UNRESOLVED", entry.file, `jobs[].job ${claim.job}`));
    }
    const home = new URL(entry.value.surfaces.homepage).hostname.toLowerCase();
    if (!entry.value.domains.includes(home)) refusals.push(refusal("HOMEPAGE_NOT_IN_DOMAINS", entry.file, home));
  }
  for (const job of jobs) {
    for (const rel of job.value.related ?? []) if (!jobIds.has(rel)) refusals.push(refusal("REF_UNRESOLVED", job.file, `related ${rel}`));
    if (job.value.supersededBy && !jobIds.has(job.value.supersededBy)) refusals.push(refusal("REF_UNRESOLVED", job.file, `supersededBy ${job.value.supersededBy}`));
  }
  const byId = new Map(jobs.map(j => [j.value.id, j.value]));
  for (const job of jobs) {
    const seen = new Set<string>();
    let cursor: string | null | undefined = job.value.supersededBy;
    while (cursor) {
      if (seen.has(cursor) || cursor === job.value.id) {
        refusals.push(refusal("SUPERSEDE_CYCLE", job.file));
        break;
      }
      seen.add(cursor);
      cursor = byId.get(cursor)?.supersededBy;
    }
  }
  for (const evidence of [...caseReports, ...measured]) {
    if (!jobIds.has(evidence.value.job)) refusals.push(refusal("REF_UNRESOLVED", evidence.file, `job ${evidence.value.job}`));
    const { type, id } = evidence.value.solution;
    const known = type === "agent" ? agentHandles.has(normalizeHandle(id)) : toolSlugs.has(id);
    if (!known) refusals.push(refusal("REF_UNRESOLVED", evidence.file, `solution ${type}:${id}`));
  }

  return { root, functions, reserved, imageHosts, agents, tools, jobs, caseReports, measured, refusals: dedupeRefusals(refusals) };
}

function unique(pairs: Array<[string, string]>, code: "HANDLE_TAKEN" | "SLUG_TAKEN" | "JOB_ID_TAKEN" | "EVIDENCE_ID_TAKEN", out: Refusal[]) {
  const seen = new Map<string, string>();
  for (const [key, file] of pairs) {
    const first = seen.get(key);
    if (first !== undefined) out.push(refusal(code, file, `also ${first}`));
    else seen.set(key, file);
  }
}

function dedupeRefusals(list: Refusal[]): Refusal[] {
  const seen = new Set<string>();
  return list.filter(r => {
    const key = `${r.code}|${r.file}|${r.detail ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
