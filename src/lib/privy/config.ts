/**
 * Privy browser configuration.
 *
 * The app id is a public identifier — the matching secret stays server-side in
 * `backend/` (`PRIVY_APP_SECRET`) and never reaches the browser.
 *
 * The chain is chosen by `NEXT_PUBLIC_CHAIN_ID` and must match the backend's
 * `CHAIN_ID`: 84532 = Base Sepolia (default), 8453 = Base. The two chains are
 * declared here (same shape as viem's `baseSepolia` / `base`) so the frontend
 * does not depend on viem, which is only installed transitively.
 */

export const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";

/**
 * Optional WalletConnect Cloud project id. When unset, Privy uses the one
 * configured for the app in the Privy dashboard.
 */
export const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || undefined;

export const baseSepolia = {
  id: 84532,
  name: "Base Sepolia",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://sepolia.base.org"] },
    public: { http: ["https://sepolia.base.org"] },
  },
  blockExplorers: {
    default: { name: "Basescan", url: "https://sepolia.basescan.org" },
  },
  testnet: true,
};

export const base = {
  id: 8453,
  name: "Base",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://mainnet.base.org"] },
    public: { http: ["https://mainnet.base.org"] },
  },
  blockExplorers: {
    default: { name: "Basescan", url: "https://basescan.org" },
  },
};

const CHAINS_BY_ID = { [baseSepolia.id]: baseSepolia, [base.id]: base } as const;

/** The configured chain; anything other than 8453 falls back to Base Sepolia. */
export const appChain =
  process.env.NEXT_PUBLIC_CHAIN_ID === String(base.id)
    ? CHAINS_BY_ID[base.id]
    : CHAINS_BY_ID[baseSepolia.id];
