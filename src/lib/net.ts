import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

/**
 * Fetching what a pull request points at is fetching what a stranger
 * chose (docs/OWNERSHIP.md): https only, the address resolved and
 * checked before every hop AND the connection pinned to that very
 * address (a second resolution at connect time would let a rebinding
 * name pass the check and connect somewhere else), a byte cap read as
 * a stream, a deadline, and at most two same-host redirects. Every
 * failure is a named reason.
 */

export interface TransportRequest {
  url: URL;
  /** The address that passed the check; the connection goes here, with the host name for SNI and the Host header. */
  address: string;
  method: "GET" | "HEAD";
  headers: Record<string, string>;
  timeoutMs: number;
  maxBytes: number;
}

export type TransportResponse =
  | { kind: "response"; status: number; headers: Record<string, string>; body: string }
  | { kind: "too_large" }
  | { kind: "timeout" }
  | { kind: "error"; detail: string };

export type Transport = (req: TransportRequest) => Promise<TransportResponse>;

export interface GuardedFetchOptions {
  transport?: Transport;
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

/**
 * The default transport: an https request whose socket connects to the
 * checked address (the `lookup` option answers with it and nothing
 * else), with the host name kept for TLS (SNI, certificate) and the
 * Host header. The body is read as a stream and stopped at the cap.
 */
export const httpsTransport: Transport = req =>
  new Promise(resolve => {
    const family = isIP(req.address) === 6 ? 6 : 4;
    const request = httpsRequest(
      {
        protocol: "https:",
        hostname: req.url.hostname,
        servername: req.url.hostname,
        port: req.url.port || 443,
        path: `${req.url.pathname}${req.url.search}`,
        method: req.method,
        headers: { ...req.headers, host: req.url.host },
        lookup: (_host, _options, callback) => {
          // The pinned address: whatever the name says now, this socket goes where the check looked.
          (callback as (err: Error | null, address: string, family: number) => void)(null, req.address, family);
        },
        timeout: req.timeoutMs
      },
      response => {
        const chunks: Buffer[] = [];
        let total = 0;
        response.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > req.maxBytes) {
            response.destroy();
            request.destroy();
            resolve({ kind: "too_large" });
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          const headers: Record<string, string> = {};
          for (const [key, value] of Object.entries(response.headers)) if (typeof value === "string") headers[key.toLowerCase()] = value;
          resolve({ kind: "response", status: response.statusCode ?? 0, headers, body: Buffer.concat(chunks).toString("utf8") });
        });
        response.on("error", error => resolve({ kind: "error", detail: String(error).slice(0, 200) }));
      }
    );
    request.on("timeout", () => {
      request.destroy();
      resolve({ kind: "timeout" });
    });
    request.on("error", error => resolve({ kind: "error", detail: String(error).slice(0, 200) }));
    request.end();
  });

export async function guardedFetch(url: string, options: GuardedFetchOptions = {}): Promise<GuardedResult> {
  const transport = options.transport ?? httpsTransport;
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
    const response = await transport({
      url: parsed,
      address: addresses[0],
      method: options.method ?? "GET",
      headers: { "user-agent": options.userAgent ?? "public-agents-ci", accept: options.accept ?? "*/*" },
      timeoutMs,
      maxBytes
    });
    if (response.kind === "timeout") return { ok: false, reason: "timeout", detail: current };
    if (response.kind === "too_large") return { ok: false, reason: "too_large", detail: `${current}: over ${maxBytes} bytes` };
    if (response.kind === "error") return { ok: false, reason: "network", detail: `${current}: ${response.detail}` };
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.location;
      if (!location) return { ok: false, reason: "redirect_forbidden", detail: `${current}: redirect without location` };
      const next = new URL(location, current);
      if (next.hostname !== parsed.hostname || hop + 1 > maxRedirects) {
        return { ok: false, reason: "redirect_forbidden", detail: `${current} -> ${next.toString()}` };
      }
      current = next.toString();
      continue;
    }
    return { ok: true, status: response.status, body: response.body, url: current, contentType: response.headers["content-type"] ?? "" };
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
