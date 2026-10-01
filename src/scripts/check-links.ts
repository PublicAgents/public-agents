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
import { askKey, askUrl, linkDetail } from "../lib/links.ts";
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

// The order of requests behind one link, and which answers count, are
// decided in src/lib/links.ts, where the whole sequence is tested without
// a network: HEAD then GET, the wider table for a probe surface its record
// measured with a POST, the JSON-RPC handshake for a surfaces.mcp URL that
// answered neither browser method, a capped body judged by its status
// line, and the one exception for a machine endpoint that answers a
// browser's GET with a redirect to its documentation on another host.
// One ask per distinct ask (src/lib/links.ts: `askKey`), shared by every file
// that names it. The report still prints a line per file, because which file
// points a reader at a dead URL is the thing a contributor has to fix; what is
// shared is the requests. The map is read and written before the first await of
// each task, so the tasks running concurrently join one ask rather than racing
// to start several.
const asks = new Map<string, Promise<Awaited<ReturnType<typeof askUrl>>>>();
const results = await withConcurrency(4, targets.map(target => async () => {
  const key = askKey(target);
  let ask = asks.get(key);
  if (ask === undefined) {
    ask = askUrl(target, guardedFetch);
    asks.set(key, ask);
  }
  const { alive, result, reasked } = await ask;
  const detail = linkDetail(result, alive);
  // A reference that failed once and answered once is neither a clean row nor a
  // dead one, and saying so is how anyone learns that a listed host is flaky
  // rather than healthy (issue #153, change 2).
  const reading = reasked === true ? (alive ? "answered on a second reading, a pause after a transient failure" : "failed twice, a pause apart") : "";
  return { ...target, dead: !alive, reasked: reasked === true, detail: [detail, reading].filter(Boolean).join(" ") };
}));

const dead = results.filter(r => r.dead);
const flaky = results.filter(r => r.reasked && !r.dead);
for (const r of results) console.log(`  ${r.dead ? "✗" : "✓"} ${r.url} (${r.file}) ${r.detail}`);
// Every run says how many references needed a second reading, zero included, so
// the number is a series a reader can watch rather than a line that appears
// only on a bad night.
console.log(`  ${flaky.length} reference(s) answered only on a second reading`);
if (dead.length === 0) {
  // Both numbers, because they differ: the gate's cost to the hosts it asks is
  // the second one, and a reader of a CI log should be able to see that one
  // surface cited by ten records was asked once.
  console.log(`✓ ${results.length} link(s) answer (${asks.size} distinct ask(s))`);
  process.exit(0);
}
// In report mode the summary IS the report, so it goes to stdout: the nightly
// audit pipes stdout through tee and greps the file for LINK_DEAD. Written to
// stderr, the lines never reach the file and the dead-links issue never fires.
const report = all ? console.log : console.error;
report(`${all ? "!" : "✗"} ${dead.length} dead link(s):`);
for (const r of dead) report(`  LINK_DEAD: ${r.url} in ${r.file}: ${r.detail}`);
process.exit(all ? 0 : 1);
