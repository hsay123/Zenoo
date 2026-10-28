"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import {
  roleFromPath,
  workspaceOrder,
  workspaceRoles,
  type WorkspaceRole,
} from "@/lib/content/workspace";
import { useSession } from "@/lib/api/session";
import { Wordmark } from "@/components/site/Wordmark";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Info } from "@/components/ui/icons";
import { cn } from "@/lib/utils/cn";

const isWorkspaceRole = (value: string): value is WorkspaceRole =>
  value === "buyer" ||
  value === "contributor" ||
  value === "reviewer" ||
  value === "admin";

/**
 * Product shell.
 *
 * Dense, utilitarian chrome for the authenticated area. The role tabs and
 * sign-out come from the live session (`GET /api/me`): a non-admin only sees
 * their own workspace and is redirected back into it if they stray.
 */
export function ProductShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useSession();

  const isAdmin = user.role === "admin";
  const pathRole = roleFromPath(pathname);
  const visibleRoles: WorkspaceRole[] = isAdmin
    ? workspaceOrder
    : workspaceOrder.filter((key) => key === user.role);

  const ownHome =
    !isAdmin && isWorkspaceRole(user.role)
      ? workspaceRoles[user.role].home
      : "/workspace/buyer";

  useEffect(() => {
    if (!isAdmin && pathRole !== user.role) router.replace(ownHome);
  }, [isAdmin, pathRole, router, user.role, ownHome]);

  const role = visibleRoles.includes(pathRole)
    ? pathRole
    : (visibleRoles[0] ?? "buyer");
  const config = workspaceRoles[role];

  const isActive = (href: string, prefix = false) => {
    if (href === config.home) {
      // Only exact match is "Dashboard/Tasks/Queue"; nested routes highlight
      // their own nav entry, not the home tab.
      if (pathname === href) return true;
      const others = config.nav.filter((item) => item.href !== config.home);
      return !others.some((item) => pathname.startsWith(item.href));
    }
    return prefix ? pathname.startsWith(href) : pathname === href;
  };

  return (
    <div className="flex min-h-full flex-1 flex-col bg-surface-muted">
      <header className="sticky top-0 z-40 border-b border-line bg-surface">
        <Container size="wide" className="flex h-14 items-center gap-4">
          <Wordmark href="/workspace" />

          <span aria-hidden className="hidden h-5 w-px bg-line sm:block" />

          {/* Role switcher — one tab for a single-role user, all for admin. */}
          {visibleRoles.length > 1 ? (
            <nav
              aria-label="Workspace role"
              className="hidden items-center gap-1 sm:flex"
            >
              {visibleRoles.map((key) => {
                const item = workspaceRoles[key];
                const active = key === role;
                return (
                  <Link
                    key={key}
                    href={item.home}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "rounded-md px-2.5 py-1.5 text-body-sm font-medium transition-colors",
                      active
                        ? "bg-accent-50 text-accent-800"
                        : "text-ink-2 hover:bg-surface-muted hover:text-ink",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          ) : (
            <span className="rounded-md bg-surface-muted px-2.5 py-1.5 text-body-sm font-medium text-ink-2">
              {config.label}
            </span>
          )}

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-caption text-ink-4 sm:inline">
              {user.email ?? user.wallet_address ?? "Signed in"} · {user.role}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void signOut()}
            >
              Sign out
            </Button>
          </div>
        </Container>

        {/* Section nav */}
        <Container size="wide">
          <nav
            aria-label={`${config.label} sections`}
            className="-mb-px flex items-center gap-1 overflow-x-auto"
          >
            {config.nav.map((item) => {
              const active = isActive(item.href, item.prefix);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "whitespace-nowrap border-b-2 px-3 py-3 text-body-sm font-medium transition-colors",
                    active
                      ? "border-accent-600 text-ink"
                      : "border-transparent text-ink-3 hover:border-line-strong hover:text-ink",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </Container>
      </header>

      {/* Live session strip */}
      <div className="border-b border-info-line bg-info-bg">
        <Container size="wide" className="flex items-center gap-2.5 py-2">
          <Info aria-hidden className="h-3.5 w-3.5 shrink-0 text-info-fg" />
          <p className="text-caption text-info-fg">
            Signed in with a platform-verified session. Every workspace screen
            reads live data from the platform API.
          </p>
        </Container>
      </div>

      <main id="main" className="flex-1">
        <Container size="wide" className="py-8">
          {children}
        </Container>
      </main>
    </div>
  );
}
