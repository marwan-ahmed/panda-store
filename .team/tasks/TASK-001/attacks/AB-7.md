# AB-7 — Injection: Reflected XSS Payloads & Malformed Percent-Encoding

- **Axis:** `injection` (OWASP A05:2025, ASVS 5.0 V1/V2)
- **Target:** `http://127.0.0.1:3000` (raw TCP/HTTP via `node:http` without client URL normalization)
- **Evidence source:** `.team/tasks/TASK-001/attacks/probe-results.json` (`ab7_xss_and_encoding`)

## Observed Requests & Responses

1. `GET /products/<script>alert(1)</script>` → `404`, `reflectsAlertPayload: false`, `leaksUriErrorOrStack: false`
2. `GET /products/%3Cscript%3Ealert(1)%3C%2Fscript%3E` → `404`, `reflectsAlertPayload: false`, `leaksUriErrorOrStack: false`
3. `GET /products/%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E` → `404`, `reflectsAlertPayload: false`, `leaksUriErrorOrStack: false`
4. `GET /products/%E0%A4%A` → `404`, `reflectsAlertPayload: false`, `leaksUriErrorOrStack: false`
5. `GET /products/%` → `404`, `reflectsAlertPayload: false`, `leaksUriErrorOrStack: false`
6. `GET /products/3?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E` → `200`, `reflectsAlertPayload: false`, `leaksUriErrorOrStack: false`
7. `GET /products/99?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E` → `404`, `reflectsAlertPayload: false`, `leaksUriErrorOrStack: false`

## Conclusion
`src/proxy.ts#proxy` catches `URIError` from `decodeURIComponent` and rewrites all invalid/malformed/XSS segments to `/__not-found` with HTTP `404`, and neither `NotFoundView` nor `ProductDetails` reflects URL paths or query parameters.
