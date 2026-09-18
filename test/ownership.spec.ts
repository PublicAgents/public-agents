import { describe, expect, it } from "vitest";
import { forbiddenAddress, guardedFetch, type Transport, type TransportResponse } from "../src/lib/net.ts";
import { decideWithProof, fetchProof, parseTxtRecord, updateNeedsProof } from "../src/lib/ownership.ts";

const resolvePublic = async () => ["93.184.216.34"];

/** A scripted transport; it also records the address every request was pinned to. */
function fetchOf(routes: Record<string, { status?: number; body?: string; headers?: Record<string, string> }>, pinned: string[] = []): Transport {
  return async req => {
    pinned.push(req.address);
    const route = routes[req.url.toString()];
    if (!route) return { kind: "response", status: 404, headers: {}, body: "not found" };
    const body = route.body ?? "";
    if (Buffer.byteLength(body) > req.maxBytes) return { kind: "too_large" };
    return { kind: "response", status: route.status ?? 200, headers: route.headers ?? { "content-type": "application/json" }, body };
  };
}

describe("guardedFetch", () => {
  it("sends a POST with its JSON body and keeps the status of an answer that outgrew the cap", async () => {
    const seen: Array<{ method: string; body?: string; headers: Record<string, string> }> = [];
    const transport: Transport = async req => {
      seen.push({ method: req.method, body: req.body, headers: req.headers });
      if (req.method === "POST") return { kind: "response", status: 406, headers: {}, body: "" };
      return { kind: "too_large", status: 200 };
    };
    const posted = await guardedFetch("https://a.example/mcp", { resolve: resolvePublic, transport, method: "POST", body: "{}" });
    expect(posted).toMatchObject({ ok: true, status: 406 });
    expect(seen[0]).toMatchObject({ method: "POST", body: "{}", headers: { "content-type": "application/json" } });
    const capped = await guardedFetch("https://a.example/big", { resolve: resolvePublic, transport, maxBytes: 16 });
    expect(capped).toMatchObject({ ok: false, reason: "too_large", status: 200 });
    expect((capped as { detail: string }).detail).toContain("(HTTP 200)");
    // A GET or HEAD carries no body and no content-type; a transport that drops the status on a cap leaves the result without one.
    expect(seen[1].body).toBeUndefined();
    expect(seen[1].headers["content-type"]).toBeUndefined();
    const bare = await guardedFetch("https://a.example/", { resolve: resolvePublic, transport: fetchOf({ "https://a.example/": { body: "x".repeat(20) } }), maxBytes: 16 });
    expect(bare).toMatchObject({ ok: false, reason: "too_large" });
    expect("status" in bare).toBe(false);
  });
  it("follows a redirect with a GET after a POST, and reads a capped redirect by its Location like any other", async () => {
    const seen: Array<{ url: string; method: string; body?: string }> = [];
    const transport: Transport = async (req): Promise<TransportResponse> => {
      seen.push({ url: req.url.toString(), method: req.method, body: req.body });
      if (req.url.pathname === "/mcp") return { kind: "response", status: 303, headers: { location: "/docs" }, body: "" };
      if (req.url.pathname === "/big-away") return { kind: "too_large", status: 302, headers: { location: "https://b.example/" } };
      if (req.url.pathname === "/big-home") return { kind: "too_large", status: 301, headers: { location: "/docs" } };
      if (req.url.pathname === "/big-nowhere") return { kind: "too_large", status: 302 };
      return { kind: "response", status: 200, headers: {}, body: "docs" };
    };
    const posted = await guardedFetch("https://a.example/mcp", { resolve: resolvePublic, transport, method: "POST", body: "{}" });
    expect(posted).toMatchObject({ ok: true, status: 200, url: "https://a.example/docs" });
    expect(seen.map(s => `${s.method} ${s.url} ${s.body ?? "-"}`)).toEqual(["POST https://a.example/mcp {}", "GET https://a.example/docs -"]);
    // An oversized off-host redirect is refused exactly as a small one is; on-host it is followed; without a Location it is refused.
    expect(await guardedFetch("https://a.example/big-away", { resolve: resolvePublic, transport })).toMatchObject({ ok: false, reason: "redirect_forbidden", detail: "https://a.example/big-away -> https://b.example/" });
    expect(await guardedFetch("https://a.example/big-home", { resolve: resolvePublic, transport })).toMatchObject({ ok: true, status: 200, url: "https://a.example/docs" });
    expect(await guardedFetch("https://a.example/big-nowhere", { resolve: resolvePublic, transport })).toMatchObject({ ok: false, reason: "redirect_forbidden" });
  });
  it("refuses http, private addresses, cross-host redirects and oversized bodies", async () => {
    expect((await guardedFetch("http://a.example/", { resolve: resolvePublic })).ok).toBe(false);
    const priv = await guardedFetch("https://a.example/", { resolve: async () => ["10.0.0.5"], transport: fetchOf({}) });
    expect(priv).toMatchObject({ ok: false, reason: "address_forbidden" });
    const hop = await guardedFetch("https://a.example/", {
      resolve: resolvePublic,
      transport: fetchOf({ "https://a.example/": { status: 302, headers: { location: "https://b.example/" } } })
    });
    expect(hop).toMatchObject({ ok: false, reason: "redirect_forbidden" });
    const big = await guardedFetch("https://a.example/", { resolve: resolvePublic, transport: fetchOf({ "https://a.example/": { body: "x".repeat(200) } }), maxBytes: 100 });
    expect(big).toMatchObject({ ok: false, reason: "too_large" });
    const pinned: string[] = [];
    const ok = await guardedFetch("https://a.example/", {
      resolve: resolvePublic,
      transport: fetchOf({ "https://a.example/": { status: 301, headers: { location: "/x" } }, "https://a.example/x": { body: "hi" } }, pinned)
    });
    expect(ok).toMatchObject({ ok: true, status: 200, body: "hi", url: "https://a.example/x" });
    // Every hop connects to the address that passed the check, never to a fresh resolution.
    expect(pinned).toEqual(["93.184.216.34", "93.184.216.34"]);
  });
  it("classifies addresses", () => {
    expect(forbiddenAddress("127.0.0.1")).toBe("loopback");
    expect(forbiddenAddress("169.254.169.254")).toBe("link-local");
    expect(forbiddenAddress("172.20.1.1")).toBe("private");
    expect(forbiddenAddress("100.100.1.1")).toBe("carrier-grade nat");
    expect(forbiddenAddress("::1")).toBe("loopback");
    expect(forbiddenAddress("fd00::1")).toBe("unique local");
    expect(forbiddenAddress("::ffff:10.1.1.1")).toBe("private");
    expect(forbiddenAddress("93.184.216.34")).toBeUndefined();
    expect(forbiddenAddress("2606:2800:220:1:248:1893:25c8:1946")).toBeUndefined();
  });
});

describe("proofs", () => {
  it("parses the TXT grammar", () => {
    expect(parseTxtRecord("v=pa1; handle=Prior; maintainers=mkrens,prior-bot")).toEqual({ name: "prior", maintainers: ["mkrens", "prior-bot"] });
    expect(parseTxtRecord("v=pa1; handle=Prior")).toBeUndefined();
    expect(parseTxtRecord("v=spf1 include:x")).toBeUndefined();
  });

  it("reads the well-known file, the TXT record, and refuses a conflict", async () => {
    const wk = { version: 1, agents: ["Prior"], tools: [], maintainers: ["mkrens"] };
    const onlyWellKnown = await fetchProof("prior.example", "prior", {
      fetch: { resolve: resolvePublic, transport: fetchOf({ "https://prior.example/.well-known/public-agents.json": { body: JSON.stringify(wk) } }) },
      txt: async () => []
    });
    expect(onlyWellKnown).toMatchObject({ method: "well-known" });
    const onlyTxt = await fetchProof("prior.example", "prior", {
      fetch: { resolve: resolvePublic, transport: fetchOf({}) },
      txt: async () => ["v=pa1; handle=prior; maintainers=mkrens"]
    });
    expect(onlyTxt).toMatchObject({ method: "dns-txt" });
    const conflict = await fetchProof("prior.example", "prior", {
      fetch: { resolve: resolvePublic, transport: fetchOf({ "https://prior.example/.well-known/public-agents.json": { body: JSON.stringify(wk) } }) },
      txt: async () => ["v=pa1; handle=prior; maintainers=someone-else"]
    });
    expect(conflict).toMatchObject({ reason: "OWNERSHIP_CONFLICT" });
    const nothing = await fetchProof("prior.example", "prior", { fetch: { resolve: resolvePublic, transport: fetchOf({}) }, txt: async () => [] });
    expect(nothing).toMatchObject({ reason: "OWNERSHIP_FETCH_FAILED" });
    const internal = await fetchProof("prior.example", "prior", { fetch: { resolve: async () => ["127.0.0.1"], transport: fetchOf({}) }, txt: async () => [] });
    expect(internal).toMatchObject({ reason: "OWNERSHIP_ADDRESS_FORBIDDEN" });
  });

  it("decides a create by the proof's names and maintainers", () => {
    const proof = { method: "well-known" as const, names: new Set(["prior"]), maintainers: new Set(["mkrens", "prior-bot"]) };
    expect(decideWithProof({ name: "Prior", author: "mkrens", maintainers: ["mkrens", "prior-bot"], proof })).toEqual({ ok: true, via: "well-known" });
    expect(decideWithProof({ name: "Other", author: "mkrens", maintainers: ["mkrens"], proof })).toMatchObject({ code: "OWNERSHIP_HANDLE_NOT_LISTED" });
    expect(decideWithProof({ name: "Prior", author: "stranger", maintainers: ["mkrens"], proof })).toMatchObject({ code: "OWNERSHIP_AUTHOR_NOT_LISTED" });
    expect(decideWithProof({ name: "Prior", author: "mkrens", maintainers: ["mkrens", "extra"], proof })).toMatchObject({ code: "OWNERSHIP_AUTHOR_NOT_LISTED" });
    expect(decideWithProof({ name: "Prior", author: "mkrens", maintainers: [], proof: { reason: "OWNERSHIP_FETCH_FAILED", detail: "x" } })).toMatchObject({ code: "OWNERSHIP_FETCH_FAILED" });
  });

  it("decides when an update needs a fresh proof", () => {
    const base = { author: "mkrens", baseMaintainers: ["mkrens"], nextMaintainers: ["mkrens"], baseDomain: "a.example", nextDomain: "a.example", lastVerified: "2026-09-01T00:00:00Z", now: "2026-09-05T00:00:00Z" };
    expect(updateNeedsProof(base)).toEqual({ decision: "pass" });
    expect(updateNeedsProof({ ...base, author: "stranger" })).toMatchObject({ decision: "refuse", code: "OWNERSHIP_UNVERIFIED" });
    expect(updateNeedsProof({ ...base, nextMaintainers: ["mkrens", "new"] })).toMatchObject({ decision: "prove" });
    expect(updateNeedsProof({ ...base, nextDomain: "b.example" })).toMatchObject({ decision: "prove" });
    expect(updateNeedsProof({ ...base, lastVerified: undefined })).toMatchObject({ decision: "prove" });
    expect(updateNeedsProof({ ...base, lastVerified: "2026-07-01T00:00:00Z" })).toMatchObject({ decision: "prove" });
  });
});
