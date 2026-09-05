import MarkdownIt from "markdown-it";
import { refusal, type Refusal } from "./refusals.ts";

/**
 * The schema-free half of an entry, rendered by one function that CI
 * and the site share: what CI validated is exactly what renders.
 * Markdown only, no HTML, headings from h2 down, https/http/mailto
 * links, images only from allowlisted hosts or the entry's own domains.
 */

export const PROFILE_MAX_BYTES = 16_000;
export const PROFILE_MAX_IMAGES = 8;

const ALLOWED_TAGS = new Set([
  "p", "a", "ul", "ol", "li", "strong", "em", "code", "pre", "h2", "h3", "h4", "blockquote", "img", "br", "hr",
  "table", "thead", "tbody", "tr", "th", "td"
]);

const md = new MarkdownIt({ html: false, linkify: false, typographer: false });

export interface ProfileResult {
  html: string;
  refusals: Refusal[];
}

export function renderProfile(
  markdown: string,
  options: { file: string; ownDomains: readonly string[]; imageHosts: readonly string[] }
): ProfileResult {
  const refusals: Refusal[] = [];
  const bytes = Buffer.byteLength(markdown, "utf8");
  if (bytes > PROFILE_MAX_BYTES) refusals.push(refusal("PROFILE_TOO_LARGE", options.file, `${bytes} bytes`));
  if (/<[a-zA-Z!/?]/.test(markdown)) refusals.push(refusal("PROFILE_HTML_FORBIDDEN", options.file));

  const tokens = md.parse(markdown, {});
  let images = 0;
  const allowedHosts = new Set([...options.imageHosts, ...options.ownDomains].map(h => h.toLowerCase()));
  const walk = (list: typeof tokens) => {
    for (const token of list) {
      if (token.type === "heading_open" && token.tag === "h1") refusals.push(refusal("PROFILE_H1_FORBIDDEN", options.file));
      if (token.type === "link_open") {
        const href = token.attrGet("href") ?? "";
        if (!/^(https?:|mailto:)/i.test(href)) refusals.push(refusal("PROFILE_LINK_SCHEME", options.file, href));
      }
      if (token.type === "image") {
        images += 1;
        const src = token.attrGet("src") ?? "";
        let ok = false;
        try {
          const url = new URL(src);
          ok = url.protocol === "https:" && allowedHosts.has(url.hostname.toLowerCase());
        } catch {
          ok = false;
        }
        if (!ok) refusals.push(refusal("PROFILE_IMAGE_HOST", options.file, src));
      }
      if (token.type === "html_block" || token.type === "html_inline") refusals.push(refusal("PROFILE_HTML_FORBIDDEN", options.file));
      if (token.children) walk(token.children);
    }
  };
  walk(tokens);
  if (images > PROFILE_MAX_IMAGES) refusals.push(refusal("PROFILE_TOO_MANY_IMAGES", options.file, String(images)));

  // Render, then keep only the allowlisted tags: defense in depth behind
  // the refusals above, so a renderer quirk cannot widen the surface.
  const rendered = md.render(markdown);
  const html = rendered.replace(/<\/?([a-zA-Z0-9]+)(\s[^>]*)?>/g, (whole, tag: string) =>
    ALLOWED_TAGS.has(tag.toLowerCase()) ? whole : ""
  );
  return { html, refusals: dedupe(refusals) };
}

function dedupe(list: Refusal[]): Refusal[] {
  const seen = new Set<string>();
  return list.filter(r => {
    const key = `${r.code}|${r.detail ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
