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
        {/* Single ambient orb behind the headline */}
        <div
          className="orb"
          style={{
            top: "-15%",
            left: "-5%",
            width: "640px",
            height: "640px",
            background: "radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)",
          }}
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-20 sm:pt-24 pb-16 sm:pb-20">
          <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-10 lg:gap-14 items-center">
            {/* Left: hero text */}
            <div className="anim-fade-up">
              <div className="badge mb-7">
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--success)" }} />
                <span>v6 live · 74 tests · real Sumsub + ZK freshness</span>
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
                className="text-[17px] sm:text-[19px] leading-[1.55] mb-4 max-w-[58ch]"
                style={{ color: "var(--text-secondary)" }}
              >
                Verify once with a trusted issuer. Privately prove KYC, accreditation, or jurisdiction to any HashKey Chain dApp. Reveal nothing on-chain.
              </p>
              <p
                className="text-[15px] sm:text-[16px] leading-[1.55] mb-9 max-w-[56ch] italic"
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
                <Link href="/demo/fresh" className="btn btn-ghost link-hover">
                  Live ZK freshness demo →
                </Link>
              </div>
            </div>

            {/* Right: browser-frame product mockup */}
            <div className="relative anim-fade-up anim-delay-3">
              {/* Glow halo behind the mockup */}
              <div
                aria-hidden
                className="absolute -inset-8 rounded-[36px] pointer-events-none opacity-70"
                style={{
                  background: "radial-gradient(ellipse at 50% 30%, var(--accent-glow), transparent 70%)",
                  filter: "blur(40px)",
                }}
              />

              <Link
                href="/composer"
                className="relative group block rounded-2xl overflow-hidden transition-transform hover:-translate-y-1"
                style={{
                  border: "1px solid var(--border-default)",
                  background: "var(--bg-elevated)",
                  boxShadow: "0 30px 80px -30px rgba(0,0,0,0.45), 0 12px 32px -12px var(--accent-glow), inset 0 1px 0 0 rgba(255,255,255,0.04)",
                }}
              >
                {/* Browser chrome */}
                <div
                  className="flex items-center gap-2 px-4 py-3 border-b"
                  style={{ borderColor: "var(--border-muted)", background: "color-mix(in srgb, var(--bg-elevated) 70%, var(--bg-canvas))" }}
                >
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#ed6a5e" }} />
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#f4bf4f" }} />
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#62c554" }} />
                  <div
                    className="ml-3 flex-1 max-w-[420px] mx-auto rounded-md text-[11px] font-mono py-1 px-3 truncate text-center"
                    style={{
                      background: "var(--bg-inset)",
                      color: "var(--text-muted)",
                      border: "1px solid var(--border-muted)",
                    }}
                  >
                    hskpassport.gudman.xyz/composer
                  </div>
                  <span className="hidden sm:inline-flex items-center gap-1 text-[10px] eyebrow" style={{ color: "var(--text-muted)" }}>
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--success)" }} />
                    live
                  </span>
                </div>

                {/* Composer screenshot */}
                <div className="relative bg-white">
                  <img
                    src="/composer-hero.png"
                    alt="Live preview of the Compliance Policy Composer generating Solidity, React, and Hardhat test code from one-click presets"
                    className="block w-full h-auto select-none transition-transform duration-700 group-hover:scale-[1.01]"
                    width="1800"
                    height="1100"
                    loading="eager"
                  />
                  {/* Subtle gradient overlay at bottom for depth */}
                  <div
                    aria-hidden
                    className="absolute inset-x-0 bottom-0 h-24 pointer-events-none"
                    style={{ background: "linear-gradient(to top, var(--bg-elevated), transparent)" }}
                  />
                </div>
              </Link>

              {/* Floating caption pill under mockup */}
              <div
                className="hidden sm:flex absolute -bottom-3 left-1/2 -translate-x-1/2 items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-medium"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-secondary)",
                  boxShadow: "0 8px 24px -8px rgba(0,0,0,0.3)",
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--accent-primary)" }} />
                Generates Solidity + React + tests in 30 seconds
              </div>
            </div>
          </div>

          {/* Live metric row */}
          <div
            className="mt-16 sm:mt-20 grid grid-cols-2 md:grid-cols-4 gap-px rounded-2xl overflow-hidden anim-fade-up anim-delay-3"
            style={{ background: "var(--border-muted)", border: "1px solid var(--border-muted)" }}
          >
            {[
              { value: "5", label: "Credential types", sub: "KYC · accredited · HK/SG/AE" },
              { value: "16", label: "Contracts live", sub: "HashKey testnet, v5 + IKycSBT + v6 freshness" },
              { value: "74", label: "Passing tests", sub: "security invariants + expiry + slashing + ZK freshness" },
              { value: "0", label: "Bytes PII on-chain", sub: "by design" },
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
          WHAT NOBODY ELSE SHIPPED
         ============================================================ */}
      <section className="relative border-y" style={{ borderColor: "var(--border-muted)", background: "var(--bg-subtle)" }}>
        <div className="absolute inset-0 bg-dots opacity-50 pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-24 sm:py-32">
          <div className="max-w-2xl mb-12">
            <div className="eyebrow mb-3" style={{ color: "var(--accent-primary)" }}>What we actually shipped</div>
            <h2 className="display-2" style={{ color: "var(--text-primary)" }}>
              Five things no other zkID submission has live today.
            </h2>
            <p className="mt-4 text-[16px] leading-[1.6]" style={{ color: "var(--text-secondary)" }}>
              Every regulated dApp has the same blockers: KYC provider wiring, identity-bridge integration, governance, an SDK that developers will actually install. We built all of them.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {[
              {
                num: "01",
                title: "Real Sumsub KYC, wired end-to-end",
                desc: "Same provider HashKey Exchange uses. HMAC-signed webhook with raw-body verification (hardened in audit Round 3). Auto-issuance on the GREEN callback.",
                href: "/kyc",
                cta: "Try the flow",
              },
              {
                num: "02",
                title: "HashKey IKycSBT + .key DID bridges",
                desc: "The only submission that reads HashKey's official KYC soulbound-token byte-for-byte and mints credentials from .key DID holders. Live on testnet, 10 passing tests.",
                href: "/bridge",
                cta: "See the bridge",
              },
              {
                num: "03",
                title: "Policy Composer generates real code",
                desc: "Tick KYC, accredited, or jurisdiction {HK, SG, AE}. Get back a deployable Solidity contract, a React gate, and a Hardhat test. 30 seconds, zero boilerplate.",
                href: "/composer",
                cta: "Generate a policy",
              },
              {
                num: "04",
                title: "Per-prover ZK credential expiry (v6)",
                desc: "Custom Circom circuit + on-chain verifier. Prove your credential is fresh without revealing when it was issued. ~4.5s browser proof, real on-chain verify.",
                href: "/demo/fresh",
                cta: "Run the live demo",
              },
              {
                num: "05",
                title: "SDK on npm + 48h Timelock governance",
                desc: "hsk-passport-sdk v1.1.0 live (freshness module included). Every owner action gated through an OpenZeppelin TimelockController — issuer slashing, schema edits, validity periods.",
                href: "/governance",
                cta: "Inspect governance",
              },
            ].map((card, i) => (
              <Link
                key={card.num}
                href={card.href}
                className={`group relative p-7 rounded-2xl surface-interactive anim-fade-up anim-delay-${(i % 3) + 1}`}
              >
                <div className="flex items-start gap-5">
                  <div
                    className="text-[32px] font-mono leading-none select-none flex-none"
                    style={{
                      color: "transparent",
                      backgroundImage: "linear-gradient(180deg, var(--accent-primary), var(--text-muted) 140%)",
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                    }}
                  >
                    {card.num}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-[18px] font-semibold mb-2 leading-snug" style={{ color: "var(--text-primary)" }}>
                      {card.title}
                    </h3>
                    <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--text-secondary)" }}>
                      {card.desc}
                    </p>
                    <div
                      className="text-sm font-medium flex items-center gap-1.5 link-hover group-hover:gap-2 transition-all"
                      style={{ color: "var(--accent-primary)" }}
                    >
                      {card.cta}
                      <span>→</span>
                    </div>
                  </div>
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
              Three things every regulated dApp on HashKey needs. We built them.
            </h2>
            <p className="text-[17px] mb-8 max-w-xl mx-auto" style={{ color: "var(--text-secondary)" }}>
              A KYC provider that actually gates access. An identity bridge to HashKey&apos;s own SBTs. Per-prover ZK expiry. Running today on testnet.
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              <Link href="/kyc" className="btn btn-accent">Get verified in 2 minutes</Link>
              <Link href="/composer" className="btn btn-secondary">Generate a policy</Link>
              <Link href="/demo/fresh" className="btn btn-ghost link-hover">See the v6 ZK demo →</Link>
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

