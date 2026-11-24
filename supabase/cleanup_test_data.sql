-- Removes the test users (*@longevia.invalid) and everything they created.
-- Real accounts are untouched. Not a migration: run it once by hand.
--   supabase db query --linked -f supabase/cleanup_test_data.sql
-- Delete the uploaded files first (see the end of this file), then run this.

begin;

create temp table t_users on commit drop as
  select id from auth.users where email like '%@longevia.invalid';
create temp table t_patients on commit drop as
  select id from public.patients where user_id in (select id from t_users);

-- Children first: these tables have no ON DELETE CASCADE to patients.
delete from public.markers      where patient_id in (select id from t_patients);
delete from public.lab_uploads  where patient_id in (select id from t_patients);
delete from public.lab_requests where patient_id in (select id from t_patients);
delete from public.orders       where patient_id in (select id from t_patients);
delete from public.bookings     where patient_id in (select id from t_patients)
                                   or doctor_id in (select id from t_users);

delete from public.patients where id in (select id from t_patients);
-- Cascades to profiles and auth.identities.
delete from auth.users where id in (select id from t_users);

-- Test center (added during the walkthrough). Uncomment once nothing real points at it.
-- delete from public.centers where id = 'CTR-001';
-- To make the next center CTR-001 again (only if the centers table is now empty):
-- alter sequence public.center_seq restart with 1;
-- alter sequence public.patient_seq restart with 1001;
-- alter sequence public.booking_seq restart with 2401;
-- alter sequence public.order_seq restart with 601;

-- Should all be 0 for test data; real users show up in the profiles count.
select
  (select count(*) from auth.users where email like '%@longevia.invalid') as test_users_left,
  (select count(*) from public.profiles) as profiles_left,
  (select count(*) from public.patients) as patients_left,
  (select count(*) from public.bookings) as bookings_left,
  (select count(*) from public.centers) as centers_left;

commit;

-- ---------- uploaded files ----------
-- Supabase blocks deleting storage rows with SQL, so remove the files through the dashboard
-- (Storage > lab-reports, delete the folders below) or the API. List them BEFORE running the cleanup:
--
--   select o.name from storage.objects o
--   where o.bucket_id = 'lab-reports'
--     and (storage.foldername(o.name))[1] in
--       (select id::text from auth.users where email like '%@longevia.invalid');
