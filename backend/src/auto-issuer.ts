import { JsonRpcProvider, Wallet, Contract } from "ethers";
import { CONFIG } from "./config.js";
import { db, updateKYCStatus, getKYCQueue } from "./db.js";

const PASSPORT_ABI = [
  "function issueCredential(uint256 groupId, uint256 identityCommitment)",
  "function hasCredential(uint256 groupId, uint256 identityCommitment) view returns (bool)",
  "function approvedIssuers(address) view returns (bool)",
];

const CREDENTIAL_TYPE_TO_GROUP: Record<string, number> = {
  KYCVerified: CONFIG.groups.KYC_VERIFIED,
  AccreditedInvestor: CONFIG.groups.ACCREDITED_INVESTOR,
  HKResident: CONFIG.groups.HK_RESIDENT,
};

// Minimum age before auto-approval fires (simulates "reviewer took a look")
const MIN_AGE_MS = 30_000;

const POLL_INTERVAL_MS = 15_000;

function getIssuerWallet(): Wallet | null {
  const pk = process.env.ISSUER_PRIVATE_KEY;
  if (!pk) {
    console.warn("[auto-issuer] ISSUER_PRIVATE_KEY not set — auto-approval disabled");
    return null;
  }
  const provider = new JsonRpcProvider(CONFIG.rpcUrl);
  return new Wallet(pk, provider);
}

interface KYCRow {
  id: string;
  identity_commitment: string;
  wallet_address: string;
  jurisdiction: string;
  credential_type: string;
  status: string;
  submitted_at: number;
}

async function tryAutoApprove(wallet: Wallet, req: KYCRow) {
  const groupId = CREDENTIAL_TYPE_TO_GROUP[req.credential_type];
  if (groupId === undefined) {
    console.warn(`[auto-issuer] Unknown credential type: ${req.credential_type}`);
    return;
  }

  const passport = new Contract(CONFIG.hskPassport, PASSPORT_ABI, wallet);

  // Double-check we're approved
  const isIssuer = await passport.approvedIssuers(wallet.address);
  if (!isIssuer) {
    console.error(`[auto-issuer] Wallet ${wallet.address} is not an approved issuer`);
    return;
  }

  const commitment = BigInt(req.identity_commitment);
  const already = await passport.hasCredential(groupId, commitment);

  if (already) {
    console.log(`[auto-issuer] ${req.id.slice(0, 8)} already has credential — marking approved`);
    updateKYCStatus(req.id, "approved", wallet.address);
    return;
  }

  console.log(`[auto-issuer] Issuing credential for ${req.id.slice(0, 8)} (${req.credential_type}, group ${groupId})...`);
  const tx = await passport.issueCredential(groupId, commitment);
  const receipt = await tx.wait();
  console.log(`[auto-issuer] Issued in tx ${receipt?.hash.slice(0, 12)}...`);

  updateKYCStatus(req.id, "approved", wallet.address, { txHash: tx.hash });
}

export function startAutoIssuer() {
  // Auto-issuer is a DEMO-ONLY convenience. It auto-approves pending KYC requests
  // after MIN_AGE_MS without human review. Gate behind an explicit env flag so
  // it never silently runs in a production deployment.
  if (process.env.DEMO_AUTO_APPROVE !== "true") {
    console.log("[auto-issuer] Disabled — set DEMO_AUTO_APPROVE=true to enable demo auto-approval.");
    return;
  }

  const walletOrNull = getIssuerWallet();
  if (!walletOrNull) return;
  const wallet: Wallet = walletOrNull;

  console.log(`[auto-issuer] DEMO MODE — auto-approving after ${MIN_AGE_MS / 1000}s. Wallet: ${wallet.address}`);

  let running = false;

  async function loop() {
    if (running) return;
    running = true;
    try {
      const queue = getKYCQueue("pending") as KYCRow[];
      const now = Date.now();

      for (const req of queue) {
        const age = now - req.submitted_at;
        if (age < MIN_AGE_MS) continue;

        try {
          await tryAutoApprove(wallet, req);
        } catch (e) {
          const msg = (e as Error).message;
          console.error(`[auto-issuer] Failed to approve ${req.id.slice(0, 8)}: ${msg.slice(0, 150)}`);
          // If the credential was already issued by a prior attempt but DB wasn't updated, fix DB
          if (msg.includes("CredentialAlreadyIssued")) {
            updateKYCStatus(req.id, "approved", wallet.address);
          }
        }
      }
    } catch (e) {
      console.error(`[auto-issuer] Loop error:`, (e as Error).message);
    } finally {
      running = false;
    }
  }

  loop().catch(() => {});
  setInterval(() => loop().catch(() => {}), POLL_INTERVAL_MS);
}
