import Link from "next/link";
import { CartHeaderLink } from "@/components/cart-header-link";

/**
 * Persistent Arabic RTL storefront header linking to the catalog home and /cart.
 */
export function SiteHeader() {
  return (
    <header className="border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="text-xl font-bold text-neutral-900 transition-colors hover:text-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:text-neutral-100 dark:hover:text-emerald-400"
        >
          باندا ستور
        </Link>

        <nav aria-label="التنقل السريع">
          <CartHeaderLink />
        </nav>
      </div>
    </header>
  );
}
