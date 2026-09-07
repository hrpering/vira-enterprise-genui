import { isIP } from "node:net";

const SECRET_KEY = /(authorization|cookie|token|secret|password|api[-_]?key|signature)/i;
const SECRET_VALUE = /(bearer\s+[/a-z0-9._~+-]+|-----BEGIN [A-Z ]+PRIVATE KEY-----)/i;

export function redactOperationalValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[REDACTED:DEPTH]";
  if (typeof value === "string") return SECRET_VALUE.test(value) ? "[REDACTED]" : value.slice(0, 4096);
  if (Array.isArray(value)) return Object.freeze(value.slice(0, 100).map((entry) => redactOperationalValue(entry, depth + 1)));
  if (value === null || typeof value !== "object") return value;
  const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const [key, entry] of Object.entries(value).slice(0, 100)) {
    output[key] = SECRET_KEY.test(key) ? "[REDACTED]" : redactOperationalValue(entry, depth + 1);
  }
  return Object.freeze(output);
}

function forbiddenHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  if (normalized === "localhost" || normalized.endsWith(".localhost") || normalized.endsWith(".local")) return true;
  const ipKind = isIP(normalized);
  if (ipKind === 4) {
    const [a = 0, b = 0] = normalized.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  if (ipKind === 6) return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb");
  return false;
}

export function assertSafeProviderEndpoint(value: unknown, allowedHosts: readonly string[]): URL {
  if (typeof value !== "string" || value.length > 2048 || allowedHosts.length < 1 || allowedHosts.length > 64) throw new Error("provider endpoint input is invalid");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) throw new Error("provider endpoint must be canonical HTTPS");
  if (forbiddenHostname(url.hostname)) throw new Error("provider endpoint resolves to a forbidden host class");
  if (!allowedHosts.includes(url.hostname.toLowerCase())) throw new Error("provider endpoint host is not explicitly allowed");
  return url;
}
