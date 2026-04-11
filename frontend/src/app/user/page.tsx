"use client";

import { useState, useEffect } from "react";
import { Contract, JsonRpcProvider } from "ethers";
import { connectWallet, signMessage } from "@/lib/wallet";
import {
  createIdentityFromSignature,
  loadIdentity,
  clearIdentity,
  getCommitment,
  Identity,
} from "@/lib/semaphore";
import {
  ADDRESSES,
  HSK_PASSPORT_ABI,
  GROUP_NAMES,
  RPC_URL,
} from "@/lib/contracts";

export default function UserPage() {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [commitment, setCommitment] = useState("");
  const [credentials, setCredentials] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const stored = loadIdentity();
    if (stored) {
      setIdentity(stored);
      setCommitment(getCommitment(stored).toString());
    }
  }, []);

  useEffect(() => {
    if (identity && ADDRESSES.hskPassport) {
      checkCredentials();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity]);

  async function handleCreateIdentity() {
    setLoading(true);
    setStatus("Sign the message in MetaMask to create your identity...");
    try {
      await connectWallet();
      const sig = await signMessage(
        "HSK Passport: Generate my Semaphore identity"
      );
      const id = createIdentityFromSignature(sig);
      setIdentity(id);
      setCommitment(getCommitment(id).toString());
      setStatus("Identity created! Share your commitment with an issuer.");
    } catch (err: unknown) {
      setStatus(`Error: ${(err as Error).message}`);
    }
    setLoading(false);
  }

  async function handleClearIdentity() {
    clearIdentity();
    setIdentity(null);
    setCommitment("");
    setCredentials({});
    setStatus("Identity cleared.");
  }

  async function checkCredentials() {
    if (!identity || !ADDRESSES.hskPassport) return;
    try {
      const provider = new JsonRpcProvider(RPC_URL);
      const passport = new Contract(
        ADDRESSES.hskPassport,
        HSK_PASSPORT_ABI,
        provider
      );
      const commit = getCommitment(identity);
      const results: Record<number, boolean> = {};
      for (const [idStr] of Object.entries(GROUP_NAMES)) {
        const groupId = parseInt(idStr);
        try {
          results[groupId] = await passport.hasCredential(groupId, commit);
        } catch {
          results[groupId] = false;
        }
      }
      setCredentials(results);
    } catch {
      // Contract may not be deployed yet
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setStatus("Copied to clipboard!");
    setTimeout(() => setStatus(""), 2000);
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-2">My Credentials</h1>
      <p className="text-gray-400 mb-8">
        Create your cryptographic identity and manage your ZK credentials.
      </p>

      {!identity ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <h2 className="text-xl font-semibold mb-3">
            No Identity Found
          </h2>
          <p className="text-gray-400 mb-6 text-sm">
            Sign a message with your wallet to generate a deterministic
            Semaphore identity. This identity is derived from your wallet
            signature and never leaves your browser.
          </p>
          <button
            onClick={handleCreateIdentity}
            disabled={loading}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
          >
            {loading ? "Waiting for signature..." : "Create Identity"}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Identity Card */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Your Identity</h2>
              <button
                onClick={handleClearIdentity}
                className="text-xs text-red-400 hover:text-red-300"
              >
                Clear
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Identity Commitment (share this with your issuer)
                </label>
                <div className="flex gap-2">
                  <code className="flex-1 px-3 py-2 bg-gray-800 rounded-lg text-sm font-mono text-purple-300 break-all">
                    {commitment}
                  </code>
                  <button
                    onClick={() => copyToClipboard(commitment)}
                    className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs text-gray-400 shrink-0"
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Credentials */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Credentials</h2>
              <button
                onClick={checkCredentials}
                className="text-xs text-purple-400 hover:text-purple-300"
              >
                Refresh
              </button>
            </div>
            <div className="space-y-3">
              {Object.entries(GROUP_NAMES).map(([idStr, name]) => {
                const groupId = parseInt(idStr);
                const hasCred = credentials[groupId];
                return (
                  <div
                    key={groupId}
                    className="flex items-center justify-between py-3 px-4 bg-gray-800/50 rounded-lg"
                  >
                    <div>
                      <p className="font-medium">{name}</p>
                      <p className="text-xs text-gray-500">
                        Group ID: {groupId}
                      </p>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        hasCred
                          ? "bg-green-900/50 text-green-400 border border-green-800"
                          : "bg-gray-800 text-gray-500 border border-gray-700"
                      }`}
                    >
                      {hasCred ? "Issued" : "Not Issued"}
                    </span>
                  </div>
                );
              })}
            </div>
            {!ADDRESSES.hskPassport && (
              <p className="text-xs text-gray-500 mt-4">
                Contract not deployed yet. Credentials will appear after
                deployment.
              </p>
            )}
          </div>

          {/* How to get credentials */}
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-3">
              How to Get Credentials
            </h2>
            <ol className="list-decimal list-inside text-sm text-gray-400 space-y-2">
              <li>
                Copy your identity commitment above
              </li>
              <li>
                Share it with an approved issuer (e.g., via the Issuer
                Dashboard)
              </li>
              <li>
                The issuer adds your commitment to a credential group on-chain
              </li>
              <li>
                Come back here and click Refresh to see your credentials
              </li>
              <li>
                Go to the Demo page to generate ZK proofs and use your
                credentials
              </li>
            </ol>
          </div>
        </div>
      )}

      {/* Status */}
      {status && (
        <div className="mt-6 bg-gray-900 border border-gray-800 rounded-lg p-4 text-sm text-gray-300">
          {status}
        </div>
      )}
    </div>
  );
}
