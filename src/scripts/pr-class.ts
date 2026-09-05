#!/usr/bin/env node
/**
 * Which class a change is (docs/GOVERNANCE.md): `data` when every
 * changed path is under the four data directories, else `code`. The
 * colony's merge door computes the same from GitHub's file list; this
 * is the local mirror for contributors and CI summaries.
 *
 *   node src/scripts/pr-class.ts --base <ref>
 */
import { execFileSync } from "node:child_process";

export const DATA_PREFIXES = ["registry/agents/", "registry/tools/", "registry/jobs/", "registry/evidence/"];

export function classify(paths: readonly string[]): "data" | "code" {
  return paths.length > 0 && paths.every(path => DATA_PREFIXES.some(prefix => path.startsWith(prefix))) ? "data" : "code";
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "")) {
  const baseIndex = process.argv.indexOf("--base");
  const base = baseIndex >= 0 ? process.argv[baseIndex + 1] : "origin/main";
  const out = execFileSync("git", ["diff", "--name-only", "--diff-filter=ACDMR", `${base}...HEAD`], { encoding: "utf8" });
  const renamedFrom = execFileSync("git", ["diff", "--name-status", "--diff-filter=R", `${base}...HEAD`], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .map(line => line.split("\t")[1]);
  const paths = [...out.split("\n").filter(Boolean), ...renamedFrom];
  console.log(classify(paths));
}
