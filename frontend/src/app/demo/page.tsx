"use client";

import { useState, useRef } from "react";
import { Contract, JsonRpcProvider } from "ethers";
import { connectWallet, signMessage } from "@/lib/wallet";
import {
  createIdentityFromSignature,
  loadIdentity,
  getCommitment,
  generateCredentialProof,
  formatProofForContract,
  Identity,
  type SemaphoreProof,
} from "@/lib/semaphore";
import {
  ADDRESSES,
  DEMO_ISSUER_ABI,
  GATED_RWA_ABI,
  GROUPS,
  RPC_URL,
  EXPLORER_URL,
} from "@/lib/contracts";
import { StepProgress } from "@/components/StepProgress";
import { ProofCard } from "@/components/ProofCard";
import { useToast } from "@/components/Toast";

const STEPS = [
  { label: "Connect", description: "Connect wallet and create identity" },
  { label: "Credential", description: "Self-issue KYC credential" },
  { label: "ZK Proof", description: "Generate zero-knowledge proof" },
  { label: "Mint", description: "KYC-gated token mint" },
];

function getInitialState() {
  if (typeof window === "undefined") return { identity: null, step: 0, completed: new Set<number>() };
  const stored = loadIdentity();
  if (stored) return { identity: stored, step: 1, completed: new Set([0]) };
  return { identity: null, step: 0, completed: new Set<number>() };
}

export default function DemoPage() {
  const { toast } = useToast();
  const [initial] = useState(getInitialState);
  const [currentStep, setCurrentStep] = useState(initial.step);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(initial.completed);
  const [identity, setIdentity] = useState<Identity | null>(initial.identity);
  const [proof, setProof] = useState<SemaphoreProof | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const [txHash, setTxHash] = useState("");
  const [balance, setBalance] = useState("0");
  const [groupSize, setGroupSize] = useState(0);
  const abortRef = useRef(false);

  function completeStep(step: number) {
    setCompletedSteps((prev) => new Set([...prev, step]));
    setCurrentStep(step + 1);
  }

  // Step 1: Connect & Create Identity
  async function handleConnect() {
    setLoading(true);
    setLoadingText("Connecting wallet...");
    try {
      await connectWallet();
      setLoadingText("Sign the message in MetaMask to create your identity...");
      const sig = await signMessage("HSK Passport: Generate my Semaphore identity");
      const id = createIdentityFromSignature(sig);
      setIdentity(id);
      completeStep(0);
      toast("Identity created! Your cryptographic fingerprint is ready.", "success");
    } catch (err: unknown) {
      const msg = (err as Error).message;
      if (msg.includes("user rejected")) {
        toast("Signature rejected. You need to sign to create your identity.", "error");
      } else if (msg.includes("MetaMask")) {
        toast("MetaMask not found. Please install MetaMask.", "error");
      } else {
        toast(`Connection failed: ${msg}`, "error");
      }
    }
    setLoading(false);
    setLoadingText("");
  }

  // Step 2: Self-issue credential via DemoIssuer
  async function handleIssueCredential() {
    if (!identity) return;
    setLoading(true);
    setLoadingText("Issuing KYC credential on-chain...");
    try {
      const { signer, address } = await connectWallet();

      // Check if already claimed
      const demoIssuer = new Contract(ADDRESSES.demoIssuer, DEMO_ISSUER_ABI, signer);
      const alreadyClaimed = await demoIssuer.hasClaimed(address);
      if (alreadyClaimed) {
        completeStep(1);
        toast("Credential already issued! Moving to proof generation.", "info");
        setLoading(false);
        setLoadingText("");
        return;
      }

      const commitment = getCommitment(identity);
      const tx = await demoIssuer.selfIssue(commitment);
      setLoadingText("Waiting for transaction confirmation...");
      await tx.wait();
      completeStep(1);
      toast("KYC credential issued on-chain!", "success");
    } catch (err: unknown) {
      const msg = (err as Error).message;
      if (msg.includes("AlreadyClaimed")) {
        completeStep(1);
        toast("Credential already issued!", "info");
      } else if (msg.includes("user rejected")) {
        toast("Transaction rejected.", "error");
      } else if (msg.includes("insufficient")) {
        toast("Insufficient HSK for gas. Get testnet HSK from the faucet.", "error");
      } else {
        toast(`Error: ${msg.slice(0, 100)}`, "error");
      }
    }
    setLoading(false);
    setLoadingText("");
  }

  // Step 3: Generate ZK proof
  async function handleGenerateProof() {
    if (!identity) return;
    setLoading(true);
    abortRef.current = false;
    setLoadingText("Fetching group members from chain...");
    try {
      const provider = new JsonRpcProvider(RPC_URL);
      const groupId = GROUPS.KYC_VERIFIED;

      // Get group members from events (revocation-aware)
      const passportEvents = new Contract(
        ADDRESSES.hskPassport,
        [
          "event CredentialIssued(uint256 indexed groupId, uint256 indexed identityCommitment)",
          "event CredentialRevoked(uint256 indexed groupId, uint256 indexed identityCommitment)",
        ],
        provider
      );

      const issuedFilter = passportEvents.filters.CredentialIssued(groupId);
      const revokedFilter = passportEvents.filters.CredentialRevoked(groupId);
      const [issuedEvents, revokedEvents] = await Promise.all([
        passportEvents.queryFilter(issuedFilter, 0, "latest"),
        passportEvents.queryFilter(revokedFilter, 0, "latest"),
      ]);

      const revokedSet = new Set(
        revokedEvents.map((e) => {
          const parsed = passportEvents.interface.parseLog({ topics: [...e.topics], data: e.data });
          return parsed?.args?.identityCommitment?.toString();
        }).filter(Boolean)
      );

      const members = issuedEvents
        .map((e) => {
          const parsed = passportEvents.interface.parseLog({ topics: [...e.topics], data: e.data });
          return parsed?.args?.identityCommitment as bigint;
        })
        .filter((m): m is bigint => m !== undefined && !revokedSet.has(m.toString()));

      if (members.length === 0) {
        toast("No members in group. Issue a credential first.", "error");
        setLoading(false);
        setLoadingText("");
        return;
      }

      setGroupSize(members.length);
      const myCommitment = getCommitment(identity);
      if (!members.some((m) => m === myCommitment)) {
        toast("Your identity is not in the KYC group. Issue a credential first.", "error");
        setLoading(false);
        setLoadingText("");
        return;
      }

      // Bind proof to caller's address to prevent front-running
      const { address: callerAddress } = await connectWallet();
      const callerAsMessage = BigInt(callerAddress);

      setLoadingText("Generating Groth16 zero-knowledge proof (10-30 seconds)...");

      // Timeout wrapper
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Proof generation timed out after 60 seconds")), 60000)
      );

      const proofPromise = generateCredentialProof(identity, members, callerAsMessage, groupId);
      const zkProof = await Promise.race([proofPromise, timeoutPromise]);

      if (abortRef.current) return;

      setProof(zkProof);
      completeStep(2);
      toast("Zero-knowledge proof generated!", "success");
    } catch (err: unknown) {
      const msg = (err as Error).message;
      if (msg.includes("timed out")) {
        toast("Proof generation timed out. Try again.", "error");
      } else {
        toast(`Proof error: ${msg.slice(0, 100)}`, "error");
      }
    }
    setLoading(false);
    setLoadingText("");
  }

  // Step 4: KYC-gated mint
  async function handleMint() {
    if (!proof) return;
    setLoading(true);
    setLoadingText("Submitting proof to GatedRWA contract...");
    try {
      const { signer, address } = await connectWallet();
      const rwa = new Contract(ADDRESSES.gatedRWA, GATED_RWA_ABI, signer);
      const formattedProof = formatProofForContract(proof);
      const tx = await rwa.kycMint(formattedProof);
      setTxHash(tx.hash);
      setLoadingText("Waiting for confirmation...");
      await tx.wait();

      const bal = await rwa.balanceOf(address);
      setBalance((Number(bal) / 1e18).toString());
      completeStep(3);
      toast("100 hSILVER minted! KYC verified with zero personal data on-chain.", "success");
    } catch (err: unknown) {
      const msg = (err as Error).message;
      if (msg.includes("NullifierAlreadyUsed")) {
        toast("Already minted with this proof. Each proof scope can only be used once.", "error");
      } else if (msg.includes("user rejected")) {
        toast("Transaction rejected.", "error");
      } else {
        toast(`Mint error: ${msg.slice(0, 100)}`, "error");
      }
    }
    setLoading(false);
    setLoadingText("");
  }

  const stepHandlers = [handleConnect, handleIssueCredential, handleGenerateProof, handleMint];

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-2">Interactive Demo</h1>
      <p className="text-gray-400 mb-8">
        Experience the full HSK Passport flow: create identity, get a KYC credential, generate a ZK proof, and mint a token — all in under a minute.
      </p>

      <StepProgress steps={STEPS} currentStep={currentStep} completedSteps={completedSteps} />

      <div className="space-y-4">
        {STEPS.map((step, index) => {
          const isActive = index === currentStep;
          const isCompleted = completedSteps.has(index);
          const isLocked = index > currentStep && !isCompleted;

          return (
            <div
              key={index}
              className={`border rounded-xl p-6 transition-all duration-300 ${
                isActive
                  ? "bg-gray-900 border-purple-600 shadow-lg shadow-purple-900/20"
                  : isCompleted
                  ? "bg-gray-900/50 border-green-800/50"
                  : "bg-gray-900/30 border-gray-800/50 opacity-60"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      isCompleted
                        ? "bg-green-600 text-white"
                        : isActive
                        ? "bg-purple-600 text-white"
                        : "bg-gray-800 text-gray-500"
                    }`}
                  >
                    {isCompleted ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      index + 1
                    )}
                  </div>
                  <h3 className="font-semibold">{step.label}</h3>
                </div>
                {isCompleted && <span className="text-xs text-green-400 font-medium">Complete</span>}
              </div>

              <p className="text-sm text-gray-400 mb-4">{getStepDescription(index)}</p>

              {/* Step-specific content */}
              {index === 0 && isCompleted && identity && (
                <div className="text-xs font-mono text-purple-300 bg-gray-800/50 rounded p-2 break-all">
                  Commitment: {getCommitment(identity).toString().slice(0, 30)}...
                </div>
              )}

              {index === 2 && proof && (
                <ProofCard
                  merkleTreeDepth={proof.merkleTreeDepth}
                  nullifier={proof.nullifier.toString()}
                  merkleTreeRoot={proof.merkleTreeRoot.toString()}
                  groupSize={groupSize}
                  groupName="KYC Verified"
                />
              )}

              {index === 3 && txHash && (
                <div className="mt-2">
                  <p className="text-sm text-green-400 font-semibold mb-1">
                    {balance} hSILVER minted!
                  </p>
                  <a
                    href={`${EXPLORER_URL}/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-400 hover:text-purple-300 text-xs font-mono"
                  >
                    View on Explorer
                  </a>
                </div>
              )}

              {/* Action button */}
              {isActive && !isCompleted && (
                <button
                  onClick={stepHandlers[index]}
                  disabled={loading || isLocked}
                  className="mt-2 px-6 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center gap-2"
                >
                  {loading && (
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  )}
                  {loading ? loadingText || "Processing..." : getButtonLabel(index)}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Explainer */}
      {completedSteps.size === 4 && (
        <div className="mt-8 bg-gradient-to-br from-green-900/30 to-gray-900 border border-green-800/50 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-green-400 mb-3">
            What Just Happened?
          </h2>
          <div className="text-sm text-gray-400 space-y-2">
            <p>
              <strong className="text-gray-200">The contract verified:</strong> &quot;This user belongs to the KYC_VERIFIED group&quot;
            </p>
            <p>
              <strong className="text-gray-200">The contract did NOT learn:</strong> which member you are, your name, your wallet address as an identity, or any personal data.
            </p>
            <p>
              <strong className="text-gray-200">How:</strong> A Groth16 ZK proof verified against the group&apos;s Merkle root on-chain. The proof demonstrates set membership without revealing the member. Powered by Semaphore v4 on HashKey Chain.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function getStepDescription(step: number): string {
  switch (step) {
    case 0:
      return "Connect your MetaMask wallet and sign a message to generate a deterministic Semaphore identity. Your private key never leaves the device.";
    case 1:
      return "The DemoIssuer contract adds your identity commitment to the KYC_VERIFIED group on-chain. In production, this would follow off-chain KYC verification by a trusted issuer.";
    case 2:
      return "Generate a Groth16 zero-knowledge proof in your browser via WASM. This proves you're a member of the KYC group without revealing which member you are.";
    case 3:
      return "Submit your ZK proof to the GatedRWA contract. It verifies on-chain that you hold a valid KYC credential, then mints 100 hSILVER tokens.";
    default:
      return "";
  }
}

function getButtonLabel(step: number): string {
  switch (step) {
    case 0: return "Connect Wallet & Create Identity";
    case 1: return "Issue Demo KYC Credential";
    case 2: return "Generate Zero-Knowledge Proof";
    case 3: return "Mint hSILVER with KYC Proof";
    default: return "Continue";
  }
}
