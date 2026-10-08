import { describe, expect, it } from "vitest";
import { askKey, askUrl, REASK_PAUSE_MS, transientFailure, canonicalUrl, endpointsOf, linkAnswers, linkDetail, type LinkFetch, MCP_ACCEPT, MCP_INITIALIZE, mcpEndpointsOf, mcpHandshakeAnswers, probeExpectationOf, probeSurfaceOf } from "../src/lib/links.ts";
import type { GuardedResult } from "../src/lib/net.ts";

const answered = (status: number): GuardedResult => ({ ok: true, status, body: "", url: "https://a.example/", contentType: "text/html" });
const refused = (reason: Extract<GuardedResult, { ok: false }>["reason"], detail = "https://a.example/ -> https://b.example/"): GuardedResult => ({ ok: false, reason, detail });

describe("endpointsOf", () => {
  it("names surfaces.mcp and surfaces.api, nothing else", () => {
    const entry = { surfaces: { homepage: "https://a.example/", docs: "https://a.example/docs", mcp: "https://mcp.a.example", api: "https://api.a.example/v1", source: "https://github.com/a/a" } };
    expect([...endpointsOf(entry)]).toEqual(["https://mcp.a.example/", "https://api.a.example/v1"]);
    expect(endpointsOf({ surfaces: { mcp: null, api: "http://api.a.example" } }).size).toBe(0);
    // Canonical spellings: an uppercase scheme or host and a missing trailing slash name the same server.
    expect([...endpointsOf({ surfaces: { mcp: "HTTPS://Mcp.A.Example" } })]).toEqual(["https://mcp.a.example/"]);
    expect(endpointsOf({}).size).toBe(0);
    expect(endpointsOf(undefined).size).toBe(0);
  });
});

describe("mcpEndpointsOf", () => {
  it("names surfaces.mcp and refuses surfaces.api, because only one of the two advertises a protocol", () => {
    const entry = { surfaces: { homepage: "https://a.example/", mcp: "https://mcp.a.example", api: "https://api.a.example/v1" } };
    expect([...mcpEndpointsOf(entry)]).toEqual(["https://mcp.a.example/"]);
    expect([...mcpEndpointsOf({ surfaces: { mcp: "HTTPS://Mcp.A.Example" } })]).toEqual(["https://mcp.a.example/"]);
    expect(mcpEndpointsOf({ surfaces: { api: "https://api.a.example/v1" } }).size).toBe(0);
    expect(mcpEndpointsOf({ surfaces: { mcp: "http://mcp.a.example" } }).size).toBe(0);
    expect(mcpEndpointsOf({ surfaces: { mcp: null } }).size).toBe(0);
    expect(mcpEndpointsOf(undefined).size).toBe(0);
  });
});

describe("the MCP handshake the checker sends", () => {
  it("is a well-formed initialize and nothing else: it reads, and it creates nothing", () => {
    const body = JSON.parse(MCP_INITIALIZE);
    expect(body.jsonrpc).toBe("2.0");
    expect(body.method).toBe("initialize");
    expect(body.params.protocolVersion).toBe("2025-06-18");
    expect(body.params.capabilities).toEqual({});
    expect(JSON.stringify(body)).not.toMatch(/tools\/call|resources\/|prompts\//);
    // The transport requires both media types of a client; without them a server answers about the request, not the URL.
    expect(MCP_ACCEPT).toBe("application/json, text/event-stream");
  });
});

describe("canonicalUrl", () => {
  it("reads equal spellings as one string and leaves what the parser refuses alone", () => {
    for (const spelling of ["https://mcp.a.example", "HTTPS://mcp.a.example/", "https://MCP.A.EXAMPLE"]) expect(canonicalUrl(spelling)).toBe("https://mcp.a.example/");
    expect(canonicalUrl("https://a.example/v1")).not.toBe(canonicalUrl("https://a.example/v1/"));
    expect(canonicalUrl("not a url")).toBe("not a url");
  });
});

describe("linkAnswers", () => {
  it("takes 2xx, 3xx, 401, 402, 403, 405 and 429 for pages and endpoints alike", () => {
    // 429 joined the page table on issue #153: deepwiki.com answers the checker with a Vercel challenge as a 429 and a browser with the page.
    for (const status of [200, 301, 401, 402, 403, 405, 429]) {
      expect(linkAnswers(answered(status), false)).toBe(true);
      expect(linkAnswers(answered(status), true)).toBe(true);
    }
    for (const status of [404, 410, 500, 503]) {
      expect(linkAnswers(answered(status), false)).toBe(false);
      expect(linkAnswers(answered(status), true)).toBe(false);
    }
  });
  it("counts a refused off-host redirect as an answer for an endpoint only", () => {
    expect(linkAnswers(refused("redirect_forbidden"), true)).toBe(true);
    expect(linkAnswers(refused("redirect_forbidden"), false)).toBe(false);
  });
  it("keeps every other refusal dead, endpoint or not", () => {
    for (const reason of ["not_https", "address_forbidden", "unresolvable", "timeout", "too_large", "network"] as const) {
      expect(linkAnswers(refused(reason), true)).toBe(false);
      expect(linkAnswers(refused(reason), false)).toBe(false);
      expect(linkAnswers(refused(reason), false, "POST")).toBe(false);
    }
  });
  it("takes a 4xx other than 404 and 410 for a URL asked with a POST, and nothing more than before otherwise", () => {
    // What the three servers issue #107 named answered to an empty JSON POST on 2026-09-18: 406, 422, 401.
    for (const status of [400, 406, 411, 415, 422]) {
      expect(linkAnswers(answered(status), false, "POST")).toBe(true);
      expect(linkAnswers(answered(status), false)).toBe(false);
      expect(linkAnswers(answered(status), true)).toBe(false);
    }
    for (const status of [404, 410, 500, 502, 503]) expect(linkAnswers(answered(status), false, "POST")).toBe(false);
    for (const status of [200, 301, 401, 402, 403, 405, 429]) expect(linkAnswers(answered(status), false, "POST")).toBe(true);
  });
  it("judges a body that outgrew the cap by the status line that arrived before it", () => {
    const capped = (status?: number): GuardedResult => ({ ok: false, reason: "too_large", detail: "https://a.example/: over 16384 bytes", ...(status === undefined ? {} : { status }) });
    for (const status of [200, 401, 403]) {
      expect(linkAnswers(capped(status), false)).toBe(true);
      expect(linkAnswers(capped(status), true)).toBe(true);
    }
    for (const status of [404, 500]) expect(linkAnswers(capped(status), false)).toBe(false);
    // The 4xx-but-not-404 table follows the method, capped or not.
    expect(linkAnswers(capped(400), false, "POST")).toBe(true);
    expect(linkAnswers(capped(400), false)).toBe(false);
    // A capped redirect whose Location was never read is not an answer, endpoint or not, POST or not.
    for (const status of [301, 302, 303, 307]) {
      expect(linkAnswers(capped(status), false)).toBe(false);
      expect(linkAnswers(capped(status), true)).toBe(false);
      expect(linkAnswers(capped(status), false, "POST")).toBe(false);
    }
    // A transport that did not keep the status says nothing the check can read.
    expect(linkAnswers(capped(), false)).toBe(false);
    expect(linkAnswers(capped(), true)).toBe(false);
  });
});

describe("probeSurfaceOf", () => {
  it("names a probe's surface, canonical, only when the record's method is POST", () => {
    const probe = (method: string) => ({ id: "p-1", surface: "HTTPS://Mcp.A.Example/mcp", request: { method, credentials: "none", payment: "none", from: "x" } });
    expect(probeSurfaceOf(probe("POST"))).toEqual({ url: "https://mcp.a.example/mcp", method: "POST" });
    for (const method of ["GET", "HEAD", "OPTIONS"]) expect(probeSurfaceOf(probe(method))).toBeUndefined();
    expect(probeSurfaceOf({ surfaces: { mcp: "https://mcp.a.example/" } })).toBeUndefined();
    expect(probeSurfaceOf({ surface: 12, request: { method: "POST" } })).toBeUndefined();
    expect(probeSurfaceOf(undefined)).toBeUndefined();
  });
});

describe("probeExpectationOf", () => {
  it("names a probe's surface and the status it filed, whatever the method, and nothing else", () => {
    const probe = (status: unknown) => ({ id: "p-1", surface: "HTTPS://A.Example/.well-known/public-agents.json", request: { method: "GET" }, observed: { status } });
    // Canonical spelling, so the expectation attaches to the same URL `urlsOf` reads out of the record.
    expect(probeExpectationOf(probe(404))).toEqual({ url: "https://a.example/.well-known/public-agents.json", status: 404 });
    // Unlike probeSurfaceOf this does not care about the method: the 404 the registry needs filed is a GET.
    expect(probeExpectationOf({ surface: "https://a.example/", request: { method: "POST" }, observed: { status: 404 } })).toEqual({ url: "https://a.example/", status: 404 });
    // No surface, no expectation: a URL a record merely cites is a page, and an entry is not a record.
    expect(probeExpectationOf({ surfaces: { mcp: "https://mcp.a.example/" }, observed: { status: 404 } })).toBeUndefined();
    expect(probeExpectationOf({ surface: 12, observed: { status: 404 } })).toBeUndefined();
    for (const status of ["404", null, undefined]) expect(probeExpectationOf(probe(status))).toBeUndefined();
    expect(probeExpectationOf({ surface: "https://a.example/" })).toBeUndefined();
    expect(probeExpectationOf(undefined)).toBeUndefined();
  });
});

describe("a probe surface answering the status its record filed (issue #228)", () => {
  it("counts as alive for that status and no other", () => {
    // The case the registry needs: a record whose whole finding is that nothing is served.
    expect(linkAnswers(answered(404), false, undefined, 404)).toBe(true);
    expect(linkAnswers(answered(410), false, undefined, 410)).toBe(true);
    // THE TEST THIS CHANGE HAS TO PASS: the wrong status still fails. A mistyped
    // surface overwhelmingly does not answer with the status its record claims,
    // so the typo-catching the gate exists for survives the exemption.
    expect(linkAnswers(answered(404), false, undefined, 410)).toBe(false);
    expect(linkAnswers(answered(500), false, undefined, 404)).toBe(false);
    expect(linkAnswers(answered(503), false, undefined, 200)).toBe(false);
    // And a surface that answers nothing at all cannot match a status: a DNS
    // failure, a timeout or a refused redirect carries none to compare.
    for (const reason of ["unresolvable", "timeout", "network"] as const) {
      expect(linkAnswers(refused(reason), false, undefined, 404)).toBe(false);
    }
    // No expectation, no exemption: the table is unchanged for every other URL.
    expect(linkAnswers(answered(404), false)).toBe(false);
    expect(linkAnswers(answered(404), true)).toBe(false);
    expect(linkAnswers(answered(404), false, "POST")).toBe(false);
  });

  it("takes a status the table already calls alive without needing the expectation", () => {
    // An expectation never makes an answer worse, and the two agreeing is the common case.
    expect(linkAnswers(answered(200), false, undefined, 200)).toBe(true);
    expect(linkAnswers(answered(401), false, undefined, 401)).toBe(true);
    // A surface filed as 404 that has started answering is alive on the table's
    // own terms, not through the exemption. Whether its FINDING still reproduces
    // is a question about a dated measurement, and not one a liveness gate asks:
    // every probe record in the registry may have stopped reproducing, and this
    // gate singles out none of them.
    expect(linkAnswers(answered(200), false, undefined, 404)).toBe(true);
  });

  it("is reported in the line, so a 404 reads as a finding and not as a gate that stopped checking", () => {
    expect(linkDetail(answered(404), true, 404)).toBe("HTTP 404, the status this probe record filed");
    expect(linkDetail(answered(410), true, 410)).toBe("HTTP 410, the status this probe record filed");
    // A status the table would have taken anyway needs no explaining.
    expect(linkDetail(answered(200), true, 200)).toBe("");
    expect(linkDetail(answered(401), true, 401)).toBe("");
    // A dead one still prints what it answered, and says nothing about an expectation it did not meet.
    expect(linkDetail(answered(404), false, 410)).toBe("HTTP 404");
  });

  it("is asked for by HEAD-then-GET and read from the GET, because the records that need it are GETs", async () => {
    const asked: string[] = [];
    const fetch: LinkFetch = async (_url, options) => {
      asked.push(options.method);
      return answered(404);
    };
    const target = { url: "https://a.example/.well-known/public-agents.json", endpoint: false, expectStatus: 404 };
    expect(await askUrl(target, fetch)).toMatchObject({ alive: true });
    // A 404 from HEAD still falls through to the GET, which is the request the
    // record made; the expectation is read from that answer rather than short
    // circuiting the pair.
    expect(asked).toEqual(["HEAD", "GET"]);
  });

  it("does not re-ask: a 404 that the record filed is not a transient failure", async () => {
    let calls = 0;
    const fetch: LinkFetch = async () => {
      calls += 1;
      return answered(404);
    };
    const ask = await askUrl({ url: "https://a.example/x", endpoint: false, expectStatus: 404 }, fetch, { sleep: async () => {}, pauseMs: 0 });
    expect(ask).toMatchObject({ alive: true });
    expect(ask.reasked).toBeUndefined();
    expect(calls).toBe(2);
  });

  it("keeps the exemption on the record that earned it: askKey separates the same URL with and without one", () => {
    // The verdict is cached per key, so if the expectation were not in the key a
    // probe surface that may answer 404 and the same URL named by an entry's
    // surfaces.api, which may not, would share one verdict and whichever was
    // asked first would decide the other.
    const url = "https://a.example/x";
    expect(askKey({ url, endpoint: false, expectStatus: 404 })).not.toBe(askKey({ url, endpoint: false }));
    expect(askKey({ url, endpoint: false, expectStatus: 404 })).not.toBe(askKey({ url, endpoint: false, expectStatus: 410 }));
    expect(askKey({ url, endpoint: false, expectStatus: 404 })).toBe(askKey({ url, endpoint: false, expectStatus: 404 }));
  });
});

describe("linkDetail", () => {
  it("prints the redirect beside an endpoint accepted through the exception, and nothing beside a plain answer", () => {
    expect(linkDetail(refused("redirect_forbidden"), true)).toBe("redirect_forbidden: https://a.example/ -> https://b.example/");
    expect(linkDetail(answered(200), true)).toBe("");
    expect(linkDetail(answered(404), false)).toBe("HTTP 404");
    // A capped body accepted by its status prints how it was accepted, so the reader sees the cap was hit.
    expect(linkDetail({ ok: false, reason: "too_large", detail: "https://a.example/: over 16384 bytes (HTTP 200)", status: 200 }, true)).toBe("too_large: https://a.example/: over 16384 bytes (HTTP 200)");
    expect(linkDetail(refused("timeout", "https://a.example/"), false)).toBe("timeout: https://a.example/");
  });
});

describe("mcpHandshakeAnswers", () => {
  const handshake = (body: string): GuardedResult => ({ ok: true, status: 200, body, url: "https://mcp.a.example/", contentType: "application/json" });

  it("takes a 2xx only when an MCP server is what replied", () => {
    expect(mcpHandshakeAnswers(handshake('{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18"}}'))).toBe(true);
    // A streamable-HTTP server answers in an SSE frame; the envelope is in the data line.
    expect(mcpHandshakeAnswers(handshake('event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"serverInfo":{"name":"x"}}}\n\n'))).toBe(true);
    expect(mcpHandshakeAnswers(handshake('{"result":{"protocolVersion":"2025-06-18","capabilities":{}}}'))).toBe(true);
    // Some other server being agreeable is not an MCP server.
    expect(mcpHandshakeAnswers(handshake('{"ok":true}'))).toBe(false);
    expect(mcpHandshakeAnswers(handshake("<!doctype html><title>Home</title>"))).toBe(false);
  });

  it("takes a refusal of the caller and refuses a refusal of the request, which is the whole narrowing", () => {
    for (const status of [401, 402, 403, 429]) expect(mcpHandshakeAnswers({ ...handshake("no"), status })).toBe(true);
    // A mistyped surfaces.mcp landing on an unrelated JSON endpoint: it rejects the body, and no MCP client could use it.
    for (const status of [400, 404, 405, 410, 415, 422, 500]) expect(mcpHandshakeAnswers({ ...handshake('{"error":"bad request"}'), status })).toBe(false);
    expect(mcpHandshakeAnswers(refused("timeout"))).toBe(false);
  });

  it("takes a capped 2xx on its status line, because a server that holds its stream open keeps no body to read", () => {
    const capped = (status: number): GuardedResult => ({ ok: false, reason: "too_large", detail: `https://mcp.a.example/: over 65536 bytes (HTTP ${status})`, status });
    // The conformant case: an SSE answer to `initialize` that kept sending past the cap.
    expect(mcpHandshakeAnswers(capped(200))).toBe(true);
    // A capped refusal of the caller is still a refusal of the caller; a capped refusal of the request is still dead.
    expect(mcpHandshakeAnswers(capped(401))).toBe(true);
    for (const status of [400, 404, 410, 422, 500]) expect(mcpHandshakeAnswers(capped(status))).toBe(false);
    // Nothing but `too_large` carries a status, and a cap with none says nothing.
    expect(mcpHandshakeAnswers({ ok: false, reason: "too_large", detail: "no status" })).toBe(false);
    expect(mcpHandshakeAnswers({ ok: false, reason: "network", detail: "reset", status: 200 } as GuardedResult)).toBe(false);
  });
});

describe("askUrl", () => {
  // A fetch that answers from a table and records the order it was asked in.
  const stub = (answers: Record<string, GuardedResult>) => {
    const asked: string[] = [];
    const fetch = async (url: string, options: { method: string; body?: string; accept?: string }) => {
      asked.push(options.method);
      if (options.method === "POST" && options.body === MCP_INITIALIZE) expect(options.accept).toBe(MCP_ACCEPT);
      return answers[options.method] ?? refused("network", "no stub");
    };
    return { fetch, asked };
  };
  const target = { url: "https://mcp.a.example/", endpoint: true, mcp: true };

  it("stops at HEAD when HEAD answers, and never sends the handshake", async () => {
    const { fetch, asked } = stub({ HEAD: answered(405) });
    expect(await askUrl(target, fetch)).toMatchObject({ alive: true });
    expect(asked).toEqual(["HEAD"]);
  });

  it("asks the handshake only after HEAD and GET have both failed, and takes the endpoint on its answer", async () => {
    const body = '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18"}}';
    const { fetch, asked } = stub({ HEAD: answered(404), GET: answered(404), POST: { ok: true, status: 200, body, url: target.url, contentType: "text/event-stream" } });
    const ask = await askUrl(target, fetch);
    expect(asked).toEqual(["HEAD", "GET", "POST"]);
    expect(ask.alive).toBe(true);
    // The kept result is the handshake, so the report prints what counted.
    expect(ask.result).toMatchObject({ status: 200 });
  });

  it("takes a handshake whose stream outgrew the cap, and prints how it counted", async () => {
    const capped: GuardedResult = { ok: false, reason: "too_large", detail: `${target.url}: over 65536 bytes (HTTP 200)`, status: 200 };
    const { fetch, asked } = stub({ HEAD: answered(404), GET: answered(404), POST: capped });
    const ask = await askUrl(target, fetch);
    expect(asked).toEqual(["HEAD", "GET", "POST"]);
    expect(ask.alive).toBe(true);
    expect(linkDetail(ask.result, ask.alive)).toBe(`too_large: ${target.url}: over 65536 bytes (HTTP 200)`);
  });

  it("leaves a URL dead when the handshake is refused by something that is not an MCP server", async () => {
    const { fetch } = stub({ HEAD: answered(404), GET: answered(404), POST: { ok: true, status: 422, body: '{"errors":["unprocessable"]}', url: target.url, contentType: "application/json" } });
    expect(await askUrl(target, fetch)).toMatchObject({ alive: false });
  });

  it("never sends the handshake to a URL that is not surfaces.mcp", async () => {
    const { fetch, asked } = stub({ HEAD: answered(404), GET: answered(404) });
    expect(await askUrl({ url: "https://api.a.example/v1", endpoint: true }, fetch)).toMatchObject({ alive: false });
    expect(asked).toEqual(["HEAD", "GET"]);
  });

  it("keeps a probe surface's single POST and asks it no other way when the POST answers", async () => {
    const { fetch, asked } = stub({ POST: answered(422) });
    expect(await askUrl({ url: "https://mcp.a.example/mcp", endpoint: false, method: "POST" as const }, fetch)).toMatchObject({ alive: true });
    expect(asked).toEqual(["POST"]);
  });

  it("falls through to the browser pair when a probe surface's POST says nothing, and takes the endpoint's refused redirect", async () => {
    // The real case: an MCP endpoint that answers a well-formed POST with a
    // 500 in some windows and a 200 in others, and answers a browser's HEAD
    // with a redirect to its documentation on another host every time.
    const redirect: GuardedResult = { ok: false, reason: "redirect_forbidden", detail: "https://mcp.a.example/mcp -> https://docs.b.example/" };
    const { fetch, asked } = stub({ POST: answered(500), HEAD: redirect, GET: redirect });
    const ask = await askUrl({ url: "https://mcp.a.example/mcp", endpoint: true, method: "POST" as const }, fetch);
    expect(asked).toEqual(["POST", "HEAD", "GET"]);
    expect(ask.alive).toBe(true);
    // The kept result is the one that counted, so the report prints why.
    expect(linkDetail(ask.result, ask.alive)).toBe("redirect_forbidden: https://mcp.a.example/mcp -> https://docs.b.example/");
  });

  it("leaves a probe surface dead when neither its POST nor the pair answers, and reports the POST", async () => {
    const { fetch, asked } = stub({ POST: answered(500), HEAD: answered(404), GET: answered(404) });
    // The kept failure is the POST's 500, which is transient, so the whole
    // sequence is read a second time a pause apart (issue #153) and the verdict
    // is taken from both.
    const ask = await askUrl({ url: "https://mcp.a.example/mcp", endpoint: true, method: "POST" as const }, fetch, { sleep: async () => {} });
    expect(asked).toEqual(["POST", "HEAD", "GET", "POST", "HEAD", "GET"]);
    expect(ask).toMatchObject({ alive: false, reasked: true });
    // The record's own method is what a contributor has to answer for, so a
    // dead surface prints the POST's status and not the fallback's.
    expect(linkDetail(ask.result, ask.alive)).toBe("HTTP 500");
  });

  it("asks the handshake behind the pair for a probe surface that is also surfaces.mcp", async () => {
    const body = '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18"}}';
    const { fetch, asked } = stub({ POST: answered(404), HEAD: answered(404), GET: answered(404) });
    // One stub answers both POSTs, so the handshake is told apart by its body.
    const handshake: LinkFetch = async (url, options) => {
      if (options.method === "POST" && options.body === MCP_INITIALIZE) return { ok: true, status: 200, body, url, contentType: "application/json" };
      return fetch(url, options);
    };
    const ask = await askUrl({ url: "https://mcp.a.example/mcp", endpoint: true, mcp: true, method: "POST" as const }, handshake);
    // A 404 to the empty POST is dead by the POST table, so the pair runs, then the handshake.
    expect(asked).toEqual(["POST", "HEAD", "GET"]);
    expect(ask.alive).toBe(true);
  });
});

describe("the second reading a pause apart (issue #153)", () => {
  // The pause is injected, so these tests exercise the sequence and never sleep.
  const paused = () => {
    const slept: number[] = [];
    return { slept, options: { sleep: async (ms: number) => void slept.push(ms) } };
  };
  const target = { url: "https://a.example/", endpoint: false };

  it("re-asks a 5xx after a pause and takes the second reading, naming it as a second reading", async () => {
    // Both requests of the first reading err, which is the case issue #153
    // measured: HEAD and GET leave in the same window and an edge that is
    // briefly erroring answers both identically.
    let call = 0;
    const fetch: LinkFetch = async () => (++call <= 2 ? answered(503) : answered(200));
    const { slept, options } = paused();
    const ask = await askUrl(target, fetch, { ...options, pauseMs: 2_500 });
    expect(ask).toMatchObject({ alive: true, reasked: true });
    expect(slept).toEqual([2_500]);
    // Two requests in the first reading (HEAD then GET on a 5xx), then the second.
    expect(call).toBe(3);
  });

  it("keeps the first reading's failure when both fail, and still says it read twice", async () => {
    const { options } = paused();
    const ask = await askUrl(target, async () => answered(500), { ...options });
    expect(ask).toMatchObject({ alive: false, reasked: true });
    expect(linkDetail(ask.result, ask.alive)).toBe("HTTP 500");
  });

  it("never re-asks an answer, and never re-asks a refusal a pause cannot change", async () => {
    for (const answer of [answered(200), answered(404), answered(410), refused("not_https"), refused("address_forbidden"), refused("unresolvable"), refused("redirect_forbidden")]) {
      let call = 0;
      const { slept, options } = paused();
      const ask = await askUrl(target, async () => { call += 1; return answer; }, options);
      expect(ask.reasked).toBeUndefined();
      expect(slept).toEqual([]);
      // At most the first reading's own HEAD and GET: no second reading.
      expect(call).toBeLessThanOrEqual(2);
    }
  });

  it("re-asks a timeout and a network error, which is the rest of what issue #153 named", async () => {
    for (const reason of ["timeout", "network"] as const) {
      const { slept, options } = paused();
      let call = 0;
      const fetch: LinkFetch = async () => (++call <= 2 ? refused(reason) : answered(200));
      expect(await askUrl(target, fetch, options)).toMatchObject({ alive: true, reasked: true });
      expect(slept).toEqual([REASK_PAUSE_MS]);
    }
  });

  it("re-asks a probe surface whose POST erred, and the second reading is the whole sequence again", async () => {
    const probe = { url: "https://mcp.a.example/mcp", endpoint: false, method: "POST" as const };
    const methods: string[] = [];
    let reading = 0;
    const fetch: LinkFetch = async (_url, options) => {
      methods.push(options.method);
      if (options.method === "POST") reading += 1;
      // First reading: the POST 500s and the pair 404s. Second: the POST answers.
      return options.method === "POST" && reading > 1 ? answered(200) : options.method === "POST" ? answered(500) : answered(404);
    };
    const { slept, options } = paused();
    expect(await askUrl(probe, fetch, options)).toMatchObject({ alive: true, reasked: true });
    expect(methods).toEqual(["POST", "HEAD", "GET", "POST"]);
    expect(slept).toEqual([REASK_PAUSE_MS]);
  });

  it("waits three seconds by default, which is a pause and not a retry budget", () => {
    expect(REASK_PAUSE_MS).toBe(3_000);
  });
});

describe("transientFailure", () => {
  it("names a 5xx, a timeout and a network error, and nothing a second reading cannot change", () => {
    for (const status of [500, 502, 503, 504]) expect(transientFailure(answered(status))).toBe(true);
    for (const status of [200, 301, 400, 401, 403, 404, 410, 422, 429]) expect(transientFailure(answered(status))).toBe(false);
    expect(transientFailure(refused("timeout"))).toBe(true);
    expect(transientFailure(refused("network"))).toBe(true);
    for (const reason of ["not_https", "address_forbidden", "unresolvable", "redirect_forbidden"] as const) expect(transientFailure(refused(reason))).toBe(false);
    // A capped body is judged by the status that arrived before it, here too.
    const capped = (status?: number): GuardedResult => ({ ok: false, reason: "too_large", detail: "over the cap", ...(status === undefined ? {} : { status }) });
    expect(transientFailure(capped(503))).toBe(true);
    expect(transientFailure(capped(404))).toBe(false);
    expect(transientFailure(capped())).toBe(false);
  });
});

describe("askKey", () => {
  it("joins the spellings of one URL and keeps the shapes of one URL apart", () => {
    const base = { url: "https://mcp.a.example", endpoint: true };
    // One server, two spellings, one ask: the gate asks a stranger once per run.
    expect(askKey(base)).toBe(askKey({ ...base, url: "HTTPS://Mcp.A.Example/" }));
    // Different requests sent, or different answers counting, so different asks.
    expect(askKey(base)).not.toBe(askKey({ ...base, method: "POST" as const }));
    expect(askKey(base)).not.toBe(askKey({ ...base, mcp: true }));
    expect(askKey(base)).not.toBe(askKey({ ...base, endpoint: false }));
    // A URL the parser refuses is its own key rather than everyone's.
    expect(askKey({ url: "https://[", endpoint: false })).not.toBe(askKey({ url: "https://]", endpoint: false }));
  });
});
