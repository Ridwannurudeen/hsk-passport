import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { ToastProviderWrapper } from "@/components/ToastWrapper";
import { WalletButton } from "@/components/WalletButton";
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
      <body className="min-h-full flex flex-col bg-gray-950 text-gray-100">
        <nav className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex h-16 items-center justify-between">
              <div className="flex items-center gap-8">
                <Link href="/" className="text-xl font-bold text-white">
                  HSK<span className="text-purple-400">Passport</span>
                </Link>
                <div className="hidden lg:flex items-center gap-5">
                  <Link href="/kyc" className="text-sm text-gray-400 hover:text-white transition-colors">Get Verified</Link>
                  <Link href="/user" className="text-sm text-purple-300 hover:text-purple-200 transition-colors font-medium">My Data</Link>
                  <Link href="/composer" className="text-sm text-green-400 hover:text-green-300 transition-colors font-medium">Composer</Link>
                  <Link href="/bridge" className="text-sm text-gray-400 hover:text-white transition-colors">Bridge</Link>
                  <Link href="/ecosystem" className="text-sm text-gray-400 hover:text-white transition-colors">Ecosystem</Link>
                  <Link href="/demo" className="text-sm text-gray-400 hover:text-white transition-colors">Demo</Link>
                  <Link href="/developers" className="text-sm text-gray-400 hover:text-white transition-colors">Developers</Link>
                  <Link href="/partners" className="text-sm text-gray-400 hover:text-white transition-colors">Partners</Link>
                  <Link href="/roadmap" className="text-sm text-gray-400 hover:text-white transition-colors">Roadmap</Link>
                  <Link href="/stats" className="text-sm text-gray-400 hover:text-white transition-colors">Stats</Link>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="hidden sm:inline text-xs text-gray-500 font-mono">
                  HashKey Chain Testnet
                </span>
                <WalletButton />
              </div>
            </div>
          </div>
        </nav>
        <main className="flex-1">
          <ToastProviderWrapper>{children}</ToastProviderWrapper>
        </main>
        <footer className="border-t border-gray-800 py-6 text-center text-xs text-gray-500">
          HSK Passport — Built for the HashKey Chain Horizon Hackathon 2026
        </footer>
      </body>
    </html>
  );
}
