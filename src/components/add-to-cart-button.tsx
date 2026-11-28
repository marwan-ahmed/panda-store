"use client";

import { useLayoutEffect, useState } from "react";
import { useCart } from "@/lib/cart-store";

export interface AddToCartButtonProps {
  readonly productId: string;
  readonly productName: string;
}

type AddFeedback =
  | { readonly kind: "status"; readonly message: string }
  | { readonly kind: "alert"; readonly message: string };

/**
 * Client leaf button that adds one unit of a catalog product to the cart,
 * surfaces inline Arabic status or max-limit feedback, and clears transient
 * feedback when hidden by React Activity.
 */
export function AddToCartButton({
  productId,
  productName,
}: AddToCartButtonProps) {
  const { addItem } = useCart();
  const [feedback, setFeedback] = useState<AddFeedback | null>(null);

  useLayoutEffect(() => {
    return () => {
      setFeedback(null);
    };
  }, []);

  function handleAddToCart() {
    const result = addItem(productId);
    if (result.ok) {
      setFeedback({
        kind: "status",
        message: `تمت إضافة ${productName} إلى السلة.`,
      });
      return;
    }

    setFeedback({
      kind: "alert",
      message: result.message,
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleAddToCart}
        className="inline-flex w-full cursor-pointer items-center justify-center rounded-xl border border-emerald-700 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:border-emerald-500 dark:bg-neutral-900 dark:text-emerald-300 dark:hover:bg-neutral-800"
      >
        أضف إلى السلة
      </button>

      {feedback?.kind === "status" ? (
        <p
          role="status"
          aria-live="polite"
          className="text-xs font-medium text-emerald-700 dark:text-emerald-400"
        >
          {feedback.message}
        </p>
      ) : null}

      {feedback?.kind === "alert" ? (
        <p
          role="alert"
          className="text-xs font-medium text-red-700 dark:text-red-400"
        >
          {feedback.message}
        </p>
      ) : null}
    </div>
  );
}
