#!/usr/bin/env node
/**
 * Every URL an entry names must answer, in its JSON and in its
 * profile.md alike (docs/OWNERSHIP.md fetch policy applies: https, the
 * address checked, a deadline, a byte cap).
 *
 *   node src/scripts/check-links.ts --changed-only --base <ref>   (a pull request: exit 1 on a dead link)
 *   node src/scripts/check-links.ts --all                         (the nightly audit: report, exit 0)
 */
import { execFileSync } from "node:child_process";
import { loadRegistry } from "../lib/registry.ts";
import { profileUrls } from "../lib/profile.ts";
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
function add(file: string, urls: Iterable<string>) {
  // https only, because the fetch policy is: a mailto: or http: link in a
  // profile is not a URL this check can answer for, and says so nowhere else.
  for (const url of urls) if (url.startsWith("https://") && !url.startsWith("https://public-agents.com/schemas/")) targets.push({ file, url });
}

for (const entry of [...registry.agents, ...registry.tools, ...registry.caseReports, ...registry.measured]) {
  if (!changed || changed.has(entry.file)) {
    const urls = new Set<string>();
    urlsOf(entry.value, urls);
    add(entry.file, urls);
  }
  // The profile is the other half of an entry and it is where the
  // citations behind its quotations live, so a URL named there is named
  // by the entry. It is gated on its own file: editing profile.md alone
  // changes which URLs the entry points a reader at.
  if ("profile" in entry && (!changed || changed.has(entry.profileFile))) {
    add(entry.profileFile, profileUrls(entry.profile));
  }
}

const results = await withConcurrency(4, targets.map(target => async () => {
  // HEAD first; GET only when HEAD failed outright or the server erred,
  // so a qualifying HEAD answer (405, 403, 401, 2xx, 3xx) is never
  // overwritten by a fallback that fares worse.
  let result = await guardedFetch(target.url, { method: "HEAD", timeoutMs: 10_000 });
  if (!result.ok || result.status >= 500 || result.status === 404) {
    const fallback = await guardedFetch(target.url, { method: "GET", timeoutMs: 10_000, maxBytes: 16 * 1024 });
    if (fallback.ok && (fallback.status < 400 || [401, 403, 405].includes(fallback.status))) result = fallback;
    else if (!result.ok) result = fallback;
  }
  // 405 is a URL that exists and answers a different method (an MCP or
  // API endpoint that takes POST): alive. 401 and 403 are alive too, an
  // endpoint that wants credentials still answers.
  const alive = result.ok && (result.status < 400 || [401, 403, 405].includes(result.status));
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
