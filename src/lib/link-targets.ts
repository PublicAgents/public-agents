import { canonicalUrl, endpointsOf, mcpEndpointsOf, probeExpectationOf, probeSurfaceOf, type ProbeExpectation, type TargetMethod } from "./links.ts";
import { profileUrls } from "./profile.ts";

/**
 * Which (file, url) pairs `check-links` fetches, decided without touching
 * the network or git so it can be tested directly.
 *
 * Three rules live here and nowhere else, which is the point of the file:
 * the https-only fetch policy, the path spelling used to compare a
 * changed-file set with the loader's paths, and the gate that reads an
 * entry's profile.md on its own path rather than on its JSON.
 */

export interface LinkTarget {
  file: string;
  url: string;
  /**
   * The URL is one the entry declares as `surfaces.mcp` or `surfaces.api`:
   * a server an agent POSTs to, not a page. `check-links` reads an answer
   * from such a URL differently (src/lib/links.ts). The flag follows the
   * URL, not the file that names it: the same endpoint quoted in the
   * entry's profile.md is the same server, in whatever spelling the URL
   * parser reads as equal (case of the scheme and host, a trailing slash).
   */
  endpoint: boolean;
  /**
   * Present only on a probe's own `surface` when the record's
   * `request.method` is POST: `check-links` asks that URL with a POST
   * rather than its HEAD-then-GET pair (src/lib/links.ts says why and
   * which answers count). Absent everywhere else.
   */
  method?: TargetMethod;
  /**
   * The URL is the entry's `surfaces.mcp`. When HEAD and GET have both
   * failed to answer it, `check-links` asks once more the only way an MCP
   * client can: a JSON-RPC `initialize` (src/lib/links.ts). The flag
   * follows the URL, like `endpoint`, so the same endpoint quoted in the
   * profile is treated as the same server.
   */
  mcp?: boolean;
  /**
   * Present only on a probe's own `surface`: the status the record filed in
   * `observed.status`, and the method of the request that read it. That
   * surface answering exactly that status, to exactly that method, counts as
   * alive whatever the liveness table says about it, so a record whose whole
   * finding is a 404 can be filed (issue #228; `probeExpectationOf` in
   * src/lib/links.ts says what the narrowing buys, what it costs, and why the
   * method travels with the status). Absent everywhere else, including on the
   * same URL named by an entry.
   */
  expect?: ProbeExpectation;
}

/** The shape this needs from a loaded entry; the registry's entries satisfy it. */
export interface TargetSource {
  file: string;
  value: unknown;
  profile?: string;
  profileFile?: string;
}

/**
 * git prints forward slashes whatever the platform; the loader's paths come
 * from node:path, so both sides are compared in one spelling. Without this,
 * `--changed-only` matched nothing at all on Windows and every pull request
 * passed the link gate.
 */
export const slash = (path: string) => path.replaceAll("\\", "/");

/**
 * Every https URL anywhere inside a JSON value. The scheme is matched
 * without regard to case because `httpsUrl` in the schema is
 * `z.url({ protocol: /^https$/ })` and zod tests the *parsed* protocol, so
 * an entry may carry `HTTPS://` today and validate.
 */
export function urlsOf(value: unknown, out: Set<string>) {
  if (typeof value === "string") {
    if (/^https:\/\//i.test(value)) out.add(value);
  } else if (Array.isArray(value)) value.forEach(v => urlsOf(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach(v => urlsOf(v, out));
}

/**
 * https only, because the fetch policy is: a mailto: or http: link is not a
 * URL this check can answer for. The registry's own schema URLs are excluded;
 * they are served by the site being built, not by a third party.
 *
 * Both tests are case-insensitive, the way the renderer reads a scheme and
 * the way a URL parser reads one. A case-sensitive filter drops an uppercase
 * link *silently*, which is worse than either fetching it or refusing it: the
 * reader can follow it and the check cannot see it.
 */
function keep(url: string) {
  return /^https:\/\//i.test(url) && !/^https:\/\/public-agents\.com\/schemas\//i.test(url);
}

export interface TargetOptions {
  /** Changed files, in git's spelling. Undefined means every file (the nightly `--all` run). */
  changed?: ReadonlySet<string>;
  /** The payment-protocol vocabulary, checked as one file rather than per entry. */
  paymentProtocols?: unknown;
  paymentProtocolsFile?: string;
}

export function linkTargets(entries: Iterable<TargetSource>, options: TargetOptions = {}): LinkTarget[] {
  const { changed, paymentProtocols, paymentProtocolsFile = "registry/payment-protocols.json" } = options;
  const targets: LinkTarget[] = [];
  const add = (
    file: string,
    urls: Iterable<string>,
    endpoints: ReadonlySet<string> = new Set(),
    surface?: { url: string; method: TargetMethod },
    mcpEndpoints: ReadonlySet<string> = new Set(),
    expectation?: { url: string; expect: ProbeExpectation }
  ) => {
    for (const url of urls) {
      if (!keep(url)) continue;
      const canonical = canonicalUrl(url);
      targets.push({
        file,
        url,
        endpoint: endpoints.has(canonical),
        ...(mcpEndpoints.has(canonical) ? { mcp: true } : {}),
        ...(surface && surface.url === canonical ? { method: surface.method } : {}),
        ...(expectation && expectation.url === canonical ? { expect: expectation.expect } : {})
      });
    }
  };
  const wanted = (file: string) => !changed || changed.has(slash(file));

  // Both flags follow the URL, not the file that names it, and a URL is named
  // by more than one file: the server an entry declares as `surfaces.mcp` is
  // the same server a probe record of that entry measured, and a probe record
  // carries no `surfaces` block of its own. Reading the flags per entry gave a
  // probe's surface `endpoint: false` for the very endpoint the registry
  // declares two files away, so the exceptions in src/lib/links.ts written for
  // a machine endpoint (a refused cross-host redirect to its documentation, the
  // JSON-RPC handshake) were unreachable from the record that probed it. The
  // sets are the union over every entry, including entries this run will not
  // ask about: which URLs are endpoints is a fact about the registry, not about
  // the changed-file set.
  const all = [...entries];
  const endpoints = new Set<string>();
  const mcpEndpoints = new Set<string>();
  for (const entry of all) {
    for (const url of endpointsOf(entry.value)) endpoints.add(url);
    for (const url of mcpEndpointsOf(entry.value)) mcpEndpoints.add(url);
  }

  for (const entry of all) {
    if (wanted(entry.file)) {
      const urls = new Set<string>();
      urlsOf(entry.value, urls);
      // A probe's surface carries the record's method; every other URL in the record is a page.
      add(entry.file, urls, endpoints, probeSurfaceOf(entry.value), mcpEndpoints, probeExpectationOf(entry.value));
    }
    // The profile is the other half of an entry and it is where the citations
    // behind its quotations live, so a URL named there is named by the entry.
    // It is gated on its own file: editing profile.md alone changes which URLs
    // the entry points a reader at, and gating that on the JSON meant a
    // profile-only pull request checked nothing at all.
    if (entry.profile !== undefined && entry.profileFile !== undefined && wanted(entry.profileFile)) {
      add(entry.profileFile, profileUrls(entry.profile), endpoints, undefined, mcpEndpoints);
    }
  }

  // The payment-protocol vocabulary is one file, not a per-entry record; its
  // url/spec/source must stay live like any URL the registry publishes.
  if (paymentProtocols !== undefined && wanted(paymentProtocolsFile)) {
    const urls = new Set<string>();
    urlsOf(paymentProtocols, urls);
    add(paymentProtocolsFile, urls);
  }

  return targets;
}
