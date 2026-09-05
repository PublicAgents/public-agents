#!/usr/bin/env node
/**
 * The JSON Schemas third parties validate against before opening a pull
 * request, generated from the zod sources into schemas/ and served at
 * /schemas/<name>.schema.json. `--check` fails when the committed files
 * are stale (SCHEMAS_STALE), so the two never drift.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { SCHEMAS } from "../schema/index.ts";

const check = process.argv.includes("--check");
const dir = join(process.cwd(), "schemas");
mkdirSync(dir, { recursive: true });

const index: Array<{ name: string; url: string; description: string }> = [];
let stale = 0;
for (const [name, entry] of Object.entries(SCHEMAS)) {
  const json = z.toJSONSchema(entry.schema, { target: "draft-2020-12", unrepresentable: "any" });
  const withId = { $id: `https://public-agents.com/schemas/${name}.schema.json`, title: name, description: entry.description, ...json };
  const text = JSON.stringify(withId, null, 2) + "\n";
  const file = join(dir, `${name}.schema.json`);
  index.push({ name, url: `/schemas/${name}.schema.json`, description: entry.description });
  if (check) {
    let current = "";
    try {
      current = readFileSync(file, "utf8");
    } catch {
      current = "";
    }
    if (current !== text) {
      stale += 1;
      console.error(`SCHEMAS_STALE: schemas/${name}.schema.json differs from the zod source; run npm run gen:schemas`);
    }
  } else {
    writeFileSync(file, text);
  }
}
const indexText = JSON.stringify({ schemas: index }, null, 2) + "\n";
if (check) {
  let current = "";
  try {
    current = readFileSync(join(dir, "index.json"), "utf8");
  } catch {
    current = "";
  }
  if (current !== indexText) {
    stale += 1;
    console.error("SCHEMAS_STALE: schemas/index.json differs; run npm run gen:schemas");
  }
  if (stale > 0) process.exit(1);
  console.log(`✓ ${index.length} schema(s) current`);
} else {
  writeFileSync(join(dir, "index.json"), indexText);
  console.log(`✓ wrote ${index.length} schema(s) to schemas/`);
}
