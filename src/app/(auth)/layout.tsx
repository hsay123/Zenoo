import Link from "next/link";
import { Container } from "@/components/ui/Container";

/**
 * Authentication route group layout.
 *
 * No marketing header or footer — these screens are focused. The only
 * chrome is the wordmark inside each `AuthShell` and a small legal line
 * here.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      {children}
      <footer className="border-t border-line">
        <Container
          size="wide"
          className="flex flex-wrap items-center justify-between gap-3 py-5"
        >
          <p className="text-caption text-ink-4">
            © {new Date().getFullYear()} Zeno
          </p>
          <ul className="flex items-center gap-5">
            <li>
              <Link href="/privacy" className="link-quiet text-caption">
                Privacy
              </Link>
            </li>
            <li>
              <Link href="/terms" className="link-quiet text-caption">
                Terms
              </Link>
            </li>
            <li>
              <Link href="/contact" className="link-quiet text-caption">
                Contact
              </Link>
            </li>
          </ul>
        </Container>
      </footer>
    </div>
  );
}
