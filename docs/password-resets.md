# Password resets

There is **no public "forgot password"** for Security accounts. Security
officers get their password reset by an Admin, in person. Admins have two
self-recovery paths.

## 1. Admin — self-service reset by email

On the login screen, click **"Emergency Reset?"** under the Passcode
field, enter the Admin email, and submit.

- The server (`POST /api/profile/request-reset`, unauthenticated) looks
  the address up and **only sends a Supabase recovery email if it belongs
  to an `admin` profile**. For a Security address or an unknown address it
  does nothing, but returns the same "if this is an Admin account, a link
  has been sent" message — so the endpoint can't be used to probe which
  emails exist or which are Admins.
- The email link lands on `/set-password`, which detects the recovery
  session and shows "Reset your password". Setting a new password there
  calls `supabase.auth.updateUser({ password })`.
- Audit log: `admin_password_reset_requested` (method `email`).

### Supabase config required

The recovery link's `redirectTo` is `https://<deployment-host>/set-password`.
That URL must be in **Supabase Dashboard → Authentication → URL
Configuration → Redirect URLs** or the link will be rejected. Add both the
production domain and any preview domains you use.

## 2. Admin — direct change via Supabase

Use this when email is unavailable (e.g. mailbox lost, DNS issue).

### Preferred: Supabase Dashboard

**Authentication → Users → (select the user) → "Reset password"** (or
"Send recovery"). This is the officially supported path and needs no SQL.

### SQL Editor (last resort)

Supabase stores a bcrypt hash in `auth.users.encrypted_password`. The
`pgcrypto` functions `crypt()` / `gen_salt()` are available in the SQL
editor:

```sql
update auth.users
set encrypted_password = crypt('THE-NEW-PASSWORD', gen_salt('bf'))
where email = 'admin@soho.estate';
```

Notes:
- Pick a strong password; it becomes the live password immediately.
- This bypasses the app entirely, so there is **no audit-log entry** —
  record the change yourself.
- Do not touch other `auth.users` columns.
- The user is not forced to change it afterwards; rotate it via method 1
  once access is restored if you want a value only they know.

## 3. Security officer — reset by an Admin (in app)

**Admin → Users → Existing accounts →** find the officer **→ "Set new
password"**.

- Admin types the new password (min. 10 chars) twice and saves.
- Server: `POST /api/users { action: 'set-password', user_id, password }`
  (admin-only) → `supabase.auth.admin.updateUserById(id, { password })`.
- The password takes effect **immediately** and the officer is **not**
  asked to change it on next login (`must_change_password` stays false) —
  per the operational choice that the Admin sets the working password and
  hands it over directly.
- Audit log: `user_password_reset` (by `admin`, with `target_role`).
- The same action works on another Admin account too, but the primary
  Admin recovery path is method 1.
