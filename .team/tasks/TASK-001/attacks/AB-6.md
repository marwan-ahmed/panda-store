# AB-6 — Injection: JavaScript `Object.prototype` Property Keys

- **Axis:** `injection` (OWASP A05:2025, ASVS 5.0 V2/V5)
- **Target:** `http://127.0.0.1:3000`
- **Evidence source:** `.team/tasks/TASK-001/attacks/probe-results.json` (`ab6_prototype_keys`)

## Observed Requests & Responses

- `GET /products/__proto__` → `404`, `"المنتج غير موجود"`, `leaksObjectOrFunction: false`
- `GET /products/constructor` → `404`, `"المنتج غير موجود"`, `leaksObjectOrFunction: false`
- `GET /products/toString` → `404`, `"المنتج غير موجود"`, `leaksObjectOrFunction: false`
- `GET /products/valueOf` → `404`, `"المنتج غير موجود"`, `leaksObjectOrFunction: false`
- `GET /products/hasOwnProperty` → `404`, `"المنتج غير موجود"`, `leaksObjectOrFunction: false`
- `GET /products/__defineGetter__` → `404`, `"المنتج غير موجود"`, `leaksObjectOrFunction: false`

## Conclusion
`getProductById` uses `Array.prototype.find` with strict `===` comparison and `requireTrimmedString` / `validateProduct` guard keys with `Object.hasOwn`. All prototype-key probes cleanly return HTTP `404` with zero `500` errors or prototype leakage.
