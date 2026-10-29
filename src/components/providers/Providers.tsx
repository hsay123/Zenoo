"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import type { ReactNode } from "react";
import { appChain, privyAppId, walletConnectProjectId } from "@/lib/privy/config";

/**
 * Client-side providers for the whole app.
 *
 * Privy is the real authentication boundary: email (OTP) and wallet login, an
 * embedded wallet created for users who do not have one, and the configured
 * Base chain (Base Sepolia by default) as the only supported chain. The
 * `usePrivy` / `getAccessToken` hooks used by the API layer only exist beneath
 * this provider.
 */
export function Providers({ children }: { children: ReactNode }) {
  if (!privyAppId) {
    throw new Error(
      "NEXT_PUBLIC_PRIVY_APP_ID is not set — authentication cannot start.",
    );
  }

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        loginMethods: ["email", "wallet"],
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
        },
        // No `defaultChain`: Privy then leaves external wallets on whatever
        // chain they are on instead of prompting a switch to the app chain
        // during login (some wallets outright reject a connection when an
        // unsupported testnet is the default chain). Embedded wallets still
        // start on supportedChains[0] = the configured Base chain.
        supportedChains: [appChain],
        // WalletConnect is listed explicitly (it is also in Privy's default
        // list) so mobile wallets such as Cake Wallet can connect by QR code.
        walletConnectCloudProjectId: walletConnectProjectId,
        appearance: {
          theme: "light",
          walletList: ["detected_wallets", "metamask", "coinbase_wallet", "rainbow", "wallet_connect"],
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
