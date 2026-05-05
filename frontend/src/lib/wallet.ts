import { BrowserProvider, JsonRpcSigner } from "ethers";
import {
  CHAIN_ID,
  RPC_URL,
  EXPLORER_URL,
  MAINNET_CHAIN_ID,
  MAINNET_RPC_URL,
  MAINNET_EXPLORER_URL,
} from "./contracts";

const HASHKEY_TESTNET = {
  chainId: "0x" + CHAIN_ID.toString(16),
  chainName: "HashKey Chain Testnet",
  nativeCurrency: { name: "HSK", symbol: "HSK", decimals: 18 },
  rpcUrls: [RPC_URL],
  blockExplorerUrls: [EXPLORER_URL],
};

const HASHKEY_MAINNET = {
  chainId: "0x" + MAINNET_CHAIN_ID.toString(16),
  chainName: "HashKey Chain",
  nativeCurrency: { name: "HSK", symbol: "HSK", decimals: 18 },
  rpcUrls: [MAINNET_RPC_URL],
  blockExplorerUrls: [MAINNET_EXPLORER_URL],
};

export type ChainTarget = "testnet" | "mainnet";

export async function connectWallet(target: ChainTarget): Promise<{
  provider: BrowserProvider;
  signer: JsonRpcSigner;
  address: string;
}> {
  if (!window.ethereum) {
    throw new Error("MetaMask not found. Please install MetaMask.");
  }

  const desiredChainId = target === "mainnet" ? MAINNET_CHAIN_ID : CHAIN_ID;
  const params = target === "mainnet" ? HASHKEY_MAINNET : HASHKEY_TESTNET;

  const provider = new BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);

  const network = await provider.getNetwork();
  if (Number(network.chainId) !== desiredChainId) {
    try {
      await provider.send("wallet_switchEthereumChain", [{ chainId: params.chainId }]);
    } catch (switchError: unknown) {
      const err = switchError as { code?: number; data?: { originalError?: { code?: number } } };
      const isChainNotAdded =
        err.code === 4902 ||
        err.data?.originalError?.code === 4902 ||
        String(switchError).includes("4902");
      if (isChainNotAdded) {
        await provider.send("wallet_addEthereumChain", [params]);
      } else {
        throw switchError;
      }
    }
    // Re-validate chain after switch — MetaMask may resolve `wallet_switchEthereumChain`
    // against a *different* RPC entry the user already has saved for this chainId.
    // We can't guarantee the RPC matches our canonical mainnet.hsk.xyz, but we can
    // at least confirm the chainId itself is what we asked for.
    const freshProvider = new BrowserProvider(window.ethereum);
    const freshNet = await freshProvider.getNetwork();
    if (Number(freshNet.chainId) !== desiredChainId) {
      throw new Error(
        `Chain switch failed: expected ${desiredChainId}, got ${freshNet.chainId}`,
      );
    }
    const signer = await freshProvider.getSigner();
    const address = await signer.getAddress();
    return { provider: freshProvider, signer, address };
  }

  const signer = await provider.getSigner();
  const address = await signer.getAddress();

  return { provider, signer, address };
}

export async function signMessage(message: string): Promise<string> {
  if (!window.ethereum) throw new Error("MetaMask not found");
  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  return signer.signMessage(message);
}
