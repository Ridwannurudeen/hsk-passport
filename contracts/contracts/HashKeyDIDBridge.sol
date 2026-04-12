// SPDX-License-Identifier: MIT
pragma solidity >=0.8.23 <0.9.0;

/// @dev Minimal interface for HashKey DID (ERC-721-based, per hashkeydid.xyz docs).
///      The real HashKey DID contract also exposes `DIDClaimedAt`, `resolverOf`, etc.
///      We only need ownership verification for the bridge.
interface IHashKeyDID {
    function ownerOf(uint256 tokenId) external view returns (address);
    function balanceOf(address owner) external view returns (uint256);
    /// @dev Returns the DID name (e.g., "alice.key") for a token id. Optional.
    function didName(uint256 tokenId) external view returns (string memory);
}

/// @dev HSK Passport issuance interface (subset of HSKPassport.sol)
interface IHSKPassportIssuer {
    function issueCredential(uint256 groupId, uint256 identityCommitment) external;
    function hasCredential(uint256 groupId, uint256 identityCommitment) external view returns (bool);
}

/// @dev HashKey's DeedGrain (ERC-1155) credential system. Optional import used for SBT credentials.
interface IHashKeyDeedGrain {
    function balanceOf(address account, uint256 id) external view returns (uint256);
}

/// @title HashKeyDIDBridge — Bridge HashKey DID identities into HSK Passport credentials
/// @notice Users with a `.key` DID can mint HSK Passport credentials tied to their DID ownership.
///         Also supports DeedGrain ERC-1155 credential imports from HashKey's credential system.
/// @dev Composable with HashKey DID (https://hashkey.id). Once HashKey DID is deployed on
///      HashKey Chain, set `hashKeyDID` to the deployed contract address.
///      For testnet demos, deploy MockHashKeyDID and set its address here.
contract HashKeyDIDBridge {
    IHashKeyDID public hashKeyDID;
    IHashKeyDeedGrain public deedGrain;
    IHSKPassportIssuer public immutable passport;

    address public owner;

    /// @dev Which HSK Passport group DID holders get issued into (e.g., HK_RESIDENT)
    uint256 public didCredentialGroup;

    /// @dev DeedGrain token id => HSK Passport group that credential maps to
    mapping(uint256 => uint256) public deedGrainToGroup;

    /// @dev didTokenId => identityCommitment (allows revocation to mirror DID transfers)
    mapping(uint256 => uint256) public didToCommitment;

    /// @dev commitment => didTokenId used (prevents a single DID claiming multiple commitments)
    mapping(uint256 => uint256) public commitmentToDid;

    event HashKeyDIDUpdated(address indexed newAddress);
    event DeedGrainUpdated(address indexed newAddress);
    event GroupConfigured(uint256 indexed groupId);
    event DeedGrainMappingSet(uint256 indexed tokenId, uint256 indexed groupId);
    event DIDCredentialIssued(uint256 indexed didTokenId, uint256 indexed identityCommitment, address indexed minter);
    event DeedGrainCredentialIssued(uint256 indexed deedGrainId, uint256 indexed groupId, uint256 indexed identityCommitment);

    error NotOwner();
    error NotDIDOwner();
    error DIDAlreadyBridged();
    error CommitmentAlreadyBridged();
    error NoDeedGrainBalance();
    error NotConfigured();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @param _passport HSKPassport contract (the caller must be approved as delegate for `_didGroup`)
    /// @param _didGroup The HSK Passport group to mint DID-based credentials into
    constructor(address _passport, uint256 _didGroup) {
        owner = msg.sender;
        passport = IHSKPassportIssuer(_passport);
        didCredentialGroup = _didGroup;
    }

    /// @notice Set the HashKey DID contract address (once HashKey DID deploys on HashKey Chain)
    function setHashKeyDID(address addr) external onlyOwner {
        hashKeyDID = IHashKeyDID(addr);
        emit HashKeyDIDUpdated(addr);
    }

    /// @notice Set the DeedGrain ERC-1155 contract address
    function setDeedGrain(address addr) external onlyOwner {
        deedGrain = IHashKeyDeedGrain(addr);
        emit DeedGrainUpdated(addr);
    }

    /// @notice Configure which HSK Passport group DeedGrain token IDs map to
    function setDeedGrainMapping(uint256 deedGrainId, uint256 groupId) external onlyOwner {
        deedGrainToGroup[deedGrainId] = groupId;
        emit DeedGrainMappingSet(deedGrainId, groupId);
    }

    function setDIDCredentialGroup(uint256 groupId) external onlyOwner {
        didCredentialGroup = groupId;
        emit GroupConfigured(groupId);
    }

    // ============================================================
    // DID → HSK Passport bridge
    // ============================================================

    /// @notice User with a HashKey DID mints a corresponding HSK Passport credential.
    ///         Proves DID ownership on-chain without revealing which DID later via ZK proofs.
    /// @param didTokenId The user's HashKey DID token ID
    /// @param identityCommitment User's Semaphore identity commitment
    function bridgeDID(uint256 didTokenId, uint256 identityCommitment) external {
        if (address(hashKeyDID) == address(0)) revert NotConfigured();
        if (hashKeyDID.ownerOf(didTokenId) != msg.sender) revert NotDIDOwner();
        if (didToCommitment[didTokenId] != 0) revert DIDAlreadyBridged();
        if (commitmentToDid[identityCommitment] != 0) revert CommitmentAlreadyBridged();

        didToCommitment[didTokenId] = identityCommitment;
        commitmentToDid[identityCommitment] = didTokenId;

        passport.issueCredential(didCredentialGroup, identityCommitment);
        emit DIDCredentialIssued(didTokenId, identityCommitment, msg.sender);
    }

    /// @notice User with a HashKey DeedGrain credential mints HSK Passport credential.
    ///         E.g., KYC level 2 DeedGrain → KYC_VERIFIED group.
    /// @param deedGrainId DeedGrain token ID the user holds
    /// @param identityCommitment User's Semaphore identity commitment
    function bridgeDeedGrain(uint256 deedGrainId, uint256 identityCommitment) external {
        if (address(deedGrain) == address(0)) revert NotConfigured();
        uint256 groupId = deedGrainToGroup[deedGrainId];
        if (groupId == 0) revert NotConfigured();
        if (deedGrain.balanceOf(msg.sender, deedGrainId) == 0) revert NoDeedGrainBalance();
        if (passport.hasCredential(groupId, identityCommitment)) revert CommitmentAlreadyBridged();

        passport.issueCredential(groupId, identityCommitment);
        emit DeedGrainCredentialIssued(deedGrainId, groupId, identityCommitment);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }
}

/// @title MockHashKeyDID — Mock implementation of HashKey DID for testnet demos
/// @dev Mimics HashKey DID's ERC-721 interface. Real HashKey DID is deployed on Ethereum/PlatON/Aptos
///      per docs.hashkey.id. Not yet deployed on HashKey Chain, so we mock it for demo purposes.
contract MockHashKeyDID is IHashKeyDID {
    address public owner;
    uint256 public totalSupply;
    mapping(uint256 => address) private _ownerOf;
    mapping(address => uint256) private _balanceOf;
    mapping(uint256 => string) public didName;

    event DIDMinted(address indexed to, uint256 indexed tokenId, string name);

    error NotOwner();
    error AlreadyMinted();

    constructor() {
        owner = msg.sender;
    }

    function mint(address to, string calldata name) external returns (uint256 tokenId) {
        tokenId = ++totalSupply;
        if (_ownerOf[tokenId] != address(0)) revert AlreadyMinted();
        _ownerOf[tokenId] = to;
        _balanceOf[to]++;
        didName[tokenId] = name;
        emit DIDMinted(to, tokenId, name);
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        return _ownerOf[tokenId];
    }

    function balanceOf(address addr) external view returns (uint256) {
        return _balanceOf[addr];
    }
}
