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
import { guardedFetch, httpsTransport, type Transport, withConcurrency } from "../lib/net.ts";

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
// shared is the requests.
//
// The DISTINCT ASKS are the unit of concurrency, not the citing files. Making
// the files the unit meant four adjacent citations of one slow URL could occupy
// all four slots waiting on a single request while independent URLs waited
// behind them, which is the opposite of what sharing the ask is for.
const byKey = new Map<string, (typeof targets)[number]>();
for (const target of targets) {
  const key = askKey(target);
  if (!byKey.has(key)) byKey.set(key, target);
}

// Every request the gate sends, counted at the transport, which is the one
// place a request cannot hide: one call of the transport is one connection to
// one checked address carrying one request. Counting one level up, around
// `guardedFetch`, understated the traffic, because a guarded fetch follows up
// to two same-host redirects inside itself (src/lib/net.ts) and each hop is
// another request that leaves this machine. The number of asks is NOT the
// number of requests either and must not be printed as if it were: one ask is
// between one and four guarded fetches (a POST, or HEAD then GET, then a
// handshake), twice that when a transient failure earns a second reading, and
// each of those fetches is one request plus one per redirect hop it followed.
let requests = 0;
const countedTransport: Transport = req => {
  requests += 1;
  return httpsTransport(req);
};
const countedFetch: typeof guardedFetch = (url, options) => guardedFetch(url, { ...options, transport: countedTransport });

const keys = [...byKey.keys()];
const answers = await withConcurrency(4, keys.map(key => () => askUrl(byKey.get(key)!, countedFetch)));
const asked = new Map(keys.map((key, index) => [key, answers[index]]));

const results = targets.map(target => {
  const { alive, result, reasked } = asked.get(askKey(target))!;
  const detail = linkDetail(result, alive);
  // A reference that failed once and answered once is neither a clean row nor a
  // dead one, and saying so is how anyone learns that a listed host is flaky
  // rather than healthy (issue #153, change 2).
  const reading = reasked === true ? (alive ? "answered on a second reading, a pause after a transient failure" : "failed twice, a pause apart") : "";
  return { ...target, dead: !alive, reasked: reasked === true, detail: [detail, reading].filter(Boolean).join(" ") };
});

const dead = results.filter(r => r.dead);
const flaky = results.filter(r => r.reasked && !r.dead);
for (const r of results) console.log(`  ${r.dead ? "✗" : "✓"} ${r.url} (${r.file}) ${r.detail}`);
// Every run says how many references needed a second reading, zero included, so
// the number is a series a reader can watch rather than a line that appears
// only on a bad night.
console.log(`  ${flaky.length} reference(s) answered only on a second reading`);
// Three different numbers, named as three different things, because conflating
// any two of them is how a reader gets a wrong idea of what this gate costs the
// hosts it asks: references are rows in the report, asks are distinct questions,
// requests are what actually left this machine, redirect hops included.
const scale = `${results.length} reference(s) over ${keys.length} distinct ask(s) in ${requests} request(s)`;
if (dead.length === 0) {
  console.log(`✓ ${scale}, all answering`);
  process.exit(0);
}
// In report mode the summary IS the report, so it goes to stdout: the nightly
// audit pipes stdout through tee and greps the file for LINK_DEAD. Written to
// stderr, the lines never reach the file and the dead-links issue never fires.
const report = all ? console.log : console.error;
report(`  ${scale}`);
report(`${all ? "!" : "✗"} ${dead.length} dead link(s):`);
for (const r of dead) report(`  LINK_DEAD: ${r.url} in ${r.file}: ${r.detail}`);
process.exit(all ? 0 : 1);
