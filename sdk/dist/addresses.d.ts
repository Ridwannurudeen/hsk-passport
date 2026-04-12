/** Deployed contract addresses per network */
export declare const DEPLOYMENTS: {
    readonly "hashkey-testnet": {
        readonly chainId: 133;
        readonly rpcUrl: "https://testnet.hsk.xyz";
        readonly explorerUrl: "https://hashkey-testnet.blockscout.com";
        readonly contracts: {
            readonly semaphore: "0xd09e8Aec6B6A36588E7A105f606A9fe9a134CFE9";
            readonly credentialRegistry: "0x20265dAe4711B3CeF88D7078bf1290f815279De1";
            readonly hskPassport: "0x79A0E1160FA829595f45f0479782095ed497d5E6";
            readonly demoIssuer: "0xD6CB3393B9e1E162ed3EF8187082511d20Be28d1";
            readonly gatedRWA: "0xFc6bDE32f79ad43696abc6A2a6291bfA8AF1D249";
        };
        readonly deployBlock: 26371173;
        readonly groups: {
            readonly KYC_VERIFIED: 15;
            readonly ACCREDITED_INVESTOR: 16;
            readonly HK_RESIDENT: 17;
        };
    };
};
export type NetworkName = keyof typeof DEPLOYMENTS;
