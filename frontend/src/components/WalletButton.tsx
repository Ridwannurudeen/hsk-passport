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
      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
        address
          ? "bg-gray-800 border-gray-700 text-purple-300 hover:text-white hover:border-purple-600"
          : "bg-purple-600 border-purple-500 text-white hover:bg-purple-500"
      }`}
      title={address ? `Click to copy: ${address}` : "Connect wallet"}
    >
      {connecting ? "Connecting..." : address ? short : "Connect Wallet"}
    </button>
  );
}
