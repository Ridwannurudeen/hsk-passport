import { BrowserProvider, JsonRpcSigner } from "ethers";
import { CHAIN_ID, RPC_URL } from "./contracts";

const HASHKEY_TESTNET = {
  chainId: "0x" + CHAIN_ID.toString(16),
  chainName: "HashKey Chain Testnet",
  nativeCurrency: { name: "HSK", symbol: "HSK", decimals: 18 },
  rpcUrls: [RPC_URL],
  blockExplorerUrls: ["https://hashkey-testnet.blockscout.com"],
};

export async function connectWallet(): Promise<{
  provider: BrowserProvider;
  signer: JsonRpcSigner;
  address: string;
}> {
  if (!window.ethereum) {
    throw new Error("MetaMask not found. Please install MetaMask.");
  }

  const provider = new BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);

  const network = await provider.getNetwork();
  if (Number(network.chainId) !== CHAIN_ID) {
    try {
      await provider.send("wallet_switchEthereumChain", [
        { chainId: HASHKEY_TESTNET.chainId },
      ]);
    } catch (switchError: unknown) {
      // Handle both direct 4902 and wrapped -32603 with originalError.code 4902
      const err = switchError as { code?: number; data?: { originalError?: { code?: number } } };
      const isChainNotAdded =
        err.code === 4902 ||
        err.data?.originalError?.code === 4902 ||
        String(switchError).includes("4902");
      if (isChainNotAdded) {
        await provider.send("wallet_addEthereumChain", [HASHKEY_TESTNET]);
      } else {
        throw switchError;
      }
    }
    // Re-create provider after chain switch to pick up the new chain
    const freshProvider = new BrowserProvider(window.ethereum);
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
