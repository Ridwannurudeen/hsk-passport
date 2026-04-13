"use client";

import { useState, useEffect } from "react";
import { Contract } from "ethers";
import { connectWallet } from "@/lib/wallet";
import {
  ADDRESSES,
  HSK_PASSPORT_ABI,
  GROUPS,
  EXPLORER_URL,
} from "@/lib/contracts";
import { apiGetKYCQueue, apiReviewKYC, buildReviewMessage, buildIssuerReadMessage, type KYCRequest, type IssuerAuth } from "@/lib/api";
import { useToast } from "@/components/Toast";

const CREDENTIAL_TYPE_TO_GROUP: Record<string, number> = {
  KYCVerified: GROUPS.KYC_VERIFIED,
  AccreditedInvestor: GROUPS.ACCREDITED_INVESTOR,
  HKResident: GROUPS.HK_RESIDENT,
};

export default function IssuerPage() {
  const { toast } = useToast();
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState("");
  const [isIssuer, setIsIssuer] = useState(false);
  const [queue, setQueue] = useState<KYCRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected" | "">("pending");
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [issuerAuth, setIssuerAuth] = useState<IssuerAuth | null>(null);

  async function handleConnect() {
    try {
      const { signer, address: addr } = await connectWallet();
      setAddress(addr);
      setConnected(true);
      const passport = new Contract(ADDRESSES.hskPassport, HSK_PASSPORT_ABI, signer);
      const approved = await passport.approvedIssuers(addr);
      setIsIssuer(approved);
      if (approved) {
        // Sign a read-auth message so the backend will return full PII (wallet, jurisdiction, etc.)
        const nonce = Date.now();
        const sig = await signer.signMessage(buildIssuerReadMessage(nonce));
        setIssuerAuth({ address: addr, signature: sig, nonce });
        toast("Authenticated as approved issuer — full queue data unlocked.", "success");
      } else {
        toast("You are not an approved issuer. Connect as the protocol owner or contact an admin.", "error");
      }
    } catch (e) {
      toast(`Connect failed: ${(e as Error).message.slice(0, 100)}`, "error");
    }
  }

  async function refreshQueue() {
    setLoading(true);
    try {
      // Re-sign auth if older than 4 minutes (5 min server window with margin)
      let auth = issuerAuth;
      if (auth && Date.now() - auth.nonce > 4 * 60_000) {
        try {
          const { signer, address: addr } = await connectWallet();
          const nonce = Date.now();
          const sig = await signer.signMessage(buildIssuerReadMessage(nonce));
          auth = { address: addr, signature: sig, nonce };
          setIssuerAuth(auth);
        } catch {
          auth = null;
        }
      }
      const [p, a, r] = await Promise.all([
        apiGetKYCQueue("pending", auth || undefined),
        apiGetKYCQueue("approved", auth || undefined),
        apiGetKYCQueue("rejected", auth || undefined),
      ]);
      setStats({ pending: p.count, approved: a.count, rejected: r.count });

      const current = await apiGetKYCQueue(statusFilter || undefined, auth || undefined);
      setQueue(current.queue);
    } catch (e) {
      toast(`Failed to load queue: ${(e as Error).message}`, "error");
    }
    setLoading(false);
  }

  useEffect(() => {
    refreshQueue();
    const i = setInterval(refreshQueue, 15000);
    return () => clearInterval(i);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function handleApprove(req: KYCRequest) {
    if (!isIssuer) {
      toast("Not an approved issuer", "error");
      return;
    }
    setReviewingId(req.id);
    try {
      const { signer } = await connectWallet();
      const passport = new Contract(ADDRESSES.hskPassport, HSK_PASSPORT_ABI, signer);

      const groupId = CREDENTIAL_TYPE_TO_GROUP[req.credential_type];
      if (groupId === undefined) {
        toast(`Unknown credential type: ${req.credential_type}`, "error");
        setReviewingId(null);
        return;
      }

      toast("Issuing credential on-chain...", "info");
      const tx = await passport.issueCredential(groupId, BigInt(req.identity_commitment));
      await tx.wait();

      // Sign review authorization for the backend
      const nonce = Date.now();
      const message = buildReviewMessage(req.id, "approve", nonce);
      const signature = await signer.signMessage(message);

      await apiReviewKYC({
        id: req.id,
        reviewer: address,
        action: "approve",
        signature,
        nonce,
        txHash: tx.hash,
      });

      toast(`Approved. Credential issued in tx ${tx.hash.slice(0, 10)}...`, "success");
      await refreshQueue();
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("CredentialAlreadyIssued")) {
        try {
          const { signer: s2 } = await connectWallet();
          const nonce2 = Date.now();
          const sig2 = await s2.signMessage(buildReviewMessage(req.id, "approve", nonce2));
          await apiReviewKYC({ id: req.id, reviewer: address, action: "approve", signature: sig2, nonce: nonce2 });
          toast("Credential already on-chain, marked approved", "info");
          await refreshQueue();
        } catch (ee) {
          toast(`Already issued but backend update failed: ${(ee as Error).message.slice(0, 80)}`, "error");
        }
      } else if (msg.includes("user rejected")) {
        toast("Signature or transaction cancelled.", "info");
      } else {
        toast(`Approval failed: ${msg.slice(0, 100)}`, "error");
      }
    }
    setReviewingId(null);
  }

  async function handleReject(req: KYCRequest) {
    const reason = prompt("Rejection reason (optional):") || "Did not meet verification requirements";
    setReviewingId(req.id);
    try {
      const { signer } = await connectWallet();
      const nonce = Date.now();
      const signature = await signer.signMessage(buildReviewMessage(req.id, "reject", nonce));

      await apiReviewKYC({
        id: req.id,
        reviewer: address,
        action: "reject",
        signature,
        nonce,
        rejectionReason: reason,
      });
      toast("Request rejected", "info");
      await refreshQueue();
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("user rejected")) {
        toast("Signature cancelled.", "info");
      } else {
        toast(`Reject failed: ${msg.slice(0, 100)}`, "error");
      }
    }
    setReviewingId(null);
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-3xl font-bold">Issuer Dashboard</h1>
        {connected && (
          <div className="flex items-center gap-3 text-sm">
            <span className="font-mono text-gray-400">{address.slice(0, 6)}...{address.slice(-4)}</span>
            <span className={`px-2 py-1 rounded text-xs ${isIssuer ? "bg-green-900/50 text-green-400" : "bg-red-900/50 text-red-400"}`}>
              {isIssuer ? "Approved Issuer" : "Not Approved"}
            </span>
          </div>
        )}
      </div>
      <p className="text-gray-400 mb-8">
        Review KYC submissions and issue on-chain credentials. Approved credentials add the user&apos;s commitment to the corresponding Semaphore group.
      </p>

      {!connected ? (
        <button
          onClick={handleConnect}
          className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition-colors"
        >
          Connect Wallet
        </button>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="text-2xl font-bold text-yellow-400">{stats.pending}</div>
              <div className="text-xs text-gray-500">Pending Review</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="text-2xl font-bold text-green-400">{stats.approved}</div>
              <div className="text-xs text-gray-500">Approved</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="text-2xl font-bold text-red-400">{stats.rejected}</div>
              <div className="text-xs text-gray-500">Rejected</div>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-1 mb-4 border-b border-gray-800">
            {(["pending", "approved", "rejected"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
                  statusFilter === s
                    ? "border-purple-500 text-white"
                    : "border-transparent text-gray-500 hover:text-gray-300"
                }`}
              >
                {s}
              </button>
            ))}
            <button
              onClick={refreshQueue}
              className="ml-auto px-4 py-2 text-xs text-gray-400 hover:text-white"
            >
              Refresh
            </button>
          </div>

          {/* Queue */}
          {loading && queue.length === 0 ? (
            <p className="text-gray-500 text-sm">Loading...</p>
          ) : queue.length === 0 ? (
            <div className="text-center py-12 bg-gray-900/30 border border-gray-800 border-dashed rounded-xl">
              <p className="text-gray-500">No {statusFilter} requests</p>
            </div>
          ) : (
            <div className="space-y-3">
              {queue.map((req) => (
                <div key={req.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-medium">{req.credential_type}</span>
                        <span className="text-xs text-gray-500 font-mono">#{req.id.slice(0, 8)}</span>
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          req.status === "pending" ? "bg-yellow-900/50 text-yellow-400" :
                          req.status === "approved" ? "bg-green-900/50 text-green-400" :
                          "bg-red-900/50 text-red-400"
                        }`}>
                          {req.status}
                        </span>
                      </div>

                      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs mb-3">
                        <div><dt className="text-gray-500 inline">Wallet: </dt><dd className="font-mono inline">{req.wallet_address.slice(0, 6)}...{req.wallet_address.slice(-4)}</dd></div>
                        <div><dt className="text-gray-500 inline">Jurisdiction: </dt><dd className="inline">{req.jurisdiction}</dd></div>
                        <div><dt className="text-gray-500 inline">Document: </dt><dd className="inline">{req.document_type || "—"}</dd></div>
                        <div><dt className="text-gray-500 inline">Submitted: </dt><dd className="inline">{new Date(req.submitted_at).toLocaleString()}</dd></div>
                      </dl>

                      <div className="text-xs font-mono text-gray-600 break-all bg-gray-800/30 rounded p-2">
                        commitment: {req.identity_commitment.slice(0, 40)}...
                      </div>

                      {req.rejection_reason && (
                        <p className="text-xs text-red-400 mt-2">Rejected: {req.rejection_reason}</p>
                      )}
                      {req.tx_hash && (
                        <a href={`${EXPLORER_URL}/tx/${req.tx_hash}`} target="_blank" rel="noopener noreferrer"
                          className="text-xs font-mono text-purple-400 hover:text-purple-300 mt-2 block">
                          Issuance tx: {req.tx_hash.slice(0, 12)}...
                        </a>
                      )}
                    </div>

                    {req.status === "pending" && (
                      <div className="flex flex-col gap-2 shrink-0">
                        <button
                          onClick={() => handleApprove(req)}
                          disabled={reviewingId === req.id || !isIssuer}
                          className="px-4 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded"
                        >
                          {reviewingId === req.id ? "..." : "Approve"}
                        </button>
                        <button
                          onClick={() => handleReject(req)}
                          disabled={reviewingId === req.id}
                          className="px-4 py-1.5 bg-red-900/50 hover:bg-red-900/70 disabled:opacity-50 text-red-200 text-sm rounded border border-red-800"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
