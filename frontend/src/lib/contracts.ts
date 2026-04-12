export const CHAIN_ID = 133;
export const RPC_URL = "https://testnet.hsk.xyz";
export const EXPLORER_URL = "https://hashkey-testnet.blockscout.com";

// V4 addresses — post-audit deployment with issuer offboarding + anti-sybil bridges + delegate split
export const ADDRESSES = {
  semaphoreVerifier: "0xe874E5DE61fa40dAf82e8916489d1B7071aC3b9A",
  semaphore: "0xd09e8Aec6B6A36588E7A105f606A9fe9a134CFE9",
  credentialRegistry: "0x20265dAe4711B3CeF88D7078bf1290f815279De1",
  hskPassport: "0xb430F30376344303560c0554DC94766D780a5c64",
  demoIssuer: "0x77bE0CD574a3602923E2a0C3B42F01C11112A170",
  gatedRWA: "0x5f7274C64C63Ea73144cf539aBF2504eB3208f25",
  kycGatedAirdrop: "0xdf399c83cc316b518836df37F7aB54e2b2ada9f9",
  kycGatedLending: "0x5B3107e67B6439A22dDC21e547f75855A3e70deD",
  jurisdictionSetVerifier: "0x450Dbd60aC27B7bf0131c2b25451380552dd4fBb",
  jurisdictionGatedPool: "0xA7C937D3D269267590bF9d411B066C57AC8462ec",
  mockHashKeyDID: "0x39931820e457949b724d28C585F821005fcaB409",
  hashKeyDIDBridge: "0x0cB4c519F984A2f43c1ca217CDB5095dB3b3A2a5",
  mockKYCSoulbound: "0x195572EaE140f53CcBA065751C92659935D075E9",
  hashKeyKYCImporter: "0x7A40694Eda3046706Fe89db771e88Cf3A979A117",
  // Roadmap scaffolding — deployed but NOT production-enforced (see SECURITY.md)
  credentialExpiry: "0xBB47Eb4104E8f77243B445AAE4925c74A839A924",
  credentialReputation: "0x15b29aFeABb1d4C31A0BF6C87f0ae1d357D55D71",
  issuerRegistry: "0x5BbAe6e90b82c7c51EbA9cA6D844D698dE2eb504",
  timelock: "0xb07Bc78559CbDe44c047b1dC3028d13c4f863D8A",
};

// Block where HSKPassport was deployed — use as fromBlock for event queries
// to avoid expensive full-range scans that cause RPC timeouts.
export const HSK_PASSPORT_DEPLOY_BLOCK = 26410000;

export const GROUPS = {
  KYC_VERIFIED: 20,
  ACCREDITED_INVESTOR: 21,
  HK_RESIDENT: 22,
  SG_RESIDENT: 23,
  AE_RESIDENT: 24,
};

export const GROUP_NAMES: Record<number, string> = {
  20: "KYC Verified",
  21: "Accredited Investor",
  22: "HK Resident",
  23: "SG Resident",
  24: "AE Resident",
};

export const HSK_PASSPORT_ABI = [
  "function semaphore() view returns (address)",
  "function owner() view returns (address)",
  "function approvedIssuers(address) view returns (bool)",
  "function credentialGroups(uint256) view returns (string name, uint256 groupId, address issuer, uint256 memberCount, bool active)",
  "function credentials(uint256, uint256) view returns (bool)",
  "function groupIds(uint256) view returns (uint256)",
  "function getGroupIds() view returns (uint256[])",
  "function getGroupCount() view returns (uint256)",
  "function hasCredential(uint256 groupId, uint256 identityCommitment) view returns (bool)",
  "function approveIssuer(address issuer)",
  "function revokeIssuer(address issuer)",
  "function createCredentialGroup(string name) returns (uint256)",
  "function issueCredential(uint256 groupId, uint256 identityCommitment)",
  "function batchIssueCredentials(uint256 groupId, uint256[] identityCommitments)",
  "function revokeCredential(uint256 groupId, uint256 identityCommitment, uint256[] merkleProofSiblings)",
  "function verifyCredential(uint256 groupId, tuple(uint256 merkleTreeDepth, uint256 merkleTreeRoot, uint256 nullifier, uint256 message, uint256 scope, uint256[8] points) proof) view returns (bool)",
  "function validateCredential(uint256 groupId, tuple(uint256 merkleTreeDepth, uint256 merkleTreeRoot, uint256 nullifier, uint256 message, uint256 scope, uint256[8] points) proof)",
  "function deactivateGroup(uint256 groupId)",
  "event CredentialGroupCreated(uint256 indexed groupId, string name, address indexed issuer)",
  "event CredentialIssued(uint256 indexed groupId, uint256 indexed identityCommitment)",
  "event CredentialRevoked(uint256 indexed groupId, uint256 indexed identityCommitment)",
  "event CredentialVerified(uint256 indexed groupId, address indexed verifier)",
  "event IssuerApproved(address indexed issuer)",
  "event IssuerRevoked(address indexed issuer)",
] as const;

export const GATED_RWA_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function requiredGroupId() view returns (uint256)",
  "function mintAmount() view returns (uint256)",
  "function usedNullifiers(uint256) view returns (bool)",
  "function kycMint(tuple(uint256 merkleTreeDepth, uint256 merkleTreeRoot, uint256 nullifier, uint256 message, uint256 scope, uint256[8] points) proof)",
  "function transfer(address to, uint256 value) returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event KYCMint(address indexed to, uint256 amount, uint256 nullifier)",
  // Custom errors — required for ethers to decode reverts
  "error InvalidProof()",
  "error NullifierAlreadyUsed()",
  "error NotOwner()",
  "error ProofNotBoundToCaller()",
] as const;

export const DEMO_ISSUER_ABI = [
  "function selfIssue(uint256 identityCommitment)",
  "function hasClaimed(address) view returns (bool)",
  "function totalIssued() view returns (uint256)",
  "function kycGroupId() view returns (uint256)",
  "event DemoCredentialIssued(address indexed claimer, uint256 identityCommitment)",
] as const;

export const CREDENTIAL_REGISTRY_ABI = [
  "function schemas(bytes32) view returns (bytes32 schemaHash, string schemaURI, address issuer, bool revocable, uint256 createdAt, bool active)",
  "function getSchemaCount() view returns (uint256)",
  "function getSchemaHashes() view returns (bytes32[])",
  "function isRevoked(bytes32 schemaHash, uint256 identityCommitment) view returns (bool)",
] as const;

export const SEMAPHORE_ABI = [
  "function groupCounter() view returns (uint256)",
  "function getMerkleTreeRoot(uint256 groupId) view returns (uint256)",
  "function getMerkleTreeDepth(uint256 groupId) view returns (uint256)",
  "function getMerkleTreeSize(uint256 groupId) view returns (uint256)",
  "function verifyProof(uint256 groupId, tuple(uint256 merkleTreeDepth, uint256 merkleTreeRoot, uint256 nullifier, uint256 message, uint256 scope, uint256[8] points) proof) view returns (bool)",
] as const;
