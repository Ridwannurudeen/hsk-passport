export const CHAIN_ID = 133;
export const RPC_URL = "https://testnet.hsk.xyz";
export const EXPLORER_URL = "https://hashkey-testnet.blockscout.com";

export const ADDRESSES = {
  semaphoreVerifier: "0xe874E5DE61fa40dAf82e8916489d1B7071aC3b9A",
  semaphore: "0xd09e8Aec6B6A36588E7A105f606A9fe9a134CFE9",
  credentialRegistry: "0x20265dAe4711B3CeF88D7078bf1290f815279De1",
  hskPassport: "0x79A0E1160FA829595f45f0479782095ed497d5E6",
  demoIssuer: "0xD6CB3393B9e1E162ed3EF8187082511d20Be28d1",
  gatedRWA: "0xFc6bDE32f79ad43696abc6A2a6291bfA8AF1D249",
  kycGatedAirdrop: "0x02F84538E05b66FD207923675f48B70541bBb01c",
  kycGatedLending: "0x5430c4A4180492D5D0ce059355e82176F8AF9A20",
  // Phase A+B+C: Technical novelty + HashKey integration + governance
  credentialExpiry: "0x11fF27Bf3F0Bbf45a5dC43210359c56E45E97770",
  credentialReputation: "0x39cc2a483Cc22Cf7B461759404642Fa528df96D7",
  jurisdictionSetVerifier: "0x12B644146d1c227a6FD34423dAAa6D37427AbE13",
  jurisdictionGatedPool: "0x38284a274c1999e5271e62f63e5e443B9A1fc1dc",
  mockHashKeyDID: "0x398684D25337BB0DF1B03f3A1f7b0deA7654F8f5",
  hashKeyDIDBridge: "0x37e855626a5cF51e808F96efe4455Dc225724472",
  mockKYCSoulbound: "0xfC981C8F4Ca8592f7f73d84f02fB3344f6e09eBf",
  hashKeyKYCImporter: "0x01fF7BFba82820a2595467a554678DB672eEa54f",
  issuerRegistry: "0x79682C30670f374BD13F40C78c828a32F47582b3",
  timelock: "0x27a145f5Ed0332Bb8a3D82Bf4B95A33B39523ef6",
};

// Block where HSKPassport was deployed — use as fromBlock for event queries
// to avoid expensive full-range scans that cause RPC timeouts.
export const HSK_PASSPORT_DEPLOY_BLOCK = 26371173;

export const GROUPS = {
  KYC_VERIFIED: 15,
  ACCREDITED_INVESTOR: 16,
  HK_RESIDENT: 17,
  SG_RESIDENT: 18,
  AE_RESIDENT: 19,
};

export const GROUP_NAMES: Record<number, string> = {
  15: "KYC Verified",
  16: "Accredited Investor",
  17: "HK Resident",
  18: "SG Resident",
  19: "AE Resident",
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
