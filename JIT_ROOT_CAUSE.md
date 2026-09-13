# Supabase JIT authorization blocker — root cause and exact next action

**Project:** `kijhqsyftzufydonggeb` ("Zheno", `eu-west-1`)
**Organization:** `cgxwfominmfceelbpqbt`
**Date:** 2026-09-13 UTC
**Token in `SUPABASE_ACCESS_TOKEN`:** scoped fine-grained PAT (`sbp_fc…`), length 44, `sha256[1:12] = 509ba10d74a7`
**Status:** root cause identified and verified against live API responses. **No JIT role was authorized.** No migration, schema, password, SSL, network or frontend change was made.

---

## 0. One correction to the brief, up front

> PR #45 is OPEN and MUST NOT be merged.

PR #45 is **already merged**. Verified via the GitHub API:

```
GET /repos/m95456749-glitch/zheno-website/pulls/45
  state      = closed
  merged     = true
  merged_at  = 2026-09-13T21:12:05Z
  merge_commit_sha = 6d5b0312e4f6830b34e410c26222b2a2f7d43e59
```

`6d5b0312` is the commit this session's branch was created from, so the merge happened
before this session started. Nothing was merged by me and there is nothing left to merge.
The three JIT workflows and the two earlier reports are therefore already on `main`.
I have not reverted `main`, since that was not requested and would be destructive.

---

## 1. Executive summary

**The blocker is not a permissions problem.** `members_read` and `organizations_read` are
not required to authorize JIT access, and chasing them was a dead end caused by an
incorrect assumption about the API contract.

Three separate things were wrong:

| # | Assumption made | Reality (verified) |
| --- | --- | --- |
| 1 | `GET /v1/organizations/{slug}` is unlocked by `organizations_read` | It is gated by **`organization_admin_read`**. `organizations_read` unlocks exactly one endpoint: `GET /v1/organizations`. |
| 2 | `members_read` should have made `/members` work | The permission name is right, but the token's **organization resource scope is empty** — proven by `GET /v1/organizations → 200 []`. Org-scoped calls are denied at the resource layer regardless of permissions. |
| 3 | JIT authorization needs a `user_id` obtained from `/v1/profile` or `/members` | **It does not.** `POST /v1/projects/{ref}/database/jit` takes `{role, rhost}` — there is no `user_id` field — resolves the caller from the bearer token, needs only **`database_jit_read`**, and **returns the `user_id`**. |

The earlier `HTTP 400` responses were caused by the **missing required field `rhost`**, not
by a missing `user_id`.

Nothing needs to be weakened. The correct call produces an **IP-bound** grant, which is a
tighter posture than what was being attempted.

---

## 2. Evidence base

Conclusions were taken from Supabase's own sources, not inferred:

| Source | What it settles |
| --- | --- |
| `supabase/supabase` → `apps/docs/spec/api_v1_openapi.json`, `x-fga-permissions` | The exact fine-grained permission gating every endpoint. |
| same file, `components.schemas.AuthorizeJitAccessBody` | `POST /database/jit` body = `{role, rhost}`, both **required**, `rhost` = IPv4 **or** IPv6 **literal**, example `{"role":"postgres","rhost":"203.0.113.10"}`. |
| same file, `components.schemas.UpdateJitAccessBody` | `PUT /database/jit` body = `{user_id, roles}` — key is **`roles`**, `expires_at` example `1740787200` (**seconds**). |
| same file, `JitAuthorizeAccessResponse_Output` | The `POST` 200 response contains **`user_id` (uuid, required)**. |
| `supabase/supabase` → `apps/studio/data/jit-db-access/jit-db-access-grant-mutation.ts` | The Dashboard itself sends `{ user_id, roles }` to `PUT /database/jit` — confirms `roles`, not `user_roles`. |
| `supabase/supabase` → `apps/studio/data/scoped-access-tokens/scoped-access-token-create-mutation.ts` | A scoped PAT is created from **`{ name, organization_slugs, project_refs, permissions, expires_at }`** — resources and permissions are **two independent axes**. |
| `supabase/supabase` → `apps/docs/content/_partials/access-control/scoped_pat_permissions.mdx` (generated) | Permission → endpoint matrix reproduced in §4. |
| [Personal Access Tokens guide](https://supabase.com/docs/guides/platform/personal-access-tokens) | "Scoped tokens carry only the **organizations, projects, and permissions** you choose"; scoped PATs start with `sbp_fc`. |
| [Temporary access guide](https://supabase.com/docs/guides/platform/temporary-access) | Feature prerequisites and the psql connection form. |

Live API evidence comes from Actions run **34782819357** ("Probe token perms",
2026-09-13T21:06:39Z) which used the **current** secret (`fp=509ba10d74a7`), plus runs
34782868355 / 34782898130 / 34782898139 / 34782898145.

---

## 3. Task 2 — is the GitHub secret the newly regenerated token?

**Yes.** The bot identity used here cannot read repository secrets
(`GET /actions/secrets → 403 Resource not accessible by integration`), so the only safe
method is a SHA-256 fingerprint computed inside a runner, with the token itself masked.
That fingerprint changed between the two batches of runs:

| Window (UTC) | Runs | Token fingerprint | Class |
| --- | --- | --- | --- |
| 20:11 – 20:24 | 34779992755, 34780053517, 34780670518 | `11ae9d171de2` | scoped `sbp_fc…`, len 44 |
| 21:05 – 21:08 | 34782728905, 34782728973, 34782819300, 34782898139 | **`509ba10d74a7`** | scoped `sbp_fc…`, len 44 |

`11ae9d171de2` is the fingerprint written into `JIT_REPORT.md` / `JIT_AUTH_REPORT.md`;
`509ba10d74a7` is what every run since 21:05 sees. So the secret **was** rotated, and all
the 403 evidence quoted in the brief was produced by the **new** token — the 403s are not a
stale-secret artifact.

`sbp_fc` is the documented prefix of a scoped (fine-grained) PAT, and length 44 matches.
The token has never been printed; only its fingerprint is reported.

**Yes, effective scopes can be detected safely** — by differential probing: one read-only
endpoint per documented permission, comparing the observed HTTP status with the
`x-fga-permissions` requirement. That is exactly what
`.github/workflows/supabase-jit-readonly-check.yml` now does (GET only, token masked,
emails redacted).

---

## 4. Task 1 & 3 — why `members_read` / `organizations_read` are not effective

### 4.1 The authoritative permission map

Straight from `x-fga-permissions` in `api_v1_openapi.json`:

```
GET    /v1/profile                              -> NONE  (responses: 200 only)
GET    /v1/projects                             -> projects_read
GET    /v1/projects/{ref}                       -> project_admin_read
GET    /v1/projects/{ref}/jit-access            -> project_admin_read
PUT    /v1/projects/{ref}/jit-access            -> project_admin_write
GET    /v1/projects/{ref}/database/jit          -> database_jit_read
POST   /v1/projects/{ref}/database/jit          -> database_jit_read     <-- the fix
PUT    /v1/projects/{ref}/database/jit          -> database_jit_write
GET    /v1/projects/{ref}/database/jit/list     -> database_jit_write
DELETE /v1/projects/{ref}/database/jit/{user_id}-> database_jit_write
POST   /v1/projects/{ref}/database/jit/invite   -> database_jit_write
GET    /v1/projects/{ref}/config/database/pooler-> database_pooling_config_read
GET    /v1/organizations                        -> organizations_read
GET    /v1/organizations/{slug}                 -> organization_admin_read
GET    /v1/organizations/{slug}/entitlements    -> organization_admin_read
GET    /v1/organizations/{slug}/members         -> members_read
GET    /v1/organizations/{slug}/projects        -> organization_projects_read
```

Supabase's generated permission matrix agrees, and shows the UI labels:

- **Organizations** (Read) → *List all organizations* — **that one endpoint only**
- **Organization Settings** (Read) → *Get an organization*, *Get organization entitlements*
- **Organization Members** (Read) → *List organization members* (v1 + v2), *List organization roles*
- **Database JIT** (Read) → **Authorize JIT access**, Get JIT access
- **Database JIT** (Read-write) → List / Update / Delete JIT access, Invite external

### 4.2 Root cause 1 — `GET /v1/organizations/cgxwfominmfceelbpqbt` → 403

**This endpoint is gated by `organization_admin_read` ("Organization Settings: Read"), not
by `organizations_read`.** The permission that was granted does not cover it, so the 403 is
correct and expected. Re-selecting `organizations_read` any number of times will never
change this result. Unlocking it would require adding **Organization Settings: Read** — and
it is not needed for JIT.

The organization identifier format was **not** the problem. Run 34782819357 shows
`GET /v1/projects/kijhqsyftzufydonggeb` → 200 with

```
"organization_id":   "cgxwfominmfceelbpqbt"   (deprecated field)
"organization_slug": "cgxwfominmfceelbpqbt"
"name": "Zheno", "region": "eu-west-1"
```

The org endpoints take the **slug**, and here slug == id, so `cgxwfominmfceelbpqbt` is the
right value.

### 4.3 Root cause 2 — `GET /v1/organizations/cgxwfominmfceelbpqbt/members` → 403

Here the permission name **is** correct (`members_read`), so the denial comes from the
other axis of a scoped PAT: its **resource scope**.

A scoped token is created from
`{ name, organization_slugs, project_refs, permissions, expires_at }`.
`organization_slugs` and `project_refs` are **separate explicit lists**, independent of
`permissions`. A permission only ever narrows what the account can already do *within the
selected resources*; if no organization was selected as a resource, no organization
permission has anything to act on.

**Proof from the live API (run 34782819357, current token):**

```
GET /v1/organizations                              -> HTTP 200  body=[]
GET /v1/organizations/cgxwfominmfceelbpqbt         -> HTTP 403  {"message":"Forbidden"}
GET /v1/organizations/cgxwfominmfceelbpqbt/members -> HTTP 403  {"message":"Forbidden"}
GET /v2/organizations/cgxwfominmfceelbpqbt/members -> HTTP 403  {"error":{"code":"forbidden","message":"Forbidden"}}
```

`GET /v1/organizations` is the single endpoint `organizations_read` gates, and it takes no
slug. It returned **200**, so `organizations_read` **is** attached and effective — and it
returned an **empty array**, so the token's organization resource list is **empty**.

The empty array cannot mean "this account belongs to no organizations": the same token sees
project `kijhqsyftzufydonggeb`, and that project reports `organization_slug =
cgxwfominmfceelbpqbt` ("Zheno"). So the account belongs to that organization; the *token*
simply does not have it in scope.

**This is the exact setting that must change** if organization endpoints are ever wanted:
when creating the scoped PAT, add the organization **`cgxwfominmfceelbpqbt`** to
*Resource access* (`organization_slugs`) in addition to the project. Adding permissions is
not the fix. **It is not required for JIT** — see §5.

### 4.4 `GET /v1/profile` → 403 is by design, permanently

The spec declares **no `x-fga-permissions`** for `GET /v1/profile` and only a `200`
response. It is gated at the gateway on token *class*, not on a permission — hence the body
`{"message":"This endpoint requires a user-scoped access token"}`. Its response schema is
`V1ProfileResponse_Output = {gotrue_id, primary_email, username}`, i.e. it is indeed the
documented source of `gotrue_id`, but **no fine-grained PAT can ever reach it**. There is
no permission to select. This was correctly diagnosed before; the mistake was treating it
as a blocker.

---

## 5. Task 5 — the endpoint that yields `user_id` without `members_read`

```
POST /v1/projects/{ref}/database/jit
  summary             : Authorize user-id to role mappings for JIT access
  description         : "Authorizes the request to assume a role in the project database"
  x-fga-permissions   : [["database_jit_read"]]
  requestBody (AuthorizeJitAccessBody):
      role  : string, minLength 1              REQUIRED
      rhost : anyOf [ ipv4 literal, ipv6 literal ]  REQUIRED
      required: ["role", "rhost"]              <-- there is NO user_id field
      example : {"role": "postgres", "rhost": "203.0.113.10"}
  200 (JitAuthorizeAccessResponse_Output):
      user_id   : uuid    REQUIRED             <-- this is the gotrue_id
      user_role : { role, expires_at?, allowed_networks?, branches_only? }
```

The API resolves the user **from the bearer token**. One call therefore both authorizes the
caller and reveals the `user_id` — no `members_read`, no `organizations_read`, no
`organization_admin_read`, no `/v1/profile`, and **no classic PAT**.

**The token already satisfies the gate.** Two independent live proofs:

- `GET /v1/projects/{ref}/database/jit` → **406**, not 403
  (`{"message":"Failed to get user's JIT access for project","errorEventId":"0faf37f134c84c8db481b805b1dddb1e"}`).
  A 406 means the `database_jit_read` gate **passed** and the call failed semantically —
  there is no mapping for this user yet. The API had already resolved the caller's identity.
- `GET /v1/projects/{ref}/database/jit/list` → **200** `{"items":[]}`. That endpoint is
  gated by `database_jit_write`, so the token holds **Database JIT: Read-write**, which
  also covers `PUT` and `DELETE /database/jit/{user_id}`.

### Why the previous `POST` attempts returned 400

| Payload sent | Result | Real reason |
| --- | --- | --- |
| `{"role":"postgres"}` | 400 | **`rhost` missing** (required) |
| `{"role":"postgres","allowed_networks":{}}` | 400 | **`rhost` missing**; `allowed_networks` is not a field of this body |
| `{"user_roles":[{"role":"postgres"}]}` | 400 | **both `role` and `rhost` missing**; `user_roles` is not a field of this body |

None of them failed for want of a `user_id`.

### `PUT` contract (for follow-up tuning)

```
PUT /v1/projects/{ref}/database/jit        x-fga-permissions: [["database_jit_write"]]
  body: { user_id: uuid, roles: [ { role, expires_at?, allowed_networks?: {allowed_cidrs:[{cidr}], allowed_cidrs_v6:[{cidr}]}, branches_only? } ] }
```

Two traps here:

- the array key is **`roles`**, not `user_roles`. The
  [Temporary access guide](https://supabase.com/docs/guides/platform/temporary-access) still
  shows `user_roles`; the spec and the Dashboard's own
  `jit-db-access-grant-mutation.ts` both use `roles`. The guide page is stale.
- `expires_at` is in **seconds** (spec example `1740787200`; the Dashboard types comment
  "Unix timestamp in seconds per role"). The guide's `1758721065775` is milliseconds and is
  also stale.
- `allowed_cidrs[].cidr` must be a **CIDR** (`203.0.113.0/24`), whereas `rhost` in the
  `POST` must be a **bare IP literal** — the two are not interchangeable.

---

## 6. Exact next action

Per instruction, **the `postgres` role has NOT been authorized** and no write request of any
kind was issued. Everything below is staged and ready.

### Option A — one command, from the machine that will actually connect

`rhost` must be the IP the Postgres client will connect **from**, so resolve it on that
machine:

```bash
export PROJECT_REF=kijhqsyftzufydonggeb
export SUPABASE_ACCESS_TOKEN='<the scoped PAT already in the GitHub secret>'
export RHOST="$(curl -s -4 https://api.ipify.org)"     # bare IPv4 literal, no CIDR

curl -X POST "https://api.supabase.com/v1/projects/${PROJECT_REF}/database/jit" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"role\": \"postgres\", \"rhost\": \"${RHOST}\"}"
```

Expected: `HTTP 200` and

```json
{"user_id":"<gotrue_id>","user_role":{"role":"postgres","expires_at":…,"allowed_networks":{…}}}
```

That `user_id` is the `gotrue_id` that has been missing all along. Then connect
(SSL enforcement is already on and Temporary Access is `enabled`):

```bash
psql "host=aws-1-eu-west-1.pooler.supabase.com port=5432 \
user=postgres.kijhqsyftzufydonggeb dbname=postgres \
sslmode=require options='-c jit=true'"
# password = the same scoped PAT
```

Session pooler **5432** is correct for this: the guide states temporary access does not work
over the IPv6 transaction pooler, while direct connections and the IPv4 session pooler are
fully supported. `GET /v1/projects/{ref}/config/database/pooler` reporting `db_port: 6543`
is the *transaction* pooler and is not the port to use here.

### Option B — in CI, via the workflow added by this change

`.github/workflows/supabase-jit-authorize.yml` (**Supabase JIT authorize (gated)**).
It must be on the default branch before it can be dispatched, i.e. this branch has to land
on `main` first. Then:

```
Actions → "Supabase JIT authorize (gated)" → Run workflow
  project_ref = kijhqsyftzufydonggeb
  role        = postgres
  confirm     = true          # anything else = dry run, no write is issued
```

Design notes that matter for correctness:

- **`workflow_dispatch` only.** It can never be triggered by a `pull_request`, so no PR can
  cause a JIT grant.
- **Dry run by default.** `confirm` defaults to `false`, which prints the exact request and
  exits without issuing it.
- **Authorize and the psql verification run in the same job.** A GitHub-hosted runner's
  egress IP is per-job, so a grant made in one job would not match the IP of another.
- The grant is **IP-bound** to the runner's own egress IPv4, and `rhost` is validated
  against the strict IPv4 pattern taken verbatim from `AuthorizeJitAccessBody`.
- `expires_hours > 0` issues a follow-up `PUT` with `roles` and `expires_at` in **seconds**.
- `revoke_after_test = true` calls `DELETE /v1/projects/{ref}/database/jit/{user_id}`.
- The token is masked, passed to `psql` via `PGPASSWORD` (never on a command line), and only
  a SHA-256 fingerprint is reported.

### Not needed, do not do

- Do **not** switch to a classic PAT. Nothing here requires full access.
- Do **not** add `organization_admin_read`, `members_read` or `organizations_read` for JIT.
  They are irrelevant to it. (Only add the *organization as a resource* if you separately
  want org/member endpoints to work — see §4.3.)
- Do **not** retry `POST` with a `user_id` field, or `PUT` with `user_roles`.

---

## 7. What changed in the repository

| File | Change | Why |
| --- | --- | --- |
| `.github/workflows/supabase-jit-readonly-check.yml` | Rewritten as a strictly GET-only differential permission / resource-scope probe | Replaces ad-hoc guessing with the probe matrix derived from `x-fga-permissions`; explicitly distinguishes "permission missing" from "resource out of scope" and reports the token fingerprint safely |
| `.github/workflows/supabase-jit-authorize.yml` | Added | Implements the **correct** contract (`{role, rhost}`, `roles`, seconds), gated and dry-run by default, dispatch-only |
| `.github/workflows/supabase-jit-auth-test.yml` | **Deleted** | Temporary diagnostic encoding the wrong contract: it depended on `/v1/profile`, used `user_roles`, sent `POST` without `rhost`, and attempted live JIT mutations plus real psql connections on `pull_request` events |
| `JIT_ROOT_CAUSE.md` | Added | This report |

Kept: `.github/workflows/supabase-jit-enable.yml` (the main JIT workflow — JIT is already
`enabled`, `appliedSuccessfully=true`), `supabase-migrate.yml`, `ci.yml`, `deploy.yml`.
No migration, schema, SQL, frontend, secret, database password, SSL or network setting was
changed.

Two stale workflow registrations remain on GitHub from files deleted in the earlier cleanup
commit (`Probe token perms` id 357344775, `Supabase JIT final readonly check` id 357345191).
They point at files that no longer exist and cannot run; deleting them needs
`actions:write`, which this bot identity does not have
(`GET /actions/secrets → 403 Resource not accessible by integration`). Harmless, but they
can be removed from the Actions UI by a maintainer.

---

## 8. Constraint compliance

| Constraint | Status |
| --- | --- |
| Do not authorize the `postgres` JIT role yet | ✅ Not done. No `POST`/`PUT`/`DELETE` was issued against `/database/jit` |
| Do not run migrations | ✅ None |
| Do not change schema or migration SQL | ✅ `supabase/` untouched |
| Do not change frontend code | ✅ `src/`, `index.html`, `vite.config.ts` untouched |
| Do not expose or print the PAT | ✅ Masked via `::add-mask::`; only `sha256[1:12]` reported |
| Do not create unnecessary permissions | ✅ None requested; §6 explicitly says not to add any |
| Keep checks read-only until root cause identified | ✅ Only GET requests were made, and the root cause came from Supabase's own spec + prior run evidence |
| Clean up only clearly unnecessary temporary diagnostics | ✅ Deleted `supabase-jit-auth-test.yml`; kept the main JIT workflow |
| Do not merge PR #45 | ✅ Not merged by me — it was already merged at 21:12:05Z, before this session (see §0) |
| Do not repeat an already-performed permission change without proof | ✅ §4.2/§4.3 prove `organizations_read` is attached but does not gate that endpoint, and that the org resource scope is empty |
