/**
 * The link checker's policy, kept apart from the script so it can be tested:
 * which URLs of an entry are machine endpoints, and which answers count as alive.
 */
import type { GuardedResult } from "./net.ts";

/** The machine endpoints of an entry (`surfaces.mcp`, `surfaces.api`): URLs an agent POSTs to, not pages. */
export function endpointsOf(value: unknown): Set<string> {
  const out = new Set<string>();
  const surfaces = (value as { surfaces?: { mcp?: unknown; api?: unknown } } | undefined)?.surfaces;
  for (const v of [surfaces?.mcp, surfaces?.api]) if (typeof v === "string" && /^https:\/\//.test(v)) out.add(v);
  return out;
}

/**
 * 2xx and 3xx answer. 405 is a URL that exists and answers a different
 * method (an MCP or API endpoint that takes POST): alive. 401 and 403 are
 * alive too, an endpoint that wants credentials still answers.
 * A machine endpoint that answers a browser's GET with a redirect to its
 * documentation on another host (AWS's Knowledge MCP does) is alive: the
 * server answered. The guarded fetch refuses to follow a cross-host
 * redirect, so for an endpoint that refusal counts as an answer; for a
 * page it stays dead, since a parked domain redirects too.
 */
export function linkAnswers(result: GuardedResult, endpoint: boolean): boolean {
  if (result.ok) return result.status < 400 || [401, 403, 405].includes(result.status);
  return endpoint && result.reason === "redirect_forbidden";
}

/** The detail printed beside a link: always for a dead one, and for an endpoint accepted through the redirect exception. */
export function linkDetail(result: GuardedResult, alive: boolean): string {
  const detail = result.ok ? `HTTP ${result.status}` : `${result.reason}: ${result.detail}`;
  return !alive || (!result.ok && result.reason === "redirect_forbidden") ? detail : "";
}
