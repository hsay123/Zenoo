/**
 * Privy browser configuration.
 *
 * The app id is a public identifier — the matching secret stays server-side in
 * `backend/` (`PRIVY_APP_SECRET`) and never reaches the browser.
 *
 * Monad testnet is declared explicitly: `@privy-io/chains` ships Monad
 * mainnet (id 143) but not testnet (id 10143), and the RPC here matches the
 * backend's `MONAD_RPC_URL`.
 */

export const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";

export const monadTestnet = {
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://testnet-rpc.monad.xyz"] },
    public: { http: ["https://testnet-rpc.monad.xyz"] },
  },
  blockExplorers: {
    default: {
      name: "Monad Testnet Explorer",
      url: "https://testnet.monadexplorer.com",
    },
  },
  testnet: true,
};
