/**
 * The public URL path of a page, from the pathname Astro renders it at.
 *
 * The site builds with `build.format: "file"`, so a page is emitted as a
 * file and renders at `/tools/stripe.html` or `/index.html` while the
 * served route is extensionless: in production `/tools/stripe.html`
 * answers 307 to `/tools/stripe`. An agent is emitted twice, at
 * `/agents/<lower>` and at `/@Handle`, and the Worker 301s the first onto
 * the second, so only `/@Handle` is public. Pure: the layout puts what
 * this returns in `<link rel="canonical">` and `og:url`.
 */

/** The emitted pathname reduced to the path the site actually serves. */
export function servedPath(pathname: string): string {
  return (
    pathname
      .replace(/\.html$/, "")
      .replace(/(^|\/)index$/, "$1")
      .replace(/\/+$/, "") || "/"
  );
}

/**
 * The one public path for a page. `handles` maps a lowercased handle to the
 * registry's own spelling of it, as the Worker's does: lowercasing instead
 * would name a URL that redirects, since `/@signpost` 301s to `/@Signpost`.
 */
export function canonicalPath(pathname: string, handles: Record<string, string>): string {
  const path = servedPath(pathname);
  const agent = /^\/agents\/([^/.]+)$/.exec(path);
  const handle = agent ? handles[agent[1].toLowerCase()] : undefined;
  return handle ? `/@${handle}` : path;
}
