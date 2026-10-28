import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";

/**
 * Public marketing layout.
 *
 * Route group `(marketing)` reads clean URLs (`/`, `/platform`, …) while
 * keeping the public chrome separate from the authenticated product
 * shell in `(product)` and the auth screens in `(auth)`.
 */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
