import { Contract, JsonRpcProvider, Signer, type TransactionReceipt } from "ethers";
import { Identity } from "@semaphore-protocol/identity";
import { Group } from "@semaphore-protocol/group";
import { generateProof, type SemaphoreProof } from "@semaphore-protocol/proof";
import { DEPLOYMENTS, type NetworkName } from "./addresses";
import { HSK_PASSPORT_ABI, SEMAPHORE_ABI, DEMO_ISSUER_ABI, CREDENTIAL_REGISTRY_ABI } from "./abi";

export { DEPLOYMENTS, type NetworkName } from "./addresses";
export { Identity } from "@semaphore-protocol/identity";
export type { SemaphoreProof } from "@semaphore-protocol/proof";

/** Credential status for a specific group */
export interface CredentialStatus {
  groupId: number;
  groupName: string;
  hasCredential: boolean;
  schemaHash: string;
}

/** Formatted proof ready for on-chain submission */
export interface HSKPassportProof {
  merkleTreeDepth: number;
  merkleTreeRoot: bigint;
  nullifier: bigint;
  message: bigint;
  scope: bigint;
  points: bigint[];
  raw: SemaphoreProof;
}

/** Group info from chain */
export interface GroupInfo {
  groupId: number;
  name: string;
  issuer: string;
  memberCount: number;
  active: boolean;
  schemaHash: string;
}

/**
 * HSK Passport SDK — Privacy-preserving ZK credential verification for HashKey Chain
 *
 * @example
 * ```ts
 * import { HSKPassport } from "hsk-passport-sdk";
 *
 * const passport = HSKPassport.connect("hashkey-testnet");
 * const identity = passport.createIdentity("user-secret");
 * const proof = await passport.generateProof(identity, 3, "my-action");
 * const valid = await passport.verifyProof(3, proof);
 * ```
 */
export class HSKPassport {
  private provider: JsonRpcProvider;
  private signer?: Signer;
  private passportContract: Contract;
  private semaphoreContract: Contract;
  private network: NetworkName;

  private constructor(network: NetworkName, signerOrProvider?: Signer | JsonRpcProvider) {
    const deployment = DEPLOYMENTS[network];
    this.network = network;

    if (signerOrProvider && "getAddress" in signerOrProvider) {
      this.signer = signerOrProvider as Signer;
      this.provider = (signerOrProvider as Signer).provider as JsonRpcProvider;
    } else {
      this.provider = (signerOrProvider as JsonRpcProvider) || new JsonRpcProvider(deployment.rpcUrl);
    }

    this.passportContract = new Contract(
      deployment.contracts.hskPassport,
      HSK_PASSPORT_ABI,
      this.signer || this.provider
    );

    this.semaphoreContract = new Contract(
      deployment.contracts.semaphore,
      SEMAPHORE_ABI,
      this.provider
    );
  }

  /** Connect to HSK Passport on a specific network */
  static connect(network: NetworkName, signerOrProvider?: Signer | JsonRpcProvider): HSKPassport {
    return new HSKPassport(network, signerOrProvider);
  }

  /** Create a deterministic Semaphore identity from a secret (e.g., wallet signature) */
  createIdentity(secret: string): Identity {
    return new Identity(secret);
  }

  /** Get the deployment addresses for the connected network */
  getAddresses() {
    return DEPLOYMENTS[this.network];
  }

  /** Get group info from chain */
  async getGroupInfo(groupId: number): Promise<GroupInfo> {
    const g = await this.passportContract.credentialGroups(groupId);
    return {
      groupId: Number(g.groupId),
      name: g.name,
      issuer: g.issuer,
      memberCount: Number(g.memberCount),
      active: g.active,
      schemaHash: g.schemaHash,
    };
  }

  /** Check if an identity has a credential in a group */
  async hasCredential(groupId: number, identity: Identity): Promise<boolean> {
    return this.passportContract.hasCredential(groupId, identity.commitment);
  }

  /** Get credential status for all default groups */
  async getCredentials(identity: Identity): Promise<CredentialStatus[]> {
    const groups = DEPLOYMENTS[this.network].groups;
    const results: CredentialStatus[] = [];

    for (const [name, groupId] of Object.entries(groups)) {
      const has = await this.passportContract.hasCredential(groupId, identity.commitment);
      const info = await this.passportContract.credentialGroups(groupId);
      results.push({
        groupId,
        groupName: name,
        hasCredential: has,
        schemaHash: info.schemaHash,
      });
    }

    return results;
  }

  /** Get all active group members (revocation-aware) */
  async getGroupMembers(groupId: number): Promise<bigint[]> {
    const issuedFilter = this.passportContract.filters.CredentialIssued(groupId);
    const revokedFilter = this.passportContract.filters.CredentialRevoked(groupId);
    const fromBlock = DEPLOYMENTS[this.network].deployBlock;

    const [issuedEvents, revokedEvents] = await Promise.all([
      this.passportContract.queryFilter(issuedFilter, fromBlock, "latest"),
      this.passportContract.queryFilter(revokedFilter, fromBlock, "latest"),
    ]);

    const revokedSet = new Set(
      revokedEvents.map((e) => {
        const parsed = this.passportContract.interface.parseLog({
          topics: [...e.topics],
          data: e.data,
        });
        return parsed?.args?.identityCommitment?.toString();
      }).filter(Boolean)
    );

    return issuedEvents
      .map((e) => {
        const parsed = this.passportContract.interface.parseLog({
          topics: [...e.topics],
          data: e.data,
        });
        return parsed?.args?.identityCommitment as bigint;
      })
      .filter((m): m is bigint => m !== undefined && !revokedSet.has(m.toString()));
  }

  /**
   * Generate a zero-knowledge proof of credential ownership
   *
   * @param identity - The user's Semaphore identity
   * @param groupId - The credential group to prove membership in
   * @param scope - Action scope (unique per action for sybil resistance)
   * @param message - REQUIRED. Bind the proof to prevent front-running.
   *                  Pass `BigInt(callerAddress)` where callerAddress is the msg.sender
   *                  that will submit the proof on-chain. The dApp's verifier contract
   *                  MUST check that `proof.message == uint256(uint160(msg.sender))`.
   *                  Passing arbitrary values (like 1) leaves the proof vulnerable
   *                  to front-running.
   */
  async generateProof(
    identity: Identity,
    groupId: number,
    scope: number | bigint | string,
    message: number | bigint
  ): Promise<HSKPassportProof> {
    if (message === undefined || message === null) {
      throw new Error(
        "generateProof: 'message' is required and should be the caller's address as a bigint. " +
        "Pass BigInt(await signer.getAddress()) to prevent front-running."
      );
    }
    const members = await this.getGroupMembers(groupId);
    if (members.length === 0) {
      throw new Error("Group has no members");
    }

    if (!members.some((m) => m === identity.commitment)) {
      throw new Error("Identity is not a member of this group");
    }

    const group = new Group();
    for (const member of members) {
      group.addMember(member);
    }

    const scopeValue = typeof scope === "string" ? BigInt("0x" + Buffer.from(scope).toString("hex")) % (2n ** 253n) : scope;

    const raw = await generateProof(identity, group, message, scopeValue);

    return {
      merkleTreeDepth: raw.merkleTreeDepth,
      merkleTreeRoot: BigInt(raw.merkleTreeRoot),
      nullifier: BigInt(raw.nullifier),
      message: BigInt(raw.message),
      scope: BigInt(raw.scope),
      points: raw.points.map((p) => BigInt(p)),
      raw,
    };
  }

  /** Verify a proof on-chain (read-only, does not consume nullifier) */
  async verifyProof(groupId: number, proof: HSKPassportProof): Promise<boolean> {
    return this.semaphoreContract.verifyProof(groupId, {
      merkleTreeDepth: proof.merkleTreeDepth,
      merkleTreeRoot: proof.merkleTreeRoot,
      nullifier: proof.nullifier,
      message: proof.message,
      scope: proof.scope,
      points: proof.points,
    });
  }

  /** Submit and validate a proof on-chain (consumes nullifier, requires signer) */
  async submitProof(groupId: number, proof: HSKPassportProof): Promise<TransactionReceipt> {
    if (!this.signer) throw new Error("Signer required to submit proof");

    const tx = await this.passportContract.validateCredential(groupId, {
      merkleTreeDepth: proof.merkleTreeDepth,
      merkleTreeRoot: proof.merkleTreeRoot,
      nullifier: proof.nullifier,
      message: proof.message,
      scope: proof.scope,
      points: proof.points,
    });

    const receipt = await tx.wait();
    if (!receipt) throw new Error("Transaction failed");
    return receipt;
  }
}
