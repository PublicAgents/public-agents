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

/** The methods the checker can send, so an expectation can name the request it belongs to. */
export type ExpectMethod = "GET" | "HEAD" | "POST";

/** The status a probe record filed, and the method of the request that read it. */
export interface ProbeExpectation {
  status: number;
  method: ExpectMethod;
}

/**
 * The status a probe record filed for its own surface, which that surface is
 * then allowed to answer with (issue #228), together with the method the
 * record read it with. Present only on the record's own `surface`; a URL a
 * record merely cites carries no expectation, and nor does the same URL named
 * by an entry two files away.
 *
 * The method travels with the status because a filed status is the answer to
 * the record's OWN request and to no other. The checker asks HEAD first and
 * GET second, and the two disagree often enough to matter: a host can answer
 * a HEAD 404 and a GET 500, or the reverse. Without the method, such a pair
 * let a record filing 404 pass on the strength of a request it never made
 * (Caliper's blocker on #229). A record filing an OPTIONS gets no
 * expectation at all, because the checker never sends one: that is a cell the
 * gate leaves empty rather than a status it quietly accepts.
 *
 * Why the gate needs this at all. The registry's product includes absences,
 * and the commonest absence it publishes is a document that is not served:
 * `GET /.well-known/public-agents.json` answering 404 is the measurement
 * behind the words "this is an unclaimed listing" on every unclaimed entry.
 * `linkTargets` reads every record's `surface` as a target and the table below
 * calls 404 and 410 dead, so a record whose entire finding is a 404 could not
 * be filed: the gate fetched the URL the record was about, got the 404 the
 * record existed to report, and refused the record. Four entries in a row put
 * that measurement in their profile instead, with the refusal named, which is
 * honest prose and is also evidence migrating out of the evidence layer.
 *
 * Why it is a status match and not an exemption. A record is exempt from the
 * table only for the one status it filed, compared against what the fetch
 * actually returned on that run, so the thing this gate exists to catch still
 * gets caught: a mistyped surface overwhelmingly does not answer with the
 * status its record claims. What is given up is narrower and worth stating,
 * because it is real: on a host whose catch-all answers 404, a typo in the
 * path of a 404-filed record now answers 404 too and passes. The protection
 * that remains for such a record is a mistyped host (which does not resolve),
 * a mistyped scheme, and any host whose miss page is a 403, a 410 or a 200.
 */
export function probeExpectationOf(value: unknown): { url: string; expect: ProbeExpectation } | undefined {
  const probe = value as { surface?: unknown; request?: { method?: unknown }; observed?: { status?: unknown } } | undefined;
  if (typeof probe?.surface !== "string" || typeof probe.observed?.status !== "number") return undefined;
  const method = probe.request?.method;
  if (method !== "GET" && method !== "HEAD" && method !== "POST") return undefined;
  return { url: canonicalUrl(probe.surface), expect: { status: probe.observed.status, method } };
}

/**
 * 2xx and 3xx answer. 405 is a URL that exists and answers a different
 * method (an MCP or API endpoint that takes POST): alive. 401 and 403 are
 * alive too, an endpoint that wants credentials still answers. 402 is alive
 * by the same logic: a payable surface (a probe subject) answers with a price.
 * 429 is alive by the same logic again, and for the same reason the
 * handshake table above already gives it: a host that demands a slower
 * caller has answered about the caller, not about whether the URL is there.
 * A bot challenge is delivered as a 429 too (deepwiki.com answers every
 * request from this checker with one, `x-vercel-mitigated: challenge`,
 * while a browser loads the page, issue #153), and that is a statement
 * about the caller as well. It stays out of `transientFailure`: a pause does
 * not change a challenge, and re-asking a host that said slow down is the
 * wrong reply.
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
export function linkAnswers(result: GuardedResult, endpoint: boolean, method?: TargetMethod, expectStatus?: number): boolean {
  // A probe's own surface answering exactly the status its record filed has
  // answered the question this gate asks, whatever the table below says about
  // that status (issue #228, `probeExpectationOf`). The comparison is against
  // the status this run actually read, never a stored or assumed one, so a
  // surface that has stopped answering that way is judged by the table like
  // any other URL.
  //
  // It reads the status through `statusRead`, which is the same reading the
  // capped-body rule below takes, and that is not a detail: the motivating
  // record of issue #228 is a `GET /.well-known/public-agents.json` whose 404
  // arrives with 46,345 bytes of a platform miss page, so the fetch that
  // measures it is a `too_large` carrying a 404 and not an `ok` one. A rule
  // that insisted on `ok` here would decline the very record it exists for,
  // on hosts whose miss page is a full HTML document, which is most of them.
  if (expectStatus !== undefined && statusRead(result) === expectStatus) return true;
  if (result.ok) return statusAnswers(result.status, method);
  if (statusRead(result) !== undefined) return statusAnswers(statusRead(result)!, method);
  return endpoint && result.reason === "redirect_forbidden";
}

/**
 * The status this check is allowed to read from a result, and `undefined` when
 * there is none it may use.
 *
 * A body that outgrew the byte cap is judged by the status line that arrived
 * before it: the check never reads the body, so the bytes it refused to buffer
 * are not evidence of anything. A capped 3xx never reaches here from
 * `guardedFetch` (it follows or refuses the redirect first), and a transport
 * that reports one without its Location is not an answer.
 */
function statusRead(result: GuardedResult): number | undefined {
  if (result.ok) return result.status;
  if (result.reason !== "too_large" || result.status === undefined) return undefined;
  return result.status >= 300 && result.status < 400 ? undefined : result.status;
}

function statusAnswers(status: number, method?: TargetMethod): boolean {
  if (status < 400 || [401, 402, 403, 405, 429].includes(status)) return true;
  return method === "POST" && status < 500 && status !== 404 && status !== 410;
}

/**
 * The detail printed beside a link: always for a dead one, and for an
 * answer accepted through an exception (an endpoint's refused redirect, a
 * capped body judged by its status), so the reader sees why it counted.
 */
export function linkDetail(result: GuardedResult, alive: boolean, expectStatus?: number): string {
  const detail = result.ok ? `HTTP ${result.status}` : `${result.reason}: ${result.detail}`;
  // A status the table would have called dead, counted because the record
  // filed it, is an answer accepted through an exception like the other two:
  // say so in the line, so a 404 in the log reads as the finding it is rather
  // than as a gate that has stopped checking.
  const status = statusRead(result);
  if (alive && status !== undefined && expectStatus !== undefined && status === expectStatus && !statusAnswers(status)) {
    // A capped body prints its own refusal too, which is where the 404 is:
    // `too_large: <url>: over 16384 bytes (HTTP 404), the status this probe
    // record filed`. That is the line the commonest record of this kind draws.
    return `${detail}, the status this probe record filed`;
  }
  return !alive || (!result.ok && (result.reason === "redirect_forbidden" || result.reason === "too_large")) ? detail : "";
}

/**
 * Two targets with this key get the same answer from the same requests, so
 * the checker asks once and shares it. The key is the whole shape of the ask
 * and not just the URL, because the same URL is asked differently depending
 * on what names it: a probe's surface is asked with a POST, an entry's
 * `surfaces.mcp` gets the handshake behind the browser pair, and `endpoint`
 * decides which answers count. The URL is canonical, so the spellings a URL
 * parser reads as equal share one ask.
 *
 * Why this is in the policy and not the script: how many requests the gate
 * sends to a stranger is part of the fetch policy (docs/OWNERSHIP.md), and it
 * was accidental before. One surface cited by ten records drew ten POSTs in
 * one run, so a surface that answers a given shape intermittently failed the
 * required gate more often the more evidence the registry held about it. The
 * question "does this URL answer" has one answer per run, not one per file.
 *
 * The expectation is part of the key for the same reason the other three are,
 * and it is the one that would bite hardest if it were left out: the verdict
 * is cached per key, so a probe surface that may answer 404 and the same URL
 * named by an entry's `surfaces.api`, which may not, would otherwise share one
 * verdict and whichever target happened to be asked first would decide the
 * other. The exemption has to stay attached to the record that earned it. Its
 * method is in the key too, because two records of one URL that filed the same
 * status with different methods are judged on different requests.
 */
export function askKey(target: AskTarget): string {
  const expect = target.expect ? `${target.expect.method} ${target.expect.status}` : "";
  return [canonicalUrl(target.url), target.method ?? "", target.mcp === true ? "mcp" : "", target.endpoint ? "endpoint" : "", expect].join("\n");
}

/** The part of a `LinkTarget` that decides how one URL is asked and how its answer is read. */
export type AskTarget = { url: string; endpoint: boolean; method?: TargetMethod; mcp?: boolean; expect?: ProbeExpectation };

/**
 * The status this target's record filed, if and only if the record read it
 * with the method about to be asked. One expression of the rule that a filed
 * status answers for the record's own request and for nothing else, so that
 * every place in the sequence applies it the same way.
 */
export function expectFor(target: AskTarget, method: ExpectMethod): number | undefined {
  return target.expect?.method === method ? target.expect.status : undefined;
}

/** What `askUrl` needs of a fetch: the guarded one, or a stub in a test. */
export type LinkFetch = (url: string, options: { method: "GET" | "HEAD" | "POST"; body?: string; accept?: string; timeoutMs: number; maxBytes?: number }) => Promise<GuardedResult>;

/** What the checker asks of one URL, and which of its own requests it kept. */
export interface LinkAsk {
  alive: boolean;
  result: GuardedResult;
  /**
   * The whole sequence ran twice, because the first reading failed with a
   * transient answer. Present either way, so a reference that failed once and
   * answered once is reported as neither a clean row nor a dead one (issue
   * #153, change 2).
   */
  reasked?: true;
}

/**
 * The failures a pause can change its mind about: a 5xx, a timeout, a network
 * error. Everything else is an answer rather than the absence of one, and
 * re-asking it only spends someone's server: a 404 and a 410 say the URL is
 * not there, a 4xx the table refuses says the request was refused, a refused
 * cross-host redirect says where it points, and `not_https`,
 * `address_forbidden` and `unresolvable` are refusals by the fetch policy
 * itself, which a second reading cannot overturn. A capped body is judged by
 * the status line that arrived first, so a capped 5xx is transient and a
 * capped 404 is not.
 *
 * `unresolvable` is deliberately not here even though DNS is capable of being
 * transient: it is a refusal this repository's own policy makes before any
 * request leaves, and issue #153 named three failures, not four. If a nightly
 * audit starts reporting it, that is a separate measurement and a separate
 * change.
 */
export function transientFailure(result: GuardedResult): boolean {
  if (result.ok) return result.status >= 500;
  if (result.reason === "timeout" || result.reason === "network") return true;
  return result.reason === "too_large" && result.status !== undefined && result.status >= 500;
}

/** How long the checker waits before a second reading. */
export const REASK_PAUSE_MS = 3_000;

/** The pause, injectable so the tests of the sequence never sleep. */
export interface AskOptions {
  sleep?: (ms: number) => Promise<void>;
  pauseMs?: number;
}

/**
 * One URL, asked once and then, if the answer was the kind a pause can change
 * its mind about, asked again after one (issue #153).
 *
 * The re-ask is a whole second reading of the sequence, not a second request
 * inside it, and that distinction is the point of the change. `askSequence`
 * already sends two requests on a 5xx, HEAD and then GET, but both leave in
 * the same millisecond-scale window and so measure the same instant: an edge
 * that is briefly erroring answers both identically, which is exactly what
 * issue #153 measured on three listed hosts at once. A pause is the only thing
 * in the path that distinguishes a dead URL from a busy one.
 *
 * What this does not do is make a dead URL alive. The second reading is judged
 * by the same table as the first, and a URL that fails twice is reported with
 * its FIRST failure, because that is the reading the gate took and the one a
 * contributor has to answer for. A URL that failed once and answered once is
 * reported as having been re-asked, so that a host which is flaky rather than
 * dead is visible in the log instead of being quietly rounded to healthy.
 */
export async function askUrl(
  target: AskTarget,
  fetch: LinkFetch,
  options: AskOptions = {}
): Promise<LinkAsk> {
  const first = await askSequence(target, fetch);
  if (first.alive || !transientFailure(first.result)) return first;
  const sleep = options.sleep ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms)));
  await sleep(options.pauseMs ?? REASK_PAUSE_MS);
  const second = await askSequence(target, fetch);
  return second.alive ? { ...second, reasked: true } : { ...first, reasked: true };
}

/**
 * The order of requests behind one reading of one link, kept here rather than
 * in the script so the whole sequence can be tested without a network: HEAD,
 * then GET when HEAD failed outright or the server erred, then, for a
 * `surfaces.mcp` URL that neither answered, one JSON-RPC `initialize`.
 * A probe surface whose record says POST is asked with its POST first.
 */
async function askSequence(target: AskTarget, fetch: LinkFetch): Promise<LinkAsk> {
  if (target.method === "POST") {
    // A probe's surface that its record measured with a POST is asked
    // with one first: an empty JSON object, no session, nothing that could
    // be a credential. Some servers answer nothing else (issue #107).
    const result = await fetch(target.url, { method: "POST", body: "{}", timeoutMs: 10_000, maxBytes: 16 * 1024 });
    // The expectation is honoured here only if the record filed a POST, which
    // for a `request.method` of POST it did; the guard is the rule stated
    // once rather than an assumption repeated.
    if (linkAnswers(result, target.endpoint, "POST", expectFor(target, "POST"))) return { alive: true, result };
    // The record's method is the *preferred* way to ask this URL, not the
    // only one the checker knows. A POST that does not answer leaves the
    // question this gate asks unanswered rather than answered no: a 5xx
    // "still says nothing" by the table above, and a server that erred on
    // one request shape has said nothing about whether the URL is there.
    // So fall through to the pair every other URL in the registry gets. A
    // surface that is dead stays dead, because nothing here counts an
    // answer the table refuses; what this buys is a URL whose POST shape
    // is unstable and whose GET shape is not. Without it a probe record
    // whose surface answers a well-formed POST intermittently could only
    // pass the required gate by a lucky sequence of duplicate fetches, and
    // every further record of the same surface made that luck less likely.
    const fallback = await askBrowser(target, fetch);
    // The POST's own result is what the report keeps when nothing answered:
    // it is the request the record made, and the most informative thing the
    // checker learned about the surface.
    return fallback.alive ? fallback : { alive: false, result };
  }
  return askBrowser(target, fetch);
}

/**
 * The checker's own HEAD-then-GET pair, and the handshake behind it for a
 * `surfaces.mcp` URL that neither browser method answered. Split out from
 * `askUrl` because a probe surface whose POST said nothing falls through to
 * exactly this, and it must be the same sequence rather than a copy of it.
 */
async function askBrowser(target: AskTarget, fetch: LinkFetch): Promise<LinkAsk> {
  // HEAD first; GET only when HEAD failed outright or the server erred,
  // so a qualifying HEAD answer (405, 403, 401, 2xx, 3xx) is never
  // overwritten by a fallback that fares worse.
  let result = await fetch(target.url, { method: "HEAD", timeoutMs: 10_000 });
  // The expectation each of these two requests may be judged by: the HEAD's,
  // only for a record that filed a HEAD, and the GET's only for one that filed
  // a GET. `judged` follows whichever response `result` ends up holding, so
  // the status a record filed can never be satisfied by the other request.
  let judged = expectFor(target, "HEAD");
  const expectOnGet = expectFor(target, "GET");
  // A record that filed a GET is entitled to have its GET sent, even where a
  // HEAD alone would have settled the matter: without this a record filing a
  // 410 is judged on a HEAD 410 that the table calls dead, and never gets to
  // agree with itself.
  if (!result.ok || result.status >= 500 || result.status === 404 || (expectOnGet !== undefined && !linkAnswers(result, target.endpoint))) {
    const fallback = await fetch(target.url, { method: "GET", timeoutMs: 10_000, maxBytes: 16 * 1024 });
    // A GET record's own GET is what the report keeps whatever it answered,
    // for the reason the POST path above keeps its POST: it is the request the
    // record made, and the most informative thing the checker learned about
    // the surface. It is also what makes the failure legible: a record filing
    // 404 whose GET now 500s is reported as the 500 it is, rather than as the
    // HEAD's 404 beside a verdict of dead.
    if (linkAnswers(fallback, target.endpoint, undefined, expectOnGet) || !result.ok || expectOnGet !== undefined) {
      result = fallback;
      judged = expectOnGet;
    }
  }
  if (linkAnswers(result, target.endpoint, undefined, judged)) return { alive: true, result };
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
