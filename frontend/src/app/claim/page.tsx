"use client";

import { useState, useEffect } from "react";
import { Contract } from "ethers";
import { connectWallet, signMessage } from "@/lib/wallet";
import {
  createIdentityFromSignature,
  loadIdentityForWallet,
  getCommitment,
  Identity,
} from "@/lib/semaphore";
import {
  apiGetVoucherPubkey,
  apiCreateVoucherSession,
  apiRequestVoucher,
  apiSumsubStatus,
} from "@/lib/api";
import { blindCommitment, unblind } from "@/lib/blind";
import {
  CLAIM_CREDENTIAL,
  CLAIM_CREDENTIAL_ABI,
  EXPLORER_URL,
} from "@/lib/contracts";
import { SumsubVerification } from "@/components/SumsubVerification";
import { COUNTRIES, DEFAULT_COUNTRY, toAlpha3 } from "@/lib/countries";
import { useToast } from "@/components/Toast";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

type Stage = "intro" | "verifying" | "claim" | "done";

interface Pubkey {
  N: bigint;
  e: bigint;
}

export default function ClaimPage() {
  const { toast } = useToast();
  const [stage, setStage] = useState<Stage>("intro");
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [country, setCountry] = useState<string>(DEFAULT_COUNTRY);
  const [pubkey, setPubkey] = useState<Pubkey | null>(null);
  const [session, setSession] = useState<{
    sessionId: string;
    accessToken: string;
    levelName: string;
  } | null>(null);
  const [sig, setSig] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);

  const delegateDeployed = CLAIM_CREDENTIAL.address !== ZERO_ADDRESS;

  // Fetch the issuer public key up front — its presence also tells us whether
  // the server has blind issuance configured at all.
  useEffect(() => {
    (async () => {
      try {
        const pk = await apiGetVoucherPubkey();
        if (pk.enabled && pk.modulus && pk.exponent) {
          setPubkey({ N: BigInt(pk.modulus), e: BigInt(pk.exponent) });
        }
      } catch {
        // leave pubkey null — UI shows "not available"
      }
    })();
  }, []);

  const available = Boolean(pubkey) && delegateDeployed;

  async function handleConnectAndVerify() {
    if (!pubkey) {
      toast("Blind issuance is not enabled on this server.", "error");
      return;
    }
    setBusy(true);
    try {
      const { address } = await connectWallet("testnet");
      let id = loadIdentityForWallet(address);
      if (!id) {
        const s = await signMessage(
          "HSK Passport: Generate my Semaphore identity",
        );
        id = createIdentityFromSignature(s, address);
        toast("Identity created.", "success");
      }
      setIdentity(id);

      // A fresh, random session — Sumsub never sees the commitment.
      const s = await apiCreateVoucherSession(toAlpha3(country));
      setSession(s);
      setStage("verifying");
    } catch (e) {
      toast(`Failed: ${(e as Error).message.slice(0, 140)}`, "error");
    } finally {
      setBusy(false);
    }
  }

  // Blind the commitment, redeem the voucher, unblind into a usable signature.
  // The blinding factor r lives only inside this function.
  async function obtainVoucher() {
    if (!identity || !session || !pubkey) return;
    setBusy(true);
    try {
      const commitment = getCommitment(identity);
      const { blinded, r } = await blindCommitment(
        commitment,
        pubkey.N,
        pubkey.e,
      );
      const { blindSig } = await apiRequestVoucher(session.sessionId, blinded);
      setSig(unblind(blindSig, r, pubkey.N));
      setStage("claim");
      toast("Voucher issued. You can now claim your credential.", "success");
    } catch (e) {
      toast(`Voucher failed: ${(e as Error).message.slice(0, 160)}`, "error");
    } finally {
      setBusy(false);
    }
  }

  async function onSumsubComplete(answer: "GREEN" | "RED" | "YELLOW") {
    if (answer === "GREEN") await obtainVoucher();
    else if (answer === "RED")
      toast("Sumsub rejected the verification.", "error");
    else toast("Sumsub review pending further checks.", "info");
  }

  async function refreshStatus() {
    if (!session) return;
    const status = await apiSumsubStatus(session.sessionId);
    if (status.reviewAnswer === "GREEN") await obtainVoucher();
    else
      toast(
        `Status: ${status.reviewStatus || "pending"} (${status.reviewAnswer || "no decision"})`,
        "info",
      );
  }

  async function handleClaim() {
    if (!identity || !sig) return;
    setBusy(true);
    try {
      const commitment = getCommitment(identity);
      const { signer } = await connectWallet("testnet");
      const claim = new Contract(
        CLAIM_CREDENTIAL.address,
        CLAIM_CREDENTIAL_ABI,
        signer,
      );
      const tx = await claim.claim(commitment, sig);
      setTxHash(tx.hash);
      toast("Claim submitted — waiting for confirmation...", "info");
      await tx.wait();
      setStage("done");
      toast("Credential claimed on-chain.", "success");
    } catch (err: unknown) {
      const e = err as {
        code?: string;
        shortMessage?: string;
        message?: string;
        reason?: string;
      };
      const msg = (e.shortMessage || e.reason || e.message || "").toString();
      if (msg.includes("NullifierUsed")) {
        toast("This voucher has already been claimed.", "info");
        setStage("done");
      } else if (msg.includes("BadSignature")) {
        toast("Signature rejected on-chain. The voucher is invalid.", "error");
      } else if (
        msg.includes("user rejected") ||
        e.code === "ACTION_REJECTED"
      ) {
        toast("Transaction cancelled.", "info");
      } else if (msg.includes("insufficient")) {
        toast(
          "Insufficient HSK for gas. Fund the wallet from the faucet.",
          "error",
        );
      } else {
        toast(`Claim error: ${msg.slice(0, 150)}`, "error");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="mb-6">
        <div className="inline-block px-3 py-1 mb-3 text-xs font-mono text-purple-400 border border-purple-800 rounded-full bg-purple-950/30">
          Blind issuance — the issuer never learns your commitment
        </div>
        <h1 className="text-3xl font-bold mb-2">Claim a Private Credential</h1>
        <p className="text-gray-400">
          You verify under a random session, then redeem a blind signature over
          your identity commitment. Because the issuer signs only a blinded
          value and you submit the on-chain claim yourself, no party can link
          your credential to your Sumsub identity.
        </p>
      </div>

      {!available && (
        <div className="mb-6 bg-yellow-950/20 border border-yellow-800/40 rounded-xl p-4 text-sm text-yellow-200">
          {!pubkey
            ? "Blind issuance is not enabled on this server."
            : "The claim delegate is not deployed on this network yet. Once ClaimCredential is deployed and approved as a group delegate, this flow goes live."}
        </div>
      )}

      {/* Step 1: intro */}
      {stage === "intro" && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5">
          <div>
            <label
              htmlFor="claim-country"
              className="block text-xs font-medium text-gray-300 mb-1.5"
            >
              Country of ID issuance
            </label>
            <select
              id="claim-country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:border-purple-500 focus:outline-none"
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleConnectAndVerify}
            disabled={busy || !available}
            className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
          >
            {busy ? "Starting..." : "Connect & Start Verification"}
          </button>
        </div>
      )}

      {/* Step 2: Sumsub verification under a random session */}
      {stage === "verifying" && session && (
        <div className="space-y-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-sm text-gray-300">
            <strong className="text-purple-300">
              Verifying under a random session
            </strong>
            <div className="text-xs text-gray-500 mt-0.5 font-mono break-all">
              session {session.sessionId}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              On approval, a blind voucher is issued automatically — your
              commitment is blinded in your browser before it is sent.
            </p>
          </div>
          <SumsubVerification
            accessToken={session.accessToken}
            levelName={session.levelName}
            onComplete={onSumsubComplete}
            onError={(e) =>
              toast(`Sumsub error: ${e.message.slice(0, 120)}`, "error")
            }
          />
          <button
            onClick={refreshStatus}
            disabled={busy}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-sm text-gray-200 rounded-lg"
          >
            {busy ? "Checking..." : "Refresh Status"}
          </button>
        </div>
      )}

      {/* Step 3: claim on-chain */}
      {stage === "claim" && sig && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          <div className="bg-green-950/30 border border-green-800/50 rounded-lg p-3 text-sm text-green-300">
            ✓ Blind voucher issued. The issuer signed a blinded value only — it
            never saw your commitment.
          </div>
          <div className="bg-yellow-950/20 border border-yellow-800/40 rounded-lg p-3 text-xs text-yellow-200">
            <strong className="text-yellow-300">Privacy tip:</strong> claiming
            right now, from the wallet you funded for KYC, can link the two by
            timing and funding address. For maximum unlinkability, claim later
            from a fresh, separately-funded address — the voucher stays valid.
          </div>
          <button
            onClick={handleClaim}
            disabled={busy}
            className="w-full px-4 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium rounded-lg"
          >
            {busy ? "Claiming..." : "Claim Credential On-Chain"}
          </button>
        </div>
      )}

      {/* Step 4: done */}
      {stage === "done" && (
        <div className="bg-gradient-to-br from-green-950/40 to-gray-900 border border-green-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-green-400 mb-2">
            Credential Claimed
          </h2>
          <p className="text-sm text-gray-300 mb-4">
            Your commitment is now in the credential group. No one can link it
            to the Sumsub session that authorised it.
          </p>
          {txHash && (
            <a
              href={`${EXPLORER_URL}/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs text-purple-300 hover:text-purple-200"
            >
              View transaction: {txHash.slice(0, 10)}...{txHash.slice(-6)}
            </a>
          )}
          <div className="flex flex-wrap gap-3 mt-5">
            <a
              href="/demo"
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg"
            >
              Try the Demo →
            </a>
            <a
              href="/user"
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm rounded-lg"
            >
              My Credentials
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
