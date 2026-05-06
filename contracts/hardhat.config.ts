import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const DEPLOY_ACCOUNTS =
  PRIVATE_KEY && /^0x[a-fA-F0-9]{64}$/.test(PRIVATE_KEY) ? [PRIVATE_KEY] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.23",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    "hashkey-testnet": {
      url: "https://testnet.hsk.xyz",
      chainId: 133,
      accounts: DEPLOY_ACCOUNTS,
    },
    "hashkey-mainnet": {
      url: "https://mainnet.hsk.xyz",
      chainId: 177,
      accounts: DEPLOY_ACCOUNTS,
    },
  },
};

export default config;
