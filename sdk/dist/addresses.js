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
            hskPassport: "0xb430F30376344303560c0554DC94766D780a5c64",
            demoIssuer: "0x77bE0CD574a3602923E2a0C3B42F01C11112A170",
            gatedRWA: "0x5f7274C64C63Ea73144cf539aBF2504eB3208f25",
        },
        deployBlock: 26410000,
        groups: {
            KYC_VERIFIED: 20,
            ACCREDITED_INVESTOR: 21,
            HK_RESIDENT: 22,
        },
    },
};
