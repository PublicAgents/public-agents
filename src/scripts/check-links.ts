#!/usr/bin/env node
/**
 * Every URL an entry names must answer, in its JSON and in its
 * profile.md alike (docs/OWNERSHIP.md fetch policy applies: https, the
 * address checked, a deadline, a byte cap).
 *
 *   node src/scripts/check-links.ts --changed-only --base <ref>   (a pull request: exit 1 on a dead link)
 *   node src/scripts/check-links.ts --all                         (the nightly audit: report, exit 0)
 *
 * Which URLs get fetched is decided in src/lib/link-targets.ts, and which
 * answers count as alive in src/lib/links.ts, where both can be tested
 * without a network or a git repository. This file is the network.
 */
import { execFileSync } from "node:child_process";
import { loadRegistry } from "../lib/registry.ts";
import { linkTargets, slash } from "../lib/link-targets.ts";
import { linkAnswers, linkDetail } from "../lib/links.ts";
import { guardedFetch, withConcurrency } from "../lib/net.ts";

const args = process.argv.slice(2);
const all = args.includes("--all");
const baseIndex = args.indexOf("--base");
const base = baseIndex >= 0 ? args[baseIndex + 1] : "origin/main";
const root = process.cwd();
const registry = loadRegistry(root);

const changed = all
  ? undefined
  : new Set(execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean).map(slash));

// Probes carry URLs too (the probed surface and the re-run command), so they
// answer to the same link discipline as case reports and measured results.
const targets = linkTargets(
  [...registry.agents, ...registry.tools, ...registry.caseReports, ...registry.measured, ...registry.probes],
  { changed, paymentProtocols: registry.paymentProtocols }
);

const results = await withConcurrency(4, targets.map(target => async () => {
  // HEAD first; GET only when HEAD failed outright or the server erred,
  // so a qualifying HEAD answer (405, 403, 401, 2xx, 3xx) is never
  // overwritten by a fallback that fares worse.
  let result = await guardedFetch(target.url, { method: "HEAD", timeoutMs: 10_000 });
  if (!result.ok || result.status >= 500 || result.status === 404) {
    const fallback = await guardedFetch(target.url, { method: "GET", timeoutMs: 10_000, maxBytes: 16 * 1024 });
    if (fallback.ok && (fallback.status < 400 || [401, 402, 403, 405].includes(fallback.status))) result = fallback;
    else if (!result.ok) result = fallback;
  }
  // Which answers count as alive is decided in src/lib/links.ts, where it
  // is tested: the status table, and the one exception for a machine
  // endpoint (surfaces.mcp, surfaces.api) that answers a browser's GET with
  // a redirect to its documentation on another host.
  const alive = linkAnswers(result, target.endpoint);
  return { ...target, dead: !alive, detail: linkDetail(result, alive) };
}));

const dead = results.filter(r => r.dead);
for (const r of results) console.log(`  ${r.dead ? "✗" : "✓"} ${r.url} (${r.file}) ${r.detail}`);
if (dead.length === 0) {
  console.log(`✓ ${results.length} link(s) answer`);
  process.exit(0);
}
// In report mode the summary IS the report, so it goes to stdout: the nightly
// audit pipes stdout through tee and greps the file for LINK_DEAD. Written to
// stderr, the lines never reach the file and the dead-links issue never fires.
const report = all ? console.log : console.error;
report(`${all ? "!" : "✗"} ${dead.length} dead link(s):`);
for (const r of dead) report(`  LINK_DEAD: ${r.url} in ${r.file}: ${r.detail}`);
process.exit(all ? 0 : 1);
