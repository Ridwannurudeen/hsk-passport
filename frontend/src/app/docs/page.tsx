export default function DocsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-2">Integration Guide</h1>
      <p className="text-gray-400 mb-8">
        Add ZK credential verification to your HashKey Chain dApp in minutes.
      </p>

      <div className="space-y-8">
        {/* Quick Start */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Quick Start</h2>
          <p className="text-sm text-gray-400 mb-4">
            Gate any function in your smart contract behind a KYC credential
            check:
          </p>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 font-mono text-sm overflow-x-auto">
            <pre className="text-gray-300">
{`// SPDX-License-Identifier: MIT
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
    uint256 public constant KYC_GROUP = 0; // KYC_VERIFIED

    constructor(address _passport) {
        passport = IHSKPassport(_passport);
    }

    function kycGatedFunction(
        ISemaphore.SemaphoreProof calldata proof
    ) external {
        require(
            passport.verifyCredential(KYC_GROUP, proof),
            "KYC proof required"
        );
        // Your logic here
    }
}`}
            </pre>
          </div>
        </section>

        {/* Frontend Integration */}
        <section>
          <h2 className="text-xl font-semibold mb-4">
            Frontend: Generate Proofs
          </h2>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 font-mono text-sm overflow-x-auto">
            <pre className="text-gray-300">
{`import { Identity } from "@semaphore-protocol/identity";
import { Group } from "@semaphore-protocol/group";
import { generateProof } from "@semaphore-protocol/proof";

// 1. Create identity from wallet signature
const signature = await signer.signMessage(
  "HSK Passport: Generate my Semaphore identity"
);
const identity = new Identity(signature);

// 2. Reconstruct the group (from on-chain events or indexer)
const group = new Group();
for (const member of groupMembers) {
  group.addMember(member);
}

// 3. Generate ZK proof
const proof = await generateProof(
  identity,
  group,
  1,  // message (arbitrary signal)
  0   // scope (group ID for KYC_VERIFIED)
);

// 4. Submit to your contract
const tx = await myDApp.kycGatedFunction(proof);`}
            </pre>
          </div>
        </section>

        {/* Contract Addresses */}
        <section>
          <h2 className="text-xl font-semibold mb-4">
            Contract Addresses (Testnet)
          </h2>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Network</span>
              <span className="font-mono text-white">
                HashKey Chain Testnet (133)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">HSKPassport</span>
              <a href="https://hashkey-testnet.blockscout.com/address/0x8D379176A95B962687e2edD8AF1f86e1280F4c3C" target="_blank" rel="noopener noreferrer" className="font-mono text-purple-300 text-xs hover:text-purple-200">
                0x8D37...4c3C
              </a>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Semaphore</span>
              <a href="https://hashkey-testnet.blockscout.com/address/0xd09e8Aec6B6A36588E7A105f606A9fe9a134CFE9" target="_blank" rel="noopener noreferrer" className="font-mono text-purple-300 text-xs hover:text-purple-200">
                0xd09e...CFE9
              </a>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">GatedRWA (hSILVER)</span>
              <a href="https://hashkey-testnet.blockscout.com/address/0xa36c64bb8E063042a0467Da12ed4cD51F71bAE59" target="_blank" rel="noopener noreferrer" className="font-mono text-purple-300 text-xs hover:text-purple-200">
                0xa36c...AE59
              </a>
            </div>
          </div>
        </section>

        {/* Credential Groups */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Credential Groups</h2>
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="px-6 py-3 text-left text-gray-400 font-medium">
                    Group ID
                  </th>
                  <th className="px-6 py-3 text-left text-gray-400 font-medium">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-gray-400 font-medium">
                    Description
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-800/50">
                  <td className="px-6 py-3 font-mono text-purple-300">0</td>
                  <td className="px-6 py-3 font-medium">KYC_VERIFIED</td>
                  <td className="px-6 py-3 text-gray-400">
                    User has passed standard KYC verification
                  </td>
                </tr>
                <tr className="border-b border-gray-800/50">
                  <td className="px-6 py-3 font-mono text-purple-300">1</td>
                  <td className="px-6 py-3 font-medium">
                    ACCREDITED_INVESTOR
                  </td>
                  <td className="px-6 py-3 text-gray-400">
                    User is an accredited/professional investor
                  </td>
                </tr>
                <tr>
                  <td className="px-6 py-3 font-mono text-purple-300">2</td>
                  <td className="px-6 py-3 font-medium">HK_RESIDENT</td>
                  <td className="px-6 py-3 text-gray-400">
                    User is a Hong Kong resident
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* How it works */}
        <section>
          <h2 className="text-xl font-semibold mb-4">How It Works</h2>
          <div className="space-y-4 text-sm text-gray-400">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <h3 className="font-semibold text-white mb-2">
                Semaphore v4
              </h3>
              <p>
                HSK Passport is built on{" "}
                <a
                  href="https://semaphore.pse.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-400 hover:text-purple-300"
                >
                  Semaphore v4
                </a>{" "}
                by the Privacy & Scaling Explorations team (Ethereum
                Foundation). Semaphore uses Groth16 zero-knowledge proofs to
                enable anonymous group membership verification.
              </p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <h3 className="font-semibold text-white mb-2">
                Identity Commitments
              </h3>
              <p>
                Each user generates a Semaphore identity (EdDSA keypair) from
                their wallet signature. The identity commitment (a hash of the
                public key) is added to a credential group&apos;s on-chain Merkle
                tree by an issuer.
              </p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <h3 className="font-semibold text-white mb-2">
                Zero-Knowledge Proofs
              </h3>
              <p>
                When a user needs to prove a credential, they generate a
                Groth16 proof in their browser (via WASM). The proof
                demonstrates: &quot;I know a private key whose commitment is a
                leaf in this Merkle tree&quot; — without revealing which leaf.
              </p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <h3 className="font-semibold text-white mb-2">
                On-Chain Verification
              </h3>
              <p>
                The smart contract verifies the proof using the bn128/alt_bn128
                elliptic curve precompiles (ecAdd, ecMul, ecPairing) available
                on HashKey Chain. Verification costs ~241,000 gas.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
