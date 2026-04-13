export const CONFIG = {
  rpcUrl: process.env.RPC_URL || "https://testnet.hsk.xyz",
  chainId: 133,
  hskPassport: "0x7d2E692A08f2fb0724238396e0436106b4FbD792",
  credentialRegistry: "0x20265dAe4711B3CeF88D7078bf1290f815279De1",
  demoIssuer: "0xBf7d566B8077A098F6844fb6b827D2A4118C88C3",
  gatedRWA: "0xb6955cb3e442c4222fFc3b92c322851109d0b9c9",
  deployBlock: 26800000,
  groups: {
    KYC_VERIFIED: 25,
    ACCREDITED_INVESTOR: 26,
    HK_RESIDENT: 27,
  },
  port: Number(process.env.PORT || 4021),
  dbPath: process.env.DB_PATH || "./hsk-passport.db",
  pollIntervalMs: 10_000,
  blockChunkSize: 5000,
} as const;
