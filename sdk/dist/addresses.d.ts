/** Deployed contract addresses per network */
export declare const DEPLOYMENTS: {
    readonly "hashkey-testnet": {
        readonly chainId: 133;
        readonly rpcUrl: "https://testnet.hsk.xyz";
        readonly explorerUrl: "https://hashkey-testnet.blockscout.com";
        readonly contracts: {
            readonly semaphore: "0xd09e8Aec6B6A36588E7A105f606A9fe9a134CFE9";
            readonly credentialRegistry: "0x20265dAe4711B3CeF88D7078bf1290f815279De1";
            readonly hskPassport: "0xb430F30376344303560c0554DC94766D780a5c64";
            readonly demoIssuer: "0x77bE0CD574a3602923E2a0C3B42F01C11112A170";
            readonly gatedRWA: "0x5f7274C64C63Ea73144cf539aBF2504eB3208f25";
        };
        readonly deployBlock: 26410000;
        readonly groups: {
            readonly KYC_VERIFIED: 20;
            readonly ACCREDITED_INVESTOR: 21;
            readonly HK_RESIDENT: 22;
        };
    };
};
export type NetworkName = keyof typeof DEPLOYMENTS;
