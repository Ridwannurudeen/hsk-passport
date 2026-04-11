"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HSKPassportGate = HSKPassportGate;
exports.useHSKPassport = useHSKPassport;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const index_1 = require("./index");
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
function HSKPassportGate({ network = "hashkey-testnet", groupId, scope, signer, onVerified, onError, identitySecret, children, }) {
    const [loading, setLoading] = (0, react_1.useState)(false);
    const [status, setStatus] = (0, react_1.useState)("");
    const handleClick = (0, react_1.useCallback)(async () => {
        setLoading(true);
        setStatus("Generating ZK proof...");
        try {
            const passport = index_1.HSKPassport.connect(network, signer);
            const identity = passport.createIdentity(identitySecret);
            const proof = await passport.generateProof(identity, groupId, scope);
            setStatus("Proof generated! Verifying...");
            const valid = await passport.verifyProof(groupId, proof);
            if (!valid) {
                throw new Error("Proof verification failed on-chain");
            }
            setStatus("");
            onVerified(proof);
        }
        catch (err) {
            setStatus("");
            onError?.(err);
        }
        finally {
            setLoading(false);
        }
    }, [network, groupId, scope, signer, identitySecret, onVerified, onError]);
    return ((0, jsx_runtime_1.jsx)("button", { onClick: handleClick, disabled: loading, style: { opacity: loading ? 0.6 : 1, cursor: loading ? "wait" : "pointer" }, children: loading ? status || "Verifying..." : children }));
}
/**
 * Hook for HSK Passport proof generation
 *
 * @example
 * ```tsx
 * const { generateProof, loading, error } = useHSKPassport("hashkey-testnet");
 * ```
 */
function useHSKPassport(network = "hashkey-testnet") {
    const [loading, setLoading] = (0, react_1.useState)(false);
    const [error, setError] = (0, react_1.useState)(null);
    const passport = index_1.HSKPassport.connect(network);
    const generateProofForGroup = (0, react_1.useCallback)(async (identitySecret, groupId, scope) => {
        setLoading(true);
        setError(null);
        try {
            const identity = passport.createIdentity(identitySecret);
            const proof = await passport.generateProof(identity, groupId, scope);
            return proof;
        }
        catch (err) {
            setError(err);
            return null;
        }
        finally {
            setLoading(false);
        }
    }, [passport]);
    return { passport, generateProof: generateProofForGroup, loading, error };
}
