"use client";

import { useState, useEffect } from "react";
import { connectWallet, signMessage } from "@/lib/wallet";
import {
  createIdentityFromSignature,
  loadIdentity,
  getCommitment,
  Identity,
} from "@/lib/semaphore";
import { apiSubmitKYC, apiGetKYCStatus, type KYCRequest } from "@/lib/api";
import { useToast } from "@/components/Toast";

const JURISDICTIONS = [
  { code: "HK", name: "Hong Kong SAR" },
  { code: "SG", name: "Singapore" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "JP", name: "Japan" },
  { code: "KR", name: "South Korea" },
  { code: "OTHER", name: "Other" },
];

const CREDENTIAL_TYPES = [
  { id: "KYCVerified", name: "Standard KYC", desc: "Basic identity verification" },
  { id: "AccreditedInvestor", name: "Accredited Investor", desc: "Professional investor status" },
  { id: "HKResident", name: "HK Resident", desc: "Hong Kong residency proof" },
];

export default function KYCPage() {
  const { toast } = useToast();
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [wallet, setWallet] = useState<string>("");
  const [credentialType, setCredentialType] = useState("KYCVerified");
  const [jurisdiction, setJurisdiction] = useState("HK");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [kycStatus, setKYCStatus] = useState<KYCRequest | null>(null);
  const [step, setStep] = useState<"identity" | "form" | "submitted">("identity");

  useEffect(() => {
    const stored = loadIdentity();
    if (stored) {
      setIdentity(stored);
      setStep("form");
      checkStatus(stored);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkStatus(id: Identity) {
    try {
      const status = await apiGetKYCStatus(getCommitment(id).toString());
      if ("status" in status && status.status !== "none") {
        setKYCStatus(status as KYCRequest);
        if ((status as KYCRequest).status === "pending") {
          setStep("submitted");
        }
      }
    } catch {
      // ignore
    }
  }

  async function handleCreateIdentity() {
    try {
      const { address } = await connectWallet();
      setWallet(address);
      const sig = await signMessage("HSK Passport: Generate my Semaphore identity");
      const id = createIdentityFromSignature(sig);
      setIdentity(id);
      setStep("form");
      await checkStatus(id);
      toast("Identity created. Fill the form below.", "success");
    } catch (e) {
      toast(`Failed: ${(e as Error).message.slice(0, 100)}`, "error");
    }
  }

  async function handleSubmit() {
    if (!identity) return;
    if (!documentFile || !selfieFile) {
      toast("Please upload both document and selfie", "error");
      return;
    }
    setSubmitting(true);
    try {
      const { address } = await connectWallet();
      const result = await apiSubmitKYC({
        commitment: getCommitment(identity).toString(),
        wallet: address,
        jurisdiction,
        credentialType,
        documentType: documentFile.name.split(".").pop() || "pdf",
      });
      toast("KYC submitted! Waiting for issuer review.", "success");
      await checkStatus(identity);
      setStep("submitted");
      console.log("[KYC] submitted", result);
    } catch (e) {
      toast(`Submit failed: ${(e as Error).message.slice(0, 100)}`, "error");
    }
    setSubmitting(false);
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-2">Complete KYC Verification</h1>
      <p className="text-gray-400 mb-8">
        Submit your identity verification to receive a zero-knowledge credential. Your documents never touch the blockchain — only your cryptographic commitment is issued on-chain.
      </p>

      {/* Privacy Notice */}
      <div className="mb-6 bg-purple-950/30 border border-purple-800/50 rounded-xl p-4 text-sm text-purple-200">
        <strong className="font-semibold">Privacy notice:</strong> Documents are processed locally for this demo. In production, they would be encrypted client-side and verified by the issuer&apos;s KYC provider. The only data stored on-chain is a 32-byte cryptographic hash — no name, address, or document content.
      </div>

      {/* Step 1: Identity */}
      {step === "identity" && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-3">Step 1 — Create your identity</h2>
          <p className="text-sm text-gray-400 mb-4">
            Connect your wallet and sign a message to generate a Semaphore identity. This identity is deterministic from your signature — you can always recover it.
          </p>
          <button
            onClick={handleCreateIdentity}
            className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition-colors"
          >
            Connect & Create Identity
          </button>
        </div>
      )}

      {/* Step 2: KYC Form */}
      {step === "form" && identity && (
        <div className="space-y-6">
          {kycStatus && kycStatus.status === "rejected" && (
            <div className="bg-red-950/50 border border-red-800/50 rounded-xl p-4 text-sm text-red-200">
              <strong>Previous submission rejected.</strong> Reason: {kycStatus.rejection_reason || "none provided"}. You can re-submit.
            </div>
          )}

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5">
            <h2 className="text-lg font-semibold">Verification Details</h2>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Credential Type</label>
              <div className="grid gap-2">
                {CREDENTIAL_TYPES.map((t) => (
                  <label
                    key={t.id}
                    className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      credentialType === t.id
                        ? "border-purple-500 bg-purple-950/30"
                        : "border-gray-700 hover:border-gray-600"
                    }`}
                  >
                    <input
                      type="radio"
                      value={t.id}
                      checked={credentialType === t.id}
                      onChange={(e) => setCredentialType(e.target.value)}
                      className="mt-1"
                    />
                    <div>
                      <div className="font-medium text-sm">{t.name}</div>
                      <div className="text-xs text-gray-500">{t.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Jurisdiction</label>
              <select
                value={jurisdiction}
                onChange={(e) => setJurisdiction(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white"
              >
                {JURISDICTIONS.map((j) => (
                  <option key={j.code} value={j.code}>{j.name} ({j.code})</option>
                ))}
              </select>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">ID Document</label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => setDocumentFile(e.target.files?.[0] || null)}
                  className="w-full text-sm text-gray-400 file:mr-3 file:py-2 file:px-4 file:rounded file:border-0 file:bg-purple-900/50 file:text-purple-200 hover:file:bg-purple-900/70 file:cursor-pointer"
                />
                {documentFile && (
                  <p className="text-xs text-green-400 mt-1">✓ {documentFile.name}</p>
                )}
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Selfie</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setSelfieFile(e.target.files?.[0] || null)}
                  className="w-full text-sm text-gray-400 file:mr-3 file:py-2 file:px-4 file:rounded file:border-0 file:bg-purple-900/50 file:text-purple-200 hover:file:bg-purple-900/70 file:cursor-pointer"
                />
                {selfieFile && (
                  <p className="text-xs text-green-400 mt-1">✓ {selfieFile.name}</p>
                )}
              </div>
            </div>

            <div className="text-xs font-mono text-gray-500 bg-gray-800/50 rounded p-3 break-all">
              <div className="text-gray-400 mb-1">Your identity commitment:</div>
              {getCommitment(identity).toString()}
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full px-6 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
            >
              {submitting ? "Submitting..." : "Submit for Verification"}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Submitted */}
      {step === "submitted" && kycStatus && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
              <div className="w-3 h-3 rounded-full bg-yellow-400 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Under Review</h2>
              <p className="text-xs text-gray-500">
                Submitted {new Date(kycStatus.submitted_at).toLocaleString()}
              </p>
            </div>
          </div>

          <dl className="space-y-2 text-sm mb-6">
            <div className="flex justify-between"><dt className="text-gray-500">Request ID</dt><dd className="font-mono text-xs">{kycStatus.id.slice(0, 8)}...</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Credential type</dt><dd>{kycStatus.credential_type}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Jurisdiction</dt><dd>{kycStatus.jurisdiction}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Status</dt><dd className="text-yellow-400">{kycStatus.status}</dd></div>
          </dl>

          <p className="text-sm text-gray-400 mb-4">
            An approved issuer is reviewing your submission. Typical review time: 5-15 minutes in this demo. Once approved, your credential will be issued on-chain.
          </p>

          <button
            onClick={() => identity && checkStatus(identity)}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-sm rounded-lg transition-colors"
          >
            Check Status
          </button>
        </div>
      )}

      {kycStatus && kycStatus.status === "approved" && (
        <div className="mt-6 bg-green-950/30 border border-green-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-green-400 mb-2">Credential Issued</h2>
          <p className="text-sm text-gray-300 mb-4">
            Your {kycStatus.credential_type} credential has been issued on-chain. You can now use it to prove your status to any dApp.
          </p>
          {kycStatus.tx_hash && (
            <a
              href={`https://hashkey-testnet.blockscout.com/tx/${kycStatus.tx_hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono text-green-400 hover:text-green-300"
            >
              View tx: {kycStatus.tx_hash.slice(0, 16)}...
            </a>
          )}
          <div className="mt-4 flex gap-3">
            <a
              href="/demo"
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-sm text-white rounded-lg transition-colors"
            >
              Try the Demo
            </a>
            <a
              href="/ecosystem"
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-sm text-gray-200 rounded-lg transition-colors"
            >
              Browse Ecosystem
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
