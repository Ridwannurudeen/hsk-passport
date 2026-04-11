"use client";

import { useState, useEffect } from "react";
import { Contract, JsonRpcProvider } from "ethers";
import { connectWallet } from "@/lib/wallet";
import {
  loadIdentity,
  generateCredentialProof,
  formatProofForContract,
  getCommitment,
  Identity,
  Group,
  type SemaphoreProof,
} from "@/lib/semaphore";
import {
  ADDRESSES,
  GATED_RWA_ABI,
  SEMAPHORE_ABI,
  GROUPS,
  RPC_URL,
  EXPLORER_URL,
} from "@/lib/contracts";

export default function DemoPage() {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [proof, setProof] = useState<SemaphoreProof | null>(null);
  const [generating, setGenerating] = useState(false);
  const [minting, setMinting] = useState(false);
  const [status, setStatus] = useState("");
  const [txHash, setTxHash] = useState("");
  const [balance, setBalance] = useState("0");

  useEffect(() => {
    const stored = loadIdentity();
    if (stored) setIdentity(stored);
  }, []);

  useEffect(() => {
    if (ADDRESSES.gatedRWA) checkBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txHash]);

  async function checkBalance() {
    if (!ADDRESSES.gatedRWA) return;
    try {
      const { signer } = await connectWallet();
      const addr = await signer.getAddress();
      const rwa = new Contract(ADDRESSES.gatedRWA, GATED_RWA_ABI, signer);
      const bal = await rwa.balanceOf(addr);
      setBalance((Number(bal) / 1e18).toString());
    } catch {
      // not connected yet
    }
  }

  async function handleGenerateProof() {
    if (!identity) {
      setStatus("No identity found. Go to My Credentials first.");
      return;
    }

    setGenerating(true);
    setStatus("Fetching group members from chain...");

    try {
      const provider = new JsonRpcProvider(RPC_URL);
      const semaphore = new Contract(
        ADDRESSES.semaphore,
        SEMAPHORE_ABI,
        provider
      );

      const groupId = GROUPS.KYC_VERIFIED;
      const size = await semaphore.getMerkleTreeSize(groupId);

      if (size === 0n) {
        setStatus(
          "KYC_VERIFIED group has no members. Ask an issuer to add your credential first."
        );
        setGenerating(false);
        return;
      }

      // For the demo, we need the group members to reconstruct the Merkle tree.
      // In production, this would come from an indexer or subgraph.
      // For now, we'll use events to get the members.
      setStatus("Reconstructing group Merkle tree...");

      // Get all CredentialIssued events for this group from HSKPassport
      const passport = new Contract(
        ADDRESSES.hskPassport,
        [
          "event CredentialIssued(uint256 indexed groupId, uint256 indexed identityCommitment)",
        ],
        provider
      );
      const filter = passport.filters.CredentialIssued(groupId);
      const events = await passport.queryFilter(filter, 0, "latest");
      const members = events.map((e) => {
        const parsed = passport.interface.parseLog({
          topics: [...e.topics],
          data: e.data,
        });
        return parsed?.args?.identityCommitment as bigint;
      }).filter((m): m is bigint => m !== undefined);

      if (members.length === 0) {
        setStatus("Could not fetch group members. Try again.");
        setGenerating(false);
        return;
      }

      const myCommitment = getCommitment(identity);
      if (!members.some((m) => m === myCommitment)) {
        setStatus(
          "Your identity is not in the KYC_VERIFIED group. Ask an issuer first."
        );
        setGenerating(false);
        return;
      }

      setStatus("Generating zero-knowledge proof (this may take a moment)...");

      const scope = groupId;
      const message = 1; // "I am KYC verified"

      const zkProof = await generateCredentialProof(
        identity,
        members,
        message,
        scope
      );

      setProof(zkProof);
      setStatus("Proof generated! You can now mint the RWA token.");
    } catch (err: unknown) {
      setStatus(`Error: ${(err as Error).message}`);
    }

    setGenerating(false);
  }

  async function handleKycMint() {
    if (!proof) return;
    setMinting(true);
    setStatus("Submitting proof to GatedRWA contract...");
    setTxHash("");

    try {
      const { signer } = await connectWallet();
      const rwa = new Contract(ADDRESSES.gatedRWA, GATED_RWA_ABI, signer);

      const formattedProof = formatProofForContract(proof);
      const tx = await rwa.kycMint(formattedProof);
      setTxHash(tx.hash);
      setStatus("Waiting for confirmation...");
      await tx.wait();
      setStatus("100 hSILVER tokens minted! KYC verified on-chain with zero personal data.");
      await checkBalance();
    } catch (err: unknown) {
      const msg = (err as Error).message;
      if (msg.includes("NullifierAlreadyUsed")) {
        setStatus("You already minted with this proof. Each proof can only be used once.");
      } else {
        setStatus(`Error: ${msg}`);
      }
    }

    setMinting(false);
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-2">Demo: KYC-Gated RWA Token</h1>
      <p className="text-gray-400 mb-8">
        Mint a HashKey Silver Token (hSILVER) by proving your KYC status with a
        zero-knowledge proof. No personal data touches the blockchain.
      </p>

      <div className="space-y-6">
        {/* Step 1: Identity */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                identity
                  ? "bg-green-600 text-white"
                  : "bg-gray-700 text-gray-400"
              }`}
            >
              1
            </div>
            <h2 className="text-lg font-semibold">Identity</h2>
          </div>
          {identity ? (
            <p className="text-sm text-green-400">
              Identity loaded. Commitment:{" "}
              <code className="text-xs">
                {getCommitment(identity).toString().slice(0, 20)}...
              </code>
            </p>
          ) : (
            <p className="text-sm text-gray-400">
              No identity found.{" "}
              <a href="/user" className="text-purple-400 hover:text-purple-300">
                Create one first
              </a>
              .
            </p>
          )}
        </div>

        {/* Step 2: Generate Proof */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                proof
                  ? "bg-green-600 text-white"
                  : "bg-gray-700 text-gray-400"
              }`}
            >
              2
            </div>
            <h2 className="text-lg font-semibold">Generate ZK Proof</h2>
          </div>
          <p className="text-sm text-gray-400 mb-4">
            This generates a Groth16 zero-knowledge proof in your browser
            proving you belong to the KYC_VERIFIED group, without revealing
            which member you are.
          </p>
          <button
            onClick={handleGenerateProof}
            disabled={!identity || generating}
            className="px-6 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            {generating ? "Generating..." : "Generate Proof"}
          </button>
          {proof && (
            <div className="mt-4 p-3 bg-gray-800 rounded-lg">
              <p className="text-xs text-gray-500 mb-1">Proof Preview</p>
              <pre className="text-xs font-mono text-gray-400 overflow-x-auto">
                {JSON.stringify(
                  {
                    merkleTreeDepth: proof.merkleTreeDepth,
                    nullifier: proof.nullifier.toString().slice(0, 20) + "...",
                    merkleTreeRoot:
                      proof.merkleTreeRoot.toString().slice(0, 20) + "...",
                  },
                  null,
                  2
                )}
              </pre>
            </div>
          )}
        </div>

        {/* Step 3: Mint */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                txHash
                  ? "bg-green-600 text-white"
                  : "bg-gray-700 text-gray-400"
              }`}
            >
              3
            </div>
            <h2 className="text-lg font-semibold">Mint hSILVER Token</h2>
          </div>
          <p className="text-sm text-gray-400 mb-4">
            Submit your ZK proof to the GatedRWA contract. It verifies
            on-chain that you hold a valid KYC credential, then mints 100
            hSILVER tokens to your wallet.
          </p>
          <div className="flex items-center gap-4">
            <button
              onClick={handleKycMint}
              disabled={!proof || minting}
              className="px-6 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
            >
              {minting ? "Minting..." : "Mint with KYC Proof"}
            </button>
            <span className="text-sm text-gray-500">
              Balance: <span className="text-white font-mono">{balance}</span>{" "}
              hSILVER
            </span>
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
                View on Explorer: {txHash.slice(0, 10)}...{txHash.slice(-8)}
              </a>
            )}
          </div>
        )}

        {/* Explanation */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-3">
            What Just Happened?
          </h2>
          <div className="text-sm text-gray-400 space-y-2">
            <p>
              <strong className="text-gray-300">The contract verified:</strong>{" "}
              &quot;This user belongs to the KYC_VERIFIED group&quot;
            </p>
            <p>
              <strong className="text-gray-300">
                The contract did NOT learn:
              </strong>{" "}
              which specific member you are, your name, your address, your KYC
              documents, or any personal information.
            </p>
            <p>
              <strong className="text-gray-300">How:</strong> A Groth16
              zero-knowledge proof verified against the group&apos;s Merkle root
              on-chain. The proof proves set membership without revealing the
              member.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
