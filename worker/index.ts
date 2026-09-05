import { route } from "./route.ts";

/**
 * Twenty lines around route(): every request that reaches the Worker
 * (see run_worker_first in wrangler.jsonc) is routed, then served from
 * the static assets with the headers the route asks for.
 */
interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

let handles: Record<string, string> | undefined;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!handles) {
      const response = await env.ASSETS.fetch(new Request(`${url.origin}/handles.json`));
      handles = response.ok ? ((await response.json()) as Record<string, string>) : {};
    }
    const decision = route(url, request.headers.get("accept"), handles);
    if (decision.kind === "redirect") return Response.redirect(decision.to.startsWith("http") ? decision.to : `${url.origin}${decision.to}`, decision.status);
    if (decision.kind === "next") return env.ASSETS.fetch(request);
    const asset = await env.ASSETS.fetch(new Request(`${url.origin}${decision.path}`, { headers: request.headers, method: request.method }));
    if (!Object.keys(decision.headers).length) return asset;
    const headers = new Headers(asset.headers);
    for (const [key, value] of Object.entries(decision.headers)) headers.set(key, value);
    return new Response(asset.body, { status: asset.status, headers });
  }
};
