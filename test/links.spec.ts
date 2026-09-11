import { describe, expect, it } from "vitest";
import { endpointsOf, linkAnswers, linkDetail } from "../src/lib/links.ts";
import type { GuardedResult } from "../src/lib/net.ts";

const answered = (status: number): GuardedResult => ({ ok: true, status, body: "", url: "https://a.example/", contentType: "text/html" });
const refused = (reason: Extract<GuardedResult, { ok: false }>["reason"], detail = "https://a.example/ -> https://b.example/"): GuardedResult => ({ ok: false, reason, detail });

describe("endpointsOf", () => {
  it("names surfaces.mcp and surfaces.api, nothing else", () => {
    const entry = { surfaces: { homepage: "https://a.example/", docs: "https://a.example/docs", mcp: "https://mcp.a.example", api: "https://api.a.example/v1", source: "https://github.com/a/a" } };
    expect([...endpointsOf(entry)]).toEqual(["https://mcp.a.example", "https://api.a.example/v1"]);
    expect(endpointsOf({ surfaces: { mcp: null, api: "http://api.a.example" } }).size).toBe(0);
    expect(endpointsOf({}).size).toBe(0);
    expect(endpointsOf(undefined).size).toBe(0);
  });
});

describe("linkAnswers", () => {
  it("takes 2xx, 3xx, 401, 403 and 405 for pages and endpoints alike", () => {
    for (const status of [200, 301, 401, 403, 405]) {
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
    }
  });
});

describe("linkDetail", () => {
  it("prints the redirect beside an endpoint accepted through the exception, and nothing beside a plain answer", () => {
    expect(linkDetail(refused("redirect_forbidden"), true)).toBe("redirect_forbidden: https://a.example/ -> https://b.example/");
    expect(linkDetail(answered(200), true)).toBe("");
    expect(linkDetail(answered(404), false)).toBe("HTTP 404");
    expect(linkDetail(refused("timeout", "https://a.example/"), false)).toBe("timeout: https://a.example/");
  });
});
