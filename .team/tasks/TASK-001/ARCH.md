# ARCH — TASK-001

## 1. Context
Current repository state (verified from inspected workspace files):
- **Framework & runtime:** Next.js `16.4.6` (App Router), React `19.3.0`, TypeScript `^5` (`strict: true`, `@/* -> ./src/*` in `tsconfig.json`), Tailwind CSS `4.3.3` (`@tailwindcss/turbopack`), Node.js `>=22.12.0` (`package.json`).
- **Next.js config (`next.config.ts`):** `cacheComponents: true` and `partialPrefetching: true` are enabled. `images` uses default configuration (`dangerouslyAllowSVG: false`, no `remotePatterns`).
- **Existing routes & layout:**
  - `src/app/layout.tsx`: defines `RootLayout` with `<html lang="ar" dir="rtl">` and Arabic metadata (`title: "باندا ستور"`, `description: "باندا ستور: متجر إلكتروني تجريبي"`).
  - `src/app/page.tsx`: synchronous Server Component currently rendering `<h1>باندا ستور</h1>` and `<p>المتجر قيد البناء.</p>`.
  - `src/app/globals.css`: imports Tailwind CSS v4 and defines light/dark variables and Arabic-compatible sans font stack (`Arial, Tahoma, sans-serif`).
- **Existing tests (`vitest.config.ts`, `tests/home.test.tsx`):** Vitest `5.1.2` with `jsdom` and `@testing-library/react` `16.3.3`; `tests/home.test.tsx` renders `<Home />` synchronously and asserts `<h1>باندا ستور</h1>`. Note from Next.js 16 docs (`node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`): Vitest unit tests support synchronous Server/Client Components directly; `async` server boundaries are best kept minimal and backed by synchronous UI components + pure domain functions.
- **Decisions (`.team/DECISIONS.md`):** Empty prior to this task; ADR-1, ADR-2, and ADR-3 are recorded for this task.

## 2. Data model changes
No database or ORM is used in this task (`EXEC_PROMPT.md` §5). All catalog records live in a static, immutable TypeScript module (`src/lib/products.ts`).

| Entity | Change | Field / invariant | Type | Notes |
|---|---|---|---|---|
| `Product` (TypeScript type) | Added | `id` | `string` | Unique URL-safe ID (`"1"`–`"10"`), non-empty trimmed |
| `Product` | Added | `name` | `string` | Non-empty trimmed synthetic Arabic product name |
| `Product` | Added | `priceIqd` | `number` | Positive safe integer (`Number.isSafeInteger(n) && n > 0`), single fixed IQD price |
| `Product` | Added | `imageSrc` | `string` | Local SVG path matching `/^\/images\/products\/[a-z0-9-]+\.svg$/` |
| `Product` | Added | `imageAlt` | `string` | Non-empty trimmed Arabic image description |
| `Product` | Added | `description` | `string` | Non-empty trimmed synthetic Arabic product description |
| `PRODUCTS` | Added | `length === 10` + unique `id`s | `readonly Product[]` | Validated at module load via `validateCatalog` |

**Migration plan:** No database schema migration is required. Forward change adds static assets under `public/images/products/`, new modules (`src/lib/products.ts`, `src/components/*`, `src/proxy.ts`, `src/app/products/**`, `src/app/not-found.tsx`), and updates `src/app/page.tsx`. Rollback is purely git-reversible (revert task commits to restore original `src/app/page.tsx` and remove added files) with zero persisted state impact.

## 3. Contracts

### HTTP / App Router entry points
| Entry point | Method / kind | Auth requirement | Request | Response | Errors |
|---|---|---|---|---|---|
| `/` (`src/app/page.tsx`) | `GET` (sync Server Component, prerendered static shell) | `public` (none) | No params | `200 OK` HTML/RSC with `<h1>باندا ستور</h1>` and 10 `<ProductCard />` items | Build/runtime fail only if static catalog invariant breaks |
| `/products` (`src/proxy.ts` + `src/app/products/page.tsx`) | `GET` (Proxy rewrite + fallback Page) | `public` (none) | Missing `[id]` segment | `404 Not Found` Arabic `<NotFoundView />` with link to `/` | Always `404`; never `500` |
| `/products/[id]` (`src/proxy.ts` + `src/app/products/[id]/page.tsx`) | `GET` (async Server Component, `generateStaticParams` for `"1"`–`"10"`) | `public` (none) | `params: Promise<{ id: string }>` | `200 OK` statically prerendered details page (`<ProductDetails />`) for `"1"`–`"10"` | Unknown/invalid/malformed `id` rewritten by `src/proxy.ts` with HTTP `404` to `/__not-found` (`src/app/not-found.tsx`); `notFound()` in `ProductPage` / `generateMetadata` as defense-in-depth |
| `/images/products/product-01.svg` … `product-10.svg` | `GET` (static `public/` files) | `public` (none) | Static asset path | `200 OK` `image/svg+xml` standalone static vector asset (root `<svg xmlns="http://www.w3.org/2000/svg">`) | `404` for unknown filenames |

### Domain & UI module contracts
- **`src/lib/products.ts`**:
  - `CATALOG_PRODUCT_COUNT = 10`
  - `validatePriceIqd(price: unknown): number` — throws `RangeError` / `TypeError` unless `typeof price === "number" && Number.isSafeInteger(price) && price > 0`.
  - `formatPriceIqd(priceIqd: number): string` — validates via `validatePriceIqd`, then formats with `new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(priceIqd) + " د.ع"` (e.g., `25000` → `"25,000 د.ع"`, `750` → `"750 د.ع"`, `1` → `"1 د.ع"`).
  - `validateProduct(item: unknown): Product` — verifies object shape, trims & requires non-empty `id`, `name`, `description`, `imageAlt`, enforces `imageSrc` matches `/^\/images\/products\/[a-z0-9-]+\.svg$/`, and calls `validatePriceIqd(priceIqd)`.
  - `validateCatalog(items: readonly unknown[]): readonly Product[]` — enforces `items.length === 10`, validates each item via `validateProduct`, and rejects duplicate `id`s.
  - `PRODUCTS: readonly Product[]` — `Object.freeze(...)` result of `validateCatalog([...])` with 10 synthetic Arabic Panda Store items (`id` `"1"` through `"10"`).
  - `getProducts(): readonly Product[]` — returns `PRODUCTS`.
  - `getProductById(id: string): Product | undefined` — checks `typeof id === "string" && id.trim().length > 0` and scans `PRODUCTS.find((p) => p.id === id)` (immune to `Object.prototype` keys such as `__proto__`, `constructor`, `toString`).
  - `isValidProductId(id: string): boolean` — returns `getProductById(id) !== undefined`.
- **`src/components/product-card.tsx` (`ProductCard`)**: synchronous component rendering `<article>` with `<Image src={product.imageSrc} alt={product.imageAlt} width={400} height={300} unoptimized />`, `<h2>{product.name}</h2>`, single formatted price `{formatPriceIqd(product.priceIqd)}`, `{product.description}`, and `<Link href={`/products/${product.id}`}>عرض التفاصيل</Link>`.
- **`src/components/product-details.tsx` (`ProductDetails`)**: synchronous component rendering `<Link href="/">العودة إلى الكتالوج</Link>`, `<h1>{product.name}</h1>`, `<Image src={product.imageSrc} alt={product.imageAlt} width={640} height={480} unoptimized />`, single formatted price `{formatPriceIqd(product.priceIqd)}`, and `{product.description}`.
- **`src/components/not-found-view.tsx` (`NotFoundView`)**: synchronous component rendering static Arabic heading `"المنتج غير موجود"`, explanation `"عذراً، المنتج المطلوب غير مدرج في كتالوج باندا ستور."`, and `<Link href="/">العودة إلى الكتالوج</Link>` (does not accept or render raw URL parameters).
- **`src/proxy.ts` (`proxy`, `config`)**:
  - `config = { matcher: ["/products", "/products/:path*"] }`.
  - Parses `request.nextUrl.pathname`; extracts single segment `/^\/products\/([^/]+)$/`, decodes via `decodeURIComponent` inside `try/catch`, checks `isValidProductId(decodedId)`. On match, returns `NextResponse.next()`; on any miss, trailing extra segments, `/products`, `/products/`, or `URIError`, returns `NextResponse.rewrite(new URL("/__not-found", request.url), { status: 404 })`.

## 4. Data flow
1. **Module load & invariant enforcement:** Importing `src/lib/products.ts` runs `validateCatalog` on the 10 static synthetic records; any count mismatch (`≠ 10`), duplicate ID, missing/whitespace field, invalid image path, or non-integer/non-positive price fails immediately at build or test time.
2. **Home catalog (`GET /`):** `src/app/page.tsx` synchronously reads `getProducts()` and maps the 10 validated `Product` objects to `<ProductCard />` elements inside `<main>`, rendering `"باندا ستور"` as `<h1>` and prerendering into the static shell under `cacheComponents: true`.
3. **Valid product details (`GET /products/1` … `GET /products/10`):**
   - At build time, `generateStaticParams()` in `src/app/products/[id]/page.tsx` enumerates `{ id: "1" }`…`{ id: "10" }`, statically prerendering all 10 detail pages and their Arabic `<title>` metadata (`generateMetadata`).
   - At request time, `src/proxy.ts` confirms `isValidProductId(decodedId)` is `true` and passes through via `NextResponse.next()`, serving the prerendered page (`200 OK`) with `<ProductDetails />` and a `<Link href="/">` back to the home catalog.
4. **Invalid or missing product (`GET /products`, `GET /products/99`, etc.):**
   - Before streaming begins, `src/proxy.ts` intercepts `/products` and `/products/:path*`. Because `isValidProductId` is `false` (or segment count ≠ 1 or `decodeURIComponent` throws), `proxy.ts` rewrites internally to `/__not-found` with HTTP status `404` (per Next.js 16 `proxy.md` & `streaming.md`, preventing Cache Components from sending `200 OK` stream headers first).
   - Next.js matches `/__not-found` to `src/app/not-found.tsx` (`<NotFoundView />`), delivering an Arabic `404` page with `<Link href="/">`.
   - If `ProductPage`, `generateMetadata`, or `ProductsIndexPage` is invoked directly (e.g., in Vitest or bypassing proxy), `notFound()` throws `NEXT_HTTP_ERROR_FALLBACK;404`, caught by `src/app/products/[id]/not-found.tsx` or `src/app/not-found.tsx`.

## 5. Entry points and sensitive data
> The security auditor builds the threat model from this section.

| Entry point | Who may call it | Data read | Data written | Tenant-scoped? |
|---|---|---|---|---|
| `GET /` (`src/app/page.tsx`) | Public (anonymous visitors) | Static synthetic `PRODUCTS` in `src/lib/products.ts` | None | No |
| `GET /products` (`src/proxy.ts` → `src/app/products/page.tsx`) | Public (anonymous visitors) | Request URL pathname only | None | No |
| `GET /products/[id]` (`src/proxy.ts` → `src/app/products/[id]/page.tsx`) | Public (anonymous visitors) | Untrusted URL segment `id` (allow-listed against `PRODUCTS` IDs `"1"`–`"10"` via `isValidProductId` / `getProductById`) | None | No |
| `GET /images/products/*.svg` (`public/images/products/product-01.svg`..`product-10.svg`) | Public (anonymous visitors) | Static local SVG asset files | None | No |

Security notes for threat modeling:
- **Zero mutation, auth, DB, or payment surface:** No `app/api/**` route handlers, no `"use server"` Server Actions, no `cookies()`/`headers()`/`searchParams` reads, no database connection, and no payment keys/forms exist.
- **Untrusted input boundaries:** Only URL path segment `id` on `/products/:path*` is user-controlled. It is safely decoded inside `try/catch` (handling malformed `%` sequences), checked by strict equality via `Array.prototype.find` (preventing prototype-key lookup and path traversal), and **never reflected** into rendered HTML, error text, or logs (`NotFoundView` uses fixed static Arabic copy).
- **SVG safety:** All 10 local SVGs are standalone `image/svg+xml` geometric graphics whose root `<svg>` element declares the standard W3C SVG XML namespace (`xmlns="http://www.w3.org/2000/svg"`, required by browsers to render standalone `.svg` files via `<img src="/images/products/...">` rather than un-namespaced XML) and contain zero `<script>`, `on*` event attributes, `<foreignObject>`, `javascript:` URIs, or external `http://`/`https://` references (`href`, `xlink:href`, `src`, or CSS `url(...)`); `next/image` uses `unoptimized` so `dangerouslyAllowSVG` remains `false` in `next.config.ts`.

## 6. Files expected to change
- `public/images/products/product-01.svg` … `public/images/products/product-10.svg` — 10 lightweight synthetic vector product illustrations.
- `src/lib/products.ts` — `Product` type, 10 synthetic Arabic product records, price/product/catalog validators, IQD integer formatter, and safe lookup helpers.
- `src/components/product-card.tsx` — reusable catalog card displaying the 4 required fields and details link.
- `src/components/product-details.tsx` — reusable product details view with full details and back-to-catalog link.
- `src/components/not-found-view.tsx` — reusable Arabic RTL not-found UI with link to `/`.
- `src/app/page.tsx` — replaces `"المتجر قيد البناء."` with the 10-product catalog grid while keeping `<h1>باندا ستور</h1>`.
- `src/app/products/[id]/page.tsx` — dynamic product details route with `generateStaticParams`, `generateMetadata`, and `notFound()` guard.
- `src/app/products/[id]/not-found.tsx` — segment not-found boundary rendering `<NotFoundView />`.
- `src/app/products/page.tsx` — `/products` index calling `notFound()` for missing product ID.
- `src/app/not-found.tsx` — root Arabic 404 page rendering `<NotFoundView />` with Arabic metadata.
- `src/proxy.ts` — Next.js 16 Proxy pre-stream guard returning HTTP `404` rewrite for missing/unknown/malformed `/products/*` requests.

## 7. Decisions
- ADR-1 — Static TypeScript catalog module with runtime invariant validation (recorded in `.team/DECISIONS.md`)
- ADR-2 — Local static SVG product assets rendered with `next/image` (`unoptimized`) and `dangerouslyAllowSVG: false` (recorded in `.team/DECISIONS.md`)
- ADR-3 — Pre-stream `src/proxy.ts` 404 rewrite paired with `notFound()` under Next.js 16 Cache Components (recorded in `.team/DECISIONS.md`)

## 8. Risks
- **Cache Components streaming status code (`200` vs `404`):** Under `cacheComponents: true` + `partialPrefetching: true`, throwing `notFound()` after streaming begins returns HTTP `200`. *Mitigation:* `src/proxy.ts` validates `/products` and `/products/:path*` before rendering starts and rewrites invalid paths with `{ status: 404 }` (ADR-3).
- **Vitest `async` Server Component limitation:** Next.js 16 docs note Vitest does not render `async` Server Component trees natively. *Mitigation:* `Home` (`/`), `ProductCard`, `ProductDetails`, `NotFoundView`, and `src/lib/products.ts` are synchronous, and `ProductPage` is a thin async wrapper over `getProductById` + `<ProductDetails />` that can be awaited directly in unit tests.
- **Unintended `instant-shell-url-data` dev insight on `/products/[id]`:** `await params` at the top of `ProductPage` can log a non-blocking dev insight under `partialPrefetching: true`, though it does not fail `next build`. *Mitigation:* `generateStaticParams` prerenders all 10 valid IDs (`"1"`–`"10"`), and `proxy.ts` intercepts unknown IDs before page render.
- **Scope creep or accidental commerce/PII additions:** Adding any cart button, discount, external image URL, or real PII would breach `EXEC_PROMPT.md` §5/§7 and `AGENTS.md`. *Mitigation:* Enforce explicit schema checks in `src/lib/products.ts` and negative tests in `TESTS` phase.
