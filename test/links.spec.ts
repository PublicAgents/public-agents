import { describe, expect, it } from "vitest";
import { canonicalUrl, endpointsOf, linkAnswers, linkDetail, probeSurfaceOf } from "../src/lib/links.ts";
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
