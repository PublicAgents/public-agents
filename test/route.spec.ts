import { describe, expect, it } from "vitest";
import { route } from "../worker/route.ts";

const handles = { prior: "Prior", cairn: "Cairn" };
const u = (path: string, host = "public-agents.com") => new URL(`https://${host}${path}`);

describe("route", () => {
  it("serves canonical handles and redirects other casings", () => {
    expect(route(u("/@Prior"), null, handles)).toMatchObject({ kind: "asset", path: "/agents/prior" });
    expect(route(u("/@prior"), null, handles)).toEqual({ kind: "redirect", to: "/@Prior", status: 301 });
    expect(route(u("/@prior?ref=directory"), null, handles)).toEqual({ kind: "redirect", to: "/@Prior?ref=directory", status: 301 });
    expect(route(u("/agents/prior?x=1"), null, handles)).toEqual({ kind: "redirect", to: "/@Prior?x=1", status: 301 });
    expect(route(u("/@PRIOR.json"), null, handles)).toEqual({ kind: "redirect", to: "/@Prior.json", status: 301 });
    expect(route(u("/@Prior.json"), null, handles)).toMatchObject({ kind: "asset", path: "/agents/prior.json" });
    expect(route(u("/@Prior/card.json"), null, handles)).toMatchObject({ kind: "asset", path: "/agents/prior/card.json" });
    expect(route(u("/@prior/profile.md"), null, handles)).toEqual({ kind: "redirect", to: "/@Prior/profile.md", status: 301 });
    expect(route(u("/@nobody"), null, handles)).toEqual({ kind: "next" });
    expect(route(u("/agents/prior"), null, handles)).toEqual({ kind: "redirect", to: "/@Prior", status: 301 });
    expect(route(u("/agents/prior/card.json"), null, handles)).toEqual({ kind: "redirect", to: "/@Prior/card.json", status: 301 });
  });

  it("negotiates markdown and sets the discovery links", () => {
    expect(route(u("/@Prior"), "text/markdown", handles)).toMatchObject({ kind: "asset", path: "/agents/prior.md" });
    expect(route(u("/@Prior"), "text/html,text/markdown", handles)).toMatchObject({ path: "/agents/prior" });
    const page = route(u("/@Prior"), "text/html", handles);
    expect(page).toMatchObject({ kind: "asset", path: "/agents/prior" });
    expect((page as { headers: Record<string, string> }).headers.link).toContain('</llms.txt>; rel="describedby"');
    expect((page as { headers: Record<string, string> }).headers.link).toContain('</@Prior.json>; rel="alternate"');
    expect(route(u("/"), "text/markdown", handles)).toMatchObject({ path: "/llms.txt" });
    expect(route(u("/register"), "text/markdown", handles)).toMatchObject({ path: "/SKILL.md" });
    expect(route(u("/tools/livevariant"), "text/markdown", handles)).toMatchObject({ path: "/tools/livevariant.md" });
    expect(route(u("/jobs/cs.deflect-tier1"), null, handles)).toMatchObject({ kind: "asset", headers: { link: expect.stringContaining("/jobs/cs.deflect-tier1.json") } });
    expect(route(u("/.well-known/api-catalog"), null, handles)).toMatchObject({ headers: { "content-type": "application/linkset+json" } });
  });

  it("redirects www and passes everything else through", () => {
    expect(route(u("/x?y=1", "www.public-agents.com"), null, handles)).toEqual({ kind: "redirect", to: "https://public-agents.com/x?y=1", status: 301 });
    expect(route(u("/agents.json"), null, handles)).toEqual({ kind: "next" });
    expect(route(u("/schemas/agent.schema.json"), null, handles)).toEqual({ kind: "next" });
  });
});
