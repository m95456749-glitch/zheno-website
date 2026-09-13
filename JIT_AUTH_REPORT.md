# Supabase JIT Auth + Postgres Test — Execution Report (Part 2)

**Project:** `kijhqsyftzufydonggeb`  
**Date:** 2026-09-13 UTC  
**Token FP:** `11ae9d171de2` (scoped `sbp_fc…`, len 44)  
**JIT Status (from Part 1):** `enabled`, `appliedSuccessfully=true`, HTTP 200  
**PR #45:** OPEN, NOT merged (as instructed)  
**Workflow:** `.github/workflows/supabase-jit-auth-test.yml` (new)  
**Latest Run:** `34780670518` (failure, as expected due to missing user_id)

---

## 1. Determine authenticated user's user_id for JIT

**Goal:** Get `gotrue_id` (user_id) via Management API.

### Attempted methods and exact results:

| # | Endpoint | HTTP | Exact Body / Error | Verdict |
|---|---|---|---|---|
| 1 | `GET /v1/profile` | **403** | `{"message":"This endpoint requires a user-scoped access token"}` | ❌ Failed — token is not user-scoped per API, requires user-scoped token |
| 2 | `GET /v1/organizations/{slug}/members` (v1) | **403** | `{"message":"Forbidden"}` | ❌ Failed — missing `members_read` permission |
| 3 | `GET /v2/organizations/{slug}/members` (v2) | **403** | `{"error":{"code":"forbidden","message":"Forbidden"}}` | ❌ Failed — missing `members_read` |
| 4 | `GET /v1/organizations/{slug}` (org details) | **403** | `{"message":"Forbidden"}` | ❌ Failed — missing `organization_admin_read` or `members_read` |
| 5 | `GET /v1/organizations` (list orgs) | **403** | (Forbidden) | ❌ Failed — missing `organizations_read` |
| 6 | `GET /v1/projects/{ref}/database/jit` (current user) | **406** | `{"message":"Failed to get user's JIT access for project","errorEventId":"c91525dd01ac4c23b81d144fdc50e9df"}` | ❌ Failed — no mapping exists yet for current user, or endpoint requires user_id |
| 7 | `GET /v1/projects/{ref}/database/jit/list` (list all) | **200** | `{"items":[]}` (0 items) — empty list | ⚠️ Success but empty — no users authorized yet, so cannot extract user_id from existing mapping |
| 8 | `POST /v1/projects/{ref}/database/jit` with `{"role":"postgres"}` | **400** | Bad Request (missing user_id) | ❌ Failed — API requires user_id |
| 9 | `POST` with `{"role":"postgres","allowed_networks":{}}` | **400** | Bad Request | ❌ Failed |
| 10 | `POST` with `{"user_roles":[{"role":"postgres"}]}` | **400** | Bad Request | ❌ Failed |

**Conclusion for Step 1:** Could NOT determine `user_id` (gotrue_id) with current token permissions.

- Token has: Project Settings Read-write (`project_admin_read/write` → 200 for project and jit-access), Database JIT Read-write (`database_jit_read` → 200 for jit/list), Database Read-write (`database_read` → 201 for query), Migrations Read-write (`database_migrations_read` → 200).
- Token **lacks**: `members_read`, `organizations_read`, `organization_admin_read`, and is not considered "user-scoped" for `/v1/profile` (error: "This endpoint requires a user-scoped access token").
- JIT list is empty (0 items), so cannot infer user_id from existing mapping.

**Exact error to report (as required):**
```
GET /v1/profile -> HTTP 403 body={"message":"This endpoint requires a user-scoped access token"}
GET /v1/organizations/{slug}/members -> HTTP 403 body={"message":"Forbidden"}
GET /v2/organizations/{slug}/members -> HTTP 403 body={"error":{"code":"forbidden","message":"Forbidden"}}
GET /v1/organizations/{slug} -> HTTP 403 body={"message":"Forbidden"}
GET /v1/organizations -> HTTP 403
GET /v1/projects/kijhqsyftzufydonggeb/database/jit -> HTTP 406 body={"message":"Failed to get user's JIT access for project","errorEventId":"c91525dd01ac4c23b81d144fdc50e9df"}
GET /v1/projects/kijhqsyftzufydonggeb/database/jit/list -> HTTP 200 body={"items":[]} (0 items)
POST /v1/projects/kijhqsyftzufydonggeb/database/jit with role postgres -> HTTP 400 Bad Request (missing user_id)
```

---

## 2. Check current JIT role mapping

- Endpoint: `GET /v1/projects/kijhqsyftzufydonggeb/database/jit/list`
- Result: **HTTP 200**, `items: []` (0 items)
- Meaning: No user is currently authorized for any role. So current user is NOT authorized for `postgres`.

---

## 3. Authorize postgres role (if needed)

**Intended operation:** `PUT /v1/projects/{ref}/database/jit` with body:
```json
{
  "user_id": "<gotrue_id>",
  "user_roles": [{"role": "postgres"}]
}
```
or alternative `{"user_id": "...", "roles": [{"role":"postgres"}]}`

**Result:** **NOT EXECUTED** — blocked because `user_id` could not be determined (see Step 1 failures). No attempt to authorize was made with a guessed user_id, as per "Do not invent a workaround".

**JIT authorization result:** **FAILED** — cannot authorize without user_id. Exact errors as listed above.

---

## 4. Test REAL PostgreSQL connection via Session Pooler 5432 with JIT

Despite missing authorization, workflow was configured with `if: always()` to still attempt connection to report exact error.

**Connection method used (exact, as required):**
```
Host: aws-1-eu-west-1.pooler.supabase.com (resolved from GET /v1/projects/{ref}/config/database/pooler -> HTTP 200, api reported 6543/transaction, using 5432 for session IPv4)
Port: 5432 (Session Pooler, IPv4-compatible)
User: postgres.kijhqsyftzufydonggeb
Database: postgres
Password: SUPABASE_ACCESS_TOKEN (masked, len 44, fp 11ae9d171de2)
SSL: require (PGSSLMODE=require)
JIT option: jit=true (PGOPTIONS="-c jit=true")
Query: SELECT current_user, current_database();
Full command:
PGPASSWORD=$SUPABASE_ACCESS_TOKEN PGSSLMODE=require PGOPTIONS='-c jit=true' psql -h aws-1-eu-west-1.pooler.supabase.com -p 5432 -U postgres.kijhqsyftzufydonggeb -d postgres -c 'SELECT current_user, current_database();'
```

**PostgreSQL connection result:** **FAILED**

**Exact error:**
```
psql: error: connection to server at "aws-1-eu-west-1.pooler.supabase.com" (54.247.26.119), port 5432 failed: FATAL:  (EJITREQUESTFAILED) failed to reach JIT provider for user postgres
```
- Exit code: 2
- Annotation: `pg error: exit=2 err=psql: error: connection to server at  aws-1-eu-west-1.pooler.supabase.com  (54.247.26.119), port 5432 failed: FATAL:  (EJITREQUESTFAILED) failed to reach JIT provider for user  postgres`

**Interpretation:** JIT is enabled (`state=enabled`), but user is not authorized for `postgres` role, so Supavisor cannot reach JIT provider. This matches JIT list being empty.

**current_user:** N/A (connection failed)  
**current_database:** N/A (connection failed)

---

## 5. What was NOT changed (as required)

- database password: no
- SSL: no (only read)
- network restrictions: no
- migrations: no (no db push, no query that writes)
- schema: no
- frontend: no
- GitHub secrets: no (only read)

No migrations run.

---

## 6. Summary for reporting (as required)

- **JIT authorization result:** FAILED — could not determine `user_id` (gotrue_id). Exact errors:
  - `GET /v1/profile → 403 This endpoint requires a user-scoped access token`
  - `GET /v1/organizations/{slug}/members → 403 Forbidden`
  - `GET /v2/organizations/{slug}/members → 403 Forbidden`
  - `GET /v1/organizations/{slug} → 403 Forbidden`
  - `GET /v1/organizations → 403`
  - `GET /v1/projects/{ref}/database/jit → 406 Failed to get user's JIT access`
  - `GET /v1/projects/{ref}/database/jit/list → 200 but empty (0 items)`
  - `POST /database/jit with role postgres → 400 Bad Request (missing user_id)`

- **PostgreSQL connection result:** FAILED — `FATAL: (EJITREQUESTFAILED) failed to reach JIT provider for user postgres` (exit 2)

- **current_user:** N/A (connection failed)

- **current_database:** N/A (connection failed)

- **Exact connection method used:**
  ```
  PGPASSWORD=$SUPABASE_ACCESS_TOKEN PGSSLMODE=require PGOPTIONS='-c jit=true' psql -h aws-1-eu-west-1.pooler.supabase.com -p 5432 -U postgres.kijhqsyftzufydonggeb -d postgres -c 'SELECT current_user, current_database();'
  Host: aws-1-eu-west-1.pooler.supabase.com
  Port: 5432 (Session Pooler IPv4)
  User: postgres.kijhqsyftzufydonggeb
  SSL: require
  JIT option: jit=true
  ```

- **Root cause:** Token lacks `members_read` / `organizations_read` / user-scoped permission needed to obtain `gotrue_id`, and JIT list is empty so user_id cannot be inferred. Without user_id, cannot authorize postgres role, so JIT provider cannot be reached.

- **Required fix to proceed (not applied, only reported):**
  - Grant token `members_read` (and `organizations_read`) or use a classic PAT (full access) or user-scoped token to call `GET /v1/profile` and obtain gotrue_id.
  - Alternatively, manually provide gotrue_id from Dashboard > Organization members (copy user_id).
  - Then `PUT /v1/projects/kijhqsyftzufydonggeb/database/jit` with `{"user_id":"<gotrue_id>","user_roles":[{"role":"postgres"}]}`.
  - After that, PostgreSQL connection with token as password, `jit=true`, SSL, via Session Pooler 5432 should succeed and return `current_user=postgres`, `current_database=postgres`.

---

## 7. PR Status

PR #45 remains **OPEN, NOT merged**, as instructed. It now contains:
- `.github/workflows/supabase-jit-enable.yml` (Part 1, success, JIT enabled)
- `.github/workflows/supabase-jit-auth-test.yml` (Part 2, fails at user_id step with exact errors, as documented)
- `JIT_REPORT.md` (Part 1 report)
- This file `JIT_AUTH_REPORT.md` (Part 2 report)

No forbidden changes made.
