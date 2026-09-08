# Society Entry Management System

A resident registry for a residential society, with Security staff submitting
new residents for Admin approval. Built on React (Vite), Vercel Serverless
Functions, and Supabase (Postgres, Auth, Storage) — free tiers throughout.

## Roles

- **Admin** — full access: manage residents directly, approve/reject
  submissions, create users, view the dashboard and audit log.
- **Security** — search/view residents, submit new residents for approval,
  view the status of their own submissions.

There is no public signup. Only an Admin can create accounts, and new users
set their own password on first login via a Supabase invite email.

## 1. Create the Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. In **Authentication → Settings**:
   - Disable "Allow new users to sign up."
   - Set minimum password length to **10**.
   - Leave rate limiting on (default).
3. In the **SQL Editor**, run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
4. In **Storage**, create a bucket named `resident-photos` and leave it
   **private** (not public).

## 2. Configure environment variables

Copy `.env.example` to `.env` and fill in the values from your Supabase
project's API settings:

```
VITE_SUPABASE_URL=...          # client-safe
VITE_SUPABASE_ANON_KEY=...     # client-safe
SUPABASE_URL=...               # server-only
SUPABASE_SERVICE_ROLE_KEY=...  # server-only — never expose to the browser
BOOTSTRAP_ADMIN_EMAIL=...      # used once, locally, by the bootstrap script
BOOTSTRAP_ADMIN_NAME=...
```

The `SUPABASE_SERVICE_ROLE_KEY` must **never** be prefixed with `VITE_` and
must never be imported from anything under `src/`.

## 3. Bootstrap the first Admin

There's no signup route, so the first Admin account is created with a local
script:

```bash
npm install
npm run bootstrap-admin
```

This invites `BOOTSTRAP_ADMIN_EMAIL` and creates their `profiles` row with
`role = 'admin'`. They'll receive an email to set their password, then can
log in and create further Admin/Security accounts from the app.

## 4. Run locally

```bash
npm install
vercel dev
```

`vercel dev` runs both the Vite frontend and the `/api` serverless functions
together. (Install the Vercel CLI with `npm i -g vercel` if you don't have
it.) Alternatively, run `npm run dev` for frontend-only work against a
already-deployed API.

## 5. Deploy

1. Push this repo to GitHub.
2. Import it into [Vercel](https://vercel.com).
3. Add the same environment variables from `.env` to the Vercel project
   (Production and Preview environments).
4. Deploy. Confirm `GET /api/health` returns `200`.

## 6. Keep Supabase warm

Free-tier Supabase projects pause after a period of inactivity. This repo
includes [`.github/workflows/keep-alive.yml`](.github/workflows/keep-alive.yml),
which pings `/api/health` every 6 hours.

1. In your GitHub repo settings, add a secret named `APP_URL` set to your
   deployed Vercel URL (e.g. `https://your-app.vercel.app`).
2. The workflow runs automatically on schedule, or trigger it manually from
   the Actions tab.

## Project structure

```
api/              Vercel Serverless Functions (Node)
  _lib/           auth verification, service-role client, audit logging
  users/          POST create Admin/Security user
  residents/      GET/POST list & create, GET/PATCH/DELETE by id
  pending/        GET/POST list & submit, approve/reject by id
  dashboard.js    GET analytics totals
  audit-log.js    GET paginated audit history
  photos/         signed upload/read URLs for resident-photos bucket
  health.js       liveness check (used by keep-alive workflow)
src/              React app
  pages/security/ Security-facing pages
  pages/admin/    Admin-facing pages
  components/     shared UI (forms, layout, protected routes, photo viewer)
  context/        auth session + profile context
  lib/            Supabase client (anon key) and API fetch helper
supabase/
  migrations/     SQL schema, RLS policies, approval RPC
scripts/
  bootstrap-admin.js  one-time first-Admin creation, run locally
```

## Security notes

- Every mutating API route re-verifies the caller's Supabase access token
  and checks their role from `profiles` before touching data — the client
  is never trusted to self-report its role.
- Row Level Security is enabled on all four tables as a read-side safety
  net; all writes go through the serverless functions using the
  service-role key.
- Resident photos are served via short-lived signed URLs against a private
  Storage bucket, never a public one.
- Approving a pending submission runs through a single Postgres function
  (`approve_pending_submission`) that locks the row, checks it hasn't
  already been reviewed, and inserts the resident — so retries or
  double-clicks can't create duplicate residents. Flat number uniqueness is
  enforced by a database constraint.
- No passwords or access tokens are ever written to the audit log.

## Non-goals

This system manages the resident *directory*, not day-to-day gate entries —
no visitor logging, QR codes, or vehicle tracking. No multi-society support,
no custom roles beyond Admin/Security, no real-time features. Keep it
simple.
