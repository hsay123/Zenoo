/**
 * E2E wallet login helper.
 *
 * Installs a deterministic EIP-6963 wallet whose signatures come from a local
 * viem key — real secp256k1 signatures, not fakes — and drives Privy's real
 * SIWE login. This is the same mechanism `scripts/capture-session-auto.mjs`
 * uses to capture reusable storage states, factored out so a spec can mint a
 * brand-new identity per run (a genuine first-time onboarding account).
 */
import type { Page } from "playwright/test";
import { createPublicClient, createWalletClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import {
  generatePrivateKey,
  privateKeyToAccount,
  type PrivateKeyAccount,
} from "viem/accounts";

/** A disposable identity: a new wallet, and therefore a new backend user. */
export function freshAccount(): PrivateKeyAccount {
  return privateKeyToAccount(generatePrivateKey());
}

/** Install the mock EIP-6963 wallet backed by the given key. */
export async function installWallet(page: Page, account: PrivateKeyAccount): Promise<void> {
  await page.exposeFunction("__e2eSignMessage", async (payload: unknown) => {
    if (typeof payload === "string" && /^0x[0-9a-fA-F]*$/.test(payload)) {
      return account.signMessage({ message: { raw: payload as `0x${string}` } });
    }
    return account.signMessage({ message: String(payload) });
  });
  await page.exposeFunction("__e2eSignTypedData", async (payload: unknown) => {
    const typedData = typeof payload === "string" ? JSON.parse(payload) : payload;
    return account.signTypedData(typedData as never);
  });
  // Real transactions: signed with the test key and broadcast on Base Sepolia
  // (test funds only), so the UI's wallet-funding path runs end to end.
  const transport = http(process.env.E2E_RPC_URL);
  const chainWallet = createWalletClient({ account, chain: baseSepolia, transport });
  const chainReader = createPublicClient({ chain: baseSepolia, transport });
  await page.exposeFunction("__e2eSendTransaction", async (tx: { to: `0x${string}`; data?: `0x${string}`; value?: string }) =>
    chainWallet.sendTransaction({ to: tx.to, data: tx.data, value: tx.value ? BigInt(tx.value) : undefined }),
  );
  await page.exposeFunction("__e2eReceipt", async (hash: `0x${string}`) => {
    const receipt = await chainReader.getTransactionReceipt({ hash }).catch(() => null);
    return receipt ? { status: receipt.status === "success" ? "0x1" : "0x0" } : null;
  });

  await page.addInitScript(
    ({ address }: { address: string }) => {
      const bridge = window as unknown as {
        __e2eSignMessage: (p: unknown) => Promise<string>;
        __e2eSignTypedData: (p: unknown) => Promise<string>;
        __e2eSendTransaction: (tx: unknown) => Promise<string>;
        __e2eReceipt: (hash: string) => Promise<unknown>;
      };
      const provider = {
        isBraveWallet: true,
        isMetaMask: true,
        chainId: "0x1",
        selectedAddress: address,
        async request({ method, params }: { method: string; params?: unknown[] }) {
          switch (method) {
            case "eth_requestAccounts":
            case "eth_accounts":
              return [address];
            case "eth_chainId":
              return "0x1";
            case "net_version":
              return "1";
            case "personal_sign":
              return bridge.__e2eSignMessage(params?.[0]);
            case "eth_sign":
              return bridge.__e2eSignMessage(params?.[1]);
            case "eth_signTypedData_v4":
            case "eth_signTypedData":
              return bridge.__e2eSignTypedData(params?.[1]);
            case "wallet_switchEthereumChain":
            case "wallet_addEthereumChain":
              return null;
            case "wallet_getCapabilities":
              return {};
            case "eth_sendTransaction":
              return bridge.__e2eSendTransaction(params?.[0]);
            case "eth_getTransactionReceipt":
              return bridge.__e2eReceipt(String(params?.[0]));
            default:
              return null;
          }
        },
        on: () => {},
        removeListener: () => {},
        onchainChanged: () => {},
      };

      Object.defineProperty(window, "ethereum", { value: provider, configurable: true });

      const info = {
        uuid: "00000000-0000-4000-8000-000000000001",
        name: "Brave Wallet",
        icon: "data:image/svg+xml;base64,PHN2Zy8+",
        rdns: "com.brave.wallet",
      };
      const announce = () =>
        window.dispatchEvent(
          new CustomEvent("eip6963:announceProvider", {
            detail: Object.freeze({ info, provider }),
          }),
        );
      window.addEventListener("eip6963:requestProvider", announce);
      setTimeout(announce, 0);
      setTimeout(announce, 300);
      setTimeout(announce, 1000);
    },
    { address: account.address },
  );
}

/** Drive Privy's login modal through the installed wallet and settle. */
export async function loginWithWallet(
  page: Page,
  frontend = "https://localhost:3000",
): Promise<void> {
  await page.goto(`${frontend}/login`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.getByRole("button", { name: /sign in/i }).first().click();
  await page.waitForTimeout(1500);
  await page.getByText(/continue with a wallet/i).first().click({ timeout: 15_000 });
  await page.waitForTimeout(1000);
  // Privy lists popular wallets first; the injected test wallet is found by search.
  await page.getByPlaceholder(/search/i).fill("Brave");
  await page.waitForTimeout(1000);
  await page.getByText(/brave wallet/i).first().click({ timeout: 15_000 });
  await page.waitForURL((url) => /\/(workspace|onboarding)(\/|$)/.test(url.pathname), {
    timeout: 90_000,
  });
  // Let Privy finish persisting/rotating its session before we act.
  await page.waitForTimeout(2000);
}
