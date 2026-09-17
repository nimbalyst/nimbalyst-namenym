import type { AvailableDomain, DomainCheck, Mashup } from "./types";

export const DOMAIN_API = "https://api.namenym.com/domains/search";
export const DOMAIN_CACHE_MS = 15 * 60 * 1000;
const TLDS = ["com", "ai", "net", "org"];

/** Check the actual joined name; never silently remove punctuation or accents. */
export function domainQuery(label: string): string | null {
  const query = label
    .trim()
    .toLowerCase()
    .replace(/\.(com|ai|net|org)$/i, "")
    .replace(/\s+/g, "");
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(query) ? query : null;
}

export function currentDomainCheck(name: Mashup): DomainCheck | undefined {
  const check = name.domainCheck;
  return check && check.query === domainQuery(name.label) ? check : undefined;
}

export function hasAvailableCom(name: Mashup): boolean {
  const check = currentDomainCheck(name);
  return !!check?.availableDomains.some(
    (d) => d.domain === `${check.query}.com`,
  );
}

export function freshDomainCheck(name: Mashup, now = Date.now()): boolean {
  const check = currentDomainCheck(name);
  const age = check ? now - Date.parse(check.checkedAt) : Infinity;
  return age >= 0 && age < DOMAIN_CACHE_MS;
}

export function parseDomainResponse(
  data: unknown,
  query: string,
): AvailableDomain[] {
  if (
    !data ||
    typeof data !== "object" ||
    !Array.isArray((data as any).domains)
  )
    throw new Error(
      "The domain service returned an invalid response. Retry the check.",
    );
  const results = new Map<string, AvailableDomain>();
  for (const value of (data as any).domains) {
    if (
      !value ||
      typeof value.domain !== "string" ||
      typeof value.available !== "boolean"
    )
      throw new Error(
        "The domain service returned an invalid result. Retry the check.",
      );
    const domain = value.domain.toLowerCase();
    const tld = TLDS.find((tld) => domain === `${query}.${tld}`);
    if (!tld || !value.available) continue;
    // Provider links can contain credentials or unexpected schemes. Only expose
    // its public, credential-free domain page in the document and editor.
    results.set(domain, {
      domain,
      tld,
      registerURL: `https://domainr.com/${encodeURIComponent(domain)}`,
    });
  }
  return [...results.values()];
}

export async function searchDomains(
  query: string,
  signal?: AbortSignal,
): Promise<DomainCheck> {
  if (domainQuery(query) !== query)
    throw new Error(
      "Use a valid domain name with letters, numbers, or hyphens.",
    );
  let response: Response;
  try {
    response = await fetch(DOMAIN_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `${query}.com` }),
      signal,
      credentials: "omit",
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(
      "Could not reach the domain service. Check your connection and retry.",
    );
  }
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? "Domain lookup rate limit reached. Wait a moment, then retry."
        : `Domain service unavailable (HTTP ${response.status}). Retry the check.`,
    );
  const availableDomains = parseDomainResponse(await response.json(), query);
  return { query, checkedAt: new Date().toISOString(), availableDomains };
}
