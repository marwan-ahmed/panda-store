# AB-9 & AB-10 — Mass Assignment, Data Exposure & Error Resilience

- **Axis:** `mass_assignment_data_exposure` (OWASP A01:2025, OWASP A10:2025, ASVS 5.0 V16)
- **Target:** `http://127.0.0.1:3000`, `.next/server/app/cart.rsc`, `src/lib/cart.ts`, `src/lib/cart-storage.ts`
- **Evidence source:** `.team/tasks/TASK-002/attacks/probe-results.json`, `.team/tasks/TASK-002/evidence/20261128-081323-922ae39/test.log`

## Observed Checks

1. **AB-9 (Allow-listed serialization & zero server/RSC data exposure):**
   - `serializeCart([{ productId: "1", quantity: 2 }])` produced strictly `'{"version":1,"items":[{"productId":"1","quantity":2}]}'`.
   - Prerendered `.next/server/app/cart.rsc` (`5004` bytes) and live `/cart?_rsc=...` (`5004` bytes) contain zero `priceIqd`, zero `cartTotalIqd`, zero `localStorage` data, zero PII, and zero secrets.
   - Live `200`, `404`, `405`, and `400` responses expose zero stack traces or local filesystem paths.

2. **AB-10 (Corrupted JSON, version mismatch & storage error resilience):**
   - `parseStoredCart(JSON.stringify({ version: 99, items: [{ productId: "1", quantity: 2 }] }))` returned `{ items: [], needsRepair: true }`.
   - `parseStoredCart("{bad")` returned `{ items: [], needsRepair: true }`.
   - `SecurityError` and `QuotaExceededError` are caught cleanly by `readCartItemsFromStorage`, `writeCartItemsToStorage`, and `cart-store.ts` in-memory fallback (`tests/cart-storage.test.ts#EC-5`, `#AB-10`).

## Conclusion
Extra properties, PII, and internal details are excluded from storage, RSC payloads, and HTTP responses, and malformed payloads or storage errors recover cleanly.
