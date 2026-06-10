// SPDX-License-Identifier: MIT
pragma solidity >=0.8.23 <0.9.0;

/// @title RsaBlindVerifySpike — P0 spike for blind-signature issuance
/// @notice Proves an RSA signature over a credential commitment can be verified
///         on-chain via the modexp precompile (0x05), and lets us measure the gas.
///         This is the gate decision in docs/blind-issuance-design.md (RSA vs ZK).
///
/// @dev SPIKE ONLY — NOT PRODUCTION. The message representative is a bare
///      keccak256(commitment) (256-bit), i.e. textbook RSA with no full-domain
///      hash / PSS padding. That is insufficient for a secure signature scheme;
///      it exists only to validate the on-chain verification mechanism + gas.
///      A real ClaimCredential would use FDH/PSS and wire claim() into
///      HSKPassport.issueCredential as an approved delegate.
contract RsaBlindVerifySpike {
    bytes public modulus; // N, big-endian
    bytes public exponent; // e, big-endian (e.g. 0x010001)

    mapping(uint256 => bool) public usedNullifier;

    event Claimed(uint256 indexed commitment, uint256 nullifier);

    constructor(bytes memory _modulus, bytes memory _exponent) {
        modulus = _modulus;
        exponent = _exponent;
    }

    /// @notice Message representative m = keccak256(commitment), reduced mod N.
    /// @dev keccak is 256-bit and N is >= 2048-bit, so m < N already.
    function messageRep(uint256 commitment) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(commitment));
    }

    /// @notice Verify sig^e mod N == m. `sig` is big-endian, same byte-length as N.
    function verify(uint256 commitment, bytes calldata sig) public view returns (bool) {
        bytes memory result = _modexp(sig, exponent, modulus);
        bytes32 m = messageRep(commitment);

        uint256 rlen = result.length;
        if (rlen < 32) return false;

        // result (N-length big-endian) equals the 256-bit m iff the high
        // (rlen-32) bytes are zero and the low 32 bytes equal m.
        for (uint256 i = 0; i + 32 < rlen; i++) {
            if (result[i] != 0) return false;
        }
        bytes32 low;
        assembly {
            low := mload(add(add(result, 0x20), sub(rlen, 32)))
        }
        return low == m;
    }

    /// @notice Spike claim: verify the issuer signature, burn a one-time nullifier.
    ///         A real implementation would then call HSKPassport.issueCredential.
    function claim(uint256 commitment, bytes calldata sig) external {
        require(verify(commitment, sig), "bad sig");
        uint256 nullifier = uint256(keccak256(sig));
        require(!usedNullifier[nullifier], "nullifier used");
        usedNullifier[nullifier] = true;
        emit Claimed(commitment, nullifier);
    }

    /// @dev Call the modexp precompile (0x05): base^exp mod modulus.
    function _modexp(
        bytes memory base,
        bytes memory exp,
        bytes memory mod
    ) internal view returns (bytes memory) {
        bytes memory input = abi.encodePacked(
            uint256(base.length),
            uint256(exp.length),
            uint256(mod.length),
            base,
            exp,
            mod
        );
        uint256 ml = mod.length;
        bytes memory out = new bytes(ml);
        bool ok;
        assembly {
            ok := staticcall(
                gas(),
                0x05,
                add(input, 0x20),
                mload(input),
                add(out, 0x20),
                ml
            )
        }
        require(ok, "modexp failed");
        return out;
    }
}
