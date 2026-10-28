import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/site/Wordmark";
import { Container } from "@/components/ui/Container";
import { Info } from "@/components/ui/icons";

/**
 * Shell for the authentication screens.
 *
 * Deliberately minimal chrome — no full product navigation while
 * unauthenticated. A persistent preview notice states plainly that no
 * authentication service is connected in this build, so the screens never
 * imply a session that does not exist.
 */
export function AuthShell({
  title,
  subtitle,
  aside,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  aside?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="relative flex min-h-full flex-1 flex-col">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(101,71,228,0.10),transparent_70%)]"
      />

      <header className="relative">
        <Container size="wide" className="flex h-16 items-center sm:h-[72px]">
          <Wordmark />
          <Link
            href="/"
            className="ml-auto text-body-sm font-medium text-ink-2 transition-colors hover:text-ink"
          >
            Back to site
          </Link>
        </Container>
      </header>

      <main id="main" className="relative flex flex-1 items-center">
        <Container size="default" className="py-10 sm:py-14">
          <div className="grid items-start gap-12 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-5 lg:pt-6">
              <h1 className="text-display-md text-ink">{title}</h1>
              <p className="mt-4 measure-tight text-body text-ink-2">{subtitle}</p>
              {aside ? <div className="mt-8">{aside}</div> : null}
            </div>

            <div className="lg:col-span-7">
              <div className="rounded-2xl border border-line bg-surface p-6 shadow-[0_24px_60px_-40px_rgba(22,19,14,0.35)] sm:p-8">
                <div className="mb-6 flex items-start gap-2.5 rounded-lg border border-info-line bg-info-bg px-3.5 py-2.5">
                  <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-info-fg" />
                  <p className="text-caption text-info-fg">
                    Sign-in is handled by Privy. Your session is issued here and
                    verified by the platform API on every request.
                  </p>
                </div>
                {children}
                {footer ? (
                  <div className="mt-6 border-t border-line pt-5">{footer}</div>
                ) : null}
              </div>
            </div>
          </div>
        </Container>
      </main>
    </div>
  );
}
