/** Deployed contract addresses per network */
export declare const DEPLOYMENTS: {
    readonly "hashkey-testnet": {
        readonly chainId: 133;
        readonly rpcUrl: "https://testnet.hsk.xyz";
        readonly explorerUrl: "https://hashkey-testnet.blockscout.com";
        readonly contracts: {
            readonly semaphore: "0xd09e8Aec6B6A36588E7A105f606A9fe9a134CFE9";
            readonly credentialRegistry: "0x20265dAe4711B3CeF88D7078bf1290f815279De1";
            readonly hskPassport: "0x728bB8D8269a826b54a45385cF87ebDD785Ed1D6";
            readonly demoIssuer: "0x0a1dcaC5735312f469E77E4a13D6B3E9AC666632";
            readonly gatedRWA: "0xF7E07555Ebf79c1B344c8E36c7393316714762dB";
        };
        readonly groups: {
            readonly KYC_VERIFIED: 3;
            readonly ACCREDITED_INVESTOR: 4;
            readonly HK_RESIDENT: 5;
        };
    };
};
export type NetworkName = keyof typeof DEPLOYMENTS;
