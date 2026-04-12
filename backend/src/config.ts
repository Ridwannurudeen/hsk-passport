export const CONFIG = {
  rpcUrl: process.env.RPC_URL || "https://testnet.hsk.xyz",
  chainId: 133,
  hskPassport: "0xb430F30376344303560c0554DC94766D780a5c64",
  credentialRegistry: "0x20265dAe4711B3CeF88D7078bf1290f815279De1",
  demoIssuer: "0x77bE0CD574a3602923E2a0C3B42F01C11112A170",
  gatedRWA: "0x5f7274C64C63Ea73144cf539aBF2504eB3208f25",
  deployBlock: 26410000,
  groups: {
    KYC_VERIFIED: 20,
    ACCREDITED_INVESTOR: 21,
    HK_RESIDENT: 22,
  },
  port: Number(process.env.PORT || 4021),
  dbPath: process.env.DB_PATH || "./hsk-passport.db",
  pollIntervalMs: 10_000,
  blockChunkSize: 5000,
} as const;
