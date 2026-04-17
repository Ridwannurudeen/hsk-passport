// SPDX-License-Identifier: MIT
pragma solidity >=0.8.23 <0.9.0;

/// @title IFreshnessVerifier — snarkjs-shaped Groth16 verifier for the credential-freshness circuit.
/// @dev Public signals, in declaration order from the circuit:
///        [0] nullifier           (output)
///        [1] merkleRoot          (input)
///        [2] earliestAcceptable  (input)
///        [3] scope               (input)
interface IFreshnessVerifier {
    function verifyProof(
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[4] calldata publicSignals
    ) external view returns (bool);
}
