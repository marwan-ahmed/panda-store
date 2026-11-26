---
name: sat-nextjs-conventions
description: "Marwan SAT conventions for Next.js + TypeScript projects: where entry points live, data access and money handling, and how to write deterministic tests for route handlers, server actions and domain logic. Follow the project's existing patterns first."
---

# Next.js + TypeScript — SAT conventions

**Rule zero:** the project's existing patterns and `AGENTS.md` win over this file. Read neighbouring code before writing. No new dependencies.

## Where things live (App Router)
- Route handlers: `app/**/api/**/route.ts` (exported `GET`, `POST`, …).
- Server Actions: functions in files starting with `"use server"` (often `**/actions/**`).
- Domain logic: plain TypeScript modules (`lib/`, `src/lib/`, `features/…`) — keep calculations here, free of framework code, so they are unit-testable.
- Data access: one layer (Drizzle/Prisma) that always receives the tenant/user from the session.

## Money and dates
- Store money as integer minor units or a decimal column; never JavaScript floats for arithmetic. Drizzle `numeric` values arrive as strings — convert deliberately.
- Rounding is explicit and documented in SPEC (method and position).
- Dates: compute in UTC unless SPEC says otherwise; day counts follow the rule in SPEC (inclusive/exclusive) — write it in the code comment.
- Multi-step balance changes: one transaction (`db.transaction(async (tx) => …)`).

## Tests (test author and reviewer)
- Use the runner the project already has (Vitest or Jest). Test names start with the id: `it('AC-3: …')`.
- Domain logic: pure unit tests with explicit inputs and exact expected values.
- Route handlers: call the exported handler with a `Request` object and assert status and JSON body.
- Server actions: call the action function directly with a mocked session boundary (not a mocked action).
- Time: fake timers / fixed system time (`vi.useFakeTimers()` + `vi.setSystemTime(...)`, or Jest equivalents).
- Abuse cases: two tenants, two roles; assert 401/403/404 and the absence of the other tenant's fields.
- Database: use the project's test database setup; never production; synthetic data from `.team/seed/`.
