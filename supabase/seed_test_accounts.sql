-- Creates one test account per role (patient2/doctor2/center2/admin2 @longevia.invalid).
-- Dev/test projects only. Never run against a live database.
-- Supabase rejects fake email domains on signup, so this inserts into auth.users directly.
-- supabase/cleanup_test_data.sql removes them again (same @longevia.invalid pattern).
--
-- Before running: replace CHANGE_ME below with a password of your own. Do not commit it.
--   supabase db query --linked -f supabase/seed_test_accounts.sql
-- Safe to re-run: emails that already exist are skipped.

do $$
declare
  pw  text := 'CHANGE_ME';
  r   record;
  uid uuid;
  ctr text := (select id from public.centers where status = 'Active' order by id limit 1);
begin
  if length(pw) < 12 then  -- the CHANGE_ME placeholder is shorter than this, so it trips too
    raise exception 'Set a password of at least 12 characters in this file first';
  end if;

  for r in select * from (values
    ('patient2@longevia.invalid', 'Test Patient 2',        'patient'),
    ('doctor2@longevia.invalid',  'Dr. Test Doctor 2',     'doctor'),
    ('center2@longevia.invalid',  'Test Center Manager 2', 'center'),
    ('admin2@longevia.invalid',   'Test Admin 2',          'admin')) v(email, name, role)
  loop
    continue when exists (select 1 from auth.users where email = r.email);
    uid := gen_random_uuid();

    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new)
    values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', r.email,
      extensions.crypt(pw, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', r.name),
      now(), now(), '', '', '', '');

    insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), uid, uid::text, 'email',
      jsonb_build_object('sub', uid::text, 'email', r.email), now(), now(), now());

    -- The signup trigger made a patient profile; promote the staff roles and drop their patient row.
    if r.role <> 'patient' then
      update public.profiles
         set role = r.role::public.user_role,
             center_id = case when r.role = 'center' then ctr end
       where id = uid;
      delete from public.patients where user_id = uid;
    end if;
  end loop;
end $$;

select u.email, p.role, p.center_id
  from auth.users u join public.profiles p on p.id = u.id
 where u.email like '%2@longevia.invalid'
 order by 2;
