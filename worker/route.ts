/**
 * The little logic in front of a static site (docs/ENDPOINTS.md): the
 * canonical `/@Handle` URLs that Astro cannot emit, case-insensitive
 * matching with a redirect to the canonical casing, `Accept:
 * text/markdown` negotiation, the linkset content type, and the
 * discovery Link headers on every HTML page. Pure: the Worker calls it
 * and serves what it says.
 */

export type Route =
  | { kind: "redirect"; to: string; status: 301 | 308 }
  | { kind: "asset"; path: string; headers: Record<string, string> }
  | { kind: "next" };

const LINK_HEADER = [
  '</llms.txt>; rel="describedby"; type="text/markdown"',
  '</.well-known/api-catalog>; rel="api-catalog"',
  '</openapi.json>; rel="service-desc"'
].join(", ");

const HTML_PAGES = new Set(["/", "/agents", "/tools", "/jobs", "/search", "/register", "/contributing", "/about", "/schemas"]);

function wantsMarkdown(accept: string | null): boolean {
  if (!accept) return false;
  const parts = accept.split(",").map(p => p.trim().toLowerCase());
  const md = parts.findIndex(p => p.startsWith("text/markdown"));
  const html = parts.findIndex(p => p.startsWith("text/html"));
  return md >= 0 && (html < 0 || md < html);
}

export function route(url: URL, accept: string | null, handles: Record<string, string>): Route {
  if (url.hostname === "www.public-agents.com") {
    return { kind: "redirect", to: `https://public-agents.com${url.pathname}${url.search}`, status: 301 };
  }
  const path = url.pathname;
  // A redirect keeps the request's query string: attribution and filters survive canonicalisation.
  const q = url.search;

  // /@Handle, /@Handle.json, /@Handle.md, /@Handle/card.json, /@Handle/profile.md
  const at = /^\/@([^/.]+)(\.json|\.md)?(?:\/(card\.json|profile\.md))?$/.exec(path);
  if (at) {
    const [, given, ext, sub] = at;
    const canonical = handles[given.toLowerCase()];
    if (!canonical) return { kind: "next" };
    if (canonical !== given) {
      return { kind: "redirect", to: `/@${canonical}${ext ?? ""}${sub ? `/${sub}` : ""}${q}`, status: 301 };
    }
    const lower = canonical.toLowerCase();
    if (sub) return { kind: "asset", path: `/agents/${lower}/${sub}`, headers: {} };
    if (ext === ".json") return { kind: "asset", path: `/agents/${lower}.json`, headers: {} };
    if (ext === ".md") return { kind: "asset", path: `/agents/${lower}.md`, headers: {} };
    if (wantsMarkdown(accept)) return { kind: "asset", path: `/agents/${lower}.md`, headers: {} };
    return { kind: "asset", path: `/agents/${lower}`, headers: { link: `${LINK_HEADER}, </@${canonical}.json>; rel="alternate"; type="application/json"` } };
  }

  // The emitted /agents/<lower> page and its files redirect to the canonical form.
  const emitted = /^\/agents\/([^/.]+)(\.json|\.md)?(?:\/(card\.json|profile\.md))?$/.exec(path);
  if (emitted) {
    const [, lower, ext, sub] = emitted;
    const canonical = handles[lower.toLowerCase()];
    if (canonical) return { kind: "redirect", to: `/@${canonical}${ext ?? ""}${sub ? `/${sub}` : ""}${q}`, status: 301 };
    return { kind: "next" };
  }

  if (path === "/.well-known/api-catalog") {
    return { kind: "asset", path, headers: { "content-type": "application/linkset+json" } };
  }

  // Tools, jobs, functions, evidence: markdown negotiation where a sibling exists, Link headers on HTML.
  const tool = /^\/tools\/([^/.]+)$/.exec(path);
  if (tool) {
    if (wantsMarkdown(accept)) return { kind: "asset", path: `/tools/${tool[1]}.md`, headers: {} };
    return { kind: "asset", path, headers: { link: `${LINK_HEADER}, </tools/${tool[1]}.json>; rel="alternate"; type="application/json"` } };
  }
  const entity = /^\/(jobs|functions|evidence)\/([^/]+)$/.exec(path);
  if (entity && !/\.(json|md)$/.test(entity[2])) {
    return { kind: "asset", path, headers: { link: `${LINK_HEADER}, </${entity[1]}/${entity[2]}.json>; rel="alternate"; type="application/json"` } };
  }
  if (HTML_PAGES.has(path)) {
    if (path === "/" && wantsMarkdown(accept)) return { kind: "asset", path: "/llms.txt", headers: {} };
    if (path === "/register" && wantsMarkdown(accept)) return { kind: "asset", path: "/SKILL.md", headers: {} };
    return { kind: "asset", path, headers: { link: LINK_HEADER } };
  }
  return { kind: "next" };
}
