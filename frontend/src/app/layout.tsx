import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { ToastProviderWrapper } from "@/components/ToastWrapper";
import { WalletButton } from "@/components/WalletButton";
import type { ReactNode } from "react";

function NavLink({ href, children, highlight = false }: { href: string; children: ReactNode; highlight?: boolean }) {
  return (
    <Link
      href={href}
      className={`relative px-3 py-1.5 text-[13px] rounded-md transition-colors ${
        highlight
          ? "text-blue-400 hover:text-blue-300"
          : "text-gray-400 hover:text-white"
      }`}
    >
      {children}
    </Link>
  );
}
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HSK Passport — Privacy-Preserving KYC for HashKey Chain",
  description:
    "Zero-knowledge credential verification for HashKey Chain. Prove compliance without revealing identity.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-gray-950 text-gray-100 antialiased selection:bg-blue-500/30 selection:text-white">
        <nav className="border-b border-gray-900 bg-gray-950/85 backdrop-blur-md sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex h-14 items-center justify-between">
              <div className="flex items-center gap-8">
                <Link href="/" className="flex items-center gap-2 text-[15px] font-semibold text-white tracking-tight">
                  <span className="block w-6 h-6 rounded-md bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-500/20 flex items-center justify-center text-[11px] font-bold">H</span>
                  HSK Passport
                </Link>
                <div className="hidden lg:flex items-center gap-1">
                  <NavLink href="/kyc">Get verified</NavLink>
                  <NavLink href="/user" highlight>Dashboard</NavLink>
                  <NavLink href="/composer" highlight>Composer</NavLink>
                  <NavLink href="/demo">Demo</NavLink>
                  <NavLink href="/ecosystem">Ecosystem</NavLink>
                  <NavLink href="/developers">Developers</NavLink>
                  <NavLink href="/docs">Docs</NavLink>
                  <NavLink href="/roadmap">Roadmap</NavLink>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] text-gray-500 font-mono tracking-wide">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500/80 animate-pulse" />
                  testnet live
                </span>
                <WalletButton />
              </div>
            </div>
          </div>
        </nav>
        <main className="flex-1">
          <ToastProviderWrapper>{children}</ToastProviderWrapper>
        </main>
        <footer className="border-t border-gray-900 mt-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-10">
              <div className="col-span-2">
                <div className="flex items-center gap-2 mb-3">
                  <span className="block w-6 h-6 rounded-md bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-[11px] font-bold">H</span>
                  <span className="text-[15px] font-semibold text-white">HSK Passport</span>
                </div>
                <p className="text-sm text-gray-500 max-w-xs leading-relaxed">
                  Verifiable compliance for regulated RWA and institutional DeFi on HashKey Chain.
                </p>
              </div>
              <div>
                <div className="text-[11px] font-mono uppercase tracking-wider text-gray-500 mb-3">Product</div>
                <ul className="space-y-2 text-sm">
                  <li><Link href="/kyc" className="text-gray-400 hover:text-white transition-colors">Get verified</Link></li>
                  <li><Link href="/user" className="text-gray-400 hover:text-white transition-colors">Dashboard</Link></li>
                  <li><Link href="/composer" className="text-gray-400 hover:text-white transition-colors">Policy Composer</Link></li>
                  <li><Link href="/demo" className="text-gray-400 hover:text-white transition-colors">Interactive demo</Link></li>
                </ul>
              </div>
              <div>
                <div className="text-[11px] font-mono uppercase tracking-wider text-gray-500 mb-3">Developers</div>
                <ul className="space-y-2 text-sm">
                  <li><Link href="/developers" className="text-gray-400 hover:text-white transition-colors">Quickstart</Link></li>
                  <li><Link href="/docs" className="text-gray-400 hover:text-white transition-colors">Integration docs</Link></li>
                  <li><a href="https://www.npmjs.com/package/hsk-passport-sdk" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">SDK on npm ↗</a></li>
                  <li><a href="https://github.com/Ridwannurudeen/hsk-passport" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">GitHub ↗</a></li>
                </ul>
              </div>
              <div>
                <div className="text-[11px] font-mono uppercase tracking-wider text-gray-500 mb-3">Resources</div>
                <ul className="space-y-2 text-sm">
                  <li><Link href="/roadmap" className="text-gray-400 hover:text-white transition-colors">Roadmap</Link></li>
                  <li><Link href="/governance" className="text-gray-400 hover:text-white transition-colors">Governance</Link></li>
                  <li><Link href="/research" className="text-gray-400 hover:text-white transition-colors">Research</Link></li>
                  <li><Link href="/partners" className="text-gray-400 hover:text-white transition-colors">Partners</Link></li>
                </ul>
              </div>
            </div>
            <div className="pt-8 border-t border-gray-900 flex flex-col md:flex-row items-center justify-between gap-3">
              <div className="text-xs text-gray-600 font-mono">
                Built for HashKey Chain Horizon Hackathon 2026 · MIT License
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500/80" />
                  All systems operational
                </span>
                <a href="https://hashkey-testnet.blockscout.com/address/0x7d2E692A08f2fb0724238396e0436106b4FbD792" target="_blank" rel="noopener noreferrer" className="hover:text-gray-300">Contract ↗</a>
              </div>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
