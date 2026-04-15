// SPDX-License-Identifier: MIT
pragma solidity >=0.8.23 <0.9.0;

/// @title IKycSBT — HashKey Chain's officially-recommended KYC Soul Bound Token interface
/// @dev   Source: https://docs.hashkeychain.net/docs/Build-on-HashKey-Chain/Tools/KYC
///        HashKey Chain's native KYC system. Users verify via
///        https://kyc-testnet.hunyuankyc.com/ and receive a soulbound token
///        with 5 tiers: NONE, BASIC, ADVANCED, PREMIUM, ULTIMATE.
interface IKycSBT {
    enum KycLevel { NONE, BASIC, ADVANCED, PREMIUM, ULTIMATE }
    enum KycStatus { NONE, APPROVED, REVOKED }

    function isHuman(address account) external view returns (bool, uint8);

    function getKycInfo(address account)
        external
        view
        returns (
            string memory ensName,
            KycLevel level,
            KycStatus status,
            uint256 createTime
        );
}

/// @title HashKeyKycSBTAdapter — Compatibility shim between HashKey's official IKycSBT and HSK Passport
/// @notice Wraps the HashKey Chain IKycSBT contract so HashKeyKYCImporter (and any other HSK
///         Passport consumer) can read it through the generic IKYCSoulbound interface. This lets
///         existing HSK Passport bridges work with the officially-recommended HashKey KYC system
///         without changing a line in the importer contract.
/// @dev    Mapping from IKycSBT tiers → HSK Passport KYC levels:
///           BASIC     (1) → level 1 (KYC_VERIFIED)
///           ADVANCED  (2) → level 2 (KYC_VERIFIED + jurisdiction)
///           PREMIUM   (3) → level 3 (KYC_VERIFIED + ACCREDITED_INVESTOR + jurisdiction)
///           ULTIMATE  (4) → level 3 (treated as PREMIUM for credentialing)
///         A revoked or NONE-status SBT returns `hasKYC = false` and level 0.
///         Deploy this adapter, point HashKeyKYCImporter.kycSbt at it, and the bridge is live
///         against the real HashKey Chain KYC system.
contract HashKeyKycSBTAdapter {
    IKycSBT public immutable kycSbt;

    constructor(address _kycSbt) {
        kycSbt = IKycSBT(_kycSbt);
    }

    /// @notice Returns true if the user has an APPROVED KYC with at least BASIC level.
    function hasKYC(address user) external view returns (bool) {
        (, IKycSBT.KycLevel level, IKycSBT.KycStatus status, ) = kycSbt.getKycInfo(user);
        return status == IKycSBT.KycStatus.APPROVED && level != IKycSBT.KycLevel.NONE;
    }

    /// @notice Returns the HSK Passport-compatible level (1..3). Returns 0 if not KYC'd.
    function kycLevelOf(address user) external view returns (uint8) {
        (, IKycSBT.KycLevel level, IKycSBT.KycStatus status, ) = kycSbt.getKycInfo(user);
        if (status != IKycSBT.KycStatus.APPROVED) return 0;
        if (level == IKycSBT.KycLevel.BASIC) return 1;
        if (level == IKycSBT.KycLevel.ADVANCED) return 2;
        if (level == IKycSBT.KycLevel.PREMIUM || level == IKycSBT.KycLevel.ULTIMATE) return 3;
        return 0;
    }
}
