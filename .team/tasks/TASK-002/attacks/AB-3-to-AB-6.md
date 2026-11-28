# AB-3 to AB-6 — Business Logic: Catalog Pricing, Quantity Bounds & Integer Totals

- **Axis:** `business_logic` (OWASP A06:2025, ASVS 5.0 V2/V5)
- **Target:** `src/lib/cart.ts`, `src/lib/cart-storage.ts`, `src/lib/products.ts`, `http://127.0.0.1:3000`
- **Evidence source:** `.team/tasks/TASK-002/attacks/probe-results.json` (`ab3_to_ab11_domain_storage`), `.team/tasks/TASK-002/evidence/20261128-073631-4bb7d48/test.log`

## Observed Verification Results

1. **AB-3 (Price & metadata forgery in storage):**
   - `parseStoredCart` given `{ productId: "1", quantity: 2, priceIqd: 1, name: "hacked", imageSrc: "https://evil.example/x.svg" }, cartTotalIqd: 2` returned `needsRepair: true` and `items: [{ productId: "1", quantity: 2 }]`.
   - `buildCart` resolved exclusively from `PRODUCTS`: `resolvedPriceIqd: 15000`, `cartTotalIqd: 30000`.

2. **AB-4 (Duplicate lines & max quantity `99`):**
   - `parseStoredCart` given `[{ productId: "1", quantity: 60 }, { productId: "1", quantity: 50 }]` merged and clamped to `[{ productId: "1", quantity: 99 }]` with `needsRepair: true`.
   - `addToCart([{ productId: "1", quantity: 99 }], "1")` returned `{ ok: false, reason: "max_quantity_reached" }`.

3. **AB-5 (Strict quantity parsing & minimum `1`):**
   - `parseQuantityInput` rejected `"0"`, `"-0"`, `"-3"`, `"1.5"`, `"1abc"`, `"1e2"`, `"+1"`, `"0x10"`, `""`, `"   "` with `invalid_quantity`, and `"100"`, `"99999999999999999999"` with `max_quantity_reached`.
   - `decrementCartItem` at `quantity: 1` fails closed (`min_quantity_reached`) without deleting the item (`tests/cart-domain.test.ts#AB-5`).

4. **AB-6 (Max cart integer arithmetic & `-0` edge case `SEC-02`):**
   - `buildCart` across all 10 products at `quantity: 99` yielded `itemCount: 990`, `cartTotalIqd: 19899000` (`"19,899,000 د.ع"`), exact integer.
   - `formatCartTotalIqd(0)` returned `"0 د.ع"` while `src/lib/products.ts#formatPriceIqd(0)` still threw (`productsFormatZeroThrows: true`).
   - **Finding `SEC-02` (`low`, confirmed):** Direct call `formatCartTotalIqd(-0)` returned `"-0 د.ع"` because `Number.isSafeInteger(-0)` is `true` and `-0 < 0` is `false`, while `Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(-0)` formats `"-0"`. Unreachable from `buildCart` or UI (`cartTotalIqd` starts at `0` and only sums positive values); affects only direct callers passing `-0`.

## Conclusion
Catalog pricing, duplicate clamping at `99`, strict integer quantity validation, and max-cart arithmetic enforce all invariants; a low-severity negative-zero formatting edge case on direct calls to `formatCartTotalIqd(-0)` is recorded as `SEC-02`.
