"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { WalletButton } from "@/components/WalletButton";

function NavLink({
  href,
  children,
  highlight = false,
  onClick,
}: {
  href: string;
  children: ReactNode;
  highlight?: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
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
    <Link
      href="/"
      className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight group"
      style={{ color: "var(--text-primary)" }}
    >
      <span
        className="block w-[26px] h-[26px] rounded-[7px] relative overflow-hidden transition-transform group-hover:scale-105"
        style={{ background: "linear-gradient(135deg, var(--accent-primary), #7a9bff)" }}
      >
        <svg
          viewBox="0 0 24 24"
          className="w-full h-full p-[5px] text-white"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 4v16M4 12h12M16 4v16M20 8v8" />
        </svg>
      </span>
      HSK Passport
    </Link>
  );
}

const LINKS: Array<{ href: string; label: string; highlight?: boolean }> = [
  { href: "/composer", label: "Composer", highlight: true },
  { href: "/kyc", label: "Get verified" },
  { href: "/demo", label: "Demo" },
  { href: "/demo/fresh", label: "Fresh ZK · v6", highlight: true },
  { href: "/ecosystem", label: "Ecosystem" },
  { href: "/developers", label: "Developers" },
  { href: "/user", label: "Dashboard", highlight: true },
];

export default function Nav() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
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
              {LINKS.map((l) => (
                <NavLink key={l.href} href={l.href} highlight={l.highlight}>
                  {l.label}
                </NavLink>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="hidden md:inline-flex items-center gap-1.5 eyebrow mr-2"
              style={{ color: "var(--text-muted)" }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ background: "var(--success)" }}
              />
              testnet
            </span>
            <ThemeToggle />
            <WalletButton />
            {/* Mobile hamburger */}
            <button
              type="button"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className="lg:hidden ml-1 p-2 rounded-md transition-colors"
              style={{ color: "var(--text-secondary)" }}
            >
              {open ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18M3 12h18M3 18h18" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div
          className="lg:hidden border-t"
          style={{
            borderColor: "var(--border-muted)",
            background: "var(--bg-canvas)",
          }}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-col gap-1">
            {LINKS.map((l) => (
              <NavLink key={l.href} href={l.href} highlight={l.highlight} onClick={close}>
                {l.label}
              </NavLink>
            ))}
            <div
              className="mt-2 pt-3 border-t text-xs font-mono flex items-center gap-1.5"
              style={{ borderColor: "var(--border-muted)", color: "var(--text-muted)" }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ background: "var(--success)" }}
              />
              HashKey testnet · v6 live
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
