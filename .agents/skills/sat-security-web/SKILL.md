---
name: sat-security-web
description: "Marwan SAT web security checklist for threat modelling and auditing web apps and APIs: the 7 attack axes mapped to OWASP Top 10:2025, ASVS 5.0 and the API Security Top 10, with what to test and what counts as proof."
---

# Marwan SAT — web security profile

References: OWASP Top 10:2025 · OWASP ASVS 5.0 · OWASP API Security Top 10. Use the project constitution too when `security.constitution` is set.

## Axis ids (use exactly these in SECURITY_AUDIT.json)
`access_control` · `authentication` · `injection` · `business_logic` · `mass_assignment_data_exposure` · `resource_abuse_uploads` · `configuration_secrets_supply_chain`

## 1. access_control — tenant isolation and authorization (OWASP A01:2025)
- Every read/write is scoped by the tenant and user taken from the **server session**, never from the URL, body, query or headers.
- Try: another tenant's id in the path; a lower role calling an admin action; changing `tenant_id`/`owner_id` in the body; listing endpoints without filters; IDs enumerated sequentially.
- Proof: request + response showing data of another tenant, or a privileged action succeeding with a lower role.

## 2. authentication — sessions and tokens
- Every server entry point requires authentication unless SPEC says it is public.
- Cookies: `HttpOnly`, `Secure`, `SameSite`. Token expiry and revocation. CSRF protection for cookie-based state changes. Brute-force protection on login/OTP.
- Try: calling the endpoint without a session, with an expired one, with another user's token; repeated login attempts.

## 3. injection — input handling
- Schema validation of every input (types, ranges, lengths, enums). Parameterised queries only; no string-built SQL. Output encoding for HTML. No user input in shell commands, file paths or outbound URLs (SSRF).
- Try: SQL metacharacters, script payloads, path traversal (`../`), internal URLs (`http://127.0.0.1`, cloud metadata addresses) — against localhost only.

## 4. business_logic — money and state
- Double submission and concurrent requests on balance-changing actions (send the same request in parallel); idempotency keys where required; multi-step money changes in one transaction; negative, zero, huge and fractional amounts; state transitions out of order.
- Proof: two parallel requests producing a double effect, or an amount/state outcome contradicting SPEC.

## 5. mass_assignment_data_exposure
- Extra fields in requests (`role`, `status`, `approved`, `tenant_id`, `balance`) must be ignored or rejected.
- Responses must not contain internal fields, password hashes, tokens or other tenants' data. Logs must not contain secrets or full personal data. Errors must not leak stack traces or SQL (OWASP A10:2025 — mishandling of exceptional conditions).

## 6. resource_abuse_uploads
- Rate limits on login, OTP, password reset, payment and expensive endpoints (check with ≤ 50 requests).
- Uploads: type allow-list by content, size limits, storage outside the web root, no path traversal in file names.

## 7. configuration_secrets_supply_chain
- No secrets in code, in client bundles or in public env vars (for example `NEXT_PUBLIC_*` in Next.js is shipped to the browser).
- Security headers (CSP, HSTS, X-Content-Type-Options, frame-ancestors). Debug modes off.
- Dependency vulnerabilities from the scanner output (OWASP A03:2025 — software supply chain failures).

## Project audit — controls that should exist (audit task, findings/security.json)
In a project audit, look for what is **absent**, not only for what is wrong. Each missing control is a `missing_control` finding:
- **Server-side authorization on every server action and route handler.** A layout, a middleware/proxy redirect or a hidden button is not a boundary: the action itself checks the session and the role (Next.js guidance: keep checks close to the data, in a data access layer).
- **Rate limiting** on login, OTP, registration, password reset, payment initiation, contact forms and any endpoint that sends mail or SMS. In serverless hosting an in-memory counter is not shared between instances.
- **Payment callbacks:** signature verified with a pinned algorithm; the order id validated; the transaction must be `pending` and belong to the same provider; amount, currency and status re-checked server-to-server with the provider; the provider's transaction id unique in the database (replay); a reconciliation path for callbacks that never arrive.
- **Security headers:** CSP (nonce-based CSP forces dynamic rendering — say so when static pages matter; start with `Content-Security-Policy-Report-Only`), HSTS, X-Content-Type-Options, frame-ancestors, Referrer-Policy, Permissions-Policy.
- **Stored URLs** (avatars, thumbnails, video links, social links): only `https:` (or an allow-list of hosts); never `javascript:` or `data:` in an `href` or `src`.
- **Account enumeration:** login and reset responses do not reveal whether an account exists or is blocked before the password is verified.
- **Password change:** requires the current password and revokes the other sessions.
- **Dependencies:** for each vulnerable package, where it is used and whether the vulnerable function is reachable; framework advisories checked at the source, not only through the audit tool.

## What is not proof
- "The code looks like it checks permissions" → `REVIEWED_STATIC`, not `TESTED_DYNAMIC`.
- A scanner warning you did not verify → triage it; it is not a confirmed finding by itself.
- "No vulnerability found" → `CLEAR_WITHIN_SCOPE` for what was tested; never "safe".

## Stack-specific: Next.js + TypeScript

- **Server Actions are public HTTP endpoints.** Every `"use server"` function authenticates and authorizes inside itself; never rely on the page that renders the form.
- **Route handlers** (`app/api/**/route.ts`) check the session and the tenant on every method.
- **Middleware is not authorization.** It may redirect, but data access must still be checked in the handler/action/data layer.
- **Client exposure:** anything prefixed `NEXT_PUBLIC_` ends up in the browser bundle. Props passed from Server Components to Client Components are serialized to the client — pass only the fields the UI needs.
- **Caching:** cached data (`fetch` cache, `unstable_cache`, route segment caching) must never be shared across tenants or users; the cache key includes the tenant/user when the data is scoped.
- **Drizzle / SQL:** the `sql` tagged template parameterizes values; `sql.raw()` and string concatenation do not. Multi-step money writes use `db.transaction(...)`.
- **Validation:** parse every input (form data, JSON, search params, route params) with a schema before use.
- **Images / fetch to user-supplied URLs:** restrict hosts to avoid SSRF.
