# ARCH — TASK-002

## 1. Context
Current repository state (verified from inspected workspace files):
- **Framework & runtime:** Next.js `16.4.6` (App Router), React `19.3.0`, TypeScript `^5` (`strict: true`, `@/* -> ./src/*`), Tailwind CSS `4.3.3` (`@tailwindcss/turbopack`), Node.js `>=22.12.0` (`package.json`). Runtime `dependencies` are strictly `["next", "react", "react-dom"]`.
- **Next.js config (`next.config.ts`):** `cacheComponents: true` and `partialPrefetching: true` are enabled; `images` has no `dangerouslyAllowSVG` or `remotePatterns`. Per Next.js 16 docs (`node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`, `03-api-reference/05-config/01-next-config-js/cacheComponents.md`, `02-guides/preserving-ui-state.md`):
  - `RootLayout` (`src/app/layout.tsx`) remains a synchronous Server Component rendering `<html lang="ar" dir="rtl">`, placing `<CartProvider>` inside `<body>` around `<SiteHeader />` and `{children}` so static HTML shell optimization and existing `RootLayout(...)` tests stay intact.
  - Client Components (`"use client"`) still server-render into HTML at build/request time; reading `localStorage` synchronously during initial client render causes hydration mismatches. Using React's `useSyncExternalStore` with a stable frozen `getServerCartSnapshot()` guarantees identical SSR and hydration output, then immediately synchronizes to `localStorage` on the client.
  - Under `cacheComponents: true`, Next.js wraps hidden navigated routes in `<Activity mode="hidden">`, preserving per-component state across visits while cleaning up effects on hide. Storing cart state in a shared `useSyncExternalStore` external store ensures all routes (`/` via `ProductCard`, `/products/[id]` via `ProductDetails`, `SiteHeader`, and `/cart`) remain consistent even when routes are hidden/re-shown by `<Activity>`, while transient inline feedback (`"تمت الإضافة..."` / validation alerts) resets via `useLayoutEffect` cleanup when a route hides.
- **ESLint (`eslint.config.mjs` + `eslint-config-next@16.4.6`):** `eslint-plugin-react-hooks@^7.1.0` enables React Compiler rules including `react-hooks/set-state-in-effect`. Using `useSyncExternalStore` for external storage and derived editing state (`editingValue: string | null`) in `CartView` avoids all `setState` inside `useEffect` bodies.
- **Existing catalog & routing (`TASK-001`):**
  - `src/lib/products.ts` exports `Product`, `PRODUCTS` (10 frozen synthetic items `"1"`–`"10"`), `validatePriceIqd` (strictly `> 0`), `formatPriceIqd` (strictly `> 0`), `getProducts`, `getProductById` (linear scan immune to `Object.prototype` keys), `isValidProductId`. **Must remain untouched** so `TASK-001` `EC-2` / `AB-4` invariants stay preserved.
  - `src/proxy.ts` pre-stream guard covers `matcher: ["/products", "/products/:path*"]`; `/cart` is untouched by `proxy.ts`.
  - `src/components/product-card.tsx` and `src/components/product-details.tsx` are synchronous components; adding a `"use client"` leaf (`<AddToCartButton />`) keeps them server-renderable and keeps `within(card).getByRole("link")` unique in `tests/home.test.tsx`.
- **Existing tests requiring scope updates in `TESTS` phase (noted for `marwan-sat-test-author`):**
  - `tests/home.test.tsx` (`AC-8`): currently fails if any element renders `/سلة|أضف إلى السلة|إضافة إلى السلة/`. In `TASK-002`, `ProductCard` (rendered in `Home`) and `ProductDetails` legitimately render the `"أضف إلى السلة"` button (with zero `<form>`/`<input>` on catalog/details cards), while checkout/COD/payment/auth/search UI must remain forbidden.
  - `tests/security-assets.test.ts` (`AB-2`): must continue enforcing zero `"use server"`, zero `src/app/api/**/route.ts`, zero checkout/payment gateway strings (`stripe|paypal|zaincash|qi-card|checkout`), and zero `cookies()`/`Set-Cookie`, while allowing the new cart domain/UI components.
- **Decisions (`.team/DECISIONS.md`):** `ADR-1`..`ADR-4` from `TASK-001` apply; `ADR-5` and `ADR-6` are added for `TASK-002`.

## 2. Data model changes
No server database, ORM, or server session is used (`EXEC_PROMPT.md` §5, `ANSWERS.md` `Q1: أ`). Cart state is modeled as immutable TypeScript DTOs backed by browser-local JSON storage (`window.localStorage`).

| Store / Type | Change | Field / Constraint | Type | Notes |
|---|---|---|---|---|
| `CartItem` (`src/lib/cart.ts`) | Added | `productId` | `string` | Allow-listed catalog ID (`getProductById(productId) !== undefined`) |
| `CartItem` | Added | `quantity` | `number` | Safe integer `1 <= quantity <= 99` (`MIN_CART_QUANTITY`..`MAX_CART_QUANTITY`) |
| `CartLineItem` (`src/lib/cart.ts`) | Added (derived) | `product`, `quantity`, `lineSubtotalIqd` | `{ Product, number, number }` | `product` resolved exclusively from `PRODUCTS`; `lineSubtotalIqd = product.priceIqd * quantity` (safe integer) |
| `Cart` (`src/lib/cart.ts`) | Added (derived) | `items`, `lines`, `itemCount`, `cartTotalIqd` | `{ readonly CartItem[], readonly CartLineItem[], number, number }` | `itemCount = sum(quantity)`, `cartTotalIqd = sum(lineSubtotalIqd)`; empty cart has `itemCount: 0`, `cartTotalIqd: 0` |
| `BrowserStorage` (`panda-store:cart:v1`) | Added (`localStorage`) | `{ version: 1, items: CartItem[] }` | JSON string (`<= 65536` chars) | Allow-listed `{ productId, quantity }` entries only; never stores `priceIqd`, `name`, `imageSrc`, PII, or secrets |

**Migration plan:** No database migration is required. Forward rollout adds `src/lib/cart.ts`, `src/lib/cart-storage.ts`, `src/lib/cart-store.ts`, `src/components/cart-provider.tsx`, `src/components/add-to-cart-button.tsx`, `src/components/cart-header-link.tsx`, `src/components/site-header.tsx`, `src/components/cart-view.tsx`, `src/app/cart/page.tsx`, and updates `src/app/layout.tsx`, `src/components/product-card.tsx`, and `src/components/product-details.tsx`. Rollback is purely git-reversible (revert task commits; clients safely ignore any leftover `panda-store:cart:v1` `localStorage` entry).

## 3. Contracts

### HTTP / App Router entry points
| Entry point | Method / kind | Auth requirement | Request | Response | Errors |
|---|---|---|---|---|---|
| `/` (`src/app/page.tsx`) | `GET` (sync Server Component, static shell) | `public` (none) | No params | `200 OK` with `<SiteHeader />` (via `RootLayout`) and 10 `<ProductCard />` items each containing `<AddToCartButton />` | Build/runtime fail only if static catalog invariant breaks |
| `/products/[id]` (`src/proxy.ts` + `src/app/products/[id]/page.tsx`) | `GET` (async Server Component, `generateStaticParams` `"1"`–`"10"`) | `public` (none) | `params: Promise<{ id: string }>` | `200 OK` with `<SiteHeader />` and `<ProductDetails />` containing `<AddToCartButton />` | Unknown/invalid/malformed `id` rewritten by `src/proxy.ts` (`404` to `/__not-found`) + `notFound()` fallback |
| `/cart` (`src/app/cart/page.tsx`) | `GET` (sync Server Component wrapping `"use client"` `<CartView />`) | `public` (none) | No params, no `searchParams`, no `cookies()` | `200 OK` Arabic RTL page (`title: "سلة التسوق \| باندا ستور"`) hydrating cart items or Arabic empty state from `localStorage` | Never `500`; corrupted `localStorage` recovers to empty state or valid subset |

### Domain, storage, store & UI module contracts
- **`src/lib/cart.ts`** (pure, framework-free domain module):
  - `MIN_CART_QUANTITY = 1`, `MAX_CART_QUANTITY = 99`.
  - `EMPTY_CART: Cart` (deeply frozen empty `Cart` with `items: []`, `lines: []`, `itemCount: 0`, `cartTotalIqd: 0`).
  - `validateCartQuantity(quantity: unknown): number` — throws `TypeError`/`RangeError` unless `typeof quantity === "number" && Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 99`.
  - `parseQuantityInput(raw: string): { ok: true; quantity: number } | { ok: false; reason: "invalid_quantity" | "max_quantity_reached"; message: string }` — trims string, requires strict ASCII digits `/^\d+$/` (rejecting `""`, `"0"`, `"-3"`, `"1.5"`, `"1abc"`, `"1e2"`), parses `Number(trimmed)`; returns `"max_quantity_reached"` when integer `> 99`, `"invalid_quantity"` when `<= 0` or non-integer/malformed, and `{ ok: true, quantity }` for `1..99`.
  - `formatCartTotalIqd(totalIqd: number): string` — validates `typeof totalIqd === "number" && Number.isSafeInteger(totalIqd) && totalIqd >= 0` (throws otherwise), formats with `Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })` + `" د.ع"` (e.g. `0` → `"0 د.ع"`, `41500` → `"41,500 د.ع"`, `19899000` → `"19,899,000 د.ع"`).
  - `sanitizeCartItems(rawItems: readonly unknown[]): readonly CartItem[]` — skips non-plain objects, looks up `productId` via `getProductById`, verifies `quantity` is a safe integer in `[1, 99]`, discards all other properties (`priceIqd`, `name`, etc.), merges duplicate valid `productId`s clamping sum at `99`, and returns frozen allow-listed `CartItem[]`.
  - `buildCart(items: readonly CartItem[]): Cart` — runs `sanitizeCartItems(items)`, resolves each `CartLineItem` from `getProductById`, multiplies `product.priceIqd * quantity` (asserting `Number.isSafeInteger`), accumulates `itemCount` and `cartTotalIqd`, and freezes result.
  - `addToCart(items: readonly CartItem[], productId: string): CartMutationResult` — validates `productId` via `getProductById` (else `{ ok: false, reason: "invalid_product" }`); adds `{ productId, quantity: 1 }` if absent or increments existing line by `1` if `< 99`, or rejects with `{ ok: false, reason: "max_quantity_reached", message: "تم بلوغ الحد الأقصى للكمية (99 قطعة) لهذا المنتج." }` when already `99`.
  - `updateCartQuantity(items: readonly CartItem[], productId: string, nextQuantity: unknown): CartMutationResult` — requires valid existing item and integer `nextQuantity` in `[1, 99]` (returns `{ ok: false, reason: "invalid_product" | "item_not_found" | "max_quantity_reached" | "invalid_quantity" }` without mutating cart on invalid input).
  - `incrementCartItem(items: readonly CartItem[], productId: string): CartMutationResult` — increments existing item by `1` or rejects at `99` (`max_quantity_reached`).
  - `decrementCartItem(items: readonly CartItem[], productId: string): CartMutationResult` — decrements existing item by `1` down to `1`; at `1` returns `{ ok: false, reason: "min_quantity_reached", cart, message: "الحد الأدنى للكمية هو قطعة واحدة؛ استخدم زر الحذف لإزالة المنتج." }` without removing item.
  - `removeFromCart(items: readonly CartItem[], productId: string): CartMutationResult` — removes matching `productId` and returns rebuilt `Cart` (or `item_not_found` / `invalid_product`).
  - `clearCart(): Cart` — returns `EMPTY_CART`.
- **`src/lib/cart-storage.ts`**:
  - `CART_STORAGE_KEY = "panda-store:cart:v1"`, `CART_STORAGE_VERSION = 1`, `MAX_CART_STORAGE_BYTES = 65536`, `MAX_RAW_STORAGE_ITEMS = 200`.
  - `parseStoredCart(rawJson: string | null): { readonly items: readonly CartItem[]; readonly needsRepair: boolean }` — bounds byte/char length, parses JSON inside `try/catch`, accepts `{ version: 1, items }` (plus legacy/test-fixture `{ items }` or array with `needsRepair = true`), truncates iteration at `MAX_RAW_STORAGE_ITEMS`, sanitizes via `sanitizeCartItems`, marks `needsRepair = true` whenever any item was dropped, merged, had extra fields (e.g., `priceIqd`), or structure was malformed.
  - `serializeCart(items: readonly CartItem[]): string` — emits canonical JSON `{ version: 1, items }` with allow-listed `{ productId, quantity }` fields only.
  - `readCartItemsFromStorage(storage?: Storage): { readonly items: readonly CartItem[]; readonly needsRepair: boolean; readonly available: boolean }` and `writeCartItemsToStorage(items: readonly CartItem[], storage?: Storage): boolean` — safe against SSR (`window` undefined) and storage `SecurityError`/`QuotaExceededError`.
- **`src/lib/cart-store.ts`** (`"use client"`):
  - External store compatible with React 19 `useSyncExternalStore(subscribeCart, getCartSnapshot, getServerCartSnapshot)`:
    - `getServerCartSnapshot()` always returns cached `EMPTY_CART` (zero hydration mismatch).
    - `getCartSnapshot()` checks current `localStorage` raw string against memoized `lastRawRead` to guarantee `O(1)` referential stability on unchanged state while picking up storage reloads/clears immediately; falls back to in-memory items when `localStorage` is unavailable/blocked.
    - `subscribeCart(listener)` registers listener and attaches `window.addEventListener("storage", ...)` while active listeners exist.
    - `repairStoredCartIfNeeded()` normalizes dirty `localStorage` contents back to canonical JSON (or removes corrupted empty payload) without triggering `setState` in an effect.
    - `useCart()` returns `{ cart, addItem, updateItemQuantity, incrementItem, decrementItem, removeItem, clearAll }` and works both inside `<CartProvider>` and in standalone component unit tests.
- **`src/components/cart-provider.tsx`** (`"use client"`): wraps `{children}` inside `RootLayout` and triggers `repairStoredCartIfNeeded()` on browser mount (`useEffect` with zero `setState`).
- **`src/components/add-to-cart-button.tsx`** (`"use client"`): props `{ readonly productId: string; readonly productName: string }`; renders `<button type="button">أضف إلى السلة</button>`, calls `addItem(productId)`, renders inline Arabic `role="status"` on success or `role="alert"` on max-limit `99`, and clears transient message on `<Activity>` hide via `useLayoutEffect` cleanup.
- **`src/components/cart-header-link.tsx`** (`"use client"`) & **`src/components/site-header.tsx`** (Server Component): `SiteHeader` renders store brand `<Link href="/">باندا ستور</Link>` and `<CartHeaderLink />` (`<Link href="/cart">` showing `"السلة"` and `cart.itemCount`).
- **`src/components/cart-view.tsx`** (`"use client"`): renders `<h1>سلة التسوق</h1>`, empty state (`"سلة التسوق فارغة حالياً."`, `0`, `"0 د.ع"`, `<Link href="/">العودة إلى الكتالوج</Link>`), or item rows (`name`, unoptimized local SVG `<Image />`, unit price, quantity controls `−` disabled at `1`, numeric input with `editingValue: string | null` draft state & inline validation error, `+` clickable to trigger max-`99` alert, `"حذف"` button), summary (`itemCount`, `formatCartTotalIqd(cart.cartTotalIqd)`), `"إفراغ السلة"`, and `<Link href="/">العودة إلى الكتالوج</Link>`. Zero `<form>` elements or checkout/payment/auth controls.

## 4. Data flow
1. **SSR & initial hydration:** `RootLayout` (`/` / `/products/[id]` / `/cart`) renders `<CartProvider><SiteHeader />{children}</CartProvider>`. During SSR and React initial hydration, `useCart()` receives `getServerCartSnapshot()` (`EMPTY_CART`: `itemCount = 0`, `cartTotalIqd = 0`), producing deterministic HTML without hydration warnings.
2. **Client mount & storage recovery:** Immediately post-hydration, `useSyncExternalStore` calls `getCartSnapshot()`, reading `localStorage["panda-store:cart:v1"]`, running `parseStoredCart` + `buildCart`, and resolving unit prices and product metadata solely from `PRODUCTS`. On mount, `CartProvider` runs `repairStoredCartIfNeeded()` to overwrite any tampered/corrupted payload with clean canonical JSON.
3. **Add to cart (`/` or `/products/[id]`):** Visitor clicks `<AddToCartButton productId={product.id} />` → `cartActions.addItem(productId)` reads sanitized items, calls pure `addToCart`, persists canonical JSON to `localStorage` if `ok`, updates memoized snapshot, notifies listeners (`SiteHeader` `itemCount` updates immediately), and displays inline Arabic status or max-`99` alert.
4. **Navigate to `/cart` & manage items:** Clicking `<CartHeaderLink />` navigates to `/cart`, rendering `<CartView />` with live `cart.lines`, `cart.itemCount`, and `cart.cartTotalIqd`. Increment, decrement, valid integer input (`1..99`), remove, or clear actions invoke pure functions in `src/lib/cart.ts`, write canonical `{ version: 1, items }` to `localStorage`, and notify all subscribed components (`SiteHeader` and `CartView`). Invalid quantity inputs keep cart state and totals unchanged and show an inline Arabic error.

## 5. Entry points and sensitive data
> The security auditor builds the threat model from this section.

| Entry point | Who may call it | Data read | Data written | Tenant-scoped? |
|---|---|---|---|---|
| `GET /` (`src/app/page.tsx`) | Public (anonymous visitors) | Static synthetic `PRODUCTS` | None (server); client leaf writes `localStorage["panda-store:cart:v1"]` on click | No (single browser device) |
| `GET /products/[id]` (`src/proxy.ts` → `src/app/products/[id]/page.tsx`) | Public (anonymous visitors) | Allow-listed route segment `id` (`"1"`–`"10"`) + static `PRODUCTS` | None (server); client leaf writes `localStorage` on click | No |
| `GET /cart` (`src/app/cart/page.tsx` → `src/components/cart-view.tsx`) | Public (anonymous visitors) | Client `localStorage["panda-store:cart:v1"]` + static `PRODUCTS` | Client `localStorage["panda-store:cart:v1"]` on user mutation/repair | No |
| Client Trust Boundary: `BrowserStorage` (`window.localStorage` key `panda-store:cart:v1`) | Any script/extension/user in visitor browser | Untrusted JSON string (`<= 65536` chars) | Allow-listed `{ version: 1, items: [{ productId, quantity }] }` only | No (per-browser local storage) |
| Client Trust Boundary: DOM Quantity Input (`CartView` numeric input & buttons) | Visitor browser DOM events | Untrusted input string / `productId` | Validated `quantity` (`1..99`) into `localStorage` | No |
| `POST` Server Actions (`"use server"`), `src/app/api/**/route.ts`, `cookies()` | **Explicitly absent** | N/A | Must remain absent | N/A |

Security notes for threat modeling:
- **Zero server mutation/session/payment surface:** No `src/app/api/**` endpoints, no `"use server"` Server Actions, no `cookies()`/`Set-Cookie`, no database, no checkout/COD forms, and no payment keys exist.
- **Untrusted browser storage (`localStorage`):** Treated as hostile input. `parseStoredCart` enforces bounded length (`65536` chars) and entry cap (`200`), catches JSON parse errors, uses linear allow-listed lookup `getProductById` (immune to `__proto__`, `constructor`, `toString`), accepts only safe integers `1..99`, discards injected fields (`priceIqd`, `price`, `name`, `imageSrc`, HTML/script strings), merges duplicates clamped at `99`, and resolves prices/names/images strictly from `PRODUCTS`.
- **Untrusted UI quantity inputs:** `parseQuantityInput` uses strict `/^\d+$/` matching and `Number.isSafeInteger` range checks `[1, 99]` rather than `parseInt`/`Number("")` coercion, preventing decimal rounding (`1.5`), scientific notation (`1e2`), empty-to-zero coercion, negatives, or integer overflow.
- **XSS / data exposure:** No `dangerouslySetInnerHTML`, no external network `fetch`, no `NEXT_PUBLIC_*` secrets, and zero PII stored in `localStorage` or code.

## 6. Files expected to change
- `src/lib/cart.ts` *(new)* — cart types, quantity validation/parsing, catalog-authoritative line/total integer calculation, `formatCartTotalIqd`, `sanitizeCartItems`, and pure cart operations.
- `src/lib/cart-storage.ts` *(new)* — `CART_STORAGE_KEY`, bounded JSON parsing/sanitization (`parseStoredCart`), canonical serialization, and exception-safe `localStorage` I/O.
- `src/lib/cart-store.ts` *(new)* — `useSyncExternalStore` cart state manager, `getServerCartSnapshot`, `getCartSnapshot`, `storage` listener, `repairStoredCartIfNeeded`, and `useCart` hook.
- `src/components/cart-provider.tsx` *(new)* — `"use client"` wrapper running mount-time storage repair inside `RootLayout`.
- `src/components/add-to-cart-button.tsx` *(new)* — `"use client"` add-to-cart button with inline Arabic feedback and `<Activity>` cleanup.
- `src/components/cart-header-link.tsx` *(new)* — `"use client"` header cart link (`/cart`) displaying live `itemCount`.
- `src/components/site-header.tsx` *(new)* — store header displaying brand link (`/`) and `<CartHeaderLink />`.
- `src/components/cart-view.tsx` *(new)* — `"use client"` independent cart UI with line items, quantity controls, removal, clear cart, empty state, and IQD totals.
- `src/components/product-card.tsx` *(modified)* — adds `<AddToCartButton />` below details link while retaining existing card structure.
- `src/components/product-details.tsx` *(modified)* — adds `<AddToCartButton />` to product details view while retaining existing fields and back link.
- `src/app/layout.tsx` *(modified)* — wraps `{children}` inside `<CartProvider><SiteHeader />{children}</CartProvider>` preserving `<html lang="ar" dir="rtl">`.
- `src/app/cart/page.tsx` *(new)* — `/cart` App Router Server Component with Arabic metadata rendering `<CartView />`.
- **Explicitly unchanged:** `src/lib/products.ts`, `src/proxy.ts`, `src/app/page.tsx`, `src/app/products/**`, `src/app/not-found.tsx`, `src/components/not-found-view.tsx`, `public/images/products/*.svg`, `next.config.ts`, `package.json`.

## 7. Decisions
- ADR-1 — Static TypeScript catalog module with runtime invariant validation (recorded in `.team/DECISIONS.md`)
- ADR-2 — Local static SVG product assets rendered with `next/image` (`unoptimized`) and `dangerouslyAllowSVG: false` (recorded in `.team/DECISIONS.md`)
- ADR-3 — Pre-stream `src/proxy.ts` 404 rewrite paired with `notFound()` under Next.js 16 Cache Components (recorded in `.team/DECISIONS.md`)
- ADR-4 — Accepted Risk REV-01 on trailing slash redirect prior to `proxy.ts` (recorded in `.team/DECISIONS.md`)
- ADR-5 — Browser-local `localStorage` cart backed by `useSyncExternalStore` and catalog-authoritative sanitization (recorded in `.team/DECISIONS.md`)
- ADR-6 — Separate non-negative `formatCartTotalIqd` in `src/lib/cart.ts` from strictly positive `formatPriceIqd` in `src/lib/products.ts` (recorded in `.team/DECISIONS.md`)

## 8. Risks
- **Hydration mismatch & `cacheComponents: true` `<Activity>` preservation:** Reading `localStorage` during render would trigger hydration errors, and per-page `useState` would desync across `<Activity>`-hidden routes. *Mitigation:* `useSyncExternalStore` uses a deterministic `EMPTY_CART` `getServerCartSnapshot()` during SSR/hydration, synchronizes globally across routes/tabs, and cleans transient feedback via `useLayoutEffect` cleanup.
- **ESLint v7 `react-hooks/set-state-in-effect` failures:** Calling `setState` inside `useEffect` (e.g., for syncing `localStorage` or numeric input draft state) fails `npx eslint .` under `eslint-config-next@16.4.6`. *Mitigation:* Use `useSyncExternalStore` for store state and `editingValue: string | null` derived-draft state in `CartView`.
- **Weakening `TASK-001` strict `> 0` price guard:** Allowing `0` inside `src/lib/products.ts#validatePriceIqd` / `formatPriceIqd` would break `TASK-001` `EC-2` & `AB-4`. *Mitigation:* Leave `src/lib/products.ts` unmodified and keep `formatCartTotalIqd` (`>= 0`) in `src/lib/cart.ts` (ADR-6).
- **Tampered or restricted `localStorage`:** Corrupted JSON, spoofed prices, `__proto__` keys, or blocked `localStorage` (`SecurityError`/`QuotaExceededError`) could break rendering or totals. *Mitigation:* Bounded `try/catch` parsing, allow-listed DTO extraction, exclusive catalog price lookup, and in-memory fallback.
- **Existing `TASK-001` negative cart assertions:** `tests/home.test.tsx#AC-8` and `tests/security-assets.test.ts#AB-2` currently assert zero cart UI; `marwan-sat-test-author` must update only those cart-banning checks in `TESTS` while retaining checkout/COD/payment/auth/search prohibitions.
