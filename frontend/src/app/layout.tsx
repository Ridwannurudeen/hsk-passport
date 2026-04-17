import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { ToastProviderWrapper } from "@/components/ToastWrapper";
import Nav from "@/components/Nav";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const SITE_URL = "https://hskpassport.gudman.xyz";
const SITE_TITLE = "HSK Passport — Verifiable compliance for HashKey Chain";
const SITE_DESCRIPTION =
  "Zero-knowledge KYC credentials for regulated RWA and institutional DeFi on HashKey Chain. Verify once, prove eligibility anywhere, reveal nothing. v6 per-prover freshness ZK proof live on testnet.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: "HSK Passport",
  keywords: [
    "HashKey Chain",
    "zkID",
    "zero-knowledge",
    "KYC",
    "Semaphore",
    "Groth16",
    "regulated DeFi",
    "RWA",
    "Sumsub",
    "compliance",
  ],
  authors: [{ name: "HSK Passport Team" }],
  openGraph: {
    type: "website",
    url: SITE_URL,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    siteName: "HSK Passport",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "HSK Passport — The default compliance layer for regulated apps on HashKey Chain",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/og-image.png"],
  },
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
        <Nav />
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
                  ["Testnet faucet ↗", "https://faucet.hsk.xyz"],
                  ["Block explorer ↗", "https://hashkey-testnet.blockscout.com"],
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
