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

/**
 * Whether an answer to that handshake came from an MCP server, which is a
 * narrower question than whether the URL answered at all. The generic POST
 * table is deliberately not used here: it counts any 4xx but 404 and 410,
 * and a mistyped `surfaces.mcp` that lands on an unrelated JSON endpoint
 * rejecting the body with 400 or 422 would pass a field no MCP client can
 * call. So only two things count.
 *
 * A 2xx counts when the body is a JSON-RPC answer to `initialize`: the
 * `jsonrpc` envelope or the `protocolVersion` every initialize result
 * carries, in a plain JSON body or in the `data:` line of an SSE stream,
 * which is how a streamable-HTTP server replies. A 2xx that says neither
 * is some other server being agreeable.
 *
 * 401, 402, 403 and 429 count: an endpoint that demands a credential, a
 * payment or a slower caller has answered about the caller, not about
 * whether the URL is there, and refusing before the protocol starts is
 * what the MCP authorization specification tells a server to do. Every
 * other status, 400 and 422 included, leaves the URL dead: a server that
 * cannot read a well-formed `initialize` is not one an agent can use.
 *
 * A 2xx whose body outgrew the byte cap counts on its status line alone,
 * the way `linkAnswers` takes any other capped answer. This is a deliberate
 * choice and not a fallthrough: a streamable-HTTP server may answer the
 * handshake on an event stream it then holds open, so the cap is reached by
 * a conformant server more often than by a 64 KiB `initialize` result, and
 * at the cap the fetch keeps no body, so the protocol evidence this function
 * otherwise requires cannot be read. What that costs is stated exactly: the
 * statuses the narrowing exists to keep dead (404, 410, 400, 422) are none
 * of them 2xx, so nothing reachable this way is a mistyped URL landing on an
 * unrelated JSON endpoint; what it admits is a non-MCP server that answers
 * a POST of `initialize` with more than 64 KiB of 2xx. A capped non-2xx is
 * judged by the same table as any other status, so a capped 401 counts and a
 * capped 400 does not.
 */
export function mcpHandshakeAnswers(result: GuardedResult): boolean {
  if (result.ok) return handshakeStatusAnswers(result.status, result.body);
  // `status` rides only on `too_large`; a timeout or a network error carries none, and stays dead.
  if (result.reason === "too_large" && result.status !== undefined) return handshakeStatusAnswers(result.status, undefined);
  return false;
}

/** The handshake's table. `body` is undefined when the cap left none to read. */
function handshakeStatusAnswers(status: number, body: string | undefined): boolean {
  if ([401, 402, 403, 429].includes(status)) return true;
  if (status < 200 || status >= 300) return false;
  if (body === undefined) return true;
  return /"jsonrpc"\s*:\s*"2\.0"/.test(body) || /"protocolVersion"\s*:/.test(body);
}

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

/** What `askUrl` needs of a fetch: the guarded one, or a stub in a test. */
export type LinkFetch = (url: string, options: { method: "GET" | "HEAD" | "POST"; body?: string; accept?: string; timeoutMs: number; maxBytes?: number }) => Promise<GuardedResult>;

/** What the checker asks of one URL, and which of its own requests it kept. */
export interface LinkAsk {
  alive: boolean;
  result: GuardedResult;
}

/**
 * The order of requests behind one link, kept here rather than in the
 * script so the whole sequence can be tested without a network: HEAD,
 * then GET when HEAD failed outright or the server erred, then, for a
 * `surfaces.mcp` URL that neither answered, one JSON-RPC `initialize`.
 * A probe surface whose record says POST keeps its single POST and is
 * never asked any other way.
 */
export async function askUrl(target: { url: string; endpoint: boolean; method?: TargetMethod; mcp?: boolean }, fetch: LinkFetch): Promise<LinkAsk> {
  if (target.method === "POST") {
    // A probe's surface that its record measured with a POST is asked
    // with one: an empty JSON object, no session, nothing that could be a
    // credential. Some servers answer nothing else (issue #107).
    const result = await fetch(target.url, { method: "POST", body: "{}", timeoutMs: 10_000, maxBytes: 16 * 1024 });
    return { alive: linkAnswers(result, target.endpoint, "POST"), result };
  }
  // HEAD first; GET only when HEAD failed outright or the server erred,
  // so a qualifying HEAD answer (405, 403, 401, 2xx, 3xx) is never
  // overwritten by a fallback that fares worse.
  let result = await fetch(target.url, { method: "HEAD", timeoutMs: 10_000 });
  if (!result.ok || result.status >= 500 || result.status === 404) {
    const fallback = await fetch(target.url, { method: "GET", timeoutMs: 10_000, maxBytes: 16 * 1024 });
    if (linkAnswers(fallback, target.endpoint)) result = fallback;
    else if (!result.ok) result = fallback;
  }
  if (linkAnswers(result, target.endpoint)) return { alive: true, result };
  // A `surfaces.mcp` URL that answered neither browser method is asked
  // once more in the protocol it advertises. An MCP server has no other
  // read verb, so a HEAD-and-GET-only check of this field measures the
  // checker. `mcpHandshakeAnswers` asks whether an MCP server replied,
  // not whether anything replied, so a 400 or a 422 from some other JSON
  // endpoint on a mistyped URL stays as dead as a 404.
  if (target.mcp === true) {
    const handshake = await fetch(target.url, { method: "POST", body: MCP_INITIALIZE, accept: MCP_ACCEPT, timeoutMs: 10_000, maxBytes: 64 * 1024 });
    if (mcpHandshakeAnswers(handshake)) return { alive: true, result: handshake };
  }
  return { alive: false, result };
}
