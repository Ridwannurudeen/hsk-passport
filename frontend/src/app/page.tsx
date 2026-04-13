"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { apiGetGlobalStats, type GlobalStats } from "@/lib/api";

export default function Home() {
  const [stats, setStats] = useState<GlobalStats | null>(null);

  useEffect(() => {
    apiGetGlobalStats().then(setStats).catch(() => {});
  }, []);

  return (
    <div>
      {/* ============================================================
          HERO
         ============================================================ */}
      <section className="relative overflow-hidden bg-grid-fade">
        {/* Animated gradient orbs */}
        <div
          className="orb"
          style={{
            top: "-10%",
            left: "10%",
            width: "520px",
            height: "520px",
            background: "radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)",
          }}
        />
        <div
          className="orb"
          style={{
            top: "20%",
            right: "-5%",
            width: "420px",
            height: "420px",
            background: "radial-gradient(circle, rgba(122, 155, 255, 0.15) 0%, transparent 70%)",
            animationDelay: "-6s",
          }}
        />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-20 sm:pt-28 pb-16 sm:pb-24">
          <div className="max-w-3xl anim-fade-up">
            <div className="badge mb-7">
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--success)" }} />
              <span>v5 live · 45 tests · real Sumsub wired</span>
            </div>
            <h1 className="display-1 mb-6">
              The default compliance layer for
              <br />
              <span
                className="bg-clip-text text-transparent gradient-shift"
                style={{
                  backgroundImage: "linear-gradient(110deg, var(--accent-primary), #8fb2ff 40%, var(--accent-primary))",
                }}
              >
                regulated apps on HashKey Chain.
              </span>
            </h1>
            <p
              className="text-[17px] sm:text-[19px] leading-[1.55] mb-4 max-w-[60ch]"
              style={{ color: "var(--text-secondary)" }}
            >
              Verify once with a trusted issuer. Privately prove KYC, accreditation, or jurisdiction to any HashKey Chain dApp. Reveal nothing on-chain.
            </p>
            <p
              className="text-[15px] sm:text-[16px] leading-[1.55] mb-10 max-w-[58ch] italic"
              style={{ color: "var(--text-muted)" }}
            >
              We&apos;re not replacing HashKey&apos;s compliance stack — we&apos;re making it reusable and private across the ecosystem.
            </p>
            <div className="flex flex-wrap items-center gap-3 anim-fade-up anim-delay-2">
              <Link href="/composer" className="btn btn-accent">
                Open the Policy Composer
                <ArrowIcon />
              </Link>
              <Link href="/kyc" className="btn btn-secondary">
                Get verified
              </Link>
              <Link href="/demo" className="btn btn-ghost link-hover">
                Watch the live ZK proof flow →
              </Link>
            </div>
          </div>

          {/* Live metric row */}
          <div
            className="mt-16 sm:mt-20 grid grid-cols-2 md:grid-cols-4 gap-px rounded-2xl overflow-hidden anim-fade-up anim-delay-3"
            style={{ background: "var(--border-muted)", border: "1px solid var(--border-muted)" }}
          >
            {[
              { value: stats?.activeCredentials ?? "—", label: "Credentials issued", sub: "testnet, live" },
              { value: "45", label: "Passing tests", sub: "contracts + invariants" },
              { value: "8", label: "Protocol contracts", sub: "deployed v5" },
              { value: "0", label: "Bytes PII", sub: "ever on-chain" },
            ].map((s) => (
              <div key={s.label} className="p-6 sm:p-7" style={{ background: "var(--bg-canvas)" }}>
                <div className="display-2 tabular mb-1.5" style={{ color: "var(--text-primary)" }}>{s.value}</div>
                <div className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>{s.label}</div>
                <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================
          STANDARDS STRIP
         ============================================================ */}
      <section className="border-y" style={{ borderColor: "var(--border-muted)", background: "var(--bg-subtle)" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <div className="eyebrow text-center mb-5" style={{ color: "var(--text-muted)" }}>
            Built on open standards — compatible with
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
            {[
              "W3C Verifiable Credentials",
              "Semaphore v4",
              "Groth16 ZK",
              "Sumsub KYC",
              "HashKey Chain",
              "HashKey DID",
              "OpenZeppelin Timelock",
            ].map((item, i, arr) => (
              <span key={item} className="flex items-center gap-8">
                <span className="link-hover hover:text-[color:var(--text-primary)] transition-colors">{item}</span>
                {i < arr.length - 1 && <span style={{ color: "var(--text-subtle)" }}>·</span>}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================
          ONE-LINE INTEGRATION — code-first
         ============================================================ */}
      <section className="relative max-w-6xl mx-auto px-4 sm:px-6 py-24 sm:py-32">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <div className="eyebrow mb-4" style={{ color: "var(--accent-primary)" }}>For developers</div>
            <h2 className="display-2 mb-5" style={{ color: "var(--text-primary)" }}>
              One require line.
              <br />
              Full compliance.
            </h2>
            <p className="text-[17px] leading-[1.6] mb-6" style={{ color: "var(--text-secondary)" }}>
              Paste one call into your contract. Users prove KYC, accreditation, or jurisdiction
              via zero-knowledge proofs that cost ~241k gas and reveal nothing.
            </p>
            <ul className="space-y-3 mb-8">
              {[
                "Caller-bound proofs prevent front-running",
                "Per-action nullifiers prevent sybil attacks",
                "Revocable, expirable, governance-controlled",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                  <CheckIcon />
                  {item}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-3">
              <Link href="/developers" className="btn btn-secondary">Read the quickstart</Link>
              <Link href="/composer" className="btn btn-ghost link-hover">Generate your policy →</Link>
            </div>
          </div>

          <div className="code-window">
            <div className="code-window-header">
              <span className="code-dot code-dot-red" />
              <span className="code-dot code-dot-yellow" />
              <span className="code-dot code-dot-green" />
              <span className="ml-2 text-xs font-mono" style={{ color: "var(--text-muted)" }}>MyRWAToken.sol</span>
            </div>
            <pre className="p-6 text-[13px] leading-[1.7] font-mono overflow-x-auto"><code>
<span style={{ color: "#7a8194" }}>// Gate any function behind a ZK credential check</span>{"\n"}
<span style={{ color: "#c689ff" }}>contract</span> <span style={{ color: "#7fc8ff" }}>MyRWAToken</span> {"{"}{"\n"}
{"    "}<span style={{ color: "#c689ff" }}>function</span> <span style={{ color: "#b9e28b" }}>mint</span>(<span style={{ color: "#7fc8ff" }}>SemaphoreProof</span> <span style={{ color: "#c689ff" }}>calldata</span> proof) <span style={{ color: "#c689ff" }}>external</span> {"{"}{"\n"}
{"        "}<span style={{ color: "#c689ff" }}>require</span>({"\n"}
{"            "}proof.message == <span style={{ color: "#ffb170" }}>uint256</span>(<span style={{ color: "#ffb170" }}>uint160</span>(msg.sender)),{"\n"}
{"            "}<span style={{ color: "#b9e28b" }}>&quot;proof must be bound to caller&quot;</span>{"\n"}
{"        "});{"\n"}
{"        "}<span style={{ color: "#c689ff" }}>require</span>({"\n"}
{"            "}passport.<span style={{ color: "#ffb170" }}>verifyCredential</span>(<span style={{ color: "#ffa06b" }}>25</span>, proof),{"\n"}
{"            "}<span style={{ color: "#b9e28b" }}>&quot;KYC required&quot;</span>{"\n"}
{"        "});{"\n"}
{"        "}_mint(msg.sender, <span style={{ color: "#ffa06b" }}>100e18</span>);{"\n"}
{"    "}{"}"}{"\n"}
{"}"}
            </code></pre>
          </div>
        </div>
      </section>

      {/* ============================================================
          THREE AUDIENCES
         ============================================================ */}
      <section className="relative border-y" style={{ borderColor: "var(--border-muted)", background: "var(--bg-subtle)" }}>
        <div className="absolute inset-0 bg-dots opacity-50 pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-24 sm:py-32">
          <div className="max-w-2xl mb-14">
            <div className="eyebrow mb-3" style={{ color: "var(--accent-primary)" }}>Who uses HSK Passport</div>
            <h2 className="display-2" style={{ color: "var(--text-primary)" }}>
              One protocol. Three sides of the market.
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              {
                tag: "Users",
                title: "Verify once, prove anywhere",
                desc: "Complete KYC with Sumsub. Get a zero-knowledge credential bound to your wallet. Use it across every compliant dApp.",
                href: "/kyc",
                cta: "Get verified",
                icon: <UserIcon />,
              },
              {
                tag: "Developers",
                title: "Ship compliant dApps in minutes",
                desc: "SDK on npm, React gate component, Hardhat helpers. Policy Composer generates Solidity + React + tests.",
                href: "/developers",
                cta: "Developer docs",
                icon: <CodeIcon />,
              },
              {
                tag: "Issuers",
                title: "Regulated issuance, staked reputation",
                desc: "Stake HSK, issue revocable credentials, earn reputation. Slashable via 48h timelock governance on misissuance.",
                href: "/issuer",
                cta: "Issuer dashboard",
                icon: <ShieldIcon />,
              },
            ].map((card, i) => (
              <Link
                key={card.tag}
                href={card.href}
                className={`group relative p-6 rounded-2xl surface-interactive anim-fade-up anim-delay-${i + 1}`}
              >
                <div className="mb-5">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ background: "var(--accent-subtle)", color: "var(--accent-primary)" }}
                  >
                    {card.icon}
                  </div>
                </div>
                <div className="eyebrow mb-2" style={{ color: "var(--text-muted)" }}>{card.tag}</div>
                <h3 className="text-[18px] font-semibold mb-2 leading-snug" style={{ color: "var(--text-primary)" }}>
                  {card.title}
                </h3>
                <p className="text-sm leading-relaxed mb-5" style={{ color: "var(--text-secondary)" }}>
                  {card.desc}
                </p>
                <div
                  className="text-sm font-medium flex items-center gap-1.5 link-hover group-hover:gap-2 transition-all"
                  style={{ color: "var(--accent-primary)" }}
                >
                  {card.cta}
                  <span>→</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================
          HOW IT WORKS — numbered steps
         ============================================================ */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-24 sm:py-32">
        <div className="max-w-2xl mb-14">
          <div className="eyebrow mb-3" style={{ color: "var(--accent-primary)" }}>Architecture</div>
          <h2 className="display-2" style={{ color: "var(--text-primary)" }}>How it works</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-px rounded-2xl overflow-hidden" style={{ background: "var(--border-muted)", border: "1px solid var(--border-muted)" }}>
          {[
            {
              step: "01",
              title: "Issuer verifies off-chain",
              desc: "Sumsub (same KYC provider HashKey Exchange uses) runs iBeta-L2 liveness, document authenticity, and face dedup. On GREEN, the issuer wallet adds the user's Semaphore commitment to an on-chain group.",
            },
            {
              step: "02",
              title: "User proves in-browser",
              desc: "The user's browser generates a Groth16 ZK proof in WASM. The proof demonstrates group membership without revealing which member. Bound to msg.sender to prevent front-running.",
            },
            {
              step: "03",
              title: "dApp verifies on-chain",
              desc: "Any contract calls verifyCredential(). Returns true/false in ~241k gas. The dApp learns nothing beyond eligibility. Nullifiers are scoped per action for sybil resistance.",
            },
          ].map((s) => (
            <div key={s.step} className="p-8" style={{ background: "var(--bg-canvas)" }}>
              <div
                className="display-2 mb-5 font-mono"
                style={{
                  color: "transparent",
                  backgroundImage: "linear-gradient(180deg, var(--text-primary), var(--text-muted) 140%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                }}
              >
                {s.step}
              </div>
              <h3 className="text-[17px] font-semibold mb-3" style={{ color: "var(--text-primary)" }}>{s.title}</h3>
              <p className="text-sm leading-[1.65]" style={{ color: "var(--text-secondary)" }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ============================================================
          ECOSYSTEM PREVIEW
         ============================================================ */}
      <section className="border-y" style={{ borderColor: "var(--border-muted)", background: "var(--bg-subtle)" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-24 sm:py-32">
          <div className="flex items-end justify-between mb-12">
            <div>
              <div className="eyebrow mb-3" style={{ color: "var(--accent-primary)" }}>Ecosystem</div>
              <h2 className="display-2" style={{ color: "var(--text-primary)" }}>Live on testnet</h2>
            </div>
            <Link href="/ecosystem" className="btn btn-ghost link-hover">View all →</Link>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { name: "HashKey Silver", symbol: "hSILVER", tag: "RWA", desc: "KYC-gated regulated RWA mint, caller-bound proof enforced." },
              { name: "HK Pilot Airdrop", symbol: "hPILOT", tag: "Airdrop", desc: "Sybil-resistant airdrop via action-scoped nullifiers." },
              { name: "Accredited Pool", symbol: "ACC", tag: "Lending", desc: "Tiered lending — retail vs accredited investor gates." },
            ].map((app, i) => (
              <Link
                key={app.name}
                href="/ecosystem"
                className={`group block p-6 rounded-2xl surface-interactive anim-fade-up anim-delay-${i + 1}`}
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="eyebrow" style={{ color: "var(--text-muted)" }}>{app.tag}</span>
                  <span className="text-xs font-mono" style={{ color: "var(--accent-primary)" }}>{app.symbol}</span>
                </div>
                <h3 className="text-[17px] font-semibold mb-2" style={{ color: "var(--text-primary)" }}>{app.name}</h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{app.desc}</p>
                <div className="mt-5 text-sm font-medium flex items-center gap-1.5 group-hover:gap-2 transition-all" style={{ color: "var(--accent-primary)" }}>
                  View integration →
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================
          CTA BAND
         ============================================================ */}
      <section className="relative max-w-6xl mx-auto px-4 sm:px-6 py-24 sm:py-32">
        <div
          className="relative overflow-hidden rounded-2xl p-10 sm:p-16 text-center"
          style={{
            background: "linear-gradient(135deg, var(--bg-subtle), var(--bg-inset))",
            border: "1px solid var(--border-default)",
          }}
        >
          <div
            className="absolute inset-0 opacity-60 pointer-events-none"
            style={{
              background: "radial-gradient(circle at 50% 0%, var(--accent-glow), transparent 60%)",
            }}
          />
          <div className="relative">
            <h2 className="display-2 mb-4" style={{ color: "var(--text-primary)" }}>
              Ready to build compliant?
            </h2>
            <p className="text-[17px] mb-8 max-w-xl mx-auto" style={{ color: "var(--text-secondary)" }}>
              Mint a credential in under 2 minutes, or ship a compliance-gated dApp in under 10.
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              <Link href="/kyc" className="btn btn-accent">Get verified</Link>
              <Link href="/composer" className="btn btn-secondary">Generate a policy</Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className="shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent-primary)" }}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}
