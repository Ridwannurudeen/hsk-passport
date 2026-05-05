import { JsonRpcProvider, Contract, formatEther } from "ethers";
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

const provider = new JsonRpcProvider(CONFIG.rpcUrl);
const registry = new Contract(CONFIG.issuerRegistry, ISSUER_REGISTRY_ABI, provider);

const METADATA_FETCH_TIMEOUT_MS = 5_000;
const METADATA_MAX_BYTES = 32 * 1024;
const METADATA_TTL_MS = 10 * 60_000;
const LIST_TTL_MS = 60_000;

interface MetadataCacheEntry {
  fetchedAt: number;
  metadata: IssuerMetadata | null;
  error: string | null;
}

const metadataCache = new Map<string, MetadataCacheEntry>();

interface ListCache {
  fetchedAt: number;
  payload: { stats: IssuerRegistryStats; issuers: IssuerView[] };
}

let listCache: ListCache | null = null;

const ALLOWED_KYC_METHODS = new Set([
  "sumsub", "onfido", "jumio", "veriff", "persona", "in-house", "other",
]);
const ALLOWED_KEY_CUSTODY = new Set(["hsm", "mpc", "multisig", "hot-wallet"]);
const ALLOWED_CREDENTIAL_TYPES = new Set([
  "KYCVerified", "AccreditedInvestor", "HKResident", "SGResident", "AEResident",
]);
const COUNTRY_CODE_RE = /^[A-Z]{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HTTPS_OR_IPFS_RE = /^(https?:\/\/|ipfs:\/\/)/i;

function clampString(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

function validateMetadata(raw: unknown): { ok: true; value: IssuerMetadata } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "metadata is not an object" };
  const m = raw as Record<string, unknown>;

  const name = clampString(m.name, 80);
  if (!name || name.length < 2) return { ok: false, error: "name missing or too short" };

  const contactRaw = m.contact as Record<string, unknown> | undefined;
  if (!contactRaw || typeof contactRaw !== "object") return { ok: false, error: "contact missing" };
  const email = clampString(contactRaw.email, 200);
  if (!email || !EMAIL_RE.test(email)) return { ok: false, error: "contact.email invalid" };

  const kycMethod = clampString(m.kycMethod, 32);
  if (!kycMethod || !ALLOWED_KYC_METHODS.has(kycMethod)) {
    return { ok: false, error: "kycMethod not in allowlist" };
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
      abuseEmail: contactRaw.abuseEmail && EMAIL_RE.test(String(contactRaw.abuseEmail))
        ? clampString(contactRaw.abuseEmail, 200)
        : undefined,
      securityEmail: contactRaw.securityEmail && EMAIL_RE.test(String(contactRaw.securityEmail))
        ? clampString(contactRaw.securityEmail, 200)
        : undefined,
    },
    kycMethod,
    jurisdictions,
    publishedAt,
  };

  const website = clampString(m.website, 300);
  if (website && HTTPS_OR_IPFS_RE.test(website)) sanitized.website = website;

  const notes = clampString(m.kycMethodNotes, 500);
  if (notes) sanitized.kycMethodNotes = notes;

  const logo = clampString(m.logoURL, 300);
  if (logo && HTTPS_OR_IPFS_RE.test(logo)) sanitized.logoURL = logo;

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
        const out: { regulator: string; licenseNumber: string; licenseType?: string; validUntil?: string; publicRegistryURL?: string } = {
          regulator,
          licenseNumber,
        };
        const t = clampString(l.licenseType, 80);
        if (t) out.licenseType = t;
        const v = clampString(l.validUntil, 40);
        if (v && !Number.isNaN(Date.parse(v))) out.validUntil = v;
        const u = clampString(l.publicRegistryURL, 300);
        if (u && HTTPS_OR_IPFS_RE.test(u)) out.publicRegistryURL = u;
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
    const incident = clampString(opsec.incidentResponseURL, 300);
    if (incident && HTTPS_OR_IPFS_RE.test(incident)) out.incidentResponseURL = incident;
    if (typeof opsec.soc2Type2 === "boolean") out.soc2Type2 = opsec.soc2Type2;
    if (typeof opsec.iso27001 === "boolean") out.iso27001 = opsec.iso27001;
    if (Object.keys(out).length) sanitized.operationalSecurity = out;
  }

  return { ok: true, value: sanitized };
}

function resolveIPFS(uri: string): string {
  if (uri.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${uri.slice(7)}`;
  }
  return uri;
}

async function fetchMetadata(uri: string): Promise<{ metadata: IssuerMetadata | null; error: string | null }> {
  const cached = metadataCache.get(uri);
  if (cached && Date.now() - cached.fetchedAt < METADATA_TTL_MS) {
    return { metadata: cached.metadata, error: cached.error };
  }

  if (!HTTPS_OR_IPFS_RE.test(uri)) {
    const result = { metadata: null, error: "metadataURI scheme not allowed (must be https or ipfs)" };
    metadataCache.set(uri, { fetchedAt: Date.now(), ...result });
    return result;
  }

  const url = resolveIPFS(uri);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), METADATA_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "follow" });
    if (!res.ok) {
      const result = { metadata: null, error: `HTTP ${res.status}` };
      metadataCache.set(uri, { fetchedAt: Date.now(), ...result });
      return result;
    }
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > METADATA_MAX_BYTES) {
      const result = { metadata: null, error: "metadata exceeds 32KB" };
      metadataCache.set(uri, { fetchedAt: Date.now(), ...result });
      return result;
    }
    const text = await res.text();
    if (text.length > METADATA_MAX_BYTES) {
      const result = { metadata: null, error: "metadata exceeds 32KB" };
      metadataCache.set(uri, { fetchedAt: Date.now(), ...result });
      return result;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      const result = { metadata: null, error: "metadata is not valid JSON" };
      metadataCache.set(uri, { fetchedAt: Date.now(), ...result });
      return result;
    }
    const validated = validateMetadata(parsed);
    if (!validated.ok) {
      const result = { metadata: null, error: validated.error };
      metadataCache.set(uri, { fetchedAt: Date.now(), ...result });
      return result;
    }
    const result = { metadata: validated.value, error: null };
    metadataCache.set(uri, { fetchedAt: Date.now(), ...result });
    return result;
  } catch (e) {
    const error = e instanceof Error && e.name === "AbortError" ? "timeout" : (e as Error).message?.slice(0, 100) || "fetch failed";
    const result = { metadata: null, error };
    metadataCache.set(uri, { fetchedAt: Date.now(), ...result });
    return result;
  } finally {
    clearTimeout(timer);
  }
}

async function loadIssuersFresh(): Promise<{ stats: IssuerRegistryStats; issuers: IssuerView[] }> {
  const [communityMin, kycMin, institutionalMin, cooldown, addresses] = await Promise.all([
    registry.communityMinStake() as Promise<bigint>,
    registry.kycProviderMinStake() as Promise<bigint>,
    registry.institutionalMinStake() as Promise<bigint>,
    registry.unstakeCooldown() as Promise<bigint>,
    registry.getAllIssuers() as Promise<string[]>,
  ]);

  const issuers: IssuerView[] = [];
  for (const addr of addresses) {
    const [data, reputation] = await Promise.all([
      registry.issuers(addr) as Promise<[bigint, bigint, bigint, bigint, bigint, bigint, boolean, string]>,
      registry.reputationOf(addr) as Promise<bigint>,
    ]);
    const [stake, tier, stakedAt, totalIssued, totalRevoked, slashedAmount, active, metadataURI] = data;
    const tierNum = Number(tier);
    const meta = metadataURI ? await fetchMetadata(metadataURI) : { metadata: null, error: "no metadataURI" };
    issuers.push({
      address: addr.toLowerCase(),
      active,
      tier: tierNum,
      tierName: TIER_NAMES[tierNum] ?? "None",
      stakeWei: stake.toString(),
      stakeHSK: formatEther(stake),
      stakedAt: Number(stakedAt),
      totalIssued: Number(totalIssued),
      totalRevoked: Number(totalRevoked),
      slashedAmountWei: slashedAmount.toString(),
      reputation: Number(reputation),
      metadataURI,
      metadata: meta.metadata,
      metadataError: meta.error,
    });
  }

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

export async function getIssuersList(): Promise<{ stats: IssuerRegistryStats; issuers: IssuerView[] }> {
  if (listCache && Date.now() - listCache.fetchedAt < LIST_TTL_MS) {
    return listCache.payload;
  }
  const payload = await loadIssuersFresh();
  listCache = { fetchedAt: Date.now(), payload };
  return payload;
}
