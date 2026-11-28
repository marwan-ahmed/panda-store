# AB-7 & AB-8 — Injection: Prototype Pollution, Stored/DOM/Query XSS & RSC Checks

- **Axis:** `injection` (OWASP A05:2025, ASVS 5.0 V1/V2/V5)
- **Target:** `http://127.0.0.1:3000`, `src/lib/cart.ts`, `src/lib/cart-storage.ts`, `.next/static/chunks/*.js`
- **Evidence source:** `.team/tasks/TASK-002/attacks/probe-results.json` (`ab3_to_ab11_domain_storage`, `ab8_ab12_xss_rsc_hydration`), `.team/tasks/TASK-002/attacks/cart-activity-probe.json`

## Observed Requests & Checks

1. **AB-7 (Prototype keys & `__proto__` JSON):**
   - `parseStoredCart('{"version":1,"items":[{"productId":"1","quantity":2,"__proto__":{"polluted":true}}],"__proto__":{"rootPolluted":true}}')` returned `items: [{ productId: "1", quantity: 2 }]`, `needsRepair: true`, and `({}).polluted === undefined`, `({}).rootPolluted === undefined`.
   - `addToCart([], id)` rejected `"__proto__"`, `"constructor"`, `"toString"`, `"valueOf"`, and `"hasOwnProperty"` (`ok: false`).

2. **AB-8 (Live `/cart` query, raw HTML & RSC non-reflection):**
   - `GET /cart?msg=%3Cscript%3Ealert(1)%3C%2Fscript%3E` → `200`, `bodyLength: 10017`, `reflectsRawScript: false`.
   - `GET /cart?msg=<script>alert(1)</script>` (raw unencoded request line) → `200`, `bodyLength: 10017`, `reflectsRawScript: false`.
   - `GET /cart?q=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E` → `200`, `reflectsOnerror: false`.
   - `GET /cart?__proto__[polluted]=1&constructor[prototype][polluted]=1` → `200`, `reflectsPolluted: false`.
   - `GET /cart?msg=%3Cscript%3Ealert(1)%3C%2Fscript%3E` with `RSC: 1` (followed `307` to `&_rsc`) → `200` (`text/x-component`, `bodyLength: 5004`), `reflectsRawScript: false`, `reflectsEncodedScript: false`.

3. **AB-8 (Storage XSS stripping & compiled client chunks):**
   - `parseStoredCart` with `name: "<script>alert(1)</script>"`, `imageSrc: "javascript:alert(1)"`, and `productId: "<img src=x onerror=alert(1)>"` returned strictly `[{ productId: "1", quantity: 1 }]`, `needsRepair: true`.
   - Compiled app chunks (`089wym5cx7080.js`, `0vjngty2s01kj.js`, `3jdrrxqpef3ut.js`) contain zero `dangerouslySetInnerHTML`, zero `.innerHTML`, and zero `eval(`.
   - Interactive `CartView` probe (`cart-activity-probe.json`) injecting `<script>alert(1)</script>` into the quantity input rejected the payload with Arabic alert (`"يرجى إدخال كمية صحيحة بين 1 و99."`), kept `htmlContainsRawScript: false` and `cartTextStillShows30k: true`, and cleared the transient draft/alert cleanly across React `<Activity>` hide/show.

## Conclusion
Prototype keys, query-parameter script strings, and stored HTML/script/URI payloads are rejected or stripped without reflection or DOM injection sinks.
