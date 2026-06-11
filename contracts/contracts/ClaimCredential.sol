// SPDX-License-Identifier: MIT
pragma solidity >=0.8.23 <0.9.0;

interface IHSKPassportIssue {
    function issueCredential(uint256 groupId, uint256 identityCommitment) external;
}

/// @title ClaimCredential — blind-issuance claim delegate (P1)
/// @notice Lets a user redeem an RSA-FDH blind signature from the issuer to add
///         their OWN identity commitment to a credential group. Because the
///         issuer signed a *blinded* commitment and the user submits the claim
///         themselves, the issuer never learns the commitment ↔ applicant link
///         (see docs/blind-issuance-design.md, CRITICAL #2).
///
///         Deployed once per group and approved as a delegate via
///         HSKPassport.approveDelegate(groupId, address(this)) — no change to
///         HSKPassport is required (issueCredential is onlyGroupIssuerOrDelegate).
///
/// @dev AUDIT-LANE — the RSA-FDH verification is hand-rolled: a full-domain hash
///      (MGF1-SHA256 expanded to the modulus width, top byte zeroed so the
///      representative is < N) compared against sig^e mod N via the modexp
///      precompile. This MUST receive a cryptographic review before production.
///      It is round-trip tested against a real RSA key, but round-trip
///      consistency is not a proof of security. Gas for RSA-2048 verify ≈ 144k
///      (measured in the P0 spike).
contract ClaimCredential {
    IHSKPassportIssue public immutable passport;
    uint256 public immutable groupId;
    bytes public modulus; // RSA modulus N, big-endian
    bytes public exponent; // RSA public exponent e, big-endian

    uint256 private constant NLEN = 256; // 2048-bit modulus

    mapping(uint256 => bool) public usedNullifier;

    event Claimed(uint256 indexed commitment, uint256 nullifier);

    error BadSignature();
    error NullifierUsed();
    error BadModulusLength();

    constructor(
        address _passport,
        uint256 _groupId,
        bytes memory _modulus,
        bytes memory _exponent
    ) {
        if (_modulus.length != NLEN) revert BadModulusLength();
        passport = IHSKPassportIssue(_passport);
        groupId = _groupId;
        modulus = _modulus;
        exponent = _exponent;
    }

    /// @notice Redeem a blind-signed commitment: verify the issuer signature, burn
    ///         a one-time nullifier, then add the commitment to the group.
    function claim(uint256 commitment, bytes calldata sig) external {
        if (!verify(commitment, sig)) revert BadSignature();
        uint256 nullifier = uint256(keccak256(sig));
        if (usedNullifier[nullifier]) revert NullifierUsed();
        usedNullifier[nullifier] = true;
        passport.issueCredential(groupId, commitment);
        emit Claimed(commitment, nullifier);
    }

    /// @notice RSA-FDH verify: sig^e mod N == FDH(commitment).
    function verify(uint256 commitment, bytes calldata sig) public view returns (bool) {
        if (sig.length != NLEN) return false;
        bytes memory got = _modexp(sig, exponent, modulus);
        return keccak256(got) == keccak256(messageRep(commitment));
    }

    /// @notice Full-domain hash of the commitment into [0, N): MGF1-SHA256 expanded
    ///         to NLEN bytes, with the top byte zeroed so the representative is < N
    ///         (a 2048-bit modulus always has its high bit set).
    function messageRep(uint256 commitment) public pure returns (bytes memory) {
        bytes32 seed = sha256(abi.encodePacked(commitment));
        bytes memory rep = new bytes(NLEN);
        uint32 counter = 0;
        uint256 off = 0;
        while (off < NLEN) {
            bytes32 blk = sha256(abi.encodePacked(seed, counter));
            for (uint256 i = 0; i < 32 && off < NLEN; i++) {
                rep[off++] = blk[i];
            }
            counter++;
        }
        rep[0] = 0x00;
        return rep;
    }

    /// @dev modexp precompile (0x05): base^exp mod mod, returning mod.length bytes.
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
