#!/usr/bin/env node
/**
 * Which class a change is (docs/GOVERNANCE.md): `data` when every
 * changed path is under the four data directories and nothing is
 * deleted, else `code`. A deletion is code-class whatever its path
 * (docs/TAXONOMY.md: a job is never deleted, evidence deletions are
 * code-class), and a rename counts both of its paths. The colony's
 * merge door computes the same from GitHub's file list; this is the
 * local mirror for contributors and CI summaries.
 *
 *   node src/scripts/pr-class.ts --base <ref>
 */
import { execFileSync } from "node:child_process";

export const DATA_PREFIXES = ["registry/agents/", "registry/tools/", "registry/jobs/", "registry/evidence/"];

export interface Change {
  path: string;
  /** git's status letter: A, C, D, M, R. */
  status: string;
}

export function classify(changes: readonly Change[]): "data" | "code" {
  if (changes.length === 0) return "code";
  for (const change of changes) {
    if (change.status === "D") return "code";
    if (!DATA_PREFIXES.some(prefix => change.path.startsWith(prefix))) return "code";
  }
  return "data";
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "")) {
  const baseIndex = process.argv.indexOf("--base");
  const base = baseIndex >= 0 ? process.argv[baseIndex + 1] : "origin/main";
  const out = execFileSync("git", ["diff", "--name-status", "-M", "--diff-filter=ACDMR", `${base}...HEAD`], { encoding: "utf8" });
  const changes: Change[] = [];
  for (const line of out.split("\n").filter(Boolean)) {
    const [status, a, b] = line.split("\t");
    // A rename is a delete of the old path plus a create of the new one.
    if (status.startsWith("R")) changes.push({ path: a, status: "D" }, { path: b, status: "A" });
    else changes.push({ path: a, status: status[0] });
  }
  console.log(classify(changes));
}
