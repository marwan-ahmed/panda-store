# AB-9 — Mass Assignment & Data Exposure: DTO Stripping, Error Hygiene, and RSC Payload

- **Axis:** `mass_assignment_data_exposure` (OWASP A01:2025, OWASP A10:2025, ASVS 5.0 V16)
- **Target:** `http://127.0.0.1:3000` + `src/lib/products.ts`
- **Evidence source:** `.team/tasks/TASK-001/attacks/probe-results.json` (`ab9_data_exposure_and_rsc`, `ab1_access_control_routes`)

## Observed Requests & Responses

1. **Error hygiene on live `404` HTML (`/products/99`, `/products/%E0%A4%A`):**
   - Status `404`, `bodyLength: 9002`, static Arabic UI (`"المنتج غير موجود"`).
   - `notFound99LeaksInternalPaths: false` (no `D:\`, `C:\Users`, `ajeeb-app`, `node_modules`, `Error:`, or stack frames).

2. **Home and details HTML / RSC payload (`/`, `/products/3`, `/products/3?_rsc=probe` with `RSC: 1`):**
   - `homeLeaksInternalPaths: false`, `prod3LeaksInternalPaths: false`.
   - `GET /products/3?_rsc=probe` (`RSC: 1`) returned `307` (`location: /products/3?_rsc`), and rendered HTML in `/products/3` contains only the 6 allow-listed `Product` DTO fields (`id`, `name`, `priceIqd`, `imageSrc`, `imageAlt`, `description`).
   - Note on `"المنتج غير موجود"` string in `/` and `/products/3` HTML: inspected via `ab2_dom_checks` (`homeNotFoundStringContext` / `prod3NotFoundStringContext`), confirming it appears only inside Next.js's hidden serialized RSC `NotFoundBoundary` fallback payload, not in visible page DOM.

3. **DTO stripping (`src/lib/products.ts#validateProduct`):**
   - Constructs a fresh frozen object with strictly `id`, `name`, `priceIqd`, `imageSrc`, `imageAlt`, `description`; extra fields (`adminNote`, `discountPercent`, etc.) are dropped (`tests/products-domain.test.ts` `AB-9`).
   - Zero real PII in `PRODUCTS`.

## Conclusion
No unstripped extra fields, real PII, stack traces, or internal workspace paths are exposed in HTTP responses or `Product` DTOs.
