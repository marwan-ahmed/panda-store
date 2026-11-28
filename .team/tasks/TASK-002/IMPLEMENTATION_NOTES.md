# IMPLEMENTATION NOTES — TASK-002

> Read by the tech manager only. The reviewers work without it on purpose.

## Decisions taken
- Implemented T1–T5 across the 12 `allowed_write` files:
  - T1: `src/lib/cart.ts` (pure cart domain logic, quantity bounds `1..99`, catalog-backed pricing, integer IQD formatting).
  - T2: `src/lib/cart-storage.ts`, `src/lib/cart-store.ts`, `src/components/cart-provider.tsx` (bounded `localStorage` sanitization, `useSyncExternalStore` store, provider with storage sync).
  - T3: `src/components/add-to-cart-button.tsx`, `src/components/cart-header-link.tsx`, `src/components/site-header.tsx`, `src/components/cart-view.tsx` (Arabic RTL cart UI components).
  - T4: `src/components/product-card.tsx`, `src/components/product-details.tsx` (wired `AddToCartButton`).
  - T5: `src/app/layout.tsx`, `src/app/cart/page.tsx` (mounted `CartProvider` + `SiteHeader` and added `/cart` route).
- Checkpoint commit created before routing `CHANGE_REQUEST-1.md` (`CR-1`) to `DESIGN` / `TESTS`.

## Deviations from PLAN
- None in implementation scope.

## Not done / known limitations
- Raised `.team/tasks/TASK-002/CHANGE_REQUEST-1.md` (`CR-1`) for `tests/cart-ui.test.tsx` (`AC-7` and `AB-8`), where `getByText(...)` matches multiple identical IQD amount spans (`priceIqd`, `lineSubtotalIqd`, `cartTotalIqd`) rendered per `SPEC.md` AC-6.
- `verify.mjs` has not been run yet pending `CR-1` resolution and test re-freeze.
