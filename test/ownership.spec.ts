import { describe, expect, it } from "vitest";
import { forbiddenAddress, guardedFetch, type Transport } from "../src/lib/net.ts";
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
