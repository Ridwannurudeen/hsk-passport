// SPDX-License-Identifier: MIT
pragma solidity >=0.8.23 <0.9.0;

/// @dev Interface for a generic soulbound KYC token (non-transferable NFT).
///      Modeled after common SBT patterns used by regulated exchanges.
interface IKYCSoulbound {
    function hasKYC(address user) external view returns (bool);
    function kycLevelOf(address user) external view returns (uint8); // 1=basic, 2=enhanced, 3=institutional
}

interface IHSKPassportIssuer {
    function issueCredential(uint256 groupId, uint256 identityCommitment) external;
    function hasCredential(uint256 groupId, uint256 identityCommitment) external view returns (bool);
}

/// @title HashKeyKYCImporter — Import HashKey Exchange KYC SBTs into HSK Passport credentials
/// @notice Users verified by HashKey Exchange can auto-import their KYC status into HSK Passport
///         without re-verification. KYC level determines which HSK Passport groups they join.
/// @dev HashKey Exchange issues soulbound KYC tokens to verified users. This contract reads
///      the SBT and mints corresponding HSK Passport credentials:
///       - Level 1 (basic): KYC_VERIFIED group
///       - Level 2 (enhanced): KYC_VERIFIED + jurisdiction group
///       - Level 3 (institutional): KYC_VERIFIED + ACCREDITED_INVESTOR + jurisdiction
///
///      The HashKey Exchange SBT address should be set after deployment (they're off-chain
///      or on a different chain today; this bridge future-proofs the integration).
contract HashKeyKYCImporter {
    IKYCSoulbound public kycSbt;
    IHSKPassportIssuer public immutable passport;

    address public owner;

    uint256 public kycVerifiedGroup;
    uint256 public accreditedInvestorGroup;
    uint256 public hkResidentGroup;

    /// @dev Track whether a user has imported their SBT to prevent double-imports
    mapping(address => mapping(uint256 => bool)) public imported; // user => commitment => imported

    event KYCSbtUpdated(address indexed newAddress);
    event GroupsConfigured(uint256 kyc, uint256 accredited, uint256 hk);
    event KYCImported(address indexed user, uint256 indexed identityCommitment, uint8 level);

    error NotOwner();
    error NoKYCSBT();
    error AlreadyImported();
    error InvalidLevel();
    error NotConfigured();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(
        address _passport,
        uint256 _kycVerifiedGroup,
        uint256 _accreditedInvestorGroup,
        uint256 _hkResidentGroup
    ) {
        owner = msg.sender;
        passport = IHSKPassportIssuer(_passport);
        kycVerifiedGroup = _kycVerifiedGroup;
        accreditedInvestorGroup = _accreditedInvestorGroup;
        hkResidentGroup = _hkResidentGroup;
    }

    function setKYCSbt(address addr) external onlyOwner {
        kycSbt = IKYCSoulbound(addr);
        emit KYCSbtUpdated(addr);
    }

    function setGroups(uint256 kyc, uint256 accredited, uint256 hk) external onlyOwner {
        kycVerifiedGroup = kyc;
        accreditedInvestorGroup = accredited;
        hkResidentGroup = hk;
        emit GroupsConfigured(kyc, accredited, hk);
    }

    /// @notice Import the caller's HashKey Exchange KYC status into HSK Passport.
    /// @param identityCommitment The user's Semaphore identity commitment
    function importKYC(uint256 identityCommitment) external {
        if (address(kycSbt) == address(0)) revert NotConfigured();
        if (!kycSbt.hasKYC(msg.sender)) revert NoKYCSBT();
        if (imported[msg.sender][identityCommitment]) revert AlreadyImported();

        uint8 level = kycSbt.kycLevelOf(msg.sender);
        if (level == 0 || level > 3) revert InvalidLevel();

        imported[msg.sender][identityCommitment] = true;

        // Level 1+: KYC_VERIFIED
        if (!passport.hasCredential(kycVerifiedGroup, identityCommitment)) {
            passport.issueCredential(kycVerifiedGroup, identityCommitment);
        }

        // Level 3: ACCREDITED_INVESTOR
        if (level == 3 && !passport.hasCredential(accreditedInvestorGroup, identityCommitment)) {
            passport.issueCredential(accreditedInvestorGroup, identityCommitment);
        }

        emit KYCImported(msg.sender, identityCommitment, level);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }
}

/// @title MockKYCSoulbound — Mock HashKey Exchange KYC SBT for testnet demos
contract MockKYCSoulbound is IKYCSoulbound {
    address public owner;
    mapping(address => uint8) private _levels;

    event KYCSet(address indexed user, uint8 level);

    error NotOwner();

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function setKYCLevel(address user, uint8 level) external onlyOwner {
        _levels[user] = level;
        emit KYCSet(user, level);
    }

    function hasKYC(address user) external view returns (bool) {
        return _levels[user] > 0;
    }

    function kycLevelOf(address user) external view returns (uint8) {
        return _levels[user];
    }
}
