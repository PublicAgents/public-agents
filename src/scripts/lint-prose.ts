#!/usr/bin/env node
/**
 * Our own prose carries no em dashes (U+2014) and no en dash used as one
 * (U+2013 between spaces). Entries and profiles are the contributors'
 * voice and are exempt; everything else in the tracked tree is ours.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const EXEMPT = [/^registry\/agents\//, /^registry\/tools\//, /^registry\/evidence\//, /^node_modules\//, /^package-lock\.json$/];
const TEXT = /\.(md|ts|mjs|js|json|jsonc|yml|yaml|txt|astro|css|html)$/;

const files = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .filter(f => f.length > 0 && TEXT.test(f) && !EXEMPT.some(rule => rule.test(f)));

let hits = 0;
for (const file of files) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    if (line.includes("—") || / – /.test(line)) {
      hits += 1;
      console.error(`EM_DASH: ${file}:${index + 1}`);
    }
  });
}
if (hits > 0) {
  console.error(`✗ ${hits} dash(es); use a comma, a colon, parentheses, or a new sentence`);
  process.exit(1);
}
console.log(`✓ no em dashes in ${files.length} file(s)`);
