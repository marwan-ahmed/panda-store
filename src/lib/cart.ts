import { getProductById, type Product } from "@/lib/products";

export const MIN_CART_QUANTITY = 1;
export const MAX_CART_QUANTITY = 99;

const ASCII_DIGITS_PATTERN = /^\d+$/;
const IQD_NUMBER_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

const INVALID_PRODUCT_MESSAGE = "المنتج المحدد غير متوفر في الكتالوج.";
const ITEM_NOT_FOUND_MESSAGE = "المنتج غير موجود في السلة.";
const INVALID_QUANTITY_MESSAGE = "يرجى إدخال كمية صحيحة بين 1 و99.";
const MAX_QUANTITY_MESSAGE =
  "تم بلوغ الحد الأقصى للكمية (99 قطعة) لهذا المنتج.";
const MIN_QUANTITY_MESSAGE =
  "الحد الأدنى للكمية هو قطعة واحدة؛ استخدم زر الحذف لإزالة المنتج.";

export interface CartItem {
  readonly productId: string;
  readonly quantity: number;
}

export interface CartLineItem {
  readonly product: Product;
  readonly quantity: number;
  readonly lineSubtotalIqd: number;
}

export interface Cart {
  readonly items: readonly CartItem[];
  readonly lines: readonly CartLineItem[];
  readonly itemCount: number;
  readonly cartTotalIqd: number;
}

export type CartMutationFailureReason =
  | "invalid_product"
  | "item_not_found"
  | "invalid_quantity"
  | "max_quantity_reached"
  | "min_quantity_reached";

export type CartMutationResult =
  | { readonly ok: true; readonly cart: Cart }
  | {
      readonly ok: false;
      readonly reason: CartMutationFailureReason;
      readonly message: string;
      readonly cart: Cart;
    };

export type QuantityParseResult =
  | { readonly ok: true; readonly quantity: number }
  | {
      readonly ok: false;
      readonly reason: "invalid_quantity" | "max_quantity_reached";
      readonly message: string;
    };

export const EMPTY_CART: Cart = Object.freeze({
  items: Object.freeze([]),
  lines: Object.freeze([]),
  itemCount: 0,
  cartTotalIqd: 0,
});

function isValidQuantityNumber(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= MIN_CART_QUANTITY &&
    value <= MAX_CART_QUANTITY
  );
}

function resolveCatalogProduct(productId: unknown): Product | undefined {
  if (typeof productId !== "string") {
    return undefined;
  }
  return getProductById(productId);
}

function failureResult(
  reason: CartMutationFailureReason,
  message: string,
  cart: Cart
): CartMutationResult {
  return { ok: false, reason, message, cart };
}

function resolveExistingCartItem(
  items: readonly CartItem[],
  productId: string
):
  | { readonly ok: true; readonly cart: Cart; readonly item: CartItem }
  | { readonly ok: false; readonly failure: CartMutationResult } {
  const currentCart = buildCart(items);
  const product = resolveCatalogProduct(productId);
  if (!product) {
    return {
      ok: false,
      failure: failureResult(
        "invalid_product",
        INVALID_PRODUCT_MESSAGE,
        currentCart
      ),
    };
  }

  const existing = currentCart.items.find(
    (item) => item.productId === product.id
  );
  if (!existing) {
    return {
      ok: false,
      failure: failureResult(
        "item_not_found",
        ITEM_NOT_FOUND_MESSAGE,
        currentCart
      ),
    };
  }

  return { ok: true, cart: currentCart, item: existing };
}

function replaceItemQuantity(
  cart: Cart,
  productId: string,
  quantity: number
): Cart {
  const nextItems = cart.items.map((item) =>
    item.productId === productId ? { productId, quantity } : item
  );
  return buildCart(nextItems);
}

/**
 * Validates that a cart item quantity is a safe integer within [1, 99].
 */
export function validateCartQuantity(quantity: unknown): number {
  if (typeof quantity !== "number") {
    throw new TypeError("Cart quantity must be a number");
  }
  if (
    !Number.isSafeInteger(quantity) ||
    quantity < MIN_CART_QUANTITY ||
    quantity > MAX_CART_QUANTITY
  ) {
    throw new RangeError(
      `Cart quantity must be an integer between ${MIN_CART_QUANTITY} and ${MAX_CART_QUANTITY}`
    );
  }
  return quantity;
}

/**
 * Parses a raw quantity string strictly as an integer in [1, 99] without rounding or coercion.
 */
export function parseQuantityInput(raw: string): QuantityParseResult {
  if (typeof raw !== "string") {
    return {
      ok: false,
      reason: "invalid_quantity",
      message: INVALID_QUANTITY_MESSAGE,
    };
  }

  const trimmed = raw.trim();
  if (!ASCII_DIGITS_PATTERN.test(trimmed)) {
    return {
      ok: false,
      reason: "invalid_quantity",
      message: INVALID_QUANTITY_MESSAGE,
    };
  }

  const normalized = trimmed.replace(/^0+/, "");
  if (normalized.length === 0) {
    return {
      ok: false,
      reason: "invalid_quantity",
      message: INVALID_QUANTITY_MESSAGE,
    };
  }

  // Any positive normalized digit string longer than 2 digits exceeds MAX_CART_QUANTITY (99).
  if (normalized.length > 2) {
    return {
      ok: false,
      reason: "max_quantity_reached",
      message: MAX_QUANTITY_MESSAGE,
    };
  }

  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < MIN_CART_QUANTITY) {
    return {
      ok: false,
      reason: "invalid_quantity",
      message: INVALID_QUANTITY_MESSAGE,
    };
  }

  if (parsed > MAX_CART_QUANTITY) {
    return {
      ok: false,
      reason: "max_quantity_reached",
      message: MAX_QUANTITY_MESSAGE,
    };
  }

  return { ok: true, quantity: parsed };
}

/**
 * Formats a non-negative safe-integer IQD cart total or line subtotal for Arabic display.
 */
export function formatCartTotalIqd(totalIqd: number): string {
  if (typeof totalIqd !== "number") {
    throw new TypeError("totalIqd must be a number");
  }
  if (!Number.isSafeInteger(totalIqd) || totalIqd < 0) {
    throw new RangeError("totalIqd must be a non-negative safe integer");
  }
  return `${IQD_NUMBER_FORMATTER.format(totalIqd)} د.ع`;
}

/**
 * Sanitizes untrusted cart item arrays into frozen allow-listed { productId, quantity } DTOs,
 * merging duplicate valid catalog IDs up to MAX_CART_QUANTITY.
 */
export function sanitizeCartItems(
  rawItems: readonly unknown[]
): readonly CartItem[] {
  if (!Array.isArray(rawItems)) {
    return EMPTY_CART.items;
  }

  const mergedQuantities = new Map<string, number>();

  for (const entry of rawItems) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }

    const record = entry as Record<string, unknown>;
    if (
      !Object.hasOwn(record, "productId") ||
      !Object.hasOwn(record, "quantity")
    ) {
      continue;
    }

    const product = resolveCatalogProduct(record.productId);
    if (!product || !isValidQuantityNumber(record.quantity)) {
      continue;
    }

    const currentQty = mergedQuantities.get(product.id) ?? 0;
    const clampedQty = Math.min(
      MAX_CART_QUANTITY,
      currentQty + record.quantity
    );
    mergedQuantities.set(product.id, clampedQty);
  }

  if (mergedQuantities.size === 0) {
    return EMPTY_CART.items;
  }

  const sanitized: CartItem[] = [];
  for (const [productId, quantity] of mergedQuantities.entries()) {
    sanitized.push(Object.freeze({ productId, quantity }));
  }
  return Object.freeze(sanitized);
}

/**
 * Builds an immutable Cart DTO resolving all unit prices and metadata exclusively from PRODUCTS.
 */
export function buildCart(items: readonly CartItem[]): Cart {
  const sanitizedItems = sanitizeCartItems(items);
  if (sanitizedItems.length === 0) {
    return EMPTY_CART;
  }

  const lines: CartLineItem[] = [];
  let itemCount = 0;
  let cartTotalIqd = 0;

  for (const item of sanitizedItems) {
    const product = getProductById(item.productId);
    if (!product) {
      continue;
    }

    const lineSubtotalIqd = product.priceIqd * item.quantity;
    if (!Number.isSafeInteger(lineSubtotalIqd)) {
      throw new RangeError("lineSubtotalIqd exceeded safe integer bounds");
    }

    const nextItemCount = itemCount + item.quantity;
    const nextCartTotalIqd = cartTotalIqd + lineSubtotalIqd;
    if (
      !Number.isSafeInteger(nextItemCount) ||
      !Number.isSafeInteger(nextCartTotalIqd)
    ) {
      throw new RangeError("Cart totals exceeded safe integer bounds");
    }

    itemCount = nextItemCount;
    cartTotalIqd = nextCartTotalIqd;
    lines.push(
      Object.freeze({
        product,
        quantity: item.quantity,
        lineSubtotalIqd,
      })
    );
  }

  if (lines.length === 0) {
    return EMPTY_CART;
  }

  return Object.freeze({
    items: sanitizedItems,
    lines: Object.freeze(lines),
    itemCount,
    cartTotalIqd,
  });
}

/**
 * Adds 1 unit of a catalog product to the cart or rejects if already at MAX_CART_QUANTITY.
 */
export function addToCart(
  items: readonly CartItem[],
  productId: string
): CartMutationResult {
  const currentCart = buildCart(items);
  const product = resolveCatalogProduct(productId);
  if (!product) {
    return failureResult("invalid_product", INVALID_PRODUCT_MESSAGE, currentCart);
  }

  const existing = currentCart.items.find(
    (item) => item.productId === product.id
  );

  if (!existing) {
    const nextItems: CartItem[] = [
      ...currentCart.items,
      { productId: product.id, quantity: MIN_CART_QUANTITY },
    ];
    return { ok: true, cart: buildCart(nextItems) };
  }

  if (existing.quantity >= MAX_CART_QUANTITY) {
    return failureResult(
      "max_quantity_reached",
      MAX_QUANTITY_MESSAGE,
      currentCart
    );
  }

  return {
    ok: true,
    cart: replaceItemQuantity(currentCart, product.id, existing.quantity + 1),
  };
}

/**
 * Updates an existing cart item's quantity to an integer in [1, 99], failing closed on invalid input.
 */
export function updateCartQuantity(
  items: readonly CartItem[],
  productId: string,
  nextQuantity: unknown
): CartMutationResult {
  const resolved = resolveExistingCartItem(items, productId);
  if (!resolved.ok) {
    return resolved.failure;
  }

  if (typeof nextQuantity !== "number" || !Number.isSafeInteger(nextQuantity)) {
    return failureResult(
      "invalid_quantity",
      INVALID_QUANTITY_MESSAGE,
      resolved.cart
    );
  }

  if (nextQuantity > MAX_CART_QUANTITY) {
    return failureResult(
      "max_quantity_reached",
      MAX_QUANTITY_MESSAGE,
      resolved.cart
    );
  }

  if (nextQuantity < MIN_CART_QUANTITY) {
    return failureResult(
      "invalid_quantity",
      INVALID_QUANTITY_MESSAGE,
      resolved.cart
    );
  }

  return {
    ok: true,
    cart: replaceItemQuantity(resolved.cart, resolved.item.productId, nextQuantity),
  };
}

/**
 * Increments an existing cart item by 1 up to MAX_CART_QUANTITY.
 */
export function incrementCartItem(
  items: readonly CartItem[],
  productId: string
): CartMutationResult {
  const resolved = resolveExistingCartItem(items, productId);
  if (!resolved.ok) {
    return resolved.failure;
  }

  if (resolved.item.quantity >= MAX_CART_QUANTITY) {
    return failureResult(
      "max_quantity_reached",
      MAX_QUANTITY_MESSAGE,
      resolved.cart
    );
  }

  return {
    ok: true,
    cart: replaceItemQuantity(
      resolved.cart,
      resolved.item.productId,
      resolved.item.quantity + 1
    ),
  };
}

/**
 * Decrements an existing cart item by 1 down to MIN_CART_QUANTITY without removing the item.
 */
export function decrementCartItem(
  items: readonly CartItem[],
  productId: string
): CartMutationResult {
  const resolved = resolveExistingCartItem(items, productId);
  if (!resolved.ok) {
    return resolved.failure;
  }

  if (resolved.item.quantity <= MIN_CART_QUANTITY) {
    return failureResult(
      "min_quantity_reached",
      MIN_QUANTITY_MESSAGE,
      resolved.cart
    );
  }

  return {
    ok: true,
    cart: replaceItemQuantity(
      resolved.cart,
      resolved.item.productId,
      resolved.item.quantity - 1
    ),
  };
}

/**
 * Removes an existing catalog product line completely from the cart.
 */
export function removeFromCart(
  items: readonly CartItem[],
  productId: string
): CartMutationResult {
  const currentCart = buildCart(items);
  const product = resolveCatalogProduct(productId);
  if (!product) {
    return failureResult("invalid_product", INVALID_PRODUCT_MESSAGE, currentCart);
  }

  const nextItems = currentCart.items.filter(
    (item) => item.productId !== product.id
  );
  if (nextItems.length === currentCart.items.length) {
    return failureResult("item_not_found", ITEM_NOT_FOUND_MESSAGE, currentCart);
  }

  return { ok: true, cart: buildCart(nextItems) };
}

/**
 * Clears all cart items and returns the empty frozen Cart DTO.
 */
export function clearCart(): Cart {
  return EMPTY_CART;
}
