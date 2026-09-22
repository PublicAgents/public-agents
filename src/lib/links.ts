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
 * The MCP endpoints of an entry (`surfaces.mcp` only). An MCP server's one
 * read verb is a POST of JSON-RPC, so a URL in this field can be alive to
 * every client in the world and dead to a checker that only knows HEAD and
 * GET. `surfaces.api` is deliberately not here: that field promises no
 * protocol, and a POST to an arbitrary REST path is a write attempt at a
 * third party who did not ask to be probed.
 */
export function mcpEndpointsOf(value: unknown): Set<string> {
  const out = new Set<string>();
  const mcp = (value as { surfaces?: { mcp?: unknown } } | undefined)?.surfaces?.mcp;
  if (typeof mcp === "string" && /^https:\/\//i.test(mcp)) out.add(canonicalUrl(mcp));
  return out;
}

/**
 * The request the checker sends to an unanswering `surfaces.mcp` URL: a
 * well-formed `initialize`, the first message of the MCP lifecycle, with
 * the `Accept` the transport specification requires. It reads and creates
 * nothing; a server that refuses it refuses the handshake every client
 * begins with. Sent only after HEAD and GET have both failed to answer.
 */
export const MCP_INITIALIZE = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "public-agents-link-check", version: "1" } }
});

/** What an MCP endpoint's transport requires of a client's `Accept` header. */
export const MCP_ACCEPT = "application/json, text/event-stream";

/** The one method a target can ask for besides the checker's own HEAD-then-GET pair. */
export type TargetMethod = "POST";

/**
 * A probe's surface is the URL its request went to, and the record says
 * which method (the schema's `request.method`). When that method is POST
 * the checker asks the URL the same way, because some servers speak only
 * to a POST and answer 404 to everything else (an MCP endpoint is one);
 * asking such a server with a GET measures the checker, not the server.
 * Any other method keeps the checker's own HEAD-then-GET pair. Nothing
 * but a probe's own surface gets a method: a URL a probe merely cites is
 * a page.
 */
export function probeSurfaceOf(value: unknown): { url: string; method: TargetMethod } | undefined {
  const probe = value as { surface?: unknown; request?: { method?: unknown } } | undefined;
  if (typeof probe?.surface !== "string" || probe.request?.method !== "POST") return undefined;
  return { url: canonicalUrl(probe.surface), method: "POST" };
}

/**
 * 2xx and 3xx answer. 405 is a URL that exists and answers a different
 * method (an MCP or API endpoint that takes POST): alive. 401 and 403 are
 * alive too, an endpoint that wants credentials still answers. 402 is alive
 * by the same logic: a payable surface (a probe subject) answers with a price.
 *
 * A URL asked with a POST (a probe surface whose record says POST) is
 * alive on any 4xx but 404 and 410: a 400, 406, 411, 415 or 422 is an
 * answer about the request the checker sent (an empty JSON object, no
 * session, an accept header of star), not about the URL, and the question
 * this gate asks is whether the URL answers. 404 and 410 still say the
 * URL is not there; 5xx still says nothing.
 *
 * A body that outgrew the byte cap is judged by the status line that
 * arrived before it: the check never reads the body, so the bytes it
 * refused to buffer are not evidence of anything. Without this a page over
 * the cap whose HEAD misbehaves reads as dead (developers.project44.com
 * did, every night). A `too_large` that carries no status stays dead.
 *
 * A machine endpoint that answers a browser's GET with a redirect to its
 * documentation on another host (AWS's Knowledge MCP does) is alive: the
 * server answered. The guarded fetch refuses to follow a cross-host
 * redirect, so for an endpoint that refusal counts as an answer; for a
 * page it stays dead, since a parked domain redirects too.
 */
export function linkAnswers(result: GuardedResult, endpoint: boolean, method?: TargetMethod): boolean {
  if (result.ok) return statusAnswers(result.status, method);
  // A capped 3xx never reaches here from guardedFetch (it follows or refuses the redirect first); a transport that reports one without its Location is not an answer.
  if (result.reason === "too_large" && result.status !== undefined && !(result.status >= 300 && result.status < 400)) return statusAnswers(result.status, method);
  return endpoint && result.reason === "redirect_forbidden";
}

function statusAnswers(status: number, method?: TargetMethod): boolean {
  if (status < 400 || [401, 402, 403, 405].includes(status)) return true;
  return method === "POST" && status < 500 && status !== 404 && status !== 410;
}

/**
 * The detail printed beside a link: always for a dead one, and for an
 * answer accepted through an exception (an endpoint's refused redirect, a
 * capped body judged by its status), so the reader sees why it counted.
 */
export function linkDetail(result: GuardedResult, alive: boolean): string {
  const detail = result.ok ? `HTTP ${result.status}` : `${result.reason}: ${result.detail}`;
  return !alive || (!result.ok && (result.reason === "redirect_forbidden" || result.reason === "too_large")) ? detail : "";
}
