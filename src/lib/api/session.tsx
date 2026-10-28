"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/Button";
import { Wordmark } from "@/components/site/Wordmark";
import { Container } from "@/components/ui/Container";
import {
  currentUserSchema,
  createPlatformClient,
  isPlatformConfigured,
  platformPaths,
  PlatformError,
  type CurrentUser,
  type PlatformClient,
} from "./platform";

/**
 * Live session layer.
 *
 * Binds the platform client to the current Privy access token, then resolves
 * the signed-in user from the backend (`GET /api/me`). Nothing here is mocked:
 * an unauthenticated visitor is sent to `/login`, and a backend rejection is
 * surfaced rather than hidden.
 */

/** A platform client wired to the current Privy session, or null if the API
 *  base URL is not configured. */
export function usePlatformClient(): PlatformClient | null {
  const { getAccessToken } = usePrivy();
  return useMemo(() => {
    if (!isPlatformConfigured()) return null;
    return createPlatformClient(() => getAccessToken());
  }, [getAccessToken]);
}

export type Session = {
  user: CurrentUser;
  client: PlatformClient;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<Session | null>(null);

/** The signed-in user and a token-bound platform client. */
export function useSession(): Session {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used inside <SessionGate>.");
  }
  return context;
}

/** Full-height placeholder used while a session or a redirect resolves. */
export function SessionFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header>
        <Container size="wide" className="flex h-16 items-center">
          <Wordmark />
        </Container>
      </header>
      <main className="flex flex-1 items-center">
        <Container size="default" className="py-16">
          <div className="mx-auto max-w-md text-center">{children}</div>
        </Container>
      </main>
    </div>
  );
}

export function SessionGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { ready, authenticated, logout } = usePrivy();
  const client = usePlatformClient();

  const [user, setUser] = useState<CurrentUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Not signed in → back to the sign-in screen.
  useEffect(() => {
    if (ready && !authenticated) router.replace("/login");
  }, [ready, authenticated, router]);

  // Signed in → resolve the real profile from the API.
  useEffect(() => {
    if (!ready || !authenticated || !client) return;
    let active = true;
    client
      .get(currentUserSchema, platformPaths.me())
      .then((profile) => {
        if (!active) return;
        setUser(profile);
        setError(null);
      })
      .catch((cause) => {
        if (!active) return;
        setError(
          cause instanceof PlatformError
            ? `${cause.code} — ${cause.message}`
            : cause instanceof Error
              ? cause.message
              : "The session could not be verified.",
        );
      });
    return () => {
      active = false;
    };
  }, [ready, authenticated, client]);

  const signOut = async () => {
    await logout();
    router.replace("/login");
  };

  if (!isPlatformConfigured() || (ready && !authenticated)) {
    return (
      <SessionFrame>
        <p className="text-body text-ink-2">
          {!isPlatformConfigured()
            ? "NEXT_PUBLIC_API_BASE_URL is not set — the platform API is not configured."
            : "Redirecting to sign in…"}
        </p>
      </SessionFrame>
    );
  }

  if (!ready || (authenticated && !user && !error)) {
    return (
      <SessionFrame>
        <p className="text-body text-ink-2">Verifying your session…</p>
      </SessionFrame>
    );
  }

  if (error) {
    return (
      <SessionFrame>
        <h1 className="font-display text-display-sm text-ink">
          We couldn&apos;t load your session
        </h1>
        <p
          role="alert"
          className="mt-4 rounded-md border border-danger-line bg-danger-bg px-3.5 py-2.5 text-body-sm text-danger-fg"
        >
          {error}
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button onClick={() => window.location.reload()}>Retry</Button>
          <Button variant="secondary" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </SessionFrame>
    );
  }

  return (
    <SessionContext.Provider value={{ user: user!, client: client!, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}
