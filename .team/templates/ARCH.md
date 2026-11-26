# ARCH — TASK-<id>

## 1. Context
<current state of the code this task touches; relevant ADRs>

## 2. Data model changes
| Table | Change | Column / constraint / index | Type | Notes |
|---|---|---|---|---|

**Migration plan:** <forward steps, backward (rollback) steps, data backfill if any>

## 3. Contracts
| Entry point | Method / kind | Auth requirement | Request | Response | Errors |
|---|---|---|---|---|---|

## 4. Data flow
<numbered steps from input to persistence and back>

## 5. Entry points and sensitive data
> The security auditor builds the threat model from this section.

| Entry point | Who may call it | Data read | Data written | Tenant-scoped? |
|---|---|---|---|---|

## 6. Files expected to change
- `path/to/file` — <why>

## 7. Decisions
- ADR-<n> — <title> (recorded in `.team/DECISIONS.md`)

## 8. Risks
- …
