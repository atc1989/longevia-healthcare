# LONGEVIA

Next.js 16 (App Router) + Supabase + Vercel. Roles: patient, doctor, center manager, network admin.
Server Components read; Server Actions write through `security definer` SQL functions (`supabase/migrations/0002`). Browsers have read-only RLS access.

## Setup

1. Create a Supabase project. Run `supabase/migrations/0001_schema.sql`, then `0002_rls_and_functions.sql` (SQL editor or `supabase db push`).
2. Run `supabase/tests/rls_check.sql`; it should return `ok` (it rolls back).
3. `cp .env.example .env.local` and fill `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
4. `npm install && npm run dev`.
5. For local testing, turn off "Confirm email" in Supabase Auth settings (the built-in mailer is rate limited).

## Staff accounts

Everyone signs up at `/signup` as a patient. Promote staff in SQL:

```sql
update public.profiles set role = 'doctor' where id = (select id from auth.users where email = 'doc@example.com');
update public.profiles set role = 'admin'  where id = (select id from auth.users where email = 'admin@example.com');
-- center manager: needs a center (admin adds centers in the app and marks them Active)
update public.profiles set role = 'center', center_id = 'CTR-001' where id = (select id from auth.users where email = 'mgr@example.com');
```

## Deploy

Vercel: set the two env vars, then set the Supabase Site URL to the Vercel URL.
The advisor warning that signed-in users can execute the functions is expected; each function checks the caller's role.
