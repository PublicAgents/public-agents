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
  const add = (file: string, urls: Iterable<string>) => {
    for (const url of urls) if (keep(url)) targets.push({ file, url });
  };
  const wanted = (file: string) => !changed || changed.has(slash(file));

  for (const entry of entries) {
    if (wanted(entry.file)) {
      const urls = new Set<string>();
      urlsOf(entry.value, urls);
      add(entry.file, urls);
    }
    // The profile is the other half of an entry and it is where the citations
    // behind its quotations live, so a URL named there is named by the entry.
    // It is gated on its own file: editing profile.md alone changes which URLs
    // the entry points a reader at, and gating that on the JSON meant a
    // profile-only pull request checked nothing at all.
    if (entry.profile !== undefined && entry.profileFile !== undefined && wanted(entry.profileFile)) {
      add(entry.profileFile, profileUrls(entry.profile));
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
