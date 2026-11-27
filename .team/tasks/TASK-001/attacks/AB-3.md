# AB-3 — Authentication: Unauthenticated Storefront & Zero Session/Cookie Issuance

- **Axis:** `authentication` (OWASP A07:2025, ASVS 5.0 V7)
- **Target:** `http://127.0.0.1:3000`
- **Evidence source:** `.team/tasks/TASK-001/attacks/probe-results.json` (`ab3_no_authentication`)

## Observed Requests & Responses

1. **Auth route probes:**
   - `GET /login` → `404`, `set-cookie: null`
   - `GET /signup` → `404`, `set-cookie: null`
   - `GET /account` → `404`, `set-cookie: null`
   - `GET /api/auth/session` → `404`, `set-cookie: null`

2. **Forged session/role header probes:**
   - `GET /products/3` with `Cookie: session=forged-admin`, `Authorization: Bearer forged-token`, `X-User-Role: admin` → `200`, `set-cookie: null`, identical static HTML (`bodyLength: 12519`).
   - `GET /products/99` with `Cookie: session=forged-admin`, `Authorization: Bearer forged-token`, `X-User-Role: admin` → `404`, `set-cookie: null`, identical 404 HTML (`bodyLength: 9002`).

3. **Static source check:**
   - Zero `cookies()` calls, zero auth UI/forms, and zero `Set-Cookie` headers anywhere in `src/`.

## Conclusion
Storefront remains strictly public and read-only with zero cookies, sessions, or auth bypass surfaces.
