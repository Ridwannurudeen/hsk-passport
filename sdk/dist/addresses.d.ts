/** Deployed contract addresses per network (v5 — on-chain expiry + timelock-gated slashing) */
export declare const DEPLOYMENTS: {
    readonly "hashkey-testnet": {
        readonly chainId: 133;
        readonly rpcUrl: "https://testnet.hsk.xyz";
        readonly explorerUrl: "https://hashkey-testnet.blockscout.com";
        readonly contracts: {
            readonly semaphore: "0xd09e8Aec6B6A36588E7A105f606A9fe9a134CFE9";
            readonly credentialRegistry: "0x20265dAe4711B3CeF88D7078bf1290f815279De1";
            readonly hskPassport: "0x7d2E692A08f2fb0724238396e0436106b4FbD792";
            readonly demoIssuer: "0xBf7d566B8077A098F6844fb6b827D2A4118C88C3";
            readonly gatedRWA: "0xb6955cb3e442c4222fFc3b92c322851109d0b9c9";
            readonly kycGatedAirdrop: "0x71c96016CBCAeE7B2Edc8b40Fec45de1d16Fb4b8";
            readonly kycGatedLending: "0x37179886986bd35a4d580f157f55f249c43A0BFD";
            readonly jurisdictionGatedPool: "0x305f5F0b44d541785305DaDb372f118A9284Ce4D";
            readonly hashKeyDIDBridge: "0xF072D06adcA2B6d5941bde6cc87f41feC5F5Ea7a";
            readonly hashKeyKYCImporter: "0x5431ae6D2f5c3Ad3373B7B4DD4066000D681f5B8";
            readonly issuerRegistry: "0x5BbAe6e90b82c7c51EbA9cA6D844D698dE2eb504";
            readonly timelock: "0xb07Bc78559CbDe44c047b1dC3028d13c4f863D8A";
        };
        readonly deployBlock: 26800000;
        readonly groups: {
            readonly KYC_VERIFIED: 25;
            readonly ACCREDITED_INVESTOR: 26;
            readonly HK_RESIDENT: 27;
            readonly SG_RESIDENT: 28;
            readonly AE_RESIDENT: 29;
        };
    };
};
export type NetworkName = keyof typeof DEPLOYMENTS;
