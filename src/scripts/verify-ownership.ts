#!/usr/bin/env node
/**
 * The ownership door (docs/OWNERSHIP.md): for every agent, tool or
 * evidence file a pull request touches, decide whether its author may.
 *
 *   node src/scripts/verify-ownership.ts --author <login> --base <ref> [--now <iso>]
 *
 * Authorization is against the BASE revision's maintainers; a create or
 * a re-proving update fetches the domain's proof. Editors
 * (registry/editors.json) maintain unclaimed third-party tool listings.
 * Exit 1 on any refusal, each named with the URL tried and the fix.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { decideWithProof, fetchProof, updateNeedsProof } from "../lib/ownership.ts";
import { withConcurrency } from "../lib/net.ts";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const author = flag("--author");
const base = flag("--base") ?? "origin/main";
const now = flag("--now") ?? new Date().toISOString();
if (!author) {
  console.error("usage: verify-ownership.ts --author <login> --base <ref>");
  process.exit(2);
}
const root = process.cwd();
const editors = existsSync(join(root, "registry/editors.json")) ? (JSON.parse(readFileSync(join(root, "registry/editors.json"), "utf8")) as string[]) : [];
// The live site is the record of when each entry's domain was last
// verified (the nightly audit refreshes it); unreachable means "prove".
const verification: { entries: Record<string, { verifiedAt: string }> } = { entries: {} };
for (const kind of ["agents", "tools"] as const) {
  try {
    const response = await fetch(`https://public-agents.com/${kind}.json`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) continue;
    const body = (await response.json()) as { agents?: Array<{ handle: string; verification: { ok: boolean; checkedAt: string | null } }>; tools?: Array<{ slug: string; verification: { ok: boolean; checkedAt: string | null } }> };
    for (const a of body.agents ?? []) if (a.verification.ok && a.verification.checkedAt) verification.entries[a.handle.toLowerCase()] = { verifiedAt: a.verification.checkedAt };
    for (const t of body.tools ?? []) if (t.verification.ok && t.verification.checkedAt) verification.entries[t.slug] = { verifiedAt: t.verification.checkedAt };
  } catch {
    /* prove instead */
  }
}

interface Change {
  status: string;
  path: string;
  from?: string;
}
const diff = execFileSync("git", ["diff", "--name-status", "-M", `${base}...HEAD`], { cwd: root, encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .map(line => {
    const [status, a, b] = line.split("\t");
    return status.startsWith("R") ? { status: "R", path: b, from: a } : { status, path: a };
  }) as Change[];

const entryDir = (path: string) => {
  const m = /^registry\/(agents|tools)\/([^/]+)\//.exec(path);
  return m ? { kind: m[1] as "agents" | "tools", dir: `registry/${m[1]}/${m[2]}` } : undefined;
};
const readHead = (path: string): unknown => (existsSync(join(root, path)) ? JSON.parse(readFileSync(join(root, path), "utf8")) : undefined);
const readBase = (path: string): unknown => {
  try {
    return JSON.parse(execFileSync("git", ["show", `${base}:${path}`], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  } catch {
    return undefined;
  }
};

interface Entry {
  handle?: string;
  slug?: string;
  domains: string[];
  maintainers: Array<{ github: string }>;
  provenance?: string;
}

const refusals: string[] = [];
const passes: string[] = [];
const tasks: Array<() => Promise<void>> = [];

// Entries: one decision per touched directory (agent.json and profile.md
// share it), a rename being a delete plus a create.
const dirs = new Map<string, { kind: "agents" | "tools"; deleted: boolean }>();
for (const change of diff) {
  const here = entryDir(change.path);
  if (here) dirs.set(here.dir, { kind: here.kind, deleted: dirs.get(here.dir)?.deleted ?? false });
  if (change.status === "D") {
    const gone = entryDir(change.path);
    if (gone) dirs.set(gone.dir, { kind: gone.kind, deleted: true });
  }
  if (change.from) {
    const from = entryDir(change.from);
    if (from && from.dir !== here?.dir) dirs.set(from.dir, { kind: from.kind, deleted: true });
  }
}

for (const [dir, info] of dirs) {
  const file = `${dir}/${info.kind === "agents" ? "agent.json" : "tool.json"}`;
  const head = readHead(file) as Entry | undefined;
  const before = readBase(file) as Entry | undefined;
  const name = (head ?? before)?.handle ?? (head ?? before)?.slug ?? dir.split("/").pop() ?? dir;
  const baseMaintainers = before?.maintainers.map(m => m.github) ?? [];
  const isEditor = editors.includes(author);

  if (!head && before) {
    // A deletion: only a base maintainer (or an editor of an unclaimed listing).
    if (baseMaintainers.includes(author) || (before.provenance === "third-party" && isEditor)) passes.push(`${dir}: deleted by a maintainer`);
    else refusals.push(`OWNERSHIP_UNVERIFIED: ${dir} deleted by ${author}, who is not a maintainer of the base entry`);
    continue;
  }
  if (!head) continue;
  const nextMaintainers = head.maintainers.map(m => m.github);

  if (!before) {
    // A create. An unclaimed third-party tool listing by an editor needs no proof.
    if (info.kind === "tools" && head.provenance === "third-party" && nextMaintainers.length === 0) {
      if (isEditor) passes.push(`${dir}: unclaimed listing created by an editor`);
      else refusals.push(`OWNERSHIP_UNVERIFIED: ${dir} is an unclaimed listing and ${author} is not in registry/editors.json`);
      continue;
    }
    tasks.push(async () => {
      const proof = await fetchProof(head.domains[0], name, {});
      const decision = decideWithProof({ name, author, maintainers: nextMaintainers, proof });
      if (decision.ok) passes.push(`${dir}: created, proven by ${decision.via} on ${head.domains[0]}`);
      else refusals.push(`${decision.code}: ${dir}: ${decision.detail} (looked at https://${head.domains[0]}/.well-known/public-agents.json and _public-agents.${head.domains[0]} TXT)`);
    });
    continue;
  }

  // An update.
  if (info.kind === "tools" && before.provenance === "third-party" && baseMaintainers.length === 0) {
    if (nextMaintainers.length === 0) {
      if (isEditor) passes.push(`${dir}: unclaimed listing edited by an editor`);
      else refusals.push(`OWNERSHIP_UNVERIFIED: ${dir} is an unclaimed listing and ${author} is not in registry/editors.json`);
      continue;
    }
    // A claim: the vendor takes it over with proof.
    tasks.push(async () => {
      const proof = await fetchProof(head.domains[0], name, {});
      const decision = decideWithProof({ name, author, maintainers: nextMaintainers, proof });
      if (decision.ok) passes.push(`${dir}: claimed by ${author}, proven by ${decision.via}`);
      else refusals.push(`${decision.code}: ${dir}: ${decision.detail}`);
    });
    continue;
  }
  const verdict = updateNeedsProof({
    author,
    baseMaintainers,
    nextMaintainers,
    baseDomain: before.domains[0],
    nextDomain: head.domains[0],
    lastVerified: verification.entries?.[name.toLowerCase()]?.verifiedAt,
    now
  });
  if (verdict.decision === "refuse") {
    refusals.push(`${verdict.code}: ${dir}: ${verdict.detail}; strangers file evidence or an issue instead`);
    continue;
  }
  if (verdict.decision === "pass") {
    passes.push(`${dir}: updated by a maintainer`);
    continue;
  }
  tasks.push(async () => {
    const proof = await fetchProof(head.domains[0], name, {});
    const decision = decideWithProof({ name, author, maintainers: nextMaintainers, proof });
    if (decision.ok) passes.push(`${dir}: updated (${verdict.why}), re-proven by ${decision.via}`);
    else {
      const code = decision.code === "OWNERSHIP_AUTHOR_NOT_LISTED" && baseMaintainers.includes(author) ? "OWNERSHIP_REVOKED" : decision.code;
      refusals.push(`${code}: ${dir}: ${verdict.why}; ${decision.detail}`);
    }
  });
}

// Evidence: the reporter is the author, on create and on update.
for (const change of diff) {
  if (!/^registry\/evidence\/(case-reports|measured)\//.test(change.path) || change.status === "D") continue;
  const head = readHead(change.path) as { reporter?: { github: string }; conductedBy?: { github: string } } | undefined;
  if (!head) continue;
  const reporter = head.reporter?.github ?? head.conductedBy?.github;
  if (reporter !== author) refusals.push(`REPORTER_MISMATCH: ${change.path}: the reporter is ${reporter ?? "unset"}, the author is ${author}`);
  else passes.push(`${change.path}: filed by its reporter`);
}

await withConcurrency(4, tasks);

for (const line of passes) console.log(`  ✓ ${line}`);
if (refusals.length === 0) {
  console.log(`✓ ownership verified for ${author} (${passes.length} decision(s))`);
  process.exit(0);
}
for (const line of refusals) console.error(`  ✗ ${line}`);
console.error(`✗ ${refusals.length} ownership refusal(s)`);
process.exit(1);
