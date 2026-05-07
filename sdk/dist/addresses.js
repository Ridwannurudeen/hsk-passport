"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEPLOYMENTS = void 0;
/** Deployed contract addresses per network.
 *
 *  hashkey-testnet: full live stack — credentials issued, gated dApps live,
 *  v6 freshness verifier wired up. Use for development, integration tests,
 *  and live demos.
 *
 *  hashkey-mainnet: soft-mainnet posture. IssuerRegistry is live for
 *  real-money issuer staking. HSKPassport v2 (with asymmetric pauser role)
 *  is deployed but in SAFE MODE: deployer-only issuer, zero credential
 *  groups, inert until third-party audit completes. Active credentials
 *  continue to issue on testnet only. Reading mainnet via the SDK is
 *  supported; calling issuance / credential methods will revert pre-audit.
 */
exports.DEPLOYMENTS = {
    "hashkey-testnet": {
        chainId: 133,
        rpcUrl: "https://testnet.hsk.xyz",
        explorerUrl: "https://hashkey-testnet.blockscout.com",
        contracts: {
            semaphore: "0xd09e8Aec6B6A36588E7A105f606A9fe9a134CFE9",
            credentialRegistry: "0x20265dAe4711B3CeF88D7078bf1290f815279De1",
            hskPassport: "0x7d2E692A08f2fb0724238396e0436106b4FbD792",
            demoIssuer: "0xBf7d566B8077A098F6844fb6b827D2A4118C88C3",
            gatedRWA: "0xb6955cb3e442c4222fFc3b92c322851109d0b9c9",
            kycGatedAirdrop: "0x71c96016CBCAeE7B2Edc8b40Fec45de1d16Fb4b8",
            kycGatedLending: "0x37179886986bd35a4d580f157f55f249c43A0BFD",
            jurisdictionGatedPool: "0x305f5F0b44d541785305DaDb372f118A9284Ce4D",
            hashKeyDIDBridge: "0xF072D06adcA2B6d5941bde6cc87f41feC5F5Ea7a",
            hashKeyKYCImporter: "0x5431ae6D2f5c3Ad3373B7B4DD4066000D681f5B8",
            issuerRegistry: "0x5BbAe6e90b82c7c51EbA9cA6D844D698dE2eb504",
            timelock: "0xb07Bc78559CbDe44c047b1dC3028d13c4f863D8A",
            // v6 — per-prover credential-freshness ZK proofs
            freshnessRegistry: "0xd251ecAD1a863299BAD2E25B93377B736a753938",
            freshnessVerifier: "0x59A03fF053464150b066e78d22AEc2F69D081394",
            hskPassportFreshness: "0xFF790dE1537a84220cD12ef648650034D4725fBb",
        },
        deployBlock: 26800000,
        groups: {
            KYC_VERIFIED: 25,
            ACCREDITED_INVESTOR: 26,
            HK_RESIDENT: 27,
            SG_RESIDENT: 28,
            AE_RESIDENT: 29,
        },
    },
    "hashkey-mainnet": {
        chainId: 177,
        rpcUrl: "https://mainnet.hsk.xyz",
        explorerUrl: "https://explorer.hsk.xyz",
        contracts: {
            // Live: real-money issuer staking.
            issuerRegistry: "0xf109cBe3D8d54D77C85ECF1367Cfcd6f075868e9",
            // Live: 48h TimelockController. Currently slashingAuthority of the
            // IssuerRegistry. Will become owner after Phase B of the handoff
            // (see RUNBOOK.md §5).
            timelock: "0xd09e8Aec6B6A36588E7A105f606A9fe9a134CFE9",
            // SAFE MODE: deployed but inert. Zero credential groups, deployer-only
            // issuer, paused=false. Will not accept credentials until the audit
            // completes and groups are created. Pauser-role enabled for surgical
            // incident response.
            hskPassport: "0x5E99a3a13952E7d7a0b2a4f10294dA645d320A9e",
            semaphore: "0x728bB8D8269a826b54a45385cF87ebDD785Ed1D6",
            semaphoreVerifier: "0x400351258Cd54b6093320b92B85942eEf48Ef128",
            poseidonT3: "0x20265dAe4711B3CeF88D7078bf1290f815279De1",
        },
        deployBlock: 21901194,
        // No groups exist on mainnet yet — SAFE MODE. SDK consumers reading
        // mainnet will see zero members for any group ID until post-audit
        // group creation.
        groups: {},
    },
};
