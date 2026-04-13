"use client";

import { useEffect, useState } from "react";
import { connectWallet } from "@/lib/wallet";

export function WalletButton() {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    // Hydrate from existing window.ethereum connection if already granted
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

  async function handleClick() {
    if (address) {
      // Copy address
      await navigator.clipboard.writeText(address);
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

  const short = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";

  return (
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
      title={address ? `Click to copy: ${address}` : "Connect wallet"}
    >
      {connecting ? "Connecting..." : address ? short : "Connect"}
    </button>
  );
}
