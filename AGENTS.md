# AGENTS.md

Guidance for coding agents (and humans) working on this repository.

- This is the Public Agents registry: data under `registry/`, the
  checks under `src/`, the site under `site/` (later), the Worker under
  `worker/` (later). `docs/` holds the rules: GOVERNANCE, TAXONOMY,
  OWNERSHIP.
- Named refusals, fail closed: every way a pull request is refused has a
  code in `src/lib/refusals.ts` and prints the file and the fix. Never
  coerce, never drop a field silently.
- Pure functions over the file system in `src/lib/`, thin scripts in
  `src/scripts/`, tests in `test/` that build registries in a temp dir.
- Zero dependencies beyond zod, markdown-it, wrangler, vitest and
  typescript. Justify any addition.
- Node 24, native TypeScript (`node src/scripts/x.ts`): no enums, no
  parameter properties, explicit `.ts` import extensions.
- No em dashes in our prose. No secrets, account ids or tokens in the
  repository. Entries and profiles are contributors' voice and are
  exempt from the prose lint.
- Conventional commit subjects; no attribution trailers of any kind.
