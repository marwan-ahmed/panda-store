# IMPLEMENTATION NOTES — TASK-001

> Read by the tech manager only. The reviewers work without it on purpose.

## Decisions taken
- Used `new URL("/__not-found", request.url)` in `src/proxy.ts#proxy` for the 404 rewrite target instead of `request.nextUrl.clone()` because `NextURL` preserved a trailing slash (`/__not-found/`) when rewriting `/products/`, while `new URL("/__not-found", request.url)` deterministically normalizes the rewrite pathname to `/__not-found` with an empty search string and without trusting `Host`/`x-forwarded-host` headers.
- Kept `ProductPage` (`src/app/products/[id]/page.tsx`) and `generateMetadata` enforcing `getProductById(id)` + `notFound()` independently of `src/proxy.ts`, and `ProductsIndexPage` (`src/app/products/page.tsx`) calling `notFound()`, as defense-in-depth alongside `src/app/products/[id]/not-found.tsx` and `src/app/not-found.tsx`.

## Deviations from PLAN
- None. All T2–T5 deliverables match `PLAN.md` and `ARCH.md`.

## Not done / known limitations
- None. `typecheck`, `eslint`, `vitest`, and `next build` all pass on the T5 changes.
