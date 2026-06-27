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
    /// @dev Fixed at construction. Slashed stake is sent here, never to the
    ///      mutable owner — so a compromised owner that re-grabs slashing
    ///      authority still cannot redirect slashed funds to an address it controls.
    address public immutable treasury;
    /// @dev Authorised to report issuance/revocation for reputation. Set by owner;
    ///      defaults to the deployer. Wire this to the backend/HSKPassport reporter.
    address public reporter;
    uint256 public pendingTreasuryWithdrawals;

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

    /// @dev True once an address has ever staked. Distinguishes a returning issuer
    ///      (top up + reactivate) from a brand-new one, so re-staking after a
    ///      requestUnstake or slash never overwrites residual stake or double-lists.
    mapping(address => bool) public registered;

    event IssuerStaked(address indexed issuer, uint256 amount, Tier tier);
    event IssuerUpgraded(address indexed issuer, Tier from, Tier to);
    event UnstakeRequested(address indexed issuer, uint256 availableAt);
    event Unstaked(address indexed issuer, uint256 amount);
    event IssuerSlashed(address indexed issuer, uint256 amount, string reason);
    event IssuanceReported(address indexed issuer, uint256 indexed groupId);
    event RevocationReported(address indexed issuer, uint256 indexed groupId);
    event MetadataUpdated(address indexed issuer, string uri);
    event StakeRequirementsUpdated(uint256 community, uint256 kycProvider, uint256 institutional);
    event TreasuryWithdrawalQueued(uint256 amount, uint256 pendingTotal);
    event TreasuryWithdrawalPaid(address indexed treasury, uint256 amount);

    error NotOwner();
    error NotSlashingAuthority();
    error NotReporter();
    error InsufficientStake();
    error NothingStaked();
    error CooldownNotElapsed();
    error NotActive();
    error AlreadyActive();
    error TransferFailed();
    error ZeroAddress();
    error NoTreasuryWithdrawal();

    event ReporterUpdated(address indexed reporter);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address _treasury) {
        if (_treasury == address(0)) revert ZeroAddress();
        owner = msg.sender;
        slashingAuthority = msg.sender; // transferred to governance later
        treasury = _treasury;
        reporter = msg.sender; // owner reports until a dedicated reporter is set
    }

    // ============================================================
    // Issuer lifecycle
    // ============================================================

    /// @notice Stake native HSK to become an approved issuer.
    /// @param metadataURI URI to issuer metadata (name, contact, jurisdictions)
    function stakeAndRegister(string calldata metadataURI) external payable {
        Issuer storage i = issuers[msg.sender];
        // Re-committing stake cancels any pending exit (and the freeze it caused).
        unstakeRequestedAt[msg.sender] = 0;

        if (registered[msg.sender]) {
            // Returning issuer (possibly deactivated by a prior unstake request or
            // slash) — top up and reactivate. Never re-push to issuerList.
            i.stake += msg.value;
            i.active = true;
            Tier newTier = _tierForStake(i.stake);
            if (newTier != i.tier) {
                emit IssuerUpgraded(msg.sender, i.tier, newTier);
                i.tier = newTier;
            }
        } else {
            // New issuer
            registered[msg.sender] = true;
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
        // Gate on stake, not active: an issuer deactivated by a slash that left
        // residual stake (when communityMinStake > 0) must still be able to start
        // withdrawing those funds — otherwise the residual is locked forever.
        if (i.stake == 0) revert NothingStaked();
        // Freeze the issuer on exit: requesting a withdrawal deactivates it, so an
        // issuer cannot keep operating while a withdrawal is armed (slash-escape
        // defense). It stays slashable — slash gates on stake, not active.
        i.active = false;
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

        // .call instead of .transfer: a 2300-gas stipend bricks withdrawals for
        // Safe/contract-wallet issuers. State is already zeroed above (CEI), so
        // this is not reentrancy-exploitable.
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert TransferFailed();
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

    /// @notice Report an issuance for reputation. Restricted to the authorised
    ///         reporter so the on-chain reputation counters can't be forged or
    ///         griefed by arbitrary callers.
    /// @dev In production, wire this to HSKPassport.CredentialIssued events via backend.
    function reportIssuance(address issuer, uint256 groupId) external {
        if (msg.sender != reporter) revert NotReporter();
        Issuer storage i = issuers[issuer];
        if (!i.active) return;
        i.totalIssued++;
        emit IssuanceReported(issuer, groupId);
    }

    function reportRevocation(address issuer, uint256 groupId) external {
        if (msg.sender != reporter) revert NotReporter();
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
        // Slashable while funded, even if already deactivated by a prior slash — so
        // residual stake left after a deactivating slash (communityMinStake > 0) can
        // still be punished rather than sitting untouchable.
        if (i.stake == 0) revert NothingStaked();

        uint256 slashed = amount > i.stake ? i.stake : amount;
        i.stake -= slashed;
        i.slashedAmount += slashed;
        // A slash cancels any pending unstake: a slashed issuer must re-request and
        // re-wait, so it cannot withdraw residual the instant a slash is queued.
        unstakeRequestedAt[issuer] = 0;

        // Downgrade tier if stake fell below threshold
        Tier newTier = _tierForStake(i.stake);
        if (newTier != i.tier) {
            emit IssuerUpgraded(issuer, i.tier, newTier);
            i.tier = newTier;
        }

        // At or below the community minimum, deactivate. Uses <= so a fully
        // slashed issuer (stake 0, communityMinStake 0) is deactivated rather
        // than left active at Community tier.
        if (i.stake <= communityMinStake) {
            i.active = false;
        }

        pendingTreasuryWithdrawals += slashed;
        emit TreasuryWithdrawalQueued(slashed, pendingTreasuryWithdrawals);
        emit IssuerSlashed(issuer, slashed, reason);
    }

    /// @notice Pay queued slashed funds to the immutable treasury.
    /// @dev Anyone can trigger payout; funds always go to `treasury`.
    function withdrawTreasury() external {
        uint256 amount = pendingTreasuryWithdrawals;
        if (amount == 0) revert NoTreasuryWithdrawal();
        pendingTreasuryWithdrawals = 0;
        (bool ok, ) = payable(treasury).call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit TreasuryWithdrawalPaid(treasury, amount);
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

    function setReporter(address addr) external onlyOwner {
        if (addr == address(0)) revert ZeroAddress();
        reporter = addr;
        emit ReporterUpdated(addr);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }
}
