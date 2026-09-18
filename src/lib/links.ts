/**
 * The link checker's policy, kept apart from the script so it can be tested:
 * which URLs of an entry are machine endpoints, and which answers count as alive.
 */
import type { GuardedResult } from "./net.ts";

/**
 * One spelling for one URL, so that two references to the same endpoint
 * compare equal: `HTTPS://Mcp.Example` and `https://mcp.example/` are the
 * same server to a fetch and must be the same to this policy. A string the
 * URL parser refuses is returned as it came; it will not match anything
 * and the fetch refuses it on its own terms.
 */
export function canonicalUrl(url: string): string {
  try {
    return new URL(url).href;
  } catch {
    return url;
  }
}

/**
 * The machine endpoints of an entry (`surfaces.mcp`, `surfaces.api`): URLs an
 * agent POSTs to, not pages. Canonical spellings; compare with `canonicalUrl`.
 */
export function endpointsOf(value: unknown): Set<string> {
  const out = new Set<string>();
  const surfaces = (value as { surfaces?: { mcp?: unknown; api?: unknown } } | undefined)?.surfaces;
  // The scheme is matched without regard to case, the way link-targets reads it: an entry may carry `HTTPS://` and validate.
  for (const v of [surfaces?.mcp, surfaces?.api]) if (typeof v === "string" && /^https:\/\//i.test(v)) out.add(canonicalUrl(v));
  return out;
}

/**
 * 2xx and 3xx answer. 405 is a URL that exists and answers a different
 * method (an MCP or API endpoint that takes POST): alive. 401 and 403 are
 * alive too, an endpoint that wants credentials still answers. 402 is alive
 * by the same logic: a payable surface (a probe subject) answers with a price.
 * A machine endpoint that answers a browser's GET with a redirect to its
 * documentation on another host (AWS's Knowledge MCP does) is alive: the
 * server answered. The guarded fetch refuses to follow a cross-host
 * redirect, so for an endpoint that refusal counts as an answer; for a
 * page it stays dead, since a parked domain redirects too.
 */
export function linkAnswers(result: GuardedResult, endpoint: boolean): boolean {
  if (result.ok) return result.status < 400 || [401, 402, 403, 405].includes(result.status);
  return endpoint && result.reason === "redirect_forbidden";
}

/** The detail printed beside a link: always for a dead one, and for an endpoint accepted through the redirect exception. */
export function linkDetail(result: GuardedResult, alive: boolean): string {
  const detail = result.ok ? `HTTP ${result.status}` : `${result.reason}: ${result.detail}`;
  return !alive || (!result.ok && result.reason === "redirect_forbidden") ? detail : "";
}
