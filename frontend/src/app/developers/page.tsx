import Link from "next/link";

export default function DevelopersPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="mb-10">
        <div className="inline-block px-3 py-1 mb-3 text-xs font-mono text-purple-400 border border-purple-800 rounded-full bg-purple-950/30">
          For builders
        </div>
        <h1 className="text-4xl font-bold mb-3">Developer Portal</h1>
        <p className="text-lg text-gray-400 max-w-2xl">
          Add privacy-preserving ZK credential verification to your dApp in under 10 minutes.
        </p>
      </div>

      {/* TL;DR */}
      <div className="grid md:grid-cols-3 gap-4 mb-10">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="text-3xl font-bold text-purple-400">1</div>
          <div className="font-medium mt-1">Inherit</div>
          <div className="text-sm text-gray-500 mt-1">Inherit from HSKPassportVerifier in your contract</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="text-3xl font-bold text-purple-400">2</div>
          <div className="font-medium mt-1">Gate</div>
          <div className="text-sm text-gray-500 mt-1">Add modifier to functions that need KYC</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="text-3xl font-bold text-purple-400">3</div>
          <div className="font-medium mt-1">Ship</div>
          <div className="text-sm text-gray-500 mt-1">Users generate proofs via SDK, submit to your contract</div>
        </div>
      </div>

      {/* Quick Start — Solidity */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-4">Smart Contract Integration</h2>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 overflow-x-auto">
          <pre className="text-sm font-mono text-gray-300">{`// SPDX-License-Identifier: MIT
pragma solidity >=0.8.23;

import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";

interface IHSKPassport {
    function verifyCredential(
        uint256 groupId,
        ISemaphore.SemaphoreProof calldata proof
    ) external view returns (bool);
}

contract MyDApp {
    IHSKPassport public passport;
    uint256 public constant KYC_GROUP = 15;

    constructor(address _passport) {
        passport = IHSKPassport(_passport);
    }

    function restrictedAction(
        ISemaphore.SemaphoreProof calldata proof
    ) external {
        // Bind proof to caller to prevent front-running
        require(
            proof.message == uint256(uint160(msg.sender)),
            "proof must be bound to caller"
        );
        require(
            passport.verifyCredential(KYC_GROUP, proof),
            "KYC proof required"
        );
        // Your logic here
    }
}`}</pre>
        </div>
        <p className="text-sm text-gray-400 mt-3">
          <strong className="text-white">Security tip:</strong> Always bind proofs to <code className="text-purple-300">msg.sender</code> to prevent front-running attacks. The <code className="text-purple-300">message</code> field of the proof must equal the caller&apos;s address cast to uint256.
        </p>
      </section>

      {/* Frontend — SDK */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-4">Frontend — TypeScript SDK</h2>
        <p className="text-sm text-gray-400 mb-3">
          Install the SDK (or copy from <a href="https://github.com/Ridwannurudeen/hsk-passport/tree/master/sdk" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300">/sdk</a>):
        </p>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4">
          <pre className="text-sm font-mono text-gray-300">npm install hsk-passport-sdk ethers @semaphore-protocol/identity @semaphore-protocol/group @semaphore-protocol/proof</pre>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 overflow-x-auto">
          <pre className="text-sm font-mono text-gray-300">{`import { HSKPassport } from "hsk-passport-sdk";
import { BrowserProvider } from "ethers";

// Connect
const provider = new BrowserProvider(window.ethereum);
const signer = await provider.getSigner();
const passport = HSKPassport.connect("hashkey-testnet", signer);

// Create identity from wallet signature
const sig = await signer.signMessage("HSK Passport: Generate identity");
const identity = passport.createIdentity(sig);

// Check status
const creds = await passport.getCredentials(identity);
console.log(creds); // [{groupName, hasCredential, ...}]

// Generate ZK proof (bound to caller)
const callerAddress = await signer.getAddress();
const proof = await passport.generateProof(
  identity,
  15,                      // KYC_VERIFIED group
  "my-action-scope",       // scope for nullifier
  BigInt(callerAddress)    // message bound to caller
);

// Verify on-chain (read-only)
const valid = await passport.verifyProof(15, proof);`}</pre>
        </div>
      </section>

      {/* REST API */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-4">Indexer REST API</h2>
        <p className="text-sm text-gray-400 mb-4">
          Query group members and KYC state without running an Ethereum node. Base URL: <code className="text-purple-300">https://hskpassport.gudman.xyz/api</code>
        </p>
        <div className="space-y-3">
          {[
            { method: "GET", path: "/api/groups/:groupId/members", desc: "Active identity commitments in a credential group (revocation-aware)" },
            { method: "GET", path: "/api/groups/:groupId/stats", desc: "Group size and issuance/revocation counts" },
            { method: "GET", path: "/api/credentials/:commitment", desc: "Groups a specific identity belongs to" },
            { method: "GET", path: "/api/stats/global", desc: "Protocol-wide stats: active credentials, groups, submissions" },
            { method: "POST", path: "/api/kyc/submit", desc: "Submit a KYC request for issuer review" },
            { method: "GET", path: "/api/kyc/queue?status=pending", desc: "Issuer queue of pending/approved/rejected requests" },
            { method: "POST", path: "/api/kyc/review", desc: "Issuer action — approve (record tx) or reject" },
          ].map((endpoint) => (
            <div key={endpoint.path} className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex items-start gap-4">
              <span className={`shrink-0 px-2 py-0.5 text-xs font-mono rounded ${
                endpoint.method === "GET" ? "bg-blue-900/50 text-blue-300" : "bg-green-900/50 text-green-300"
              }`}>
                {endpoint.method}
              </span>
              <div className="flex-1 min-w-0">
                <code className="text-sm font-mono text-purple-300 break-all">{endpoint.path}</code>
                <p className="text-xs text-gray-500 mt-1">{endpoint.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Contract Addresses */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-4">Deployed Contracts</h2>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="text-xs text-gray-500 mb-3 font-mono">HashKey Chain Testnet (chain ID 133)</div>
          <dl className="space-y-2 text-sm">
            {[
              { label: "HSKPassport", address: "0x79A0E1160FA829595f45f0479782095ed497d5E6" },
              { label: "CredentialRegistry", address: "0x20265dAe4711B3CeF88D7078bf1290f815279De1" },
              { label: "Semaphore", address: "0xd09e8Aec6B6A36588E7A105f606A9fe9a134CFE9" },
              { label: "DemoIssuer", address: "0xD6CB3393B9e1E162ed3EF8187082511d20Be28d1" },
              { label: "GatedRWA (hSILVER)", address: "0xFc6bDE32f79ad43696abc6A2a6291bfA8AF1D249" },
              { label: "KYCGatedAirdrop (hPILOT)", address: "0x02F84538E05b66FD207923675f48B70541bBb01c" },
              { label: "KYCGatedLending", address: "0x5430c4A4180492D5D0ce059355e82176F8AF9A20" },
            ].map((c) => (
              <div key={c.address} className="flex items-center justify-between py-1 border-b border-gray-800/50 last:border-0">
                <dt className="text-gray-400">{c.label}</dt>
                <dd>
                  <a href={`https://hashkey-testnet.blockscout.com/address/${c.address}`}
                    target="_blank" rel="noopener noreferrer"
                    className="font-mono text-xs text-purple-300 hover:text-purple-200">
                    {c.address}
                  </a>
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-4 text-sm">
          {[
            { name: "KYC Verified", id: 15 },
            { name: "Accredited Investor", id: 16 },
            { name: "HK Resident", id: 17 },
          ].map((g) => (
            <div key={g.id} className="bg-gray-900 border border-gray-800 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-purple-400">{g.id}</div>
              <div className="text-xs text-gray-500 mt-1">{g.name}</div>
            </div>
          ))}
        </div>
      </section>

      {/* React component */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-4">React Component</h2>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 overflow-x-auto">
          <pre className="text-sm font-mono text-gray-300">{`import { HSKPassportGate } from "hsk-passport-sdk/react";

<HSKPassportGate
  groupId={15}
  scope="mint-silver-token"
  identitySecret={walletSignature}
  signer={signer}
  onVerified={async (proof) => {
    // User is KYC-verified — mint the token
    await myContract.kycMint(proof);
  }}
  onError={(err) => toast.error(err.message)}
>
  Verify KYC & Mint
</HSKPassportGate>`}</pre>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-4">Live Examples</h2>
        <div className="grid md:grid-cols-3 gap-3">
          <Link href="/ecosystem" className="block bg-gray-900 border border-gray-800 hover:border-purple-800 rounded-xl p-5 transition-colors">
            <div className="text-sm font-semibold text-purple-400 mb-1">RWA Minting</div>
            <div className="text-xs text-gray-500">KYC-gated ERC-20 mint with nullifier tracking</div>
          </Link>
          <Link href="/ecosystem" className="block bg-gray-900 border border-gray-800 hover:border-purple-800 rounded-xl p-5 transition-colors">
            <div className="text-sm font-semibold text-purple-400 mb-1">Sybil-resistant Airdrop</div>
            <div className="text-xs text-gray-500">Per-round nullifiers prevent double-claims</div>
          </Link>
          <Link href="/ecosystem" className="block bg-gray-900 border border-gray-800 hover:border-purple-800 rounded-xl p-5 transition-colors">
            <div className="text-sm font-semibold text-purple-400 mb-1">Accredited Lending</div>
            <div className="text-xs text-gray-500">Tiered access based on credential group</div>
          </Link>
        </div>
      </section>

      <div className="bg-purple-950/20 border border-purple-900 rounded-xl p-6 text-center">
        <h2 className="text-xl font-semibold mb-2">Need help integrating?</h2>
        <p className="text-gray-400 mb-4 text-sm">
          Open an issue on GitHub or reach out to the core team.
        </p>
        <a
          href="https://github.com/Ridwannurudeen/hsk-passport"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition-colors"
        >
          Open on GitHub
        </a>
      </div>
    </div>
  );
}
