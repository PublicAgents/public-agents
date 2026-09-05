import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Fetching what a pull request points at is fetching what a stranger
 * chose (docs/OWNERSHIP.md): https only, the address resolved and
 * checked before every hop, a byte cap read as a stream, a deadline,
 * and at most two same-host redirects. Every failure is a named reason.
 */

export interface GuardedFetchOptions {
  fetch?: typeof fetch;
  resolve?: (host: string) => Promise<string[]>;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  userAgent?: string;
  method?: "GET" | "HEAD";
  accept?: string;
}

export type GuardedResult =
  | { ok: true; status: number; body: string; url: string; contentType: string }
  | { ok: false; reason: "not_https" | "address_forbidden" | "unresolvable" | "timeout" | "too_large" | "redirect_forbidden" | "network"; detail: string };

const PRIVATE_V4 = [
  [/^0\./, "this network"],
  [/^10\./, "private"],
  [/^127\./, "loopback"],
  [/^169\.254\./, "link-local"],
  [/^172\.(1[6-9]|2\d|3[01])\./, "private"],
  [/^192\.168\./, "private"],
  [/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, "carrier-grade nat"],
  [/^224\./, "multicast"],
  [/^255\./, "broadcast"]
] as const;

export function forbiddenAddress(address: string): string | undefined {
  const family = isIP(address);
  if (family === 4) {
    for (const [pattern, why] of PRIVATE_V4) if (pattern.test(address)) return why;
    return undefined;
  }
  if (family === 6) {
    const lower = address.toLowerCase();
    if (lower === "::1" || lower === "::") return "loopback";
    if (lower.startsWith("fc") || lower.startsWith("fd")) return "unique local";
    if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return "link-local";
    if (lower.startsWith("::ffff:")) return forbiddenAddress(lower.slice(7)) ?? undefined;
    return undefined;
  }
  return "not an address";
}

async function defaultResolve(host: string): Promise<string[]> {
  if (isIP(host)) return [host];
  const answers = await lookup(host, { all: true });
  return answers.map(a => a.address);
}

export async function guardedFetch(url: string, options: GuardedFetchOptions = {}): Promise<GuardedResult> {
  const doFetch = options.fetch ?? fetch;
  const resolve = options.resolve ?? defaultResolve;
  const timeoutMs = options.timeoutMs ?? 5000;
  const maxBytes = options.maxBytes ?? 64 * 1024;
  const maxRedirects = options.maxRedirects ?? 2;
  let current = url;
  for (let hop = 0; ; hop += 1) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      return { ok: false, reason: "network", detail: `not a URL: ${current}` };
    }
    if (parsed.protocol !== "https:") return { ok: false, reason: "not_https", detail: current };
    let addresses: string[];
    try {
      addresses = await resolve(parsed.hostname);
    } catch (error) {
      return { ok: false, reason: "unresolvable", detail: `${parsed.hostname}: ${String(error).slice(0, 120)}` };
    }
    if (addresses.length === 0) return { ok: false, reason: "unresolvable", detail: parsed.hostname };
    for (const address of addresses) {
      const why = forbiddenAddress(address);
      if (why) return { ok: false, reason: "address_forbidden", detail: `${parsed.hostname} resolves to ${address} (${why})` };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await doFetch(current, {
        method: options.method ?? "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": options.userAgent ?? "public-agents-ci", accept: options.accept ?? "*/*" }
      });
    } catch (error) {
      clearTimeout(timer);
      const detail = String(error).slice(0, 200);
      return { ok: false, reason: controller.signal.aborted ? "timeout" : "network", detail: `${current}: ${detail}` };
    }
    if (response.status >= 300 && response.status < 400) {
      clearTimeout(timer);
      const location = response.headers.get("location");
      if (!location) return { ok: false, reason: "redirect_forbidden", detail: `${current}: redirect without location` };
      const next = new URL(location, current);
      if (next.hostname !== parsed.hostname || hop + 1 > maxRedirects) {
        return { ok: false, reason: "redirect_forbidden", detail: `${current} -> ${next.toString()}` };
      }
      current = next.toString();
      continue;
    }
    // Read at most maxBytes, as a stream, then stop.
    let body = "";
    try {
      if (response.body && (options.method ?? "GET") === "GET") {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let total = 0;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > maxBytes) {
            await reader.cancel().catch(() => undefined);
            clearTimeout(timer);
            return { ok: false, reason: "too_large", detail: `${current}: over ${maxBytes} bytes` };
          }
          body += decoder.decode(value, { stream: true });
        }
        body += decoder.decode();
      }
    } catch (error) {
      clearTimeout(timer);
      return { ok: false, reason: controller.signal.aborted ? "timeout" : "network", detail: `${current}: ${String(error).slice(0, 200)}` };
    }
    clearTimeout(timer);
    return { ok: true, status: response.status, body, url: current, contentType: response.headers.get("content-type") ?? "" };
  }
}

/** Run at most `limit` tasks at once. */
export async function withConcurrency<T>(limit: number, tasks: Array<() => Promise<T>>): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= tasks.length) return;
      results[index] = await tasks[index]();
    }
  });
  await Promise.all(workers);
  return results;
}
