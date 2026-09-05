#!/usr/bin/env node
/**
 * The door every pull request passes: `node src/scripts/validate.ts
 * [--base <ref>]`. Loads registry/, prints every refusal by name, and
 * with --base applies the change rules (version bumps, timestamps,
 * immutable fields) against that git ref. Exit 1 on any refusal.
 */
import { execFileSync } from "node:child_process";
import { loadRegistry, type Loaded } from "../lib/registry.ts";
import { formatRefusal, refusal, type Refusal } from "../lib/refusals.ts";

const args = process.argv.slice(2);
const baseIndex = args.indexOf("--base");
const base = baseIndex >= 0 ? args[baseIndex + 1] : undefined;
const root = process.cwd();

const registry = loadRegistry(root);
const refusals: Refusal[] = [...registry.refusals];

interface Versioned {
  created: string;
  updated: string;
  version: number;
}

function atBase(file: string): Versioned | undefined {
  if (!base) return undefined;
  try {
    const raw = execFileSync("git", ["show", `${base}:${file}`], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return JSON.parse(raw) as Versioned;
  } catch {
    return undefined;
  }
}

function todayPlusOne(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Change rules (docs/TAXONOMY.md): a changed file bumps version by
 * exactly one; updated never goes backwards or into the future beyond
 * a day; created never changes. A new file starts at version 1.
 */
function changeRules<T extends Versioned>(entry: Loaded<T>, extra?: (before: T) => void) {
  const before = atBase(entry.file) as T | undefined;
  const after = entry.value;
  if (after.updated > todayPlusOne()) refusals.push(refusal("UPDATED_FUTURE", entry.file, after.updated));
  if (!before) {
    if (base && after.version !== 1) refusals.push(refusal("VERSION_NOT_BUMPED", entry.file, "a new file starts at version 1"));
    return;
  }
  if (entry.raw === JSON.stringify(before, null, 2) + "\n") return; // unchanged
  if (after.version === before.version) refusals.push(refusal("VERSION_NOT_BUMPED", entry.file, `still ${before.version}`));
  else if (after.version !== before.version + 1) refusals.push(refusal("VERSION_SKIPPED", entry.file, `${before.version} to ${after.version}`));
  if (after.updated < before.updated) refusals.push(refusal("UPDATED_STALE", entry.file, `${after.updated} before ${before.updated}`));
  if (after.created !== before.created) refusals.push(refusal("CREATED_CHANGED", entry.file));
  if (extra) extra(before);
}

if (base) {
  for (const agent of registry.agents) changeRules(agent);
  for (const tool of registry.tools) changeRules(tool);
  for (const job of registry.jobs) changeRules(job);
  for (const report of registry.caseReports) {
    changeRules(report, before => {
      if ((before as typeof report.value).reporter.github !== report.value.reporter.github) refusals.push(refusal("REPORTER_CHANGED", report.file));
    });
  }
  for (const measured of registry.measured) {
    changeRules(measured, before => {
      if ((before as typeof measured.value).conductedBy.github !== measured.value.conductedBy.github) refusals.push(refusal("REPORTER_CHANGED", measured.file));
    });
  }
  // A profile-only edit bumps its sibling entry (the entry is the unit of versioning).
  for (const entry of [...registry.agents, ...registry.tools]) {
    let profileBefore: string | undefined;
    try {
      profileBefore = execFileSync("git", ["show", `${base}:${entry.profileFile}`], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      profileBefore = undefined;
    }
    const entryBefore = atBase(entry.file);
    if (profileBefore !== undefined && profileBefore !== entry.profile && entryBefore && entryBefore.version === entry.value.version) {
      refusals.push(refusal("VERSION_NOT_BUMPED", entry.file, "profile.md changed: bump the entry's version and updated"));
    }
  }
}

const counts = `${registry.agents.length} agent(s), ${registry.tools.length} tool(s), ${registry.jobs.length} job(s), ${registry.caseReports.length} case report(s), ${registry.measured.length} measured result(s)`;
if (refusals.length === 0) {
  console.log(`✓ registry valid: ${counts}${base ? ` (change rules against ${base})` : ""}`);
  process.exit(0);
}
console.error(`✗ ${refusals.length} refusal(s) in ${counts}:`);
for (const r of refusals) console.error(`  ${formatRefusal(r)}`);
process.exit(1);
