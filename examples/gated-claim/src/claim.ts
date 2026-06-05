/**
 * gated-claim — end-to-end HSK Passport integration on HashKey Chain testnet.
 *
 * Flow:
 *   1. Derive a Semaphore identity from a wallet signature (deterministic).
 *   2. If the wallet has no KYC_VERIFIED credential, self-issue one via the
 *      DemoIssuer (testnet-only convenience; real issuance is gated by Sumsub KYC).
 *   3. Generate a ZK proof of credential ownership, bound to the caller and
 *      scoped to the airdrop's current round.
 *   4. Submit it to KYCGatedAirdrop.claim() and read the resulting balance.
 *
 * Run:  cp env.example .env && edit .env, then `npm run claim`
 */
import "dotenv/config";
import { JsonRpcProvider, Wallet, Contract } from "ethers";
import { HSKPassport } from "hsk-passport-sdk";

const SemaphoreProofTuple =
  "tuple(uint256 merkleTreeDepth, uint256 merkleTreeRoot, uint256 nullifier, uint256 message, uint256 scope, uint256[8] points) proof";

const AIRDROP_ABI = [
  "function currentRound() view returns (uint256)",
  "function claimAmount() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function hasClaimedInRound(uint256 round, uint256 nullifier) view returns (bool)",
  `function claim(${SemaphoreProofTuple})`,
] as const;

const DEMO_ISSUER_ABI = [
  "function selfIssue(uint256 identityCommitment)",
  "function hasClaimed(address) view returns (bool)",
] as const;

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey || privateKey.startsWith("0xYOUR")) {
    throw new Error(
      "Set PRIVATE_KEY in .env (copy env.example to .env). Use a TESTNET wallet funded with HSK gas.",
    );
  }

  const rpcUrl = process.env.RPC_URL || "https://testnet.hsk.xyz";
  const provider = new JsonRpcProvider(rpcUrl);
  const wallet = new Wallet(privateKey, provider);
  const caller = await wallet.getAddress();
  console.log(`Wallet:  ${caller}`);

  // Connect the SDK with a signer so we can both read and write.
  const passport = HSKPassport.connect("hashkey-testnet", wallet);
  const { contracts, groups } = passport.getAddresses();
  const groupId = groups.KYC_VERIFIED;

  // 1. Deterministic identity from a wallet signature. The same signature always
  //    yields the same identity, so the user never stores a separate secret.
  const signature = await wallet.signMessage(
    "HSK Passport: Generate my identity",
  );
  const identity = passport.createIdentity(signature);
  console.log(`Identity commitment: ${identity.commitment}`);

  // 2. Ensure the identity holds a KYC_VERIFIED credential.
  let hasCredential = await passport.hasCredential(groupId, identity);
  if (!hasCredential) {
    console.log(
      "No KYC_VERIFIED credential found — self-issuing a demo credential...",
    );
    const demoIssuer = new Contract(
      contracts.demoIssuer,
      DEMO_ISSUER_ABI,
      wallet,
    );
    if (await demoIssuer.hasClaimed(caller)) {
      throw new Error(
        "This wallet already self-issued for a different identity. Use a fresh wallet, " +
          "or complete real KYC at https://hskpassport.gudman.xyz/kyc.",
      );
    }
    const issueTx = await demoIssuer.selfIssue(identity.commitment);
    console.log(`  selfIssue tx: ${issueTx.hash}`);
    await issueTx.wait();
    hasCredential = true;
  }
  console.log("Credential: KYC_VERIFIED ✓");

  // 3. Generate a proof bound to this caller and scoped to the current round.
  const airdrop = new Contract(contracts.kycGatedAirdrop, AIRDROP_ABI, wallet);
  const round: bigint = await airdrop.currentRound();
  const proof = await passport.generateProof(
    identity,
    groupId,
    round,
    BigInt(caller),
  );

  if (await airdrop.hasClaimedInRound(round, proof.nullifier)) {
    console.log(`Already claimed in round ${round}. Nothing to do.`);
    return;
  }

  // 4. Submit the claim. The contract checks message == caller, scope == round,
  //    the nullifier is unused, and the proof verifies — all in one call.
  console.log(`Claiming airdrop (round ${round})...`);
  const claimTx = await airdrop.claim({
    merkleTreeDepth: proof.merkleTreeDepth,
    merkleTreeRoot: proof.merkleTreeRoot,
    nullifier: proof.nullifier,
    message: proof.message,
    scope: proof.scope,
    points: proof.points,
  });
  console.log(`  claim tx: ${claimTx.hash}`);
  await claimTx.wait();

  const balance: bigint = await airdrop.balanceOf(caller);
  console.log(`Done. Airdrop balance: ${balance}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
