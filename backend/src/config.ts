export const CONFIG = {
  rpcUrl: process.env.RPC_URL || "https://testnet.hsk.xyz",
  chainId: 133,
  hskPassport: "0x79A0E1160FA829595f45f0479782095ed497d5E6",
  credentialRegistry: "0x20265dAe4711B3CeF88D7078bf1290f815279De1",
  demoIssuer: "0xD6CB3393B9e1E162ed3EF8187082511d20Be28d1",
  gatedRWA: "0xFc6bDE32f79ad43696abc6A2a6291bfA8AF1D249",
  deployBlock: 26371173,
  groups: {
    KYC_VERIFIED: 15,
    ACCREDITED_INVESTOR: 16,
    HK_RESIDENT: 17,
  },
  port: Number(process.env.PORT || 4021),
  dbPath: process.env.DB_PATH || "./hsk-passport.db",
  pollIntervalMs: 10_000,
  blockChunkSize: 5000,
} as const;
