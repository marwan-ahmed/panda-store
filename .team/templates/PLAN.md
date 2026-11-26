# PLAN — TASK-<id>

> Ordered tasks. `allowed_write` = explicit paths, or a directory glob only for a folder the task creates.
> Never repo-wide globs, never governance files, never test files (tests belong to the test author).

| Task | Title | Acceptance | Depends on | allowed_write | Done when |
|---|---|---|---|---|---|
| T1 | <title> | AC-1, AC-2 | — | `src/lib/<file>.ts` | <observable criterion> |
| T2 | <title> | AC-3 | T1 | `src/app/api/<route>/route.ts` | <observable criterion> |
