"use client";

import { useState, useEffect } from "react";
import { Contract, JsonRpcProvider } from "ethers";
import { connectWallet, signMessage } from "@/lib/wallet";
import {
  createIdentityFromSignature,
  loadIdentity,
  loadIdentityForWallet,
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
import { apiSumsubData, type SumsubIdDoc } from "@/lib/api";

export default function UserPage() {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [commitment, setCommitment] = useState("");
  const [credentials, setCredentials] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [verifiedData, setVerifiedData] = useState<{ applicantId?: string; idDocs: SumsubIdDoc[]; reviewAnswer?: string | null } | null>(null);
  const [showFullData, setShowFullData] = useState(false);
  const [tab, setTab] = useState<"identity" | "verified" | "credentials">("identity");

  useEffect(() => {
    const stored = loadIdentity();
    if (stored) {
      setIdentity(stored);
      setCommitment(getCommitment(stored).toString());
    }

    // Auto-swap when MetaMask account changes.
    if (typeof window === "undefined" || !window.ethereum) return;
    const eth = window.ethereum as { on?: (e: string, h: (a: string[]) => void) => void };
    const handler = (accs: string[]) => {
      const addr = accs[0]?.toLowerCase();
      if (!addr) return;
      const id = loadIdentityForWallet(addr);
      if (id) {
        setIdentity(id);
        setCommitment(getCommitment(id).toString());
      } else {
        setIdentity(null);
        setCommitment("");
      }
      setVerifiedData(null);
    };
    eth.on?.("accountsChanged", handler);
  }, []);

  useEffect(() => {
    if (identity && ADDRESSES.hskPassport) {
      checkCredentials();
    }
    if (identity) {
      loadVerifiedData();
    }
    // eslint-disable-next-line @typescript-eslint/no-use-before-define,react-hooks/exhaustive-deps
  }, [identity]);

  async function loadVerifiedData() {
    if (!identity) return;
    try {
      const data = await apiSumsubData(getCommitment(identity).toString());
      if (data.idDocs && data.idDocs.length > 0) {
        setVerifiedData({ applicantId: data.applicantId, idDocs: data.idDocs, reviewAnswer: data.reviewAnswer });
      } else {
        setVerifiedData(null);
      }
    } catch {
      setVerifiedData(null);
    }
  }

  function mask(s: string | undefined, keep = 2): string {
    if (!s) return "—";
    if (s.length <= keep * 2) return s[0] + "*".repeat(Math.max(1, s.length - 1));
    return s.slice(0, keep) + "*".repeat(Math.max(3, s.length - keep * 2)) + s.slice(-keep);
  }

  function maskDob(dob: string | undefined): string {
    if (!dob) return "—";
    const year = dob.slice(0, 4);
    return `${year}-**-**`;
  }

  async function handleCreateIdentity() {
    setLoading(true);
    setStatus("Sign the message in MetaMask to create your identity...");
    try {
      const { address: walletAddr } = await connectWallet();
      const sig = await signMessage("HSK Passport: Generate my Semaphore identity");
      const id = createIdentityFromSignature(sig, walletAddr);
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
          {/* Tabs */}
          <div className="flex gap-1 border-b border-gray-800">
            {([
              { k: "identity" as const, label: "Identity", badge: "" },
              { k: "verified" as const, label: "Verified Data", badge: verifiedData ? "✓" : "" },
              { k: "credentials" as const, label: "Credentials", badge: "" },
            ]).map((t) => (
              <button
                key={t.k}
                onClick={() => setTab(t.k)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  tab === t.k
                    ? "border-purple-500 text-white"
                    : "border-transparent text-gray-400 hover:text-gray-200"
                }`}
              >
                {t.label}
                {t.badge && <span className="ml-1.5 text-green-400">{t.badge}</span>}
              </button>
            ))}
          </div>

          {/* Identity Card */}
          {tab === "identity" && (
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
          )}

          {/* Verified Identity (Sumsub) */}
          {tab === "verified" && (
            verifiedData && verifiedData.idDocs.length > 0 ? (
            <div className="bg-gradient-to-br from-green-950/30 to-gray-900 border border-green-800/50 rounded-xl p-6">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h2 className="text-lg font-semibold text-green-300">Verified Identity</h2>
                  <p className="text-xs text-gray-500">
                    Verified via Sumsub — same provider used by HashKey Exchange
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-900/50 text-green-400 border border-green-800">
                  {verifiedData.reviewAnswer || "VERIFIED"}
                </span>
              </div>

              <div className="mt-4 text-xs text-gray-400 bg-gray-900/50 border border-gray-800 rounded-lg p-3">
                <strong className="text-green-400">🔒 Privacy guarantee:</strong> This data is fetched live from Sumsub on every page load. HSK Passport does not store your personal information. Your on-chain credential is only a cryptographic commitment — it reveals none of the fields below.
              </div>

              {verifiedData.idDocs.map((doc, i) => (
                <div key={i} className="mt-4 space-y-2">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <Field label="Document Type" value={doc.idDocType || "—"} />
                    <Field label="Issuing Country" value={doc.country || "—"} />
                    <Field label="Given Name" value={showFullData ? (doc.firstName || "—") : mask(doc.firstName)} />
                    <Field label="Surname" value={showFullData ? (doc.lastName || "—") : mask(doc.lastName)} />
                    <Field label="Date of Birth" value={showFullData ? (doc.dob || "—") : maskDob(doc.dob)} />
                    <Field label="Document Number" value={showFullData ? (doc.number || "—") : mask(doc.number)} />
                    {doc.issuedDate && <Field label="Issued" value={doc.issuedDate} />}
                    {doc.validUntil && <Field label="Valid Until" value={doc.validUntil} />}
                  </div>
                </div>
              ))}

              <button
                onClick={() => setShowFullData((v) => !v)}
                className="mt-4 text-xs text-purple-400 hover:text-purple-300 underline"
              >
                {showFullData ? "Hide sensitive fields" : "Show full details"}
              </button>
              {verifiedData.applicantId && (
                <p className="mt-3 text-xs text-gray-600 font-mono">
                  Sumsub applicant: {verifiedData.applicantId}
                </p>
              )}
            </div>
            ) : (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
                <h3 className="text-lg font-semibold mb-2">No verified data yet</h3>
                <p className="text-sm text-gray-400 mb-4">
                  Complete KYC via Sumsub to see your verified identity fields here.
                </p>
                <a href="/kyc" className="inline-block px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg">
                  Start Verification
                </a>
              </div>
            )
          )}

          {/* Credentials */}
          {tab === "credentials" && (
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
          )}

          {/* How to get credentials */}
          {tab === "credentials" && (
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
          )}
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-gray-200 font-mono break-all">{value}</div>
    </div>
  );
}
