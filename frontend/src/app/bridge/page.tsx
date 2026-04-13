"use client";

import { useState, useEffect } from "react";
import { Contract } from "ethers";
import Link from "next/link";
import { connectWallet, signMessage } from "@/lib/wallet";
import {
  createIdentityFromSignature,
  loadIdentity,
  getCommitment,
  Identity,
} from "@/lib/semaphore";
import { ADDRESSES, EXPLORER_URL } from "@/lib/contracts";
import { useToast } from "@/components/Toast";

const MOCK_DID_ABI = [
  "function mint(address to, string calldata name) returns (uint256)",
  "function ownerOf(uint256) view returns (address)",
  "function didName(uint256) view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
];

const BRIDGE_ABI = [
  "function bridgeDID(uint256 didTokenId, uint256 identityCommitment)",
  "function didToCommitment(uint256) view returns (uint256)",
  "function commitmentToDid(uint256) view returns (uint256)",
  "function hashKeyDID() view returns (address)",
  "function didCredentialGroup() view returns (uint256)",
];

const MOCK_KYC_SBT_ABI = [
  "function setKYCLevel(address user, uint8 level)",
  "function hasKYC(address) view returns (bool)",
  "function kycLevelOf(address) view returns (uint8)",
];

const IMPORTER_ABI = [
  "function importKYC(uint256 identityCommitment)",
  "function imported(address, uint256) view returns (bool)",
];

export default function BridgePage() {
  const { toast } = useToast();
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [address, setAddress] = useState("");
  const [didId, setDidId] = useState<string>("");
  const [didName, setDidName] = useState("alice.key");
  const [kycLevel, setKycLevel] = useState("1");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const stored = loadIdentity();
    if (stored) setIdentity(stored);
  }, []);

  async function ensureIdentity() {
    if (identity) return identity;
    const { address: walletAddr } = await connectWallet();
    const sig = await signMessage("HSK Passport: Generate my Semaphore identity");
    const id = createIdentityFromSignature(sig, walletAddr);
    setIdentity(id);
    return id;
  }

  async function mintMockDID() {
    setLoading(true);
    try {
      const { signer, address: addr } = await connectWallet();
      setAddress(addr);
      const mockDid = new Contract(ADDRESSES.mockHashKeyDID, MOCK_DID_ABI, signer);
      const tx = await mockDid.mint(addr, didName);
      toast("Minting mock DID...", "info");
      const rc = await tx.wait();
      // Read token ID from event or state
      const total = await mockDid.totalSupply();
      setDidId(total.toString());
      toast(`Minted DID: ${didName} (token #${total})`, "success");
    } catch (e) {
      toast(`Mint failed: ${(e as Error).message.slice(0, 100)}`, "error");
    }
    setLoading(false);
  }

  async function bridgeDID() {
    if (!didId) {
      toast("Mint a DID first", "error");
      return;
    }
    setLoading(true);
    try {
      const id = await ensureIdentity();
      const { signer } = await connectWallet();
      const bridge = new Contract(ADDRESSES.hashKeyDIDBridge, BRIDGE_ABI, signer);
      const tx = await bridge.bridgeDID(didId, getCommitment(id));
      toast("Bridging DID → HSK Passport credential...", "info");
      const rc = await tx.wait();
      setStatus(`Bridged! tx: ${rc.hash}`);
      toast("DID bridged. You now have an HK_RESIDENT credential.", "success");
    } catch (e) {
      toast(`Bridge failed: ${(e as Error).message.slice(0, 100)}`, "error");
    }
    setLoading(false);
  }

  async function setMockKYC() {
    setLoading(true);
    try {
      const { signer, address: addr } = await connectWallet();
      setAddress(addr);
      const kyc = new Contract(ADDRESSES.mockKYCSoulbound, MOCK_KYC_SBT_ABI, signer);
      const tx = await kyc.setKYCLevel(addr, Number(kycLevel));
      await tx.wait();
      toast(`Mock KYC level ${kycLevel} set on wallet`, "success");
    } catch (e) {
      toast(`KYC set failed: ${(e as Error).message.slice(0, 100)}`, "error");
    }
    setLoading(false);
  }

  async function importKYC() {
    setLoading(true);
    try {
      const id = await ensureIdentity();
      const { signer } = await connectWallet();
      const importer = new Contract(ADDRESSES.hashKeyKYCImporter, IMPORTER_ABI, signer);
      const tx = await importer.importKYC(getCommitment(id));
      toast("Importing HashKey KYC → HSK Passport credentials...", "info");
      const rc = await tx.wait();
      setStatus(`Imported! tx: ${rc.hash}`);
      toast("KYC imported. Level 1+ gives KYC_VERIFIED; level 3 also adds ACCREDITED_INVESTOR.", "success");
    } catch (e) {
      toast(`Import failed: ${(e as Error).message.slice(0, 100)}`, "error");
    }
    setLoading(false);
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="mb-10">
        <div className="inline-block px-3 py-1 mb-3 text-xs font-mono text-purple-400 border border-purple-800 rounded-full bg-purple-950/30">
          HashKey Integration
        </div>
        <h1 className="text-4xl font-bold mb-3">HashKey Bridges</h1>
        <p className="text-lg text-gray-400 max-w-2xl">
          Import your HashKey DID or HashKey Exchange KYC status into HSK Passport. No re-verification — one step, private credential.
        </p>
      </div>

      {/* DID Bridge */}
      <section className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-purple-600/20 text-purple-400 flex items-center justify-center text-lg font-bold">D</div>
          <h2 className="text-2xl font-semibold">HashKey DID Bridge</h2>
        </div>
        <p className="text-sm text-gray-400 mb-6">
          Users with a <code className="text-purple-300">.key</code> DID can mint an HSK Passport HK_RESIDENT credential directly. This demo uses a mock HashKey DID contract; production will point at the real HashKey DID contract address when deployed on HashKey Chain.
        </p>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          <div>
            <label className="text-sm text-gray-500 mb-2 block">DID name</label>
            <div className="flex gap-2">
              <input
                value={didName}
                onChange={(e) => setDidName(e.target.value)}
                placeholder="alice.key"
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white font-mono text-sm"
              />
              <button
                onClick={mintMockDID}
                disabled={loading}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-sm text-white rounded-lg border border-gray-700"
              >
                Mint Mock DID
              </button>
            </div>
            {didId && (
              <p className="text-xs text-green-400 mt-2">Your DID token #{didId} ({didName})</p>
            )}
          </div>

          <button
            onClick={bridgeDID}
            disabled={loading || !didId}
            className="w-full px-4 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium rounded-lg"
          >
            {loading ? "Processing..." : "Bridge DID → HSK Passport"}
          </button>
        </div>
      </section>

      {/* KYC Importer */}
      <section className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-green-600/20 text-green-400 flex items-center justify-center text-lg font-bold">K</div>
          <h2 className="text-2xl font-semibold">HashKey Exchange KYC Importer</h2>
        </div>
        <p className="text-sm text-gray-400 mb-6">
          If you&apos;ve already completed KYC on HashKey Exchange, import your status into HSK Passport instantly. Level 1+ grants KYC_VERIFIED; level 3 also grants ACCREDITED_INVESTOR.
        </p>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          <div>
            <label className="text-sm text-gray-500 mb-2 block">Mock KYC level (demo)</label>
            <div className="flex gap-2">
              <select
                value={kycLevel}
                onChange={(e) => setKycLevel(e.target.value)}
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
              >
                <option value="1">Level 1 — Basic KYC</option>
                <option value="2">Level 2 — Enhanced KYC</option>
                <option value="3">Level 3 — Institutional (KYC + Accredited)</option>
              </select>
              <button
                onClick={setMockKYC}
                disabled={loading}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-sm text-white rounded-lg border border-gray-700"
              >
                Set Mock KYC
              </button>
            </div>
          </div>

          <button
            onClick={importKYC}
            disabled={loading}
            className="w-full px-4 py-3 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-medium rounded-lg"
          >
            {loading ? "Processing..." : "Import KYC → HSK Passport"}
          </button>
        </div>
      </section>

      {status && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-sm text-gray-300 mb-6">
          {status}
          {status.includes("0x") && (
            <a
              href={`${EXPLORER_URL}/tx/${status.split("tx: ")[1]}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 hover:text-purple-300 ml-2"
            >
              View tx
            </a>
          )}
        </div>
      )}

      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-3">How This Integrates with HashKey</h3>
        <div className="text-sm text-gray-400 space-y-2">
          <p>
            <strong className="text-gray-200">HashKey DID</strong> is HashKey Group&apos;s decentralized identity system (<a href="https://hashkey.id" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300">hashkey.id</a>) — ERC-721 NFTs representing <code>.key</code> identities.
          </p>
          <p>
            <strong className="text-gray-200">HashKey Exchange KYC</strong> issues soulbound tokens to verified users. Level 1 = basic, Level 2 = enhanced, Level 3 = institutional.
          </p>
          <p>
            HSK Passport bridges both: DID holders get on-chain credentials tied to their <code>.key</code>. Exchange-verified users import their KYC status without re-submitting documents. All private — the ZK layer reveals only credential membership, not DID or KYC level.
          </p>
          <p>
            <strong className="text-gray-200">Status:</strong> Mocks live on testnet. Real contracts activate when HashKey DID + Exchange SBTs are deployed on HashKey Chain.
          </p>
        </div>
      </div>

      <div className="mt-8 text-center">
        <Link href="/user" className="text-sm text-purple-400 hover:text-purple-300">
          View your credentials after bridging →
        </Link>
      </div>
    </div>
  );
}
