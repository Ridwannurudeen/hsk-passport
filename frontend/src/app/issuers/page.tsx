"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  MAINNET_ADDRESSES,
  MAINNET_EXPLORER_URL,
  ISSUER_TIER_NAMES,
} from "@/lib/contracts";
import { apiGetIssuers, type IssuerView, type IssuerRegistryStats } from "@/lib/api";

// Whitelist for hrefs derived from issuer-supplied strings or the on-chain
// metadataURI. Backend strips javascript:/data:/file: from validated metadata,
// but the raw metadataURI is rendered as a "raw URI" link too — re-validate
// here. ipfs:// is rewritten to a public gateway so the link is clickable.
function safeHref(raw: string | undefined): string | undefined {
  if (!raw || typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("ipfs://")) {
    const tail = trimmed.slice(7);
    if (/[@?#]/.test(tail)) return undefined;
    if (!/^[A-Za-z0-9._\-/]+$/.test(tail)) return undefined;
    return `https://ipfs.io/ipfs/${tail}`;
  }
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "https:" && u.protocol !== "http:") return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}

function safeImgSrc(raw: string | undefined): string | undefined {
  const href = safeHref(raw);
  if (!href) return undefined;
  // Only allow https for images to avoid mixed-content + cleartext leaks.
  if (!href.startsWith("https://")) return undefined;
  return href;
}

const TIER_TONE: Record<number, string> = {
  0: "border-gray-700 bg-gray-900/40 text-gray-400",
  1: "border-blue-800/50 bg-blue-950/30 text-blue-300",
  2: "border-purple-800/50 bg-purple-950/30 text-purple-300",
  3: "border-emerald-800/50 bg-emerald-950/30 text-emerald-300",
};

function formatHSK(wei: string): string {
  try {
    const w = BigInt(wei);
    if (w === 0n) return "0 HSK";
    const whole = w / 10n ** 18n;
    const frac = w % 10n ** 18n;
    if (frac === 0n) return `${whole} HSK`;
    const fracStr = frac.toString().padStart(18, "0").replace(/0+$/, "").slice(0, 4);
    return fracStr ? `${whole}.${fracStr} HSK` : `${whole} HSK`;
  } catch {
    return "0 HSK";
  }
}

function formatStakedAt(ts: number): string {
  if (!ts) return "—";
  const d = new Date(ts * 1000);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 10);
}

export default function IssuersPage() {
  const [issuers, setIssuers] = useState<IssuerView[]>([]);
  const [stats, setStats] = useState<IssuerRegistryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGetIssuers()
      .then((data) => {
        if (cancelled) return;
        setIssuers(data.issuers);
        setStats(data.stats);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "failed to load issuers");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const active = issuers.filter((i) => i.active);
  const inactive = issuers.filter((i) => !i.active);

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div className="mb-10">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="inline-block px-3 py-1 text-xs font-mono text-purple-400 border border-purple-800 rounded-full bg-purple-950/30">
            Issuer directory
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-mono text-emerald-300 border border-emerald-700 rounded-full bg-emerald-950/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            mainnet
          </span>
        </div>
        <h1 className="text-4xl font-bold mb-3">Approved HSK Passport issuers</h1>
        <p className="text-gray-400 text-lg max-w-3xl mb-6">
          Every issuer here has staked native HSK on{" "}
          <a
            href={`${MAINNET_EXPLORER_URL}/address/${MAINNET_ADDRESSES.issuerRegistry}`}
            target="_blank"
            rel="noreferrer"
            className="text-purple-400 hover:underline"
          >
            HashKey Chain mainnet IssuerRegistry
          </a>
          . Reputation is tracked on-chain (issuances minus 10× revocations). Misissuance can be slashed via 48-hour governance Timelock.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/issuer-program"
            className="px-4 py-2 text-sm font-medium rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition-colors"
          >
            Apply to become an issuer →
          </Link>
          <a
            href="https://github.com/Ridwannurudeen/hsk-passport/blob/main/schemas/Issuer.json"
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-700 text-gray-300 hover:border-gray-600 transition-colors"
          >
            Metadata schema
          </a>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
          <Stat label="Total issuers" value={stats.totalIssuers.toString()} />
          <Stat label="Active" value={stats.activeIssuers.toString()} />
          <Stat label="Min stake (KYC Provider)" value={formatHSK(stats.kycProviderMinStakeWei)} />
          <Stat label="Min stake (Institutional)" value={formatHSK(stats.institutionalMinStakeWei)} />
        </div>
      )}

      {loading && <p className="text-gray-400 text-sm">Loading on-chain registry…</p>}
      {error && (
        <div className="border border-red-900 bg-red-950/30 text-red-300 rounded-lg p-4 text-sm">
          Could not load issuer registry: {error}
        </div>
      )}

      {!loading && !error && issuers.length === 0 && (
        <div className="border border-gray-800 rounded-xl p-8 text-center">
          <p className="text-gray-300 mb-2">No issuers staked yet on this network.</p>
          <p className="text-gray-500 text-sm">
            Be the first.{" "}
            <Link href="/issuer-program" className="text-purple-400 hover:underline">
              Apply →
            </Link>
          </p>
        </div>
      )}

      {active.length > 0 && (
        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-4">Active</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {active.map((iss) => (
              <IssuerCard key={iss.address} issuer={iss} />
            ))}
          </div>
        </section>
      )}

      {inactive.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-4 text-gray-400">Slashed or unstaked</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {inactive.map((iss) => (
              <IssuerCard key={iss.address} issuer={iss} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-gray-800 rounded-xl p-4 bg-gray-950/50">
      <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">{label}</div>
      <div className="text-lg font-semibold text-gray-100">{value}</div>
    </div>
  );
}

function IssuerCard({ issuer }: { issuer: IssuerView }) {
  const tone = TIER_TONE[issuer.tier] ?? TIER_TONE[0];
  const meta = issuer.metadata;
  const slashed = BigInt(issuer.slashedAmountWei || "0") > 0n;
  const logoSrc = safeImgSrc(meta?.logoURL);
  const websiteHref = safeHref(meta?.website);
  const metadataHref = safeHref(issuer.metadataURI);
  const cleanEmail = meta && /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(meta.contact.email)
    ? meta.contact.email
    : null;

  return (
    <div className={`border rounded-xl p-5 ${tone}`}>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wider opacity-70 mb-1">
            {ISSUER_TIER_NAMES[issuer.tier] ?? "None"}
            {!issuer.active && " · inactive"}
            {slashed && " · slashed"}
          </div>
          <h3 className="text-lg font-semibold truncate">
            {meta?.name ?? <span className="text-gray-500 italic">unnamed (metadata unavailable)</span>}
          </h3>
        </div>
        {logoSrc && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoSrc}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="w-12 h-12 rounded object-cover flex-shrink-0 bg-gray-900"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs mb-3">
        <Field label="Address">
          <a
            href={`${MAINNET_EXPLORER_URL}/address/${issuer.address}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono hover:underline"
          >
            {issuer.address.slice(0, 6)}…{issuer.address.slice(-4)}
          </a>
        </Field>
        <Field label="Stake">{formatHSK(issuer.stakeWei)}</Field>
        <Field label="Reputation">{issuer.reputation}</Field>
        <Field label="Issued · revoked">
          {issuer.totalIssued} · {issuer.totalRevoked}
        </Field>
        <Field label="Staked since">{formatStakedAt(issuer.stakedAt)}</Field>
        {meta && <Field label="KYC method">{meta.kycMethod}</Field>}
      </div>

      {meta && (
        <>
          <div className="mb-3">
            <div className="text-xs uppercase tracking-wider opacity-70 mb-1">Jurisdictions</div>
            <div className="flex flex-wrap gap-1.5">
              {meta.jurisdictions.map((c) => (
                <span key={c} className="px-2 py-0.5 text-[11px] font-mono rounded bg-black/30 border border-white/5">
                  {c}
                </span>
              ))}
            </div>
          </div>
          {meta.regulatoryLicenses && meta.regulatoryLicenses.length > 0 && (
            <div className="mb-3">
              <div className="text-xs uppercase tracking-wider opacity-70 mb-1">Licenses</div>
              <ul className="text-xs space-y-0.5">
                {meta.regulatoryLicenses.slice(0, 3).map((l, i) => {
                  const licHref = safeHref(l.publicRegistryURL);
                  return (
                    <li key={i} className="opacity-90">
                      {l.regulator} · {l.licenseNumber}
                      {licHref && (
                        <>
                          {" "}
                          <a
                            href={licHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline opacity-70 hover:opacity-100"
                          >
                            verify
                          </a>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap gap-3 text-xs pt-2 border-t border-white/5">
            {websiteHref && (
              <a href={websiteHref} target="_blank" rel="noopener noreferrer" className="hover:underline opacity-80">
                website ↗
              </a>
            )}
            {cleanEmail && (
              <a href={`mailto:${cleanEmail}`} className="hover:underline opacity-80">
                contact
              </a>
            )}
            {metadataHref && (
              <a href={metadataHref} target="_blank" rel="noopener noreferrer" className="hover:underline opacity-50 ml-auto">
                metadata.json ↗
              </a>
            )}
          </div>
        </>
      )}

      {!meta && issuer.metadataError && (
        <div className="text-xs text-amber-400/70 italic break-all">
          metadata error: {issuer.metadataError}
          {metadataHref && (
            <>
              {" "}
              <a
                href={metadataHref}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                raw URI
              </a>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="uppercase tracking-wider opacity-60 mb-0.5">{label}</div>
      <div className="opacity-95">{children}</div>
    </div>
  );
}
