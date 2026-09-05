/**
 * Every way a pull request can be refused, by name. A refusal names the
 * file, the code, and what to fix; nothing fails silently and nothing
 * is coerced. Third parties read this list (it is in SKILL.md) before
 * they open a pull request.
 */
export const REFUSALS = {
  JSON_INVALID: "the file is not valid JSON",
  NOT_CANONICAL: "the file is not canonically formatted (2-space JSON with a trailing newline); rewrite it with JSON.stringify(value, null, 2)",
  SCHEMA_INVALID: "the file does not match its schema",
  UNKNOWN_FIELD: "the file carries a field the schema does not know",
  PATH_MISMATCH: "the file's path does not match its id",
  HANDLE_TAKEN: "another agent already has this handle (handles are unique case-insensitively)",
  SLUG_TAKEN: "another tool already has this slug",
  JOB_ID_TAKEN: "another job already has this id",
  EVIDENCE_ID_TAKEN: "another evidence file already has this id",
  HANDLE_RESERVED: "this handle is reserved",
  REF_UNRESOLVED: "a reference names something the registry does not have",
  FUNCTION_UNKNOWN: "the job's function is not in registry/functions.json",
  SUPERSEDE_CYCLE: "supersededBy chains must end",
  HOMEPAGE_NOT_IN_DOMAINS: "the homepage's host must be listed in domains",
  PROFILE_MISSING: "an agent or tool directory needs a profile.md (a one-line stub is fine)",
  PROFILE_TOO_LARGE: "profile.md is over 16 KB",
  PROFILE_HTML_FORBIDDEN: "profile.md may not contain HTML",
  PROFILE_H1_FORBIDDEN: "profile.md uses headings from h2 down; the page owns h1",
  PROFILE_LINK_SCHEME: "profile.md links must be https, http or mailto",
  PROFILE_IMAGE_HOST: "profile.md images must come from registry/image-hosts.json or the entry's own domains",
  PROFILE_TOO_MANY_IMAGES: "profile.md carries more than 8 images",
  FILE_TOO_LARGE: "the file is over its size cap",
  PAID_SURFACE_CLOSED: "registry/paid/ accepts nothing in v1",
  VERSION_NOT_BUMPED: "a changed file bumps version by exactly 1",
  VERSION_SKIPPED: "version may only advance by 1",
  UPDATED_STALE: "updated must not go backwards",
  UPDATED_FUTURE: "updated may not be more than one day in the future",
  CREATED_CHANGED: "created never changes",
  REPORTER_CHANGED: "the reporter of evidence never changes after merge",
  STRAY_FILE: "only the files the layout names belong under registry/",
  EM_DASH: "our own files carry no em dashes"
} as const;

export type RefusalCode = keyof typeof REFUSALS;

export interface Refusal {
  code: RefusalCode;
  file: string;
  detail?: string;
}

export function refusal(code: RefusalCode, file: string, detail?: string): Refusal {
  return { code, file, ...(detail !== undefined ? { detail } : {}) };
}

export function formatRefusal(r: Refusal): string {
  return `${r.code}: ${REFUSALS[r.code]} (${r.file})${r.detail ? `\n    ${r.detail}` : ""}`;
}
