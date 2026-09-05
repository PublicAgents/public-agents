import { wellKnownSchema } from "../schema/well-known.ts";
import { guardedFetch, type GuardedFetchOptions } from "./net.ts";

/**
 * Ownership (docs/OWNERSHIP.md): the binding between a handle and the
 * logins that may maintain it comes from domain-controlled content,
 * the well-known file or a DNS TXT record, never from the pull request.
 * Pure decisions here; the fetches are injected.
 */

export interface Proof {
  method: "well-known" | "dns-txt";
  /** Lowercased handles and slugs the domain acknowledges. */
  names: Set<string>;
  maintainers: Set<string>;
}

export type ProofFailure =
  | { reason: "OWNERSHIP_FETCH_FAILED"; detail: string }
  | { reason: "OWNERSHIP_ADDRESS_FORBIDDEN"; detail: string }
  | { reason: "OWNERSHIP_CONFLICT"; detail: string };

/** `v=pa1; handle=<h>; maintainers=<a>,<b>` (one record per handle or slug). */
export function parseTxtRecord(record: string): { name: string; maintainers: string[] } | undefined {
  const parts = Object.fromEntries(
    record
      .split(";")
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => {
        const eq = part.indexOf("=");
        return eq < 0 ? [part, ""] : [part.slice(0, eq).trim().toLowerCase(), part.slice(eq + 1).trim()];
      })
  ) as Record<string, string>;
  if (parts.v !== "pa1" || !parts.handle) return undefined;
  const maintainers = (parts.maintainers ?? "")
    .split(",")
    .map(login => login.trim())
    .filter(Boolean);
  if (maintainers.length === 0) return undefined;
  return { name: parts.handle.toLowerCase(), maintainers };
}

export interface ProofSources {
  fetch?: GuardedFetchOptions;
  /** DNS-over-HTTPS resolver for TXT records; returns the record strings. */
  txt?: (name: string) => Promise<string[]>;
}

async function defaultTxt(name: string, fetchOptions: GuardedFetchOptions): Promise<string[]> {
  const result = await guardedFetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=TXT`, {
    ...fetchOptions,
    accept: "application/dns-json"
  });
  if (!result.ok) throw new Error(`${result.reason}: ${result.detail}`);
  const parsed = JSON.parse(result.body) as { Answer?: Array<{ type: number; data: string }> };
  return (parsed.Answer ?? [])
    .filter(answer => answer.type === 16)
    .map(answer => answer.data.replace(/^"|"$/g, "").replace(/"\s*"/g, ""));
}

/**
 * Fetch the proofs a domain offers and combine them. Both present and
 * disagreeing on the name at hand is a conflict; either alone suffices.
 */
export async function fetchProof(domain: string, name: string, sources: ProofSources = {}): Promise<Proof | ProofFailure> {
  const fetchOptions = sources.fetch ?? {};
  const wanted = name.toLowerCase();
  const failures: string[] = [];

  let wellKnown: Proof | undefined;
  const result = await guardedFetch(`https://${domain}/.well-known/public-agents.json`, { ...fetchOptions, accept: "application/json" });
  if (result.ok && result.status === 200) {
    try {
      const parsed = wellKnownSchema.parse(JSON.parse(result.body));
      wellKnown = {
        method: "well-known",
        names: new Set([...parsed.agents, ...parsed.tools].map(n => n.toLowerCase())),
        maintainers: new Set(parsed.maintainers)
      };
    } catch (error) {
      failures.push(`well-known: not a valid ownership file (${String(error).slice(0, 120)})`);
    }
  } else if (!result.ok && result.reason === "address_forbidden") {
    return { reason: "OWNERSHIP_ADDRESS_FORBIDDEN", detail: result.detail };
  } else {
    failures.push(result.ok ? `well-known: HTTP ${result.status}` : `well-known: ${result.reason} ${result.detail}`);
  }

  let txt: Proof | undefined;
  try {
    const records = await (sources.txt ?? (n => defaultTxt(n, fetchOptions)))(`_public-agents.${domain}`);
    const parsed = records.map(parseTxtRecord).filter((r): r is NonNullable<typeof r> => r !== undefined);
    if (parsed.length > 0) {
      const mine = parsed.filter(r => r.name === wanted);
      txt = {
        method: "dns-txt",
        names: new Set(parsed.map(r => r.name)),
        maintainers: new Set(mine.flatMap(r => r.maintainers))
      };
    } else {
      failures.push(`dns-txt: no v=pa1 record at _public-agents.${domain}`);
    }
  } catch (error) {
    failures.push(`dns-txt: ${String(error).slice(0, 120)}`);
  }

  if (wellKnown && txt && wellKnown.names.has(wanted) && txt.names.has(wanted)) {
    const a = [...wellKnown.maintainers].sort().join(",");
    const b = [...txt.maintainers].sort().join(",");
    if (a !== b) return { reason: "OWNERSHIP_CONFLICT", detail: `well-known names [${a}], dns-txt names [${b}]` };
  }
  const proof = wellKnown?.names.has(wanted) ? wellKnown : txt?.names.has(wanted) ? txt : (wellKnown ?? txt);
  if (!proof) return { reason: "OWNERSHIP_FETCH_FAILED", detail: failures.join("; ") };
  return proof;
}

export type Decision = { ok: true; via: string } | { ok: false; code: OwnershipCode; detail: string };
export type OwnershipCode =
  | "OWNERSHIP_UNVERIFIED"
  | "OWNERSHIP_FETCH_FAILED"
  | "OWNERSHIP_HANDLE_NOT_LISTED"
  | "OWNERSHIP_AUTHOR_NOT_LISTED"
  | "OWNERSHIP_CONFLICT"
  | "OWNERSHIP_REVOKED"
  | "OWNERSHIP_ADDRESS_FORBIDDEN"
  | "REPORTER_MISMATCH";

/** A create, or an update that re-proves: the domain must name the handle, the author, and every maintainer the entry lists. */
export function decideWithProof(input: { name: string; author: string; maintainers: string[]; proof: Proof | ProofFailure }): Decision {
  const { proof } = input;
  if ("reason" in proof) return { ok: false, code: proof.reason, detail: proof.detail };
  const wanted = input.name.toLowerCase();
  if (!proof.names.has(wanted)) {
    return { ok: false, code: "OWNERSHIP_HANDLE_NOT_LISTED", detail: `${proof.method} names [${[...proof.names].join(", ")}], not ${input.name}` };
  }
  if (!proof.maintainers.has(input.author)) {
    return { ok: false, code: "OWNERSHIP_AUTHOR_NOT_LISTED", detail: `${proof.method} names maintainers [${[...proof.maintainers].join(", ")}], not ${input.author}` };
  }
  const stray = input.maintainers.filter(login => !proof.maintainers.has(login));
  if (stray.length > 0) {
    return { ok: false, code: "OWNERSHIP_AUTHOR_NOT_LISTED", detail: `the entry lists maintainers the ${proof.method} does not: ${stray.join(", ")}` };
  }
  return { ok: true, via: proof.method };
}

/**
 * Whether an update by `author` needs a fresh proof: a stranger is
 * refused outright; a listed maintainer passes without a fetch unless
 * the change adds a maintainer, moves the verification domain, or the
 * entry's last verification is older than the freshness bound.
 */
export function updateNeedsProof(input: {
  author: string;
  baseMaintainers: string[];
  nextMaintainers: string[];
  baseDomain: string;
  nextDomain: string;
  lastVerified: string | undefined;
  now: string;
  freshnessDays?: number;
}): { decision: "refuse"; code: "OWNERSHIP_UNVERIFIED"; detail: string } | { decision: "prove"; why: string } | { decision: "pass" } {
  if (!input.baseMaintainers.includes(input.author)) {
    return { decision: "refuse", code: "OWNERSHIP_UNVERIFIED", detail: `${input.author} is not a maintainer of the base entry (${input.baseMaintainers.join(", ") || "none"})` };
  }
  const added = input.nextMaintainers.filter(login => !input.baseMaintainers.includes(login));
  if (added.length > 0) return { decision: "prove", why: `adds maintainers ${added.join(", ")}` };
  if (input.baseDomain !== input.nextDomain) return { decision: "prove", why: `moves the verification domain to ${input.nextDomain}` };
  const days = input.freshnessDays ?? 30;
  if (!input.lastVerified) return { decision: "prove", why: "no verification on record" };
  const age = (Date.parse(input.now) - Date.parse(input.lastVerified)) / 86_400_000;
  if (age > days) return { decision: "prove", why: `last verified ${input.lastVerified}, older than ${days} days` };
  return { decision: "pass" };
}
