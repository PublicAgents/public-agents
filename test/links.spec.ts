import { describe, expect, it } from "vitest";
import { askUrl, canonicalUrl, endpointsOf, linkAnswers, linkDetail, MCP_ACCEPT, MCP_INITIALIZE, mcpEndpointsOf, mcpHandshakeAnswers, probeSurfaceOf } from "../src/lib/links.ts";
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
  it("takes 2xx, 3xx, 401, 402, 403 and 405 for pages and endpoints alike", () => {
    for (const status of [200, 301, 401, 402, 403, 405]) {
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
    for (const status of [400, 406, 411, 415, 422, 429]) {
      expect(linkAnswers(answered(status), false, "POST")).toBe(true);
      expect(linkAnswers(answered(status), false)).toBe(false);
      expect(linkAnswers(answered(status), true)).toBe(false);
    }
    for (const status of [404, 410, 500, 502, 503]) expect(linkAnswers(answered(status), false, "POST")).toBe(false);
    for (const status of [200, 301, 401, 402, 403, 405]) expect(linkAnswers(answered(status), false, "POST")).toBe(true);
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

  it("leaves a URL dead when the handshake is refused by something that is not an MCP server", async () => {
    const { fetch } = stub({ HEAD: answered(404), GET: answered(404), POST: { ok: true, status: 422, body: '{"errors":["unprocessable"]}', url: target.url, contentType: "application/json" } });
    expect(await askUrl(target, fetch)).toMatchObject({ alive: false });
  });

  it("never sends the handshake to a URL that is not surfaces.mcp", async () => {
    const { fetch, asked } = stub({ HEAD: answered(404), GET: answered(404) });
    expect(await askUrl({ url: "https://api.a.example/v1", endpoint: true }, fetch)).toMatchObject({ alive: false });
    expect(asked).toEqual(["HEAD", "GET"]);
  });

  it("keeps a probe surface's single POST and asks it no other way", async () => {
    const { fetch, asked } = stub({ POST: answered(422) });
    expect(await askUrl({ url: "https://mcp.a.example/mcp", endpoint: false, method: "POST" as const }, fetch)).toMatchObject({ alive: true });
    expect(asked).toEqual(["POST"]);
  });
});
