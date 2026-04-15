"use client";

import { useEffect, useRef, useState } from "react";
import { connectWallet } from "@/lib/wallet";

export function WalletButton() {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) return;
    const eth = window.ethereum as { request: (p: { method: string }) => Promise<string[]>; on?: (e: string, h: (a: string[]) => void) => void };
    eth.request({ method: "eth_accounts" })
      .then((accounts) => {
        if (accounts && accounts.length > 0) setAddress(accounts[0]);
      })
      .catch(() => {});

    const handleAccounts = (accounts: string[]) => {
      setAddress(accounts[0] || null);
    };
    eth.on?.("accountsChanged", handleAccounts);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  async function handleClick() {
    if (address) {
      setMenuOpen((v) => !v);
      return;
    }
    setConnecting(true);
    try {
      const { address: addr } = await connectWallet();
      setAddress(addr);
    } catch {
      // user rejected
    } finally {
      setConnecting(false);
    }
  }

  async function handleCopy() {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleDisconnect() {
    setAddress(null);
    setMenuOpen(false);
    // Note: EIP-1193 has no programmatic disconnect. The wallet remains
    // connected in MetaMask's view; the user can re-click "Connect" to
    // resume without another permission prompt.
  }

  const short = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={handleClick}
        className={`text-[12px] font-medium rounded-lg transition-all h-[34px] px-3 ${address ? "font-mono" : ""}`}
        style={
          address
            ? {
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-muted)",
                color: "var(--accent-primary)",
              }
            : {
                background: "var(--accent-primary)",
                border: "1px solid transparent",
                color: "white",
                boxShadow: "0 0 0 1px rgba(255,255,255,0.08) inset, 0 6px 20px -6px var(--accent-glow)",
              }
        }
        title={address ? "Wallet menu" : "Connect wallet"}
        aria-haspopup={address ? "menu" : undefined}
        aria-expanded={address ? menuOpen : undefined}
      >
        {connecting ? "Connecting..." : address ? short : "Connect"}
      </button>

      {address && menuOpen && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-56 rounded-lg overflow-hidden z-50"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-muted)",
            boxShadow: "0 12px 28px -8px rgba(0,0,0,0.45)",
          }}
        >
          <div
            className="px-3 py-2 text-[11px] font-mono truncate"
            style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border-muted)" }}
            title={address}
          >
            {address}
          </div>
          <button
            role="menuitem"
            onClick={handleCopy}
            className="w-full text-left px-3 py-2 text-[12px] hover:bg-white/5 transition-colors"
            style={{ color: "var(--text-primary)" }}
          >
            {copied ? "Copied ✓" : "Copy address"}
          </button>
          <a
            role="menuitem"
            href="https://faucet.hsk.xyz"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setMenuOpen(false)}
            className="block px-3 py-2 text-[12px] hover:bg-white/5 transition-colors"
            style={{ color: "var(--text-primary)" }}
          >
            Testnet faucet ↗
          </a>
          <button
            role="menuitem"
            onClick={handleDisconnect}
            className="w-full text-left px-3 py-2 text-[12px] hover:bg-white/5 transition-colors"
            style={{ color: "var(--danger, #ef4444)", borderTop: "1px solid var(--border-muted)" }}
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
