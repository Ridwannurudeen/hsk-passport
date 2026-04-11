"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEPLOYMENTS = void 0;
/** Deployed contract addresses per network */
exports.DEPLOYMENTS = {
    "hashkey-testnet": {
        chainId: 133,
        rpcUrl: "https://testnet.hsk.xyz",
        explorerUrl: "https://hashkey-testnet.blockscout.com",
        contracts: {
            semaphore: "0xd09e8Aec6B6A36588E7A105f606A9fe9a134CFE9",
            credentialRegistry: "0x20265dAe4711B3CeF88D7078bf1290f815279De1",
            hskPassport: "0x728bB8D8269a826b54a45385cF87ebDD785Ed1D6",
            demoIssuer: "0x0a1dcaC5735312f469E77E4a13D6B3E9AC666632",
            gatedRWA: "0xF7E07555Ebf79c1B344c8E36c7393316714762dB",
        },
        groups: {
            KYC_VERIFIED: 3,
            ACCREDITED_INVESTOR: 4,
            HK_RESIDENT: 5,
        },
    },
};
