# AB-4 & AB-5 — Business Logic: IQD Integer Pricing & 10-Product Catalog Integrity

- **Axis:** `business_logic` (OWASP A06:2025, ASVS 5.0 V2/V5)
- **Target:** `http://127.0.0.1:3000` + domain checks in `tests/products-domain.test.ts`
- **Evidence source:** `.team/tasks/TASK-001/attacks/probe-results.json` (`ab4_ab5_pricing_and_catalog`, `ab2_dom_checks`), `.team/tasks/TASK-001/evidence/20261126-192242-742f2e1/test.log`

## Observed Live Output & Static/Unit Verification

1. **Live home page (`GET /`):**
   - `homeCardCount`: `10` `<article>` cards.
   - `homeHasAll10Prices`: `true` (`15,000 د.ع`, `9,500 د.ع`, `18,000 د.ع`, `28,000 د.ع`, `22,000 د.ع`, `25,000 د.ع`, `12,000 د.ع`, `34,000 د.ع`, `7,500 د.ع`, `30,000 د.ع`).
   - `homeHasDecimalIqd`: `false`
   - `homeHasDelOrStrikeTag`: `false`
   - `homeHasDiscountOrTaxWords`: `false`

2. **Live product detail pages (`GET /products/1` … `GET /products/10`):**
   - All 10 returned `200`, each contained its exact expected `"د.ع"` integer price (`hasExpectedPrice: true`), and none contained decimal IQD values (`hasDecimalIqd: false`).

3. **Domain boundary enforcement (`src/lib/products.ts`):**
   - `validatePriceIqd` and `formatPriceIqd` enforce `typeof price === "number" && Number.isSafeInteger(price) && price > 0`, throwing `TypeError`/`RangeError` on `0`, `-1`, `-5000`, `15000.5`, `0.5`, `NaN`, `Infinity`, `-Infinity`, `Number.MAX_SAFE_INTEGER + 1`, strings, `null`, `undefined` (verified in `tests/products-domain.test.ts`, `test.log` exit 0).
   - `validateCatalog` enforces `items.length === 10` and unique IDs; `validateProduct` rejects empty/whitespace required fields.

## Conclusion
IQD integer-only monetary integrity and strict 10-product catalog invariants hold both in live rendered responses and domain validation code.
