// SPDX-License-Identifier: MIT
pragma solidity >=0.8.23 <0.9.0;

/// @title IssuerRegistry — Multi-issuer network with staking and reputation
/// @notice Issuers stake native HSK to become approved. Three tiers based on stake amount.
///         On-chain reputation tracked per issuer (issuance count, revocation rate, tenure).
///         Misissuance can be slashed via governance vote (slashing hook; governance external).
/// @dev Designed to transfer ownership to a Gnosis Safe + TimelockController for production.
contract IssuerRegistry {
    address public owner;
    address public slashingAuthority;

    enum Tier { None, Community, KYCProvider, Institutional }

    struct Issuer {
        uint256 stake;
        Tier tier;
        uint256 stakedAt;
        uint256 totalIssued;
        uint256 totalRevoked;
        uint256 slashedAmount;
        bool active;
        string metadataURI; // IPFS/HTTPS URI to issuer metadata (name, jurisdictions, etc.)
    }

    mapping(address => Issuer) public issuers;
    address[] public issuerList;

    /// @dev Stake requirements per tier (in native HSK)
    uint256 public communityMinStake = 0;               // Tier 1 — no stake (limited groups)
    uint256 public kycProviderMinStake = 1000 ether;    // Tier 2 — 1000 HSK
    uint256 public institutionalMinStake = 10000 ether; // Tier 3 — 10000 HSK

    uint256 public unstakeCooldown = 7 days;
    mapping(address => uint256) public unstakeRequestedAt;

    event IssuerStaked(address indexed issuer, uint256 amount, Tier tier);
    event IssuerUpgraded(address indexed issuer, Tier from, Tier to);
    event UnstakeRequested(address indexed issuer, uint256 availableAt);
    event Unstaked(address indexed issuer, uint256 amount);
    event IssuerSlashed(address indexed issuer, uint256 amount, string reason);
    event IssuanceReported(address indexed issuer, uint256 indexed groupId);
    event RevocationReported(address indexed issuer, uint256 indexed groupId);
    event MetadataUpdated(address indexed issuer, string uri);
    event StakeRequirementsUpdated(uint256 community, uint256 kycProvider, uint256 institutional);

    error NotOwner();
    error NotSlashingAuthority();
    error InsufficientStake();
    error NothingStaked();
    error CooldownNotElapsed();
    error NotActive();
    error AlreadyActive();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor() {
        owner = msg.sender;
        slashingAuthority = msg.sender; // transferred to governance later
    }

    // ============================================================
    // Issuer lifecycle
    // ============================================================

    /// @notice Stake native HSK to become an approved issuer.
    /// @param metadataURI URI to issuer metadata (name, contact, jurisdictions)
    function stakeAndRegister(string calldata metadataURI) external payable {
        Issuer storage i = issuers[msg.sender];

        if (i.active) {
            // Already active — treat as additional stake
            i.stake += msg.value;
            Tier newTier = _tierForStake(i.stake);
            if (newTier != i.tier) {
                emit IssuerUpgraded(msg.sender, i.tier, newTier);
                i.tier = newTier;
            }
        } else {
            // New issuer
            i.stake = msg.value;
            i.tier = _tierForStake(msg.value);
            i.stakedAt = block.timestamp;
            i.active = true;
            i.metadataURI = metadataURI;
            issuerList.push(msg.sender);
        }

        emit IssuerStaked(msg.sender, msg.value, i.tier);
    }

    /// @notice Request unstake (7-day cooldown before withdrawal)
    function requestUnstake() external {
        Issuer storage i = issuers[msg.sender];
        if (!i.active) revert NotActive();
        unstakeRequestedAt[msg.sender] = block.timestamp;
        emit UnstakeRequested(msg.sender, block.timestamp + unstakeCooldown);
    }

    /// @notice Withdraw stake after cooldown
    function withdrawStake() external {
        Issuer storage i = issuers[msg.sender];
        uint256 requestedAt = unstakeRequestedAt[msg.sender];
        if (requestedAt == 0) revert CooldownNotElapsed();
        if (block.timestamp < requestedAt + unstakeCooldown) revert CooldownNotElapsed();
        if (i.stake == 0) revert NothingStaked();

        uint256 amount = i.stake;
        i.stake = 0;
        i.tier = Tier.None;
        i.active = false;
        unstakeRequestedAt[msg.sender] = 0;

        payable(msg.sender).transfer(amount);
        emit Unstaked(msg.sender, amount);
    }

    /// @notice Update issuer metadata URI
    function setMetadataURI(string calldata uri) external {
        if (!issuers[msg.sender].active) revert NotActive();
        issuers[msg.sender].metadataURI = uri;
        emit MetadataUpdated(msg.sender, uri);
    }

    // ============================================================
    // Reputation tracking (called by HSKPassport or by issuers)
    // ============================================================

    /// @notice Issuer self-reports an issuance for reputation. Anyone can call, but
    ///         non-issuers have no effect. Pull-based because contracts can't push.
    /// @dev In production, wire this to HSKPassport.CredentialIssued events via backend.
    function reportIssuance(address issuer, uint256 groupId) external {
        Issuer storage i = issuers[issuer];
        if (!i.active) return;
        i.totalIssued++;
        emit IssuanceReported(issuer, groupId);
    }

    function reportRevocation(address issuer, uint256 groupId) external {
        Issuer storage i = issuers[issuer];
        if (!i.active) return;
        i.totalRevoked++;
        emit RevocationReported(issuer, groupId);
    }

    // ============================================================
    // Slashing (governance-gated)
    // ============================================================

    /// @notice Slash an issuer's stake (only governance)
    function slash(address issuer, uint256 amount, string calldata reason) external {
        if (msg.sender != slashingAuthority) revert NotSlashingAuthority();
        Issuer storage i = issuers[issuer];
        if (!i.active) revert NotActive();

        uint256 slashed = amount > i.stake ? i.stake : amount;
        i.stake -= slashed;
        i.slashedAmount += slashed;

        // Downgrade tier if stake fell below threshold
        Tier newTier = _tierForStake(i.stake);
        if (newTier != i.tier) {
            emit IssuerUpgraded(issuer, i.tier, newTier);
            i.tier = newTier;
        }

        // If below community minimum, deactivate
        if (i.stake < communityMinStake) {
            i.active = false;
        }

        // Slashed funds go to owner (could route to treasury/DAO)
        payable(owner).transfer(slashed);
        emit IssuerSlashed(issuer, slashed, reason);
    }

    // ============================================================
    // View helpers
    // ============================================================

    function getTier(address addr) external view returns (Tier) {
        return issuers[addr].tier;
    }

    function isActiveIssuer(address addr) external view returns (bool) {
        return issuers[addr].active;
    }

    function issuerCount() external view returns (uint256) {
        return issuerList.length;
    }

    function getAllIssuers() external view returns (address[] memory) {
        return issuerList;
    }

    /// @notice Reputation score: issuances minus 10× revocations (simple formula)
    function reputationOf(address addr) external view returns (int256) {
        Issuer storage i = issuers[addr];
        return int256(i.totalIssued) - int256(i.totalRevoked * 10);
    }

    function _tierForStake(uint256 stake) internal view returns (Tier) {
        if (stake >= institutionalMinStake) return Tier.Institutional;
        if (stake >= kycProviderMinStake) return Tier.KYCProvider;
        return Tier.Community;
    }

    // ============================================================
    // Admin
    // ============================================================

    function setStakeRequirements(uint256 community, uint256 kycProvider, uint256 institutional) external onlyOwner {
        communityMinStake = community;
        kycProviderMinStake = kycProvider;
        institutionalMinStake = institutional;
        emit StakeRequirementsUpdated(community, kycProvider, institutional);
    }

    function setSlashingAuthority(address addr) external onlyOwner {
        slashingAuthority = addr;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }
}
