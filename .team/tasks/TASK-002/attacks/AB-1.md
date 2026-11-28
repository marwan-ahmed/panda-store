# AB-1 — Access Control: Route Boundaries, `404` Guards & Absence of Server Mutations

- **Axis:** `access_control` (OWASP A01:2025, ASVS 5.0 V4)
- **Target:** `http://127.0.0.1:3000` (`npm run start` built from `4bb7d48a50f8fde7ffb3921a675e3c52c121c880`)
- **Evidence source:** `.team/tasks/TASK-002/attacks/probe-results.json` (`ab1_access_control`), `.next/server/app/cart/page/server-reference-manifest.json`

## Observed Requests & Responses

1. **Public storefront routes (`200 OK`, zero `<form>`/`<input>` on catalog pages):**
   - `GET /` → `200` (`bodyLength: 49375`, `<html lang="ar" dir="rtl">`, 10 `<article>` cards, 10 `"أضف إلى السلة"` buttons, `href="/cart"`, `formCount: 0`, `inputCount: 0`, zero checkout/payment/auth terms).
   - `GET /products/1` … `GET /products/10` → `200` for all 10 allow-listed IDs, each with `"أضف إلى السلة"`, `href="/cart"`, and `formCount: 0`.
   - `GET /cart` → `200` (`bodyLength: 10017`, `<html lang="ar" dir="rtl">`, `<title>` `"سلة التسوق | باندا ستور"`, `<h1>سلة التسوق</h1>`, `"سلة التسوق فارغة حالياً."`, `"0 د.ع"`, `href="/"`, `formCount: 0`, `inputCount: 0` when empty, zero checkout/payment/auth/PII terms).

2. **Blocked / non-existent routes (`404 Not Found`):**
   - `GET /products/cart` → `404` (`bodyLength: 10654`, Arabic `"المنتج غير موجود"`, zero stack trace or local path leak).
   - `GET /products/99`, `/products`, `/products/0`, `/products/-1`, `/products/1/extra`, `/cart/checkout`, `/cart/extra`, `/checkout`, `/api/cart`, `/api/health` → all `404` (`"المنتج غير موجود"`).
   - Trailing slashes: `GET /cart/` → `308` (`location: /cart`), `GET /products/` → `308` (`location: /products` → `404`, matching ADR-4).

3. **Write methods & Server Action probes:**
   - `POST /cart`, `PUT /cart`, `DELETE /cart`, `PATCH /cart`, `OPTIONS /cart` → `405 Method Not Allowed` (`bodyLength: 18`, zero `Set-Cookie`).
   - `POST /cart` and `POST /` with `Next-Action: deadbeef0123456789` → `400` (`text/plain`, `"Invalid Server Action request."`, zero stack trace in HTTP response).
   - `POST /api/cart` → `404`.
   - `.next/server/app/cart/page/server-reference-manifest.json` and `.next/server/app/page/server-reference-manifest.json` both contain `{"node":{},"edge":{}}`.

## Conclusion
`src/proxy.ts#proxy` and App Router route boundaries enforce `404` on `/products/cart` and unknown routes, reject write HTTP methods (`405`), and expose zero `src/app/api/**` handlers, `"use server"` Server Actions, or checkout/payment forms.
