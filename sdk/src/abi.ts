export const HSK_PASSPORT_ABI = [
  "function semaphore() view returns (address)",
  "function owner() view returns (address)",
  "function approvedIssuers(address) view returns (bool)",
  "function groupDelegates(uint256 groupId, address delegate) view returns (bool)",
  "function credentialGroups(uint256) view returns (string name, uint256 groupId, address issuer, uint256 memberCount, bool active, bytes32 schemaHash)",
  "function credentials(uint256, uint256) view returns (bool)",
  "function getGroupIds() view returns (uint256[])",
  "function getGroupCount() view returns (uint256)",
  "function hasCredential(uint256 groupId, uint256 identityCommitment) view returns (bool)",
  "function issueCredential(uint256 groupId, uint256 identityCommitment)",
  "function verifyCredential(uint256 groupId, tuple(uint256 merkleTreeDepth, uint256 merkleTreeRoot, uint256 nullifier, uint256 message, uint256 scope, uint256[8] points) proof) view returns (bool)",
  "function validateCredential(uint256 groupId, tuple(uint256 merkleTreeDepth, uint256 merkleTreeRoot, uint256 nullifier, uint256 message, uint256 scope, uint256[8] points) proof)",
  "event CredentialGroupCreated(uint256 indexed groupId, string name, address indexed issuer, bytes32 schemaHash)",
  "event CredentialIssued(uint256 indexed groupId, uint256 indexed identityCommitment)",
  "event CredentialRevoked(uint256 indexed groupId, uint256 indexed identityCommitment)",
  "event CredentialVerified(uint256 indexed groupId, address indexed verifier)",
] as const;

export const SEMAPHORE_ABI = [
  "function getMerkleTreeRoot(uint256 groupId) view returns (uint256)",
  "function getMerkleTreeDepth(uint256 groupId) view returns (uint256)",
  "function getMerkleTreeSize(uint256 groupId) view returns (uint256)",
  "function verifyProof(uint256 groupId, tuple(uint256 merkleTreeDepth, uint256 merkleTreeRoot, uint256 nullifier, uint256 message, uint256 scope, uint256[8] points) proof) view returns (bool)",
] as const;

export const DEMO_ISSUER_ABI = [
  "function selfIssue(uint256 identityCommitment)",
  "function hasClaimed(address) view returns (bool)",
  "function totalIssued() view returns (uint256)",
] as const;

export const CREDENTIAL_REGISTRY_ABI = [
  "function schemas(bytes32) view returns (bytes32 schemaHash, string schemaURI, address issuer, bool revocable, uint256 createdAt, bool active)",
  "function getSchemaCount() view returns (uint256)",
  "function getSchemaHashes() view returns (bytes32[])",
  "function isRevoked(bytes32 schemaHash, uint256 identityCommitment) view returns (bool)",
] as const;
