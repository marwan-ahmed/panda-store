# AB-2 — Access Control: Absence of Mutation APIs, Server Actions, and Commerce Controls

- **Axis:** `access_control` (OWASP A01:2025, OWASP API4/API8)
- **Target:** `http://127.0.0.1:3000`
- **Evidence source:** `.team/tasks/TASK-001/attacks/probe-results.json` (`ab2_no_mutations_or_commerce`, `ab2_dom_checks`), `tests/security-assets.test.ts`

## Observed Requests & Responses

1. **Forged Server Action probes:**
   - `POST /` with headers `Next-Action: deadbeef01234567`, `Content-Type: text/plain`, body `[]` → `400` (`text/plain`, body: `Invalid Server Action request.`).
   - `POST /products/3` with headers `Next-Action: deadbeef01234567`, `Content-Type: text/plain`, body `[]` → `400` (`text/plain`, body: `Invalid Server Action request.`).

2. **Unintended API / commerce / admin routes:**
   - `GET /api/products` → `404` (`"المنتج غير موجود"`)
   - `POST /api/cart` (`Content-Type: application/json`) → `404`
   - `POST /api/upload` (`Content-Type: application/json`) → `404`
   - `GET /cart` → `404`
   - `GET /checkout` → `404`
   - `GET /admin` → `404`

3. **Live DOM & static source checks:**
   - `/` HTML contains 0 `<form>`/`<input>`/`<button type="submit">` elements and 0 commerce/payment/auth terms (`homeHasFormOrInput: false`, `homeHasCommerceWords: false`).
   - `/products/3` HTML contains 0 `<form>`/`<input>`/`<button type="submit">` elements.
   - `src/` contains zero `app/api/**/route.ts` handlers and zero `"use server"` directives.

## Conclusion
No API routes, Server Actions, shopping cart, checkout, COD/payment, or admin surfaces exist.
