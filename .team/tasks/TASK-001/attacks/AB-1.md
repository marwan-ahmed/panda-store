# AB-1 — Access Control: Routing, Cache Components `404` Status, and Traversal Probes

- **Axis:** `access_control` (OWASP A01:2025, ASVS 5.0 V4)
- **Target:** `http://127.0.0.1:3000` (`npm run start` built from `742f2e12b436ff0f4d42d253c1c0b08632c09e1f`)
- **Evidence source:** `.team/tasks/TASK-001/attacks/probe-results.json` (`ab1_access_control_routes`)

## Observed Requests & Responses

1. **Valid home catalog (`GET /`):**
   - Status: `200` (`content-type: text/html; charset=utf-8`, `x-nextjs-cache: HIT`)
   - HTML root: `<html lang="ar" dir="rtl" ...>`, contains `<h1>باندا ستور</h1>`, 10 `<article>` cards, does not contain `"المتجر قيد البناء"`.

2. **Valid allow-listed product routes (`GET /products/1` … `GET /products/10`, plus percent-encoded `GET /products/%33`):**
   - Status: `200` for all 10 IDs (`1`–`10`) and `/products/%33` (`bodyLength: 12355`–`12519`).
   - All include back link `href="/"` and matching product Arabic title and integer IQD price.

3. **Missing / invalid / traversal / multi-segment / RSC prefetch probes:**
   - `GET /products` → `404` (`bodyLength: 9002`, contains `"المنتج غير موجود"` and `href="/"`).
   - `GET /products/03` → `404` (`"المنتج غير موجود"`).
   - `GET /products/%203%20` → `404` (`"المنتج غير موجود"`).
   - `GET /products/99` → `404` (`"المنتج غير موجود"`).
   - `GET /products/0` → `404` (`"المنتج غير موجود"`).
   - `GET /products/-1` → `404` (`"المنتج غير موجود"`).
   - `GET /products/%20` → `404` (`"المنتج غير موجود"`).
   - `GET /products/1/extra` → `404` (`"المنتج غير موجود"`).
   - `GET /products/..%2F..%2Flayout` → `404` (`"المنتج غير موجود"`).
   - `GET /products/%2e%2e%2f` → `404` (`"المنتج غير موجود"`).
   - `GET /products/../../layout` (raw un-normalized HTTP path) → `404` (`"المنتج غير موجود"`).
   - `GET /__not-found` → `404` (`"المنتج غير موجود"`).
   - `GET /nonexistent-page` → `404` (`"المنتج غير موجود"`).
   - `GET /products/99` with headers `RSC: 1`, `Next-Router-Prefetch: 1` → `404` (`content-type: text/x-component`, `bodyLength: 5355`).

4. **Trailing-slash behavior observed on production server (`GET /products/` and `GET /products/3/`):**
   - `GET /products/` → `308` with relative `location: /products` (without echoing `Host` or `X-Forwarded-Host`), which then resolves to `404`.
   - `GET /products/3/` → `308` with relative `location: /products/3`, which resolves to `200`.
   - Note: Next.js strips trailing slashes prior to `src/proxy.ts` because `skipTrailingSlashRedirect` is not enabled; no `200` soft-404 and no open redirect occurs.

## Conclusion
`src/proxy.ts#proxy` and App Router boundaries (`ProductPage`, `generateMetadata`, `ProductsIndexPage`) return true HTTP `404` (including on RSC prefetch requests) under `cacheComponents: true` + `partialPrefetching: true`, with zero soft-404 `200` or `500` responses.
