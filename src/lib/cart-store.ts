"use client";

import { useSyncExternalStore } from "react";
import {
  EMPTY_CART,
  addToCart,
  buildCart,
  clearCart,
  decrementCartItem,
  incrementCartItem,
  removeFromCart,
  updateCartQuantity,
  type Cart,
  type CartItem,
  type CartMutationResult,
} from "@/lib/cart";
import {
  CART_STORAGE_KEY,
  parseStoredCart,
  readCartItemsFromStorage,
  serializeCart,
  writeCartItemsToStorage,
} from "@/lib/cart-storage";

const listeners = new Set<() => void>();

let isStorageListenerAttached = false;
let cachedRawRead: string | null | undefined = undefined;
let lastKnownStorageRaw: string | null | undefined = undefined;
let cachedCart: Cart = EMPTY_CART;
let inMemoryFallbackCart: Cart | null = null;

function areCartItemsEqual(
  left: readonly CartItem[],
  right: readonly CartItem[]
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let i = 0; i < left.length; i += 1) {
    if (
      left[i].productId !== right[i].productId ||
      left[i].quantity !== right[i].quantity
    ) {
      return false;
    }
  }
  return true;
}

function readRawStorageSafe(): { readonly ok: true; readonly raw: string | null } | { readonly ok: false } {
  if (typeof window === "undefined") {
    return { ok: false };
  }
  try {
    return { ok: true, raw: window.localStorage.getItem(CART_STORAGE_KEY) };
  } catch {
    return { ok: false };
  }
}

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

function handleStorageEvent(event: StorageEvent): void {
  if (typeof window === "undefined") {
    return;
  }
  if (event.storageArea !== null) {
    try {
      if (event.storageArea !== window.localStorage) {
        return;
      }
    } catch {
      return;
    }
  }
  if (event.key !== null && event.key !== CART_STORAGE_KEY) {
    return;
  }

  inMemoryFallbackCart = null;
  cachedRawRead = undefined;
  notifyListeners();
}

function commitCart(nextCart: Cart): void {
  const preRead = readRawStorageSafe();
  if (preRead.ok) {
    lastKnownStorageRaw = preRead.raw;
  }

  const persisted = writeCartItemsToStorage(nextCart.items);
  if (persisted) {
    inMemoryFallbackCart = null;
    cachedCart = nextCart;
    const canonicalRaw = serializeCart(nextCart.items);
    cachedRawRead = canonicalRaw;
    lastKnownStorageRaw = canonicalRaw;
  } else {
    inMemoryFallbackCart = nextCart;
    cachedCart = nextCart;
  }

  notifyListeners();
}

/**
 * Deterministic empty cart snapshot used during SSR and initial React hydration.
 */
export function getServerCartSnapshot(): Cart {
  return EMPTY_CART;
}

/**
 * Returns the current client cart snapshot with O(1) referential stability
 * when underlying localStorage contents have not changed.
 */
export function getCartSnapshot(): Cart {
  if (typeof window === "undefined") {
    return EMPTY_CART;
  }

  const readResult = readRawStorageSafe();
  if (!readResult.ok) {
    return inMemoryFallbackCart ?? cachedCart;
  }

  const { raw } = readResult;

  if (inMemoryFallbackCart !== null) {
    if (raw === lastKnownStorageRaw) {
      return inMemoryFallbackCart;
    }
    inMemoryFallbackCart = null;
  }

  if (raw === cachedRawRead) {
    return cachedCart;
  }

  const nextCart =
    raw === null ? EMPTY_CART : buildCart(parseStoredCart(raw).items);

  if (
    cachedRawRead !== undefined &&
    areCartItemsEqual(cachedCart.items, nextCart.items)
  ) {
    cachedRawRead = raw;
    lastKnownStorageRaw = raw;
    return cachedCart;
  }

  cachedRawRead = raw;
  lastKnownStorageRaw = raw;
  cachedCart = nextCart;
  return cachedCart;
}

/**
 * Subscribes a React listener to cart mutations and cross-tab storage events.
 */
export function subscribeCart(listener: () => void): () => void {
  listeners.add(listener);

  if (typeof window !== "undefined" && !isStorageListenerAttached) {
    window.addEventListener("storage", handleStorageEvent);
    isStorageListenerAttached = true;
  }

  return () => {
    listeners.delete(listener);
    if (
      listeners.size === 0 &&
      isStorageListenerAttached &&
      typeof window !== "undefined"
    ) {
      window.removeEventListener("storage", handleStorageEvent);
      isStorageListenerAttached = false;
    }
  };
}

/**
 * Normalizes dirty or tampered localStorage cart payloads back to canonical allow-listed JSON.
 */
export function repairStoredCartIfNeeded(): void {
  const readResult = readCartItemsFromStorage();
  if (!readResult.available || !readResult.needsRepair) {
    return;
  }

  const canonicalCart = buildCart(readResult.items);
  const persisted = writeCartItemsToStorage(canonicalCart.items);
  if (!persisted) {
    return;
  }

  const canonicalRaw = serializeCart(canonicalCart.items);
  const itemsChanged = !areCartItemsEqual(cachedCart.items, canonicalCart.items);

  cachedRawRead = canonicalRaw;
  lastKnownStorageRaw = canonicalRaw;
  inMemoryFallbackCart = null;

  if (itemsChanged) {
    cachedCart = canonicalCart;
    notifyListeners();
  }
}

export const cartActions = {
  addItem(productId: string): CartMutationResult {
    const current = getCartSnapshot();
    const result = addToCart(current.items, productId);
    if (result.ok) {
      commitCart(result.cart);
    }
    return result;
  },

  updateItemQuantity(
    productId: string,
    nextQuantity: unknown
  ): CartMutationResult {
    const current = getCartSnapshot();
    const result = updateCartQuantity(current.items, productId, nextQuantity);
    if (result.ok) {
      commitCart(result.cart);
    }
    return result;
  },

  incrementItem(productId: string): CartMutationResult {
    const current = getCartSnapshot();
    const result = incrementCartItem(current.items, productId);
    if (result.ok) {
      commitCart(result.cart);
    }
    return result;
  },

  decrementItem(productId: string): CartMutationResult {
    const current = getCartSnapshot();
    const result = decrementCartItem(current.items, productId);
    if (result.ok) {
      commitCart(result.cart);
    }
    return result;
  },

  removeItem(productId: string): CartMutationResult {
    const current = getCartSnapshot();
    const result = removeFromCart(current.items, productId);
    if (result.ok) {
      commitCart(result.cart);
    }
    return result;
  },

  clearAll(): Cart {
    const nextCart = clearCart();
    commitCart(nextCart);
    return nextCart;
  },
} as const;

export interface UseCartResult {
  readonly cart: Cart;
  readonly addItem: (productId: string) => CartMutationResult;
  readonly updateItemQuantity: (
    productId: string,
    nextQuantity: unknown
  ) => CartMutationResult;
  readonly incrementItem: (productId: string) => CartMutationResult;
  readonly decrementItem: (productId: string) => CartMutationResult;
  readonly removeItem: (productId: string) => CartMutationResult;
  readonly clearAll: () => Cart;
}

/**
 * React hook subscribing to the browser-persisted cart store with deterministic SSR hydration.
 */
export function useCart(): UseCartResult {
  const cart = useSyncExternalStore(
    subscribeCart,
    getCartSnapshot,
    getServerCartSnapshot
  );

  return {
    cart,
    addItem: cartActions.addItem,
    updateItemQuantity: cartActions.updateItemQuantity,
    incrementItem: cartActions.incrementItem,
    decrementItem: cartActions.decrementItem,
    removeItem: cartActions.removeItem,
    clearAll: cartActions.clearAll,
  };
}
