import type { Signer } from "ethers";
import { HSKPassport, type HSKPassportProof, type NetworkName } from "./index";
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
export declare function HSKPassportGate({ network, groupId, scope, signer, onVerified, onError, identitySecret, children, }: HSKPassportGateProps): import("react/jsx-runtime").JSX.Element;
/**
 * Hook for HSK Passport proof generation
 *
 * @example
 * ```tsx
 * const { generateProof, loading, error } = useHSKPassport("hashkey-testnet");
 * ```
 */
export declare function useHSKPassport(network?: NetworkName): {
    passport: HSKPassport;
    generateProof: (identitySecret: string, groupId: number, scope: string | number, callerAddress: string) => Promise<HSKPassportProof | null>;
    loading: boolean;
    error: Error | null;
};
export {};
