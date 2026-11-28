import {
  EMPTY_CART,
  sanitizeCartItems,
  type CartItem,
} from "@/lib/cart";

export const CART_STORAGE_KEY = "panda-store:cart:v1";
export const CART_STORAGE_VERSION = 1;
export const MAX_CART_STORAGE_BYTES = 65536;
export const MAX_RAW_STORAGE_ITEMS = 200;

const UTF8_ENCODER = new TextEncoder();

export interface ParsedStoredCart {
  readonly items: readonly CartItem[];
  readonly needsRepair: boolean;
}

export interface StorageReadResult {
  readonly items: readonly CartItem[];
  readonly needsRepair: boolean;
  readonly available: boolean;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyAllowedKeys(
  record: Record<string, unknown>,
  allowedKeyA: string,
  allowedKeyB: string
): boolean {
  for (const key of Object.getOwnPropertyNames(record)) {
    if (key !== allowedKeyA && key !== allowedKeyB) {
      return false;
    }
  }
  return true;
}

function exceedsStorageByteLimit(rawJson: string): boolean {
  if (rawJson.length > MAX_CART_STORAGE_BYTES) {
    return true;
  }
  // ASCII strings have byteLength === length; only invoke TextEncoder when multi-byte chars could push past limit.
  if (rawJson.length * 3 > MAX_CART_STORAGE_BYTES) {
    return UTF8_ENCODER.encode(rawJson).byteLength > MAX_CART_STORAGE_BYTES;
  }
  return false;
}

function resolveBrowserStorage(storage?: Storage): Storage | null {
  if (storage !== undefined) {
    return storage;
  }
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Parses and sanitizes an untrusted JSON cart payload from browser storage.
 * Enforces byte and item bounds, strict schema version === 1 when present,
 * allow-listed { productId, quantity } DTOs, and catalog-authoritative IDs.
 */
export function parseStoredCart(rawJson: string | null): ParsedStoredCart {
  if (rawJson === null) {
    return { items: EMPTY_CART.items, needsRepair: false };
  }

  if (typeof rawJson !== "string" || exceedsStorageByteLimit(rawJson)) {
    return { items: EMPTY_CART.items, needsRepair: true };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return { items: EMPTY_CART.items, needsRepair: true };
  }

  let rawItems: readonly unknown[];
  let needsRepair = false;

  if (Array.isArray(parsed)) {
    rawItems = parsed;
    needsRepair = true;
  } else if (isPlainRecord(parsed)) {
    if (Object.hasOwn(parsed, "version")) {
      if (parsed.version !== CART_STORAGE_VERSION) {
        return { items: EMPTY_CART.items, needsRepair: true };
      }
    } else {
      needsRepair = true;
    }

    if (!Object.hasOwn(parsed, "items") || !Array.isArray(parsed.items)) {
      return { items: EMPTY_CART.items, needsRepair: true };
    }

    if (!hasOnlyAllowedKeys(parsed, "version", "items")) {
      needsRepair = true;
    }

    rawItems = parsed.items;
  } else {
    return { items: EMPTY_CART.items, needsRepair: true };
  }

  if (rawItems.length > MAX_RAW_STORAGE_ITEMS) {
    needsRepair = true;
  }

  const boundedItems =
    rawItems.length > MAX_RAW_STORAGE_ITEMS
      ? rawItems.slice(0, MAX_RAW_STORAGE_ITEMS)
      : rawItems;

  if (!needsRepair) {
    for (const entry of boundedItems) {
      if (
        !isPlainRecord(entry) ||
        !hasOnlyAllowedKeys(entry, "productId", "quantity")
      ) {
        needsRepair = true;
        break;
      }
    }
  }

  const sanitizedItems = sanitizeCartItems(boundedItems);
  if (sanitizedItems.length !== boundedItems.length) {
    needsRepair = true;
  }

  return {
    items: sanitizedItems,
    needsRepair,
  };
}

/**
 * Serializes sanitized allow-listed cart items into canonical versioned JSON.
 */
export function serializeCart(items: readonly CartItem[]): string {
  const sanitized = sanitizeCartItems(items).map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
  }));

  return JSON.stringify({
    version: CART_STORAGE_VERSION,
    items: sanitized,
  });
}

/**
 * Reads and sanitizes cart items from localStorage without throwing on SecurityError.
 */
export function readCartItemsFromStorage(
  storage?: Storage
): StorageReadResult {
  const targetStorage = resolveBrowserStorage(storage);
  if (!targetStorage) {
    return {
      items: EMPTY_CART.items,
      needsRepair: false,
      available: false,
    };
  }

  try {
    const raw = targetStorage.getItem(CART_STORAGE_KEY);
    const parsed = parseStoredCart(raw);
    return {
      items: parsed.items,
      needsRepair: parsed.needsRepair,
      available: true,
    };
  } catch {
    return {
      items: EMPTY_CART.items,
      needsRepair: false,
      available: false,
    };
  }
}

/**
 * Persists sanitized allow-listed cart items to localStorage without throwing on QuotaExceededError or SecurityError.
 */
export function writeCartItemsToStorage(
  items: readonly CartItem[],
  storage?: Storage
): boolean {
  const targetStorage = resolveBrowserStorage(storage);
  if (!targetStorage) {
    return false;
  }

  const payload = serializeCart(items);
  if (exceedsStorageByteLimit(payload)) {
    return false;
  }

  try {
    targetStorage.setItem(CART_STORAGE_KEY, payload);
    return true;
  } catch {
    return false;
  }
}
