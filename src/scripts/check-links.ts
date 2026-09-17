#!/usr/bin/env node
/**
 * Every URL an entry names must answer, in its JSON and in its
 * profile.md alike (docs/OWNERSHIP.md fetch policy applies: https, the
 * address checked, a deadline, a byte cap).
 *
 *   node src/scripts/check-links.ts --changed-only --base <ref>   (a pull request: exit 1 on a dead link)
 *   node src/scripts/check-links.ts --all                         (the nightly audit: report, exit 0)
 *
 * Which URLs get fetched is decided in src/lib/link-targets.ts, where it can
 * be tested without a network or a git repository. This file is the network.
 */
import { execFileSync } from "node:child_process";
import { loadRegistry } from "../lib/registry.ts";
import { linkTargets, slash } from "../lib/link-targets.ts";
import { guardedFetch, withConcurrency } from "../lib/net.ts";

/**
 * Failures that say something about this registry's fetch policy rather than
 * about the page. A cross-host redirect and a page over the byte cap are both
 * live pages a reader can open; the checker cannot follow them, which is a
 * different fact and is reported as one.
 */
const POLICY_REASONS = new Set(["redirect_forbidden", "too_large", "not_https", "address_forbidden"]);

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
  // 405 is a URL that exists and answers a different method (an MCP or
  // API endpoint that takes POST): alive. 401 and 403 are alive too, an
  // endpoint that wants credentials still answers. 402 is alive by the
  // same logic: a payable surface (a probe subject) answers with a price.
  const alive = result.ok && (result.status < 400 || [401, 402, 403, 405].includes(result.status));
  // A failure is reported as what it is. A page that answers 200 to a
  // browser but redirects across hosts, or runs past the byte cap, is not a
  // dead link: it is a live page this registry's own fetch policy cannot
  // follow (docs/OWNERSHIP.md). Both still fail the gate, because a citation
  // the registry cannot verify is a citation the registry cannot verify, but
  // an author who opens the URL and sees a working page deserves to be told
  // which of the two they are looking at.
  const code = alive ? undefined : !result.ok && POLICY_REASONS.has(result.reason) ? "LINK_UNFETCHABLE" : "LINK_DEAD";
  return { ...target, code, detail: result.ok ? `HTTP ${result.status}` : `${result.reason}: ${result.detail}` };
}));

const failed = results.filter(r => r.code);
for (const r of results) console.log(`  ${r.code ? "\u2717" : "\u2713"} ${r.url} (${r.file}) ${r.code ? r.detail : ""}`);
if (failed.length === 0) {
  console.log(`\u2713 ${results.length} link(s) answer`);
  process.exit(0);
}
const dead = failed.filter(r => r.code === "LINK_DEAD").length;
const unfetchable = failed.length - dead;
const parts = [dead ? `${dead} dead` : "", unfetchable ? `${unfetchable} unfetchable under the fetch policy` : ""].filter(Boolean);
console.error(`${all ? "!" : "\u2717"} ${failed.length} of ${results.length} link(s) did not answer: ${parts.join(", ")}`);
for (const r of failed) console.error(`  ${r.code}: ${r.url} in ${r.file}: ${r.detail}`);
process.exit(all ? 0 : 1);
