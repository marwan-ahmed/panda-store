"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart-store";

/**
 * Client link to the independent /cart route displaying the live total piece count.
 */
export function CartHeaderLink() {
  const { cart } = useCart();

  return (
    <Link
      href="/cart"
      className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-900 transition-colors hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
    >
      <span>السلة</span>
      <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-emerald-700 px-2 py-0.5 text-xs font-bold text-white dark:bg-emerald-600">
        {cart.itemCount}
      </span>
    </Link>
  );
}
