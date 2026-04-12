import { useState, useCallback } from "react";
import type { Signer } from "ethers";
import { HSKPassport, type HSKPassportProof, type NetworkName, Identity } from "./index";

interface HSKPassportGateProps {
  /** Network to connect to */
  network?: NetworkName;
  /** Credential group ID to verify */
  groupId: number;
  /** Action scope for sybil resistance */
  scope: string | number;
  /** Ethers signer for transaction submission */
  signer?: Signer;
  /** Called when proof is successfully generated and verified */
  onVerified: (proof: HSKPassportProof) => void;
  /** Called on error */
  onError?: (error: Error) => void;
  /** Identity secret (e.g., wallet signature) */
  identitySecret: string;
  /** Custom button content */
  children: React.ReactNode;
}

/**
 * React component that handles the ZK proof flow.
 *
 * @example
 * ```tsx
 * <HSKPassportGate
 *   groupId={3}
 *   scope="mint_token"
 *   identitySecret={walletSignature}
 *   onVerified={(proof) => mintToken(proof)}
 *   onError={(err) => console.error(err)}
 * >
 *   <span>Verify KYC & Mint</span>
 * </HSKPassportGate>
 * ```
 */
export function HSKPassportGate({
  network = "hashkey-testnet",
  groupId,
  scope,
  signer,
  onVerified,
  onError,
  identitySecret,
  children,
}: HSKPassportGateProps) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  const handleClick = useCallback(async () => {
    setLoading(true);
    setStatus("Generating ZK proof...");

    try {
      const passport = HSKPassport.connect(network, signer);
      const identity = passport.createIdentity(identitySecret);

      // Bind proof to caller to prevent front-running
      if (!signer) {
        throw new Error("HSKPassportGate requires a signer to bind proofs to the caller address");
      }
      const callerAddress = await signer.getAddress();
      const proof = await passport.generateProof(identity, groupId, scope, BigInt(callerAddress));
      setStatus("Proof generated! Verifying...");

      const valid = await passport.verifyProof(groupId, proof);
      if (!valid) {
        throw new Error("Proof verification failed on-chain");
      }

      setStatus("");
      onVerified(proof);
    } catch (err) {
      setStatus("");
      onError?.(err as Error);
    } finally {
      setLoading(false);
    }
  }, [network, groupId, scope, signer, identitySecret, onVerified, onError]);

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      style={{ opacity: loading ? 0.6 : 1, cursor: loading ? "wait" : "pointer" }}
    >
      {loading ? status || "Verifying..." : children}
    </button>
  );
}

/**
 * Hook for HSK Passport proof generation
 *
 * @example
 * ```tsx
 * const { generateProof, loading, error } = useHSKPassport("hashkey-testnet");
 * ```
 */
export function useHSKPassport(network: NetworkName = "hashkey-testnet") {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const passport = HSKPassport.connect(network);

  const generateProofForGroup = useCallback(
    async (
      identitySecret: string,
      groupId: number,
      scope: string | number,
      callerAddress: string
    ) => {
      setLoading(true);
      setError(null);
      try {
        const identity = passport.createIdentity(identitySecret);
        const proof = await passport.generateProof(
          identity,
          groupId,
          scope,
          BigInt(callerAddress)
        );
        return proof;
      } catch (err) {
        setError(err as Error);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [passport]
  );

  return { passport, generateProof: generateProofForGroup, loading, error };
}
