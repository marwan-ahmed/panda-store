# AB-8 — Injection: Static SVG Assets & `/_next/image` SVG Guard

- **Axis:** `injection` (OWASP A05:2025, ASVS 5.0 V1/V5)
- **Target:** `http://127.0.0.1:3000`
- **Evidence source:** `.team/tasks/TASK-001/attacks/probe-results.json` (`ab8_svg_and_next_image`, `ab8_next_image_svg_block`)

## Observed Requests & Responses

1. **All 10 SVG assets (`GET /images/products/product-01.svg` … `product-10.svg`):**
   - All returned `200` with `Content-Type: image/svg+xml` (sizes `1320`–`1810` bytes).
   - Zero `<script`, `on*` event attributes, `<foreignObject`, or `javascript:` (`hasScriptOrEventOrForeignObject: false`).
   - Zero `http://` or `https://` references outside the root `xmlns="http://www.w3.org/2000/svg"` namespace declaration (`hasExternalHttpAfterRootNs: false`).
   - Header observation: static `.svg` responses have `x-content-type-options: null` and `content-security-policy: null` (tracked under low-severity hardening finding `SEC-01`).

2. **Image optimizer SVG restriction probe (`GET /_next/image?url=%2Fimages%2Fproducts%2Fproduct-01.svg&w=640&q=75`):**
   - Returned `400`, body: `"url" parameter is valid but image type is not allowed`.
   - Confirms `dangerouslyAllowSVG: false` is enforced at runtime.

## Conclusion
Local SVG assets are clean static vector graphics and `next/image` optimization rejects SVG processing as designed. Defense-in-depth headers on SVG responses are recorded in `SEC-01` (`low`).
