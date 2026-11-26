# SPEC — TASK-001

> Source of truth for acceptance. Every AC traces to EXEC_PROMPT (`← EXEC §x` and/or `R<n>`).
> The phase tool rejects an AC line without that reference.

## 1. Summary
Display a read-only catalog of exactly 10 synthetic Arabic products with positive integer Iraqi Dinar (`priceIqd`) pricing directly on the Panda Store (`باندا ستور`) home page (`/`), replacing the `"المتجر قيد البناء."` placeholder. Provide an independent details page (`/products/[id]`) for each of the 10 products and a clear Arabic HTTP `404` not-found experience for unknown or missing product IDs, with no cart, checkout, payment, or login functionality.

## 2. Acceptance criteria
- **AC-1** (← EXEC §2.1, §4 E1, R1, R10): Given the static catalog of 10 valid synthetic products, when the home page (`/`) is rendered, then it renders a level-1 heading `"باندا ستور"`, displays the 10-product catalog directly on `/`, does not contain the placeholder `"المتجر قيد البناء"`, and the root layout renders `<html lang="ar" dir="rtl">`.
- **AC-2** (← EXEC §2.2, §4 E1, E2, R2): Given the catalog dataset `PRODUCTS` and catalog validator `validateCatalog(items)`, when `validateCatalog` validates `PRODUCTS` (10 items with unique IDs `"1"` through `"10"`), then it returns the 10 items and `/` renders exactly 10 product cards; when `validateCatalog` receives `0`, `9`, or `11` items (or duplicate IDs), then it throws an error rejecting the dataset because the count must equal `10` exactly.
- **AC-3** (← EXEC §2.3, §4 E1, E8, R3, R4): Given any product record in `PRODUCTS` or validated by `validateProduct(item)`, when validated or rendered, then `id`, `name`, `description`, `imageSrc` (a local `/images/products/...` `.svg` asset path), and `imageAlt` (Arabic description of the image) are all non-empty after trimming whitespace, `priceIqd` is present, any missing/empty/whitespace-only required field causes `validateProduct` to throw, and none of the 10 synthetic products contain real personal names, real phone numbers, or real street addresses.
- **AC-4** (← EXEC §2.3, §4 E3, E4, E5, E6, E7, R5, R6): Given `validatePriceIqd(price)` and `formatPriceIqd(price)`, when called with `25000`, `750`, and `1`, then validation succeeds and formatting outputs `"25,000 د.ع"`, `"750 د.ع"`, and `"1 د.ع"` respectively with a single integer value and no decimal places; when called with `0`, `-5000`, `15000.5`, `NaN`, `Infinity`, or a missing/non-integer value, then both `validatePriceIqd` and `formatPriceIqd` throw an error.
- **AC-5** (← EXEC §2.3, §4 E1, E9, R6, R7): Given the 10-product catalog rendered on `/`, when each product card is inspected, then it displays the product's Arabic `name`, single fixed formatted price (`"<n> د.ع"`), local image (`<img>` with non-empty Arabic `imageAlt` and `/images/products/...` `src`), Arabic `description`, and a link (`<a href="/products/<id>">`) to that product's details page, and displays no previous/strikethrough prices, discounts, percentages, taxes, or delivery fees.
- **AC-6** (← EXEC §2.4, §4 E10, R8): Given an existing product such as product `"3"` in `PRODUCTS`, when `/products/3` is requested or rendered, then it returns HTTP `200`, displays a level-1 heading with product `"3"`'s Arabic `name`, its local image with Arabic `imageAlt`, its single fixed formatted price in `"د.ع"`, its Arabic `description`, and an Arabic link (`<a href="/">`) returning to the catalog on `/`.
- **AC-7** (← EXEC §2.4, §4 E11, R8): Given a non-existent or missing product identifier such as `/products/99`, `/products` (missing ID), or `/products/%20`, when requested over HTTP or rendered through the product route, then the server responds with HTTP status `404` and renders an Arabic not-found message (`"المنتج غير موجود"`) with a link back to `/`, without echoing untrusted path input or leaking stack traces or internal file paths.
- **AC-8** (← EXEC §2.5, §4 E9, R9): Given all storefront views (`/`, `/products/[id]`, not-found) and application routes/code, when inspected, then there are no shopping cart UI or state, no "add to cart" or "buy" buttons, no payment gateway or cash-on-delivery forms or keys, no login/signup/account controls, no search/filter/category/sort/pagination/stock UI, and no mutation API routes or Server Actions.
- **AC-9** (← EXEC §3 R10, §7, R10): Given the root layout, page metadata (`/` and `/products/[id]`), product data, and UI components, when rendered, then all visible text, headings, page titles, currency labels (`"د.ع"`), image alt texts, and navigation links are in Arabic with RTL direction (`lang="ar"`, `dir="rtl"`), and no external URLs or network resources (`http://` or `https://`, excluding the standard W3C SVG XML namespace `xmlns="http://www.w3.org/2000/svg"` required on local standalone `.svg` root elements) are referenced.

## 3. Edge cases
- **EC-1** (→ AC-2): Catalog boundary counts (`0`, `9`, `11` items) and a 10-item array with duplicate `id` values are rejected with an explicit validation error by `validateCatalog`.
- **EC-2** (→ AC-4): Integer price boundaries `1` (`"1 د.ع"`) and `750` (`"750 د.ع"`) are accepted and formatted without decimals or thousands commas; `0`, `-1`, `-5000`, `15000.5`, `NaN`, `Infinity`, and unsafe integers (`Number.MAX_SAFE_INTEGER + 1`) are rejected.
- **EC-3** (→ AC-3): Missing, empty (`""`), or whitespace-only (`"   "`) values for `id`, `name`, `description`, `imageSrc`, or `imageAlt`, as well as non-local or malformed `imageSrc` values (e.g., `https://...`, `javascript:...`, or `../`), are rejected by `validateProduct`.
- **EC-4** (→ AC-7): Missing ID (`/products`, `/products/`), unknown ID (`/products/99`, `/products/0`, `/products/-1`), extra nested path (`/products/1/extra`), whitespace-encoded ID (`/products/%20`), and malformed URI escape (`/products/%E0%A4%A`) all return HTTP `404` with the static Arabic not-found view and link to `/`, never throwing an unhandled `500` error.
- **EC-5** (→ AC-6, AC-7): Object-prototype property names passed as product ID (`/products/__proto__`, `/products/constructor`, `/products/toString`) resolve safely to `undefined` in `getProductById` and result in HTTP `404` rather than prototype leakage or runtime errors.

## 4. Out of scope
- Keeping the `"المتجر قيد البناء."` placeholder or moving the catalog off `/`.
- Shopping cart, "add to cart", "buy", ordering, or reservation flows.
- Online payment gateways, payment API keys, checkout, or cash-on-delivery forms.
- User authentication, registration, sessions, roles, or user profiles.
- Discounts, previous/compare-at prices, taxes, or delivery/shipping fees.
- Search, filtering, categories, sorting, pagination, or stock/inventory quantities.
- Database persistence, admin dashboard, or product CRUD endpoints/actions.

## 5. Non-functional requirements
- **Security & data hygiene:** Read-only public storefront using 100% synthetic static data and local static SVG assets; no secrets or payment keys; no external network requests; no stack traces, internal paths, or unescaped untrusted input rendered in error/not-found responses (`EXEC §7`).
- **Localization & layout:** Arabic UI (`lang="ar"`, `dir="rtl"` in root layout) across all pages and metadata (`EXEC §7`, `R10`).
- **Monetary & asset constraints:** All IQD amounts represented strictly as positive safe integers (`EXEC §7`, `AGENTS.md`); all 10 product images stored locally under `public/images/products/` as lightweight static standalone `image/svg+xml` files (declaring root `xmlns="http://www.w3.org/2000/svg"` so browsers render `<img src="/images/products/...">` cleanly, with zero external `http://` or `https://` URLs) (`EXEC §7`, `§8 A3`).
