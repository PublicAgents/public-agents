#!/usr/bin/env node
/**
 * Every URL an entry names must answer (docs/OWNERSHIP.md fetch policy
 * applies: https, the address checked, a deadline, a byte cap).
 *
 *   node src/scripts/check-links.ts --changed-only --base <ref>   (a pull request: exit 1 on a dead link)
 *   node src/scripts/check-links.ts --all                         (the nightly audit: report, exit 0)
 */
import { execFileSync } from "node:child_process";
import { loadRegistry } from "../lib/registry.ts";
import { guardedFetch, withConcurrency } from "../lib/net.ts";

const args = process.argv.slice(2);
const all = args.includes("--all");
const baseIndex = args.indexOf("--base");
const base = baseIndex >= 0 ? args[baseIndex + 1] : "origin/main";
const root = process.cwd();
const registry = loadRegistry(root);

const changed = all
  ? undefined
  : new Set(execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean));

function urlsOf(value: unknown, out: Set<string>) {
  if (typeof value === "string") {
    if (/^https:\/\//.test(value)) out.add(value);
  } else if (Array.isArray(value)) value.forEach(v => urlsOf(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach(v => urlsOf(v, out));
}

const targets: Array<{ file: string; url: string }> = [];
// Probes carry URLs too (the probed surface and the re-run command), so they
// answer to the same link discipline as case reports and measured results.
for (const entry of [...registry.agents, ...registry.tools, ...registry.caseReports, ...registry.measured, ...registry.probes]) {
  if (changed && !changed.has(entry.file)) continue;
  const urls = new Set<string>();
  urlsOf(entry.value, urls);
  for (const url of urls) if (!url.startsWith("https://public-agents.com/schemas/")) targets.push({ file: entry.file, url });
}
// The payment-protocol vocabulary is one file, not a per-entry record; its
// url/spec/source must stay live like any URL the registry publishes.
const protocolsFile = "registry/payment-protocols.json";
if (!changed || changed.has(protocolsFile)) {
  const urls = new Set<string>();
  urlsOf(registry.paymentProtocols, urls);
  for (const url of urls) if (!url.startsWith("https://public-agents.com/schemas/")) targets.push({ file: protocolsFile, url });
}

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
  const dead = !alive;
  return { ...target, dead, detail: result.ok ? `HTTP ${result.status}` : `${result.reason}: ${result.detail}` };
}));

const dead = results.filter(r => r.dead);
for (const r of results) console.log(`  ${r.dead ? "✗" : "✓"} ${r.url} (${r.file}) ${r.dead ? r.detail : ""}`);
if (dead.length === 0) {
  console.log(`✓ ${results.length} link(s) answer`);
  process.exit(0);
}
console.error(`${all ? "!" : "✗"} ${dead.length} dead link(s):`);
for (const r of dead) console.error(`  LINK_DEAD: ${r.url} in ${r.file}: ${r.detail}`);
process.exit(all ? 0 : 1);
