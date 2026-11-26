# THREAT MODEL — TASK-<id>

> Profile: <web | mobile>. References: OWASP Top 10:2025, ASVS 5.0, API Security Top 10 (web) · MASVS v2.1 (mobile).

## 1. Assets
- <data, money, privileges an attacker wants>

## 2. Entry points
| Entry point | Added / modified | Callers | Auth |
|---|---|---|---|

## 3. Trust boundaries
- …

## 4. Threats
| Entry point | Axis | Threat | Likelihood | Impact |
|---|---|---|---|---|

## 5. Abuse cases
- **AB-1** (axis: access_control · entry: `GET /api/<resource>/<id>` · ref: OWASP A01:2025 · → T2):
  As a user of tenant B, I request a record that belongs to tenant A.
  **Expected secure behaviour:** 404 (or 403), no field of tenant A's record in the response or the logs.
- **AB-2** (axis: business_logic · entry: … · ref: … · → T<n>): …

<!-- If there is truly no entry point, replace section 5 with a single line:
NO-ABUSE-CASES: <reason> -->
