import { JsonRpcProvider, Contract, formatEther } from "ethers";
import { promises as dns } from "node:dns";
import { CONFIG } from "./config.js";

const ISSUER_REGISTRY_ABI = [
  "function communityMinStake() view returns (uint256)",
  "function kycProviderMinStake() view returns (uint256)",
  "function institutionalMinStake() view returns (uint256)",
  "function unstakeCooldown() view returns (uint256)",
  "function issuers(address) view returns (uint256 stake, uint8 tier, uint256 stakedAt, uint256 totalIssued, uint256 totalRevoked, uint256 slashedAmount, bool active, string metadataURI)",
  "function getAllIssuers() view returns (address[])",
  "function reputationOf(address) view returns (int256)",
];

const TIER_NAMES = ["None", "Community", "KYC Provider", "Institutional"];

export interface IssuerMetadata {
  name: string;
  website?: string;
  contact: { email: string; abuseEmail?: string; securityEmail?: string };
  kycMethod: string;
  kycMethodNotes?: string;
  jurisdictions: string[];
  regulatoryLicenses?: Array<{
    regulator: string;
    licenseNumber: string;
    licenseType?: string;
    validUntil?: string;
    publicRegistryURL?: string;
  }>;
  supportedCredentials?: string[];
  operationalSecurity?: {
    keyCustody?: string;
    incidentResponseURL?: string;
    soc2Type2?: boolean;
    iso27001?: boolean;
  };
  publishedAt: string;
  logoURL?: string;
}

export interface IssuerView {
  address: string;
  active: boolean;
  tier: number;
  tierName: string;
  stakeWei: string;
  stakeHSK: string;
  stakedAt: number;
  totalIssued: number;
  totalRevoked: number;
  slashedAmountWei: string;
  reputation: number;
  metadataURI: string;
  metadata: IssuerMetadata | null;
  metadataError: string | null;
}

export interface IssuerRegistryStats {
  communityMinStakeWei: string;
  kycProviderMinStakeWei: string;
  institutionalMinStakeWei: string;
  unstakeCooldownSec: number;
  totalIssuers: number;
  activeIssuers: number;
}

// IssuerRegistry lives on mainnet (chain 177). Other backend modules continue
// to use the testnet provider; this file is the only mainnet read.
const provider = new JsonRpcProvider(CONFIG.mainnetRpcUrl);
const registry = new Contract(CONFIG.mainnetIssuerRegistry, ISSUER_REGISTRY_ABI, provider);

// Lazy chain-id assertion on first registry read. Fail fast if MAINNET_RPC_URL
// has been overridden to a different chain — without this guard, a misconfig
// or hostile env override silently indexes the wrong contract.
let chainIdChecked = false;
async function assertMainnetChain(): Promise<void> {
  if (chainIdChecked) return;
  const net = await provider.getNetwork();
  if (Number(net.chainId) !== CONFIG.mainnetChainId) {
    throw new Error(
      `mainnet RPC chain mismatch: expected ${CONFIG.mainnetChainId}, got ${net.chainId}`,
    );
  }
  chainIdChecked = true;
}

const METADATA_FETCH_TIMEOUT_MS = 5_000;
const METADATA_MAX_BYTES = 32 * 1024;
const METADATA_TTL_MS = 10 * 60_000;
const LIST_TTL_MS = 60_000;
const METADATA_CACHE_MAX = 500;
const FETCH_CONCURRENCY = 6;

const ALLOWED_KYC_METHODS = new Set([
  "sumsub", "onfido", "jumio", "veriff", "persona", "in-house", "other",
]);
const KYC_METHODS_REQUIRING_NOTES = new Set(["in-house", "other"]);
const ALLOWED_KEY_CUSTODY = new Set(["hsm", "mpc", "multisig", "hot-wallet"]);
const ALLOWED_CREDENTIAL_TYPES = new Set([
  "KYCVerified", "AccreditedInvestor", "HKResident", "SGResident", "AEResident",
]);
const COUNTRY_CODE_RE = /^[A-Z]{2}$/;
// RFC-5322-light: rejects whitespace, control chars, mailto-smuggle chars.
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const HTTPS_RE = /^https:\/\//i;
const HTTPS_OR_IPFS_RE = /^(https:\/\/|ipfs:\/\/)/i;
// Strict CID: base58btc CIDv0 (Qm…) or base32 CIDv1 (baf…). Length-bounded
// so a malformed value can't smuggle subdomain or path tricks.
const IPFS_CID_RE = /^(baf[0-9a-z]{55,150}|Qm[1-9A-HJ-NP-Za-km-z]{44})$/;
const IPFS_PATH_RE = /^[A-Za-z0-9._\-/]{0,200}$/;

// ── Bounded LRU cache ────────────────────────────────────────────

class LRUCache<K, V> {
  private map = new Map<K, V>();
  constructor(private max: number) {}
  get(k: K): V | undefined {
    const v = this.map.get(k);
    if (v !== undefined) {
      this.map.delete(k);
      this.map.set(k, v);
    }
    return v;
  }
  set(k: K, v: V): void {
    if (this.map.has(k)) this.map.delete(k);
    this.map.set(k, v);
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }
}

interface MetadataCacheEntry {
  fetchedAt: number;
  metadata: IssuerMetadata | null;
  error: string | null;
}

const metadataCache = new LRUCache<string, MetadataCacheEntry>(METADATA_CACHE_MAX);

interface ListCache {
  fetchedAt: number;
  payload: { stats: IssuerRegistryStats; issuers: IssuerView[] };
}

let listCache: ListCache | null = null;

// ── SSRF defenses ────────────────────────────────────────────────

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true; // malformed treated as unsafe
  }
  const [a, b] = parts;
  if (a === 0) return true;                                   // 0.0.0.0/8
  if (a === 10) return true;                                  // 10.0.0.0/8
  if (a === 127) return true;                                 // loopback
  if (a === 100 && b >= 64 && b <= 127) return true;          // CGNAT 100.64.0.0/10
  if (a === 169 && b === 254) return true;                    // link-local
  if (a === 172 && b >= 16 && b <= 31) return true;           // 172.16.0.0/12
  if (a === 192 && b === 168) return true;                    // 192.168.0.0/16
  if (a === 192 && b === 0) return true;                      // 192.0.0.0/24 IETF
  if (a >= 224) return true;                                  // multicast + reserved
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fe80:") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true; // link-local
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true;          // ULA fc00::/7
  if (lower.startsWith("ff")) return true;                    // multicast
  const v4mapped = lower.match(/^::ffff:([\d.]+)$/);
  if (v4mapped) return isPrivateIPv4(v4mapped[1]);
  return false;
}

async function isHostSafe(host: string): Promise<{ ok: boolean; reason?: string }> {
  // Reject literal IP addresses outright if private.
  if (/^[\d.]+$/.test(host)) {
    if (isPrivateIPv4(host)) return { ok: false, reason: "private IPv4 literal" };
    return { ok: true };
  }
  // Bracketed IPv6 or bare IPv6
  if (host.includes(":") || /^\[.+\]$/.test(host)) {
    if (isPrivateIPv6(host)) return { ok: false, reason: "private IPv6 literal" };
    return { ok: true };
  }
  const lc = host.toLowerCase();
  if (
    lc === "localhost" ||
    lc.endsWith(".localhost") ||
    lc.endsWith(".local") ||
    lc.endsWith(".internal") ||
    lc.endsWith(".lan") ||
    lc.endsWith(".intranet") ||
    lc.endsWith(".corp") ||
    lc.endsWith(".home")
  ) {
    return { ok: false, reason: "non-public hostname" };
  }
  try {
    const records = await dns.lookup(host, { all: true, verbatim: true });
    if (records.length === 0) return { ok: false, reason: "DNS no records" };
    for (const r of records) {
      if (r.family === 4 && isPrivateIPv4(r.address)) {
        return { ok: false, reason: `resolves to private IPv4 ${r.address}` };
      }
      if (r.family === 6 && isPrivateIPv6(r.address)) {
        return { ok: false, reason: `resolves to private IPv6 ${r.address}` };
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: `DNS lookup failed: ${(e as Error).message?.slice(0, 60) ?? "unknown"}` };
  }
}

function resolveIPFS(uri: string): { ok: true; url: string } | { ok: false; reason: string } {
  if (!uri.startsWith("ipfs://")) return { ok: false, reason: "not an ipfs URI" };
  const tail = uri.slice(7);
  // Strip any auth / query / fragment that might smuggle hosts past the gateway.
  if (/[@?#]/.test(tail)) return { ok: false, reason: "ipfs URI contains @, ? or #" };
  const slashIdx = tail.indexOf("/");
  const cid = slashIdx === -1 ? tail : tail.slice(0, slashIdx);
  const path = slashIdx === -1 ? "" : tail.slice(slashIdx + 1);
  if (!IPFS_CID_RE.test(cid)) return { ok: false, reason: "invalid IPFS CID" };
  if (path && !IPFS_PATH_RE.test(path)) return { ok: false, reason: "invalid IPFS path" };
  return { ok: true, url: `https://ipfs.io/ipfs/${cid}${path ? `/${path}` : ""}` };
}

async function readBoundedText(
  res: Response,
  maxBytes: number,
): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  if (!res.body) return { ok: false, reason: "no response body" };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return { ok: false, reason: `metadata exceeds ${maxBytes} bytes` };
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return { ok: true, text };
  } catch (e) {
    return { ok: false, reason: `read failed: ${(e as Error).message?.slice(0, 60) ?? "unknown"}` };
  }
}

// ── Metadata validation ──────────────────────────────────────────

function clampString(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

function isSafeUrl(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  if (!HTTPS_OR_IPFS_RE.test(v)) return undefined;
  // Reject URLs containing control chars / whitespace.
  if (/[\s<>"\\ -]/.test(v)) return undefined;
  return v.slice(0, 300);
}

function isCleanEmail(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  if (trimmed.length > 200) return undefined;
  if (!EMAIL_RE.test(trimmed)) return undefined;
  return trimmed;
}

function validateMetadata(
  raw: unknown,
): { ok: true; value: IssuerMetadata } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "metadata is not an object" };
  const m = raw as Record<string, unknown>;

  const name = clampString(m.name, 80);
  if (!name || name.length < 2) return { ok: false, error: "name missing or too short" };

  const contactRaw = m.contact as Record<string, unknown> | undefined;
  if (!contactRaw || typeof contactRaw !== "object") return { ok: false, error: "contact missing" };
  const email = isCleanEmail(contactRaw.email);
  if (!email) return { ok: false, error: "contact.email invalid" };

  const kycMethod = clampString(m.kycMethod, 32);
  if (!kycMethod || !ALLOWED_KYC_METHODS.has(kycMethod)) {
    return { ok: false, error: "kycMethod not in allowlist" };
  }

  let kycMethodNotes: string | undefined;
  if (KYC_METHODS_REQUIRING_NOTES.has(kycMethod)) {
    kycMethodNotes = clampString(m.kycMethodNotes, 500);
    if (!kycMethodNotes || kycMethodNotes.length < 10) {
      return { ok: false, error: `kycMethodNotes required (min 10 chars) when kycMethod is "${kycMethod}"` };
    }
  } else {
    kycMethodNotes = clampString(m.kycMethodNotes, 500);
  }

  const jurisdictionsRaw = m.jurisdictions;
  if (!Array.isArray(jurisdictionsRaw) || jurisdictionsRaw.length === 0) {
    return { ok: false, error: "jurisdictions missing" };
  }
  const jurisdictions = Array.from(
    new Set(
      jurisdictionsRaw
        .filter((c): c is string => typeof c === "string" && COUNTRY_CODE_RE.test(c))
        .slice(0, 50),
    ),
  );
  if (jurisdictions.length === 0) return { ok: false, error: "no valid jurisdiction codes" };

  const publishedAt = clampString(m.publishedAt, 40);
  if (!publishedAt || Number.isNaN(Date.parse(publishedAt))) {
    return { ok: false, error: "publishedAt invalid" };
  }

  const sanitized: IssuerMetadata = {
    name,
    contact: {
      email,
      abuseEmail: isCleanEmail(contactRaw.abuseEmail),
      securityEmail: isCleanEmail(contactRaw.securityEmail),
    },
    kycMethod,
    jurisdictions,
    publishedAt,
  };
  if (kycMethodNotes) sanitized.kycMethodNotes = kycMethodNotes;

  const website = isSafeUrl(m.website);
  if (website) sanitized.website = website;

  const logo = isSafeUrl(m.logoURL);
  if (logo) sanitized.logoURL = logo;

  const supported = m.supportedCredentials;
  if (Array.isArray(supported)) {
    const filtered = Array.from(
      new Set(
        supported
          .filter((s): s is string => typeof s === "string" && ALLOWED_CREDENTIAL_TYPES.has(s))
          .slice(0, 10),
      ),
    );
    if (filtered.length) sanitized.supportedCredentials = filtered;
  }

  const licenses = m.regulatoryLicenses;
  if (Array.isArray(licenses)) {
    const cleaned = licenses
      .slice(0, 20)
      .map((lic) => {
        if (!lic || typeof lic !== "object") return null;
        const l = lic as Record<string, unknown>;
        const regulator = clampString(l.regulator, 100);
        const licenseNumber = clampString(l.licenseNumber, 100);
        if (!regulator || !licenseNumber) return null;
        const out: {
          regulator: string;
          licenseNumber: string;
          licenseType?: string;
          validUntil?: string;
          publicRegistryURL?: string;
        } = { regulator, licenseNumber };
        const t = clampString(l.licenseType, 80);
        if (t) out.licenseType = t;
        const v = clampString(l.validUntil, 40);
        if (v && !Number.isNaN(Date.parse(v))) out.validUntil = v;
        const u = isSafeUrl(l.publicRegistryURL);
        if (u) out.publicRegistryURL = u;
        return out;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    if (cleaned.length) sanitized.regulatoryLicenses = cleaned;
  }

  const opsec = m.operationalSecurity as Record<string, unknown> | undefined;
  if (opsec && typeof opsec === "object") {
    const out: NonNullable<IssuerMetadata["operationalSecurity"]> = {};
    const custody = clampString(opsec.keyCustody, 32);
    if (custody && ALLOWED_KEY_CUSTODY.has(custody)) out.keyCustody = custody;
    const incident = isSafeUrl(opsec.incidentResponseURL);
    if (incident) out.incidentResponseURL = incident;
    if (typeof opsec.soc2Type2 === "boolean") out.soc2Type2 = opsec.soc2Type2;
    if (typeof opsec.iso27001 === "boolean") out.iso27001 = opsec.iso27001;
    if (Object.keys(out).length) sanitized.operationalSecurity = out;
  }

  return { ok: true, value: sanitized };
}

// ── Metadata fetch ───────────────────────────────────────────────

function cacheMetadata(uri: string, metadata: IssuerMetadata | null, error: string | null): {
  metadata: IssuerMetadata | null;
  error: string | null;
} {
  metadataCache.set(uri, { fetchedAt: Date.now(), metadata, error });
  return { metadata, error };
}

async function fetchMetadata(
  uri: string,
): Promise<{ metadata: IssuerMetadata | null; error: string | null }> {
  const cached = metadataCache.get(uri);
  if (cached && Date.now() - cached.fetchedAt < METADATA_TTL_MS) {
    return { metadata: cached.metadata, error: cached.error };
  }

  // Resolve to a concrete https URL.
  let url: string;
  if (uri.startsWith("ipfs://")) {
    const r = resolveIPFS(uri);
    if (!r.ok) return cacheMetadata(uri, null, r.reason);
    url = r.url;
  } else if (HTTPS_RE.test(uri)) {
    url = uri;
  } else {
    return cacheMetadata(uri, null, "metadataURI must be https:// or ipfs://");
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return cacheMetadata(uri, null, "invalid URL");
  }
  if (parsed.protocol !== "https:") {
    return cacheMetadata(uri, null, "non-https URL after resolution");
  }

  const hostCheck = await isHostSafe(parsed.hostname);
  if (!hostCheck.ok) {
    return cacheMetadata(uri, null, `host rejected: ${hostCheck.reason ?? "unsafe"}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), METADATA_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: "manual",
      headers: { accept: "application/json" },
    });
    if (res.status >= 300 && res.status < 400) {
      return cacheMetadata(uri, null, "redirects not allowed");
    }
    if (res.type === "opaqueredirect") {
      return cacheMetadata(uri, null, "redirects not allowed");
    }
    if (!res.ok) {
      return cacheMetadata(uri, null, `HTTP ${res.status}`);
    }
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    // GitHub gists, raw IPFS gateways, and many developer-friendly hosts serve
    // JSON with "text/plain" or "application/octet-stream". JSON.parse +
    // validateMetadata are the real gate — content-type is a hint only. Reject
    // text/html outright (defense-in-depth against accidental HTML responses).
    if (ct.includes("text/html")) {
      return cacheMetadata(uri, null, "html responses not allowed");
    }
    const declaredLen = Number(res.headers.get("content-length") ?? -1);
    if (Number.isFinite(declaredLen) && declaredLen > METADATA_MAX_BYTES) {
      return cacheMetadata(uri, null, "metadata exceeds 32KB");
    }

    const body = await readBoundedText(res, METADATA_MAX_BYTES);
    if (!body.ok) return cacheMetadata(uri, null, body.reason);

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(body.text);
    } catch {
      return cacheMetadata(uri, null, "metadata is not valid JSON");
    }
    const validated = validateMetadata(parsedJson);
    if (!validated.ok) return cacheMetadata(uri, null, validated.error);
    return cacheMetadata(uri, validated.value, null);
  } catch (e) {
    const err = e as Error;
    const reason =
      err?.name === "AbortError" ? "timeout" : err?.message?.slice(0, 60) ?? "fetch failed";
    return cacheMetadata(uri, null, reason);
  } finally {
    clearTimeout(timer);
  }
}

// ── Concurrency-bounded mapping ──────────────────────────────────

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const idx = cursor++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx], idx);
    }
  };
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

// ── On-chain registry read ───────────────────────────────────────

async function loadIssuersFresh(): Promise<{ stats: IssuerRegistryStats; issuers: IssuerView[] }> {
  await assertMainnetChain();
  const [communityMin, kycMin, institutionalMin, cooldown, addresses] = await Promise.all([
    registry.communityMinStake() as Promise<bigint>,
    registry.kycProviderMinStake() as Promise<bigint>,
    registry.institutionalMinStake() as Promise<bigint>,
    registry.unstakeCooldown() as Promise<bigint>,
    registry.getAllIssuers() as Promise<string[]>,
  ]);

  const issuers: IssuerView[] = await mapWithConcurrency(addresses, FETCH_CONCURRENCY, async (addr) => {
    const [data, reputation] = await Promise.all([
      registry.issuers(addr) as Promise<
        [bigint, bigint, bigint, bigint, bigint, bigint, boolean, string]
      >,
      registry.reputationOf(addr) as Promise<bigint>,
    ]);
    const [stake, tier, stakedAt, totalIssued, totalRevoked, slashedAmount, active, metadataURI] = data;
    const tierNum = Number(tier);
    const meta = metadataURI
      ? await fetchMetadata(metadataURI)
      : { metadata: null, error: "no metadataURI" };
    return {
      address: addr.toLowerCase(),
      active,
      tier: tierNum,
      tierName: TIER_NAMES[tierNum] ?? "None",
      stakeWei: stake.toString(),
      stakeHSK: formatEther(stake),
      stakedAt: stakedAt > BigInt(Number.MAX_SAFE_INTEGER) ? 0 : Number(stakedAt),
      totalIssued: totalIssued > BigInt(Number.MAX_SAFE_INTEGER) ? 0 : Number(totalIssued),
      totalRevoked: totalRevoked > BigInt(Number.MAX_SAFE_INTEGER) ? 0 : Number(totalRevoked),
      slashedAmountWei: slashedAmount.toString(),
      reputation: reputation > BigInt(Number.MAX_SAFE_INTEGER) || reputation < BigInt(Number.MIN_SAFE_INTEGER) ? 0 : Number(reputation),
      metadataURI,
      metadata: meta.metadata,
      metadataError: meta.error,
    };
  });

  const activeCount = issuers.filter((i) => i.active).length;

  return {
    stats: {
      communityMinStakeWei: communityMin.toString(),
      kycProviderMinStakeWei: kycMin.toString(),
      institutionalMinStakeWei: institutionalMin.toString(),
      unstakeCooldownSec: Number(cooldown),
      totalIssuers: issuers.length,
      activeIssuers: activeCount,
    },
    issuers,
  };
}

export async function getIssuersList(): Promise<{
  stats: IssuerRegistryStats;
  issuers: IssuerView[];
}> {
  if (listCache && Date.now() - listCache.fetchedAt < LIST_TTL_MS) {
    return listCache.payload;
  }
  const payload = await loadIssuersFresh();
  listCache = { fetchedAt: Date.now(), payload };
  return payload;
}
