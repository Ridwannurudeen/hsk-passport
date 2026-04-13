import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";
import { ToastProviderWrapper } from "@/components/ToastWrapper";
import { WalletButton } from "@/components/WalletButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "HSK Passport — Verifiable compliance for HashKey Chain",
  description:
    "Zero-knowledge KYC credentials for regulated RWA and institutional DeFi on HashKey Chain. Verify once, prove eligibility anywhere, reveal nothing.",
};

// Inline theme-init script runs before React hydrates — prevents theme flash.
const themeInitScript = `
(function() {
  try {
    var s = localStorage.getItem('hsk-theme');
    var m = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    var t = s || (m ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;

function NavLink({ href, children, highlight = false }: { href: string; children: ReactNode; highlight?: boolean }) {
  return (
    <Link
      href={href}
      className={`relative px-3 py-1.5 text-[13px] rounded-md transition-colors link-hover ${
        highlight ? "font-medium" : ""
      }`}
      style={{
        color: highlight ? "var(--accent-primary)" : "var(--text-secondary)",
      }}
    >
      {children}
    </Link>
  );
}

function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight group" style={{ color: "var(--text-primary)" }}>
      <span
        className="block w-[26px] h-[26px] rounded-[7px] relative overflow-hidden transition-transform group-hover:scale-105"
        style={{
          background: "linear-gradient(135deg, var(--accent-primary), #7a9bff)",
          boxShadow: "0 4px 16px -4px var(--accent-glow), inset 0 1px 0 0 rgba(255,255,255,0.2)",
        }}
      >
        <svg viewBox="0 0 24 24" className="w-full h-full p-[5px] text-white" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4v16M4 12h12M16 4v16M20 8v8" />
        </svg>
      </span>
      HSK Passport
    </Link>
  );
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`} data-theme="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className="min-h-full flex flex-col antialiased"
        style={{ background: "var(--bg-canvas)", color: "var(--text-primary)" }}
      >
        <nav
          className="border-b backdrop-blur-xl sticky top-0 z-50"
          style={{
            borderColor: "var(--border-muted)",
            background: "color-mix(in srgb, var(--bg-canvas) 85%, transparent)",
          }}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex h-14 items-center justify-between">
              <div className="flex items-center gap-8">
                <Wordmark />
                <div className="hidden lg:flex items-center gap-0.5">
                  <NavLink href="/composer" highlight>Composer</NavLink>
                  <NavLink href="/kyc">Get verified</NavLink>
                  <NavLink href="/demo">Demo</NavLink>
                  <NavLink href="/ecosystem">Ecosystem</NavLink>
                  <NavLink href="/developers">Developers</NavLink>
                  <NavLink href="/user" highlight>Dashboard</NavLink>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden md:inline-flex items-center gap-1.5 eyebrow mr-2" style={{ color: "var(--text-muted)" }}>
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--success)" }} />
                  testnet
                </span>
                <ThemeToggle />
                <WalletButton />
              </div>
            </div>
          </div>
        </nav>
        <main className="flex-1">
          <ToastProviderWrapper>{children}</ToastProviderWrapper>
        </main>
        <footer className="border-t mt-24" style={{ borderColor: "var(--border-muted)" }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
              <div className="col-span-2">
                <div className="flex items-center gap-2 mb-4">
                  <span
                    className="block w-[26px] h-[26px] rounded-[7px] relative overflow-hidden"
                    style={{ background: "linear-gradient(135deg, var(--accent-primary), #7a9bff)" }}
                  >
                    <svg viewBox="0 0 24 24" className="w-full h-full p-[5px] text-white" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 4v16M4 12h12M16 4v16M20 8v8" />
                    </svg>
                  </span>
                  <span className="text-[15px] font-semibold tracking-tight">HSK Passport</span>
                </div>
                <p className="text-sm leading-relaxed max-w-xs" style={{ color: "var(--text-muted)" }}>
                  Verifiable compliance for regulated RWA and institutional DeFi on HashKey Chain.
                </p>
              </div>
              {[
                { title: "Product", items: [
                  ["Get verified", "/kyc"], ["Dashboard", "/user"], ["Policy Composer", "/composer"], ["Interactive demo", "/demo"],
                ] },
                { title: "Developers", items: [
                  ["Quickstart", "/developers"], ["Integration docs", "/docs"],
                  ["SDK on npm ↗", "https://www.npmjs.com/package/hsk-passport-sdk"],
                  ["GitHub ↗", "https://github.com/Ridwannurudeen/hsk-passport"],
                ] },
                { title: "Resources", items: [
                  ["Roadmap", "/roadmap"], ["Governance", "/governance"], ["Research", "/research"], ["Partners", "/partners"],
                ] },
              ].map((col) => (
                <div key={col.title}>
                  <div className="eyebrow mb-3" style={{ color: "var(--text-muted)" }}>{col.title}</div>
                  <ul className="space-y-2.5 text-sm">
                    {col.items.map(([label, href]) => (
                      <li key={label}>
                        {href.startsWith("http") ? (
                          <a href={href} target="_blank" rel="noopener noreferrer" className="transition-colors" style={{ color: "var(--text-secondary)" }}>{label}</a>
                        ) : (
                          <Link href={href} className="transition-colors" style={{ color: "var(--text-secondary)" }}>{label}</Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="pt-8 border-t flex flex-col md:flex-row items-center justify-between gap-3" style={{ borderColor: "var(--border-muted)" }}>
              <div className="text-xs font-mono" style={{ color: "var(--text-subtle)" }}>
                Built for HashKey Chain Horizon Hackathon 2026 · MIT License
              </div>
              <div className="flex items-center gap-4 text-xs" style={{ color: "var(--text-muted)" }}>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--success)" }} />
                  All systems operational
                </span>
                <a
                  href="https://hashkey-testnet.blockscout.com/address/0x7d2E692A08f2fb0724238396e0436106b4FbD792"
                  target="_blank" rel="noopener noreferrer"
                  className="hover:opacity-100 opacity-70 transition-opacity font-mono"
                >
                  0x7d2E…D792 ↗
                </a>
              </div>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
