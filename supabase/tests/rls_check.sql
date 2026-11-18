-- Run in the Supabase SQL editor after the migrations. Rolls back; returns 'ok' if every check passes.
begin;

insert into public.centers (id, name, city, type, manager, status) values
  ('CTR-T1', 'Test One', 'A', 'Company-owned', 'M', 'Active'),
  ('CTR-T2', 'Test Two', 'B', 'Company-owned', 'M', 'Active');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'p1@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'p2@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', 'd1@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', 'c1@test.local');

update public.profiles set role = 'doctor' where id = '00000000-0000-0000-0000-0000000000d1';
update public.profiles set role = 'center', center_id = 'CTR-T1' where id = '00000000-0000-0000-0000-0000000000c1';
delete from public.patients where user_id in ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1');

insert into public.bookings (id, patient_id, doctor_id, center_id, date, time, service)
select 'GG-T1', id, '00000000-0000-0000-0000-0000000000d1', 'CTR-T1', current_date + 1, '10:00', 'Initial consultation'
  from public.patients where user_id = '00000000-0000-0000-0000-0000000000a1';
insert into public.bookings (id, patient_id, doctor_id, center_id, date, time, service)
select 'GG-T2', id, '00000000-0000-0000-0000-0000000000d1', 'CTR-T2', current_date + 1, '11:00', 'Initial consultation'
  from public.patients where user_id = '00000000-0000-0000-0000-0000000000a2';
insert into public.lab_uploads (patient_id, path, name, label, size_bytes)
select id, user_id::text || '/x.pdf', 'x.pdf', 'test', 1 from public.patients
  where user_id = '00000000-0000-0000-0000-0000000000a1';

-- patient 1
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare n int;
begin
  assert (select count(*) from public.patients) = 1, 'patient sees only self';
  assert (select count(*) from public.bookings) = 1, 'patient sees own booking only';
  assert (select count(*) from public.lab_uploads) = 1, 'patient sees own upload';
  begin
    update public.bookings set status = 'Completed'; get diagnostics n = row_count;
    assert n = 0, 'direct update must change nothing';
  exception when insufficient_privilege then null; end; -- denied outright is fine too
  begin
    perform public.advance_booking('GG-T1'); assert false, 'patient must not advance';
  exception when insufficient_privilege then null; end;
  begin
    perform public.add_center('x', 'Company-owned', 'y', 'z'); assert false, 'patient must not add center';
  exception when insufficient_privilege then null; end;
  perform public.book_appointment(null, '00000000-0000-0000-0000-0000000000d1', 'CTR-T1', current_date + 2, '09:00', 'Follow-up review');
  assert (select count(*) from public.bookings) = 2, 'patient can book';
end $$;
reset role;

-- center manager of T1
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
do $$
begin
  assert (select count(*) from public.bookings where center_id = 'CTR-T2') = 0, 'center cannot see other center';
  assert (select count(*) from public.bookings) >= 1, 'center sees own bookings';
  assert (select count(*) from public.lab_uploads) = 0, 'center cannot read lab uploads';
  assert (select count(*) from public.markers) = 0, 'center cannot read markers';
  begin
    perform public.advance_booking('GG-T2'); assert false, 'center must not advance other center booking';
  exception when insufficient_privilege then null; end;
  perform public.advance_booking('GG-T1');
  assert (select status from public.bookings where id = 'GG-T1') = 'Confirmed', 'center advances own booking';
end $$;
reset role;

-- doctor
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
do $$
begin
  assert (select count(*) from public.lab_uploads) = 1, 'doctor sees uploads of booked patients';
  assert (select count(*) from public.patients) = 2, 'doctor sees booked patients';
end $$;
reset role;

select 'ok' as result;
rollback;
