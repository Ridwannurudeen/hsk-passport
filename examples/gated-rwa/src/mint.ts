/**
 * gated-rwa — mint a ZK-KYC-gated ERC-20 (hSILVER) on HashKey Chain testnet.
 *
 * Shows a different gate shape from `gated-claim`: GatedRWA verifies the proof
 * directly against the Semaphore contract (no action rounds), binding it to the
 * caller and tracking a per-mint nullifier. One mint per identity per scope.
 *
 * Flow:
 *   1. Derive a Semaphore identity from a wallet signature (deterministic).
 *   2. If the wallet has no KYC_VERIFIED credential, self-issue one via DemoIssuer.
 *   3. Generate a ZK proof bound to the caller, scoped to the mint action.
 *   4. Submit GatedRWA.kycMint(proof) and read the resulting hSILVER balance.
 *
 * Run:  cp env.example .env && edit .env, then `npm run mint`
 */
import "dotenv/config";
import { JsonRpcProvider, Wallet, Contract } from "ethers";
import { HSKPassport } from "hsk-passport-sdk";

const MINT_SCOPE = "mint-hsilver";

const SemaphoreProofTuple =
  "tuple(uint256 merkleTreeDepth, uint256 merkleTreeRoot, uint256 nullifier, uint256 message, uint256 scope, uint256[8] points) proof";

const RWA_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function mintAmount() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function usedNullifiers(uint256) view returns (bool)",
  `function kycMint(${SemaphoreProofTuple})`,
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

  const passport = HSKPassport.connect("hashkey-testnet", wallet);
  const { contracts, groups } = passport.getAddresses();
  const groupId = groups.KYC_VERIFIED;

  // 1. Deterministic identity from a wallet signature.
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

  // 3. Generate a proof bound to this caller, scoped to the mint action. The
  //    nullifier is deterministic per (identity, scope), so one mint per identity.
  const rwa = new Contract(contracts.gatedRWA, RWA_ABI, wallet);
  const proof = await passport.generateProof(
    identity,
    groupId,
    MINT_SCOPE,
    BigInt(caller),
  );

  if (await rwa.usedNullifiers(proof.nullifier)) {
    console.log("This identity already minted hSILVER. Nothing to do.");
    return;
  }

  // 4. Mint. The contract checks message == caller, the nullifier is unused,
  //    and the proof verifies against the KYC group — all in one call.
  const [symbol, mintAmount] = await Promise.all([
    rwa.symbol(),
    rwa.mintAmount(),
  ]);
  console.log(`Minting ${mintAmount} ${symbol}...`);
  const mintTx = await rwa.kycMint({
    merkleTreeDepth: proof.merkleTreeDepth,
    merkleTreeRoot: proof.merkleTreeRoot,
    nullifier: proof.nullifier,
    message: proof.message,
    scope: proof.scope,
    points: proof.points,
  });
  console.log(`  kycMint tx: ${mintTx.hash}`);
  await mintTx.wait();

  const balance: bigint = await rwa.balanceOf(caller);
  console.log(`Done. ${symbol} balance: ${balance}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
