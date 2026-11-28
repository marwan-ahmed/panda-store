"use client";

import Image from "next/image";
import Link from "next/link";
import { useLayoutEffect, useState } from "react";
import {
  MIN_CART_QUANTITY,
  formatCartTotalIqd,
  parseQuantityInput,
} from "@/lib/cart";
import { useCart } from "@/lib/cart-store";
import { formatPriceIqd } from "@/lib/products";

/**
 * Interactive Arabic RTL shopping cart view with bounded quantity controls (1-99),
 * item removal, cart clearing, and catalog-authoritative integer IQD totals.
 */
export function CartView() {
  const {
    cart,
    incrementItem,
    decrementItem,
    updateItemQuantity,
    removeItem,
    clearAll,
  } = useCart();

  const [draftQuantities, setDraftQuantities] = useState<
    Readonly<Record<string, string>>
  >({});
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  useLayoutEffect(() => {
    return () => {
      setDraftQuantities({});
      setAlertMessage(null);
    };
  }, []);

  function clearDraftFor(productId: string) {
    setDraftQuantities((prev) => {
      if (!Object.hasOwn(prev, productId)) {
        return prev;
      }
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  }

  function handleIncrement(productId: string) {
    clearDraftFor(productId);
    const result = incrementItem(productId);
    if (!result.ok) {
      setAlertMessage(result.message);
      return;
    }
    setAlertMessage(null);
  }

  function handleDecrement(productId: string) {
    clearDraftFor(productId);
    const result = decrementItem(productId);
    if (!result.ok) {
      setAlertMessage(result.message);
      return;
    }
    setAlertMessage(null);
  }

  function handleQuantityChange(productId: string, rawValue: string) {
    const parsed = parseQuantityInput(rawValue);
    if (!parsed.ok) {
      setDraftQuantities((prev) => ({ ...prev, [productId]: rawValue }));
      setAlertMessage(parsed.message);
      return;
    }

    const result = updateItemQuantity(productId, parsed.quantity);
    if (!result.ok) {
      setDraftQuantities((prev) => ({ ...prev, [productId]: rawValue }));
      setAlertMessage(result.message);
      return;
    }

    clearDraftFor(productId);
    setAlertMessage(null);
  }

  function handleQuantityBlur(productId: string) {
    clearDraftFor(productId);
  }

  function handleRemove(productId: string) {
    clearDraftFor(productId);
    removeItem(productId);
    setAlertMessage(null);
  }

  function handleClearAll() {
    setDraftQuantities({});
    setAlertMessage(null);
    clearAll();
  }

  const formattedCartTotal = formatCartTotalIqd(cart.cartTotalIqd);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-neutral-900 sm:text-3xl dark:text-neutral-100">
          سلة التسوق
        </h1>
        <Link
          href="/"
          className="inline-flex items-center rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-800 transition-colors hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
        >
          العودة إلى الكتالوج
        </Link>
      </div>

      {alertMessage ? (
        <div
          role="alert"
          className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300"
        >
          {alertMessage}
        </div>
      ) : null}

      {cart.lines.length === 0 ? (
        <section className="rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <p className="mb-4 text-base text-neutral-700 dark:text-neutral-300">
            سلة التسوق فارغة حالياً.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-neutral-600 dark:text-neutral-400">
            <div>
              <span>عدد القطع: </span>
              <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                {cart.itemCount}
              </span>
            </div>
            <div>
              <span>المجموع الكلي: </span>
              <span className="font-bold text-emerald-700 dark:text-emerald-400">
                {formattedCartTotal}
              </span>
            </div>
          </div>
        </section>
      ) : (
        <div className="flex flex-col gap-6">
          <ul className="flex flex-col gap-4">
            {cart.lines.map((line) => {
              const { product, quantity, lineSubtotalIqd } = line;
              const inputId = `cart-qty-${product.id}`;
              const displayValue = Object.hasOwn(draftQuantities, product.id)
                ? draftQuantities[product.id]
                : String(quantity);

              return (
                <li
                  key={product.id}
                  className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-neutral-100 bg-neutral-50 p-2 dark:border-neutral-800 dark:bg-neutral-950">
                      <Image
                        src={product.imageSrc}
                        alt={product.imageAlt}
                        width={96}
                        height={96}
                        unoptimized
                        className="h-full w-full object-contain"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                        {product.name}
                      </h2>
                      <p className="text-sm text-neutral-600 dark:text-neutral-300">
                        <span>سعر الوحدة: </span>
                        <span>{formatPriceIqd(product.priceIqd)}</span>
                      </p>
                      <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                        <span>المجموع الفرعي: </span>
                        <span>{formatCartTotalIqd(lineSubtotalIqd)}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleDecrement(product.id)}
                        disabled={quantity <= MIN_CART_QUANTITY}
                        aria-label={`إنقاص ${product.name}`}
                        className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-neutral-300 bg-white text-base font-bold text-neutral-800 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
                      >
                        −
                      </button>

                      <label htmlFor={inputId} className="sr-only">
                        {`كمية ${product.name}`}
                      </label>
                      <input
                        id={inputId}
                        type="text"
                        inputMode="numeric"
                        value={displayValue}
                        onChange={(event) =>
                          handleQuantityChange(product.id, event.target.value)
                        }
                        onBlur={() => handleQuantityBlur(product.id)}
                        className="h-9 w-16 rounded-lg border border-neutral-300 bg-white px-2 text-center text-sm font-semibold text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                      />

                      <button
                        type="button"
                        onClick={() => handleIncrement(product.id)}
                        aria-label={`زيادة ${product.name}`}
                        className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-neutral-300 bg-white text-base font-bold text-neutral-800 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
                      >
                        +
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemove(product.id)}
                      className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300 dark:hover:bg-red-900/50"
                    >
                      حذف
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex flex-col gap-1">
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                <span>إجمالي القطع: </span>
                <span className="font-bold text-neutral-900 dark:text-neutral-100">
                  {cart.itemCount}
                </span>
              </p>
              <p className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                <span>المجموع الكلي: </span>
                <span className="text-emerald-700 dark:text-emerald-400">
                  {formattedCartTotal}
                </span>
              </p>
            </div>

            <button
              type="button"
              onClick={handleClearAll}
              className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-800 transition-colors hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
            >
              إفراغ السلة
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
