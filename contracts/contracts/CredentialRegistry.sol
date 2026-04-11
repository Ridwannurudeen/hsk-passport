// SPDX-License-Identifier: MIT
pragma solidity >=0.8.23 <0.9.0;

/// @title CredentialRegistry — On-chain schema registry for HSK Passport credential types
/// @notice Issuers register credential schemas (W3C VC aligned). Credentials can be individually revoked.
/// @dev This is the protocol layer that gives HSK Passport structured credential types beyond named groups.
contract CredentialRegistry {
    struct CredentialType {
        bytes32 schemaHash;
        string schemaURI;
        address issuer;
        bool revocable;
        uint256 createdAt;
        bool active;
    }

    address public owner;
    mapping(address => bool) public approvedIssuers;
    mapping(bytes32 => CredentialType) public schemas;
    bytes32[] public schemaHashes;

    /// @dev schemaHash => identityCommitment => revoked
    mapping(bytes32 => mapping(uint256 => bool)) public revocations;

    event SchemaRegistered(bytes32 indexed schemaHash, string schemaURI, address indexed issuer);
    event SchemaDeactivated(bytes32 indexed schemaHash);
    event CredentialRevoked(bytes32 indexed schemaHash, uint256 indexed identityCommitment);
    event IssuerApproved(address indexed issuer);
    event IssuerRemoved(address indexed issuer);

    error NotOwner();
    error NotApprovedIssuer();
    error NotSchemaIssuer();
    error SchemaAlreadyExists();
    error SchemaNotFound();
    error SchemaNotRevocable();
    error AlreadyRevoked();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyApprovedIssuer() {
        if (!approvedIssuers[msg.sender]) revert NotApprovedIssuer();
        _;
    }

    constructor() {
        owner = msg.sender;
        approvedIssuers[msg.sender] = true;
    }

    function approveIssuer(address issuer) external onlyOwner {
        approvedIssuers[issuer] = true;
        emit IssuerApproved(issuer);
    }

    function removeIssuer(address issuer) external onlyOwner {
        approvedIssuers[issuer] = false;
        emit IssuerRemoved(issuer);
    }

    /// @notice Register a new credential schema
    /// @param schemaHash Keccak256 of the canonical JSON schema
    /// @param schemaURI URI to the JSON-LD schema (IPFS or HTTPS)
    /// @param revocable Whether credentials of this type can be revoked
    function registerSchema(
        bytes32 schemaHash,
        string calldata schemaURI,
        bool revocable
    ) external onlyApprovedIssuer {
        if (schemas[schemaHash].createdAt != 0) revert SchemaAlreadyExists();

        schemas[schemaHash] = CredentialType({
            schemaHash: schemaHash,
            schemaURI: schemaURI,
            issuer: msg.sender,
            revocable: revocable,
            createdAt: block.timestamp,
            active: true
        });

        schemaHashes.push(schemaHash);
        emit SchemaRegistered(schemaHash, schemaURI, msg.sender);
    }

    /// @notice Revoke a specific credential
    /// @param schemaHash The credential type
    /// @param identityCommitment The holder's identity commitment to revoke
    function revokeCredential(
        bytes32 schemaHash,
        uint256 identityCommitment
    ) external {
        CredentialType storage schema = schemas[schemaHash];
        if (schema.createdAt == 0) revert SchemaNotFound();
        if (schema.issuer != msg.sender) revert NotSchemaIssuer();
        if (!schema.revocable) revert SchemaNotRevocable();
        if (revocations[schemaHash][identityCommitment]) revert AlreadyRevoked();

        revocations[schemaHash][identityCommitment] = true;
        emit CredentialRevoked(schemaHash, identityCommitment);
    }

    /// @notice Check if a credential is revoked
    function isRevoked(bytes32 schemaHash, uint256 identityCommitment) external view returns (bool) {
        return revocations[schemaHash][identityCommitment];
    }

    /// @notice Deactivate a schema (no new credentials can reference it)
    function deactivateSchema(bytes32 schemaHash) external {
        CredentialType storage schema = schemas[schemaHash];
        if (schema.createdAt == 0) revert SchemaNotFound();
        if (schema.issuer != msg.sender) revert NotSchemaIssuer();
        schema.active = false;
        emit SchemaDeactivated(schemaHash);
    }

    /// @notice Get all registered schema hashes
    function getSchemaHashes() external view returns (bytes32[] memory) {
        return schemaHashes;
    }

    /// @notice Get schema count
    function getSchemaCount() external view returns (uint256) {
        return schemaHashes.length;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }
}
