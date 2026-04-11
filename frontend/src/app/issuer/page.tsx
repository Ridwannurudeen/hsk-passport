"use client";

import { useState } from "react";
import { Contract } from "ethers";
import { connectWallet } from "@/lib/wallet";
import {
  ADDRESSES,
  HSK_PASSPORT_ABI,
  GROUP_NAMES,
  EXPLORER_URL,
} from "@/lib/contracts";

export default function IssuerPage() {
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState("");
  const [isIssuer, setIsIssuer] = useState(false);
  const [status, setStatus] = useState("");
  const [txHash, setTxHash] = useState("");

  const [newGroupName, setNewGroupName] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("0");
  const [commitmentInput, setCommitmentInput] = useState("");

  async function handleConnect() {
    try {
      const { signer, address: addr } = await connectWallet();
      setAddress(addr);
      setConnected(true);

      if (ADDRESSES.hskPassport) {
        const passport = new Contract(
          ADDRESSES.hskPassport,
          HSK_PASSPORT_ABI,
          signer
        );
        const approved = await passport.approvedIssuers(addr);
        setIsIssuer(approved);
      }
    } catch (err: unknown) {
      setStatus(`Connection failed: ${(err as Error).message}`);
    }
  }

  async function handleCreateGroup() {
    if (!newGroupName.trim()) return;
    setStatus("Creating credential group...");
    setTxHash("");
    try {
      const { signer } = await connectWallet();
      const passport = new Contract(
        ADDRESSES.hskPassport,
        HSK_PASSPORT_ABI,
        signer
      );
      const tx = await passport.createCredentialGroup(newGroupName);
      setTxHash(tx.hash);
      setStatus("Waiting for confirmation...");
      await tx.wait();
      setStatus(`Group "${newGroupName}" created!`);
      setNewGroupName("");
    } catch (err: unknown) {
      setStatus(`Error: ${(err as Error).message}`);
    }
  }

  async function handleIssueCredential() {
    if (!commitmentInput.trim()) return;
    setStatus("Issuing credential...");
    setTxHash("");
    try {
      const { signer } = await connectWallet();
      const passport = new Contract(
        ADDRESSES.hskPassport,
        HSK_PASSPORT_ABI,
        signer
      );
      const tx = await passport.issueCredential(
        BigInt(selectedGroup),
        BigInt(commitmentInput)
      );
      setTxHash(tx.hash);
      setStatus("Waiting for confirmation...");
      await tx.wait();
      setStatus("Credential issued!");
      setCommitmentInput("");
    } catch (err: unknown) {
      setStatus(`Error: ${(err as Error).message}`);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-2">Issuer Dashboard</h1>
      <p className="text-gray-400 mb-8">
        Manage credential groups and issue ZK credentials to verified users.
      </p>

      {/* Connect */}
      {!connected ? (
        <button
          onClick={handleConnect}
          className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition-colors"
        >
          Connect Wallet
        </button>
      ) : (
        <div className="space-y-8">
          {/* Status bar */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">
                Connected:{" "}
                <span className="font-mono text-white">
                  {address.slice(0, 6)}...{address.slice(-4)}
                </span>
              </span>
              <span
                className={`px-2 py-0.5 rounded text-xs ${
                  isIssuer
                    ? "bg-green-900/50 text-green-400"
                    : "bg-red-900/50 text-red-400"
                }`}
              >
                {isIssuer ? "Approved Issuer" : "Not Approved"}
              </span>
            </div>
          </div>

          {/* Create Group */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">
              Create Credential Group
            </h2>
            <div className="flex gap-3">
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="e.g., KYC_VERIFIED"
                className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
              />
              <button
                onClick={handleCreateGroup}
                disabled={!isIssuer}
                className="px-6 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
              >
                Create
              </button>
            </div>
          </div>

          {/* Issue Credential */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">Issue Credential</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Credential Group
                </label>
                <select
                  value={selectedGroup}
                  onChange={(e) => setSelectedGroup(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
                >
                  {Object.entries(GROUP_NAMES).map(([id, name]) => (
                    <option key={id} value={id}>
                      {name} (Group {id})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Identity Commitment
                </label>
                <input
                  type="text"
                  value={commitmentInput}
                  onChange={(e) => setCommitmentInput(e.target.value)}
                  placeholder="Paste user's identity commitment"
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 font-mono text-sm"
                />
              </div>
              <button
                onClick={handleIssueCredential}
                disabled={!isIssuer}
                className="px-6 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
              >
                Issue Credential
              </button>
            </div>
          </div>

          {/* Status */}
          {status && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-sm">
              <p className="text-gray-300">{status}</p>
              {txHash && (
                <a
                  href={`${EXPLORER_URL}/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-400 hover:text-purple-300 text-xs font-mono mt-1 block"
                >
                  {txHash}
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
