-- Row level security (read only for browsers) and the functions that do all writes.

-- ---------- helpers ----------

create function public.my_role() returns public.user_role
language sql stable security definer set search_path = '' as
$$ select role from public.profiles where id = auth.uid() $$;

create function public.my_center() returns text
language sql stable security definer set search_path = '' as
$$ select center_id from public.profiles where id = auth.uid() $$;

create function public.my_patient() returns text
language sql stable security definer set search_path = '' as
$$ select id from public.patients where user_id = auth.uid() $$;

-- Clinical data: the patient, a doctor they are booked with, or an admin.
create function public.can_see_clinical(pid text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case public.my_role()
    when 'admin' then true
    when 'patient' then pid = public.my_patient()
    when 'doctor' then exists (select 1 from public.bookings b where b.patient_id = pid and b.doctor_id = auth.uid())
    else false
  end
$$;

-- Patient record: clinical access, or a center manager whose center the patient is tied to.
create function public.can_see_patient(pid text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.can_see_clinical(pid) or (
    public.my_role() = 'center' and public.my_center() is not null and (
      exists (select 1 from public.patients p where p.id = pid and p.center_id = public.my_center())
      or exists (select 1 from public.bookings b where b.patient_id = pid and b.center_id = public.my_center())
      or exists (select 1 from public.orders o where o.patient_id = pid and o.center_id = public.my_center())
      or exists (select 1 from public.lab_requests l where l.patient_id = pid and l.center_id = public.my_center())
    )
  )
$$;

create function public.require_role(r text[]) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce(public.my_role()::text = any (r), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
end $$;

-- ---------- RLS: select only ----------

alter table public.centers enable row level security;
alter table public.profiles enable row level security;
alter table public.patients enable row level security;
alter table public.bookings enable row level security;
alter table public.lab_panels enable row level security;
alter table public.products enable row level security;
alter table public.marker_types enable row level security;
alter table public.orders enable row level security;
alter table public.lab_requests enable row level security;
alter table public.lab_uploads enable row level security;
alter table public.markers enable row level security;

create policy "read config" on public.lab_panels for select to authenticated using (true);
create policy "read config" on public.products for select to authenticated using (true);
create policy "read config" on public.marker_types for select to authenticated using (true);

create policy "read centers" on public.centers for select to authenticated
  using (status = 'Active' or id = public.my_center() or public.my_role() = 'admin');

-- Doctor names are visible to everyone signed in (needed to book).
create policy "read profiles" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or role = 'doctor' or public.my_role() = 'admin');

create policy "read patients" on public.patients for select to authenticated
  using (public.can_see_patient(id));

create policy "read bookings" on public.bookings for select to authenticated
  using (public.my_role() = 'admin' or patient_id = public.my_patient()
         or doctor_id = (select auth.uid()) or center_id = public.my_center());

create policy "read orders" on public.orders for select to authenticated
  using (public.my_role() = 'admin' or patient_id = public.my_patient() or center_id = public.my_center());

create policy "read lab requests" on public.lab_requests for select to authenticated
  using (public.can_see_clinical(patient_id) or center_id = public.my_center());

create policy "read lab uploads" on public.lab_uploads for select to authenticated
  using (public.can_see_clinical(patient_id));

create policy "read markers" on public.markers for select to authenticated
  using (public.can_see_clinical(patient_id));

-- Storage: patients write only into their own folder; reading follows lab_uploads visibility.
create policy "lab upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'lab-reports' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "lab read" on storage.objects for select to authenticated
  using (bucket_id = 'lab-reports' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (select 1 from public.lab_uploads u where u.path = name)  -- RLS on lab_uploads applies
  ));

-- ---------- write functions ----------

create function public.book_appointment(p_patient text, p_doctor uuid, p_center text, p_date date, p_time time, p_service text)
returns text language plpgsql security definer set search_path = '' as $$
declare r public.user_role := public.my_role(); pid text; cid text; bid text;
begin
  perform public.require_role(array['patient', 'center', 'admin']);
  pid := case when r = 'patient' then public.my_patient() else p_patient end;
  if pid is null or not exists (select 1 from public.patients where id = pid) then
    raise exception 'Choose a patient.';
  end if;
  if r = 'center' and not public.can_see_patient(pid) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  cid := case when r = 'center' then public.my_center() else p_center end;
  if not exists (select 1 from public.centers where id = cid and status = 'Active') then
    raise exception 'Choose an active center.';
  end if;
  if not exists (select 1 from public.profiles where id = p_doctor and role = 'doctor') then
    raise exception 'Choose a physician.';
  end if;
  if p_date < (now() at time zone 'Asia/Manila')::date then
    raise exception 'Choose a date that is not in the past.';
  end if;
  insert into public.bookings (patient_id, doctor_id, center_id, date, time, service)
  values (pid, p_doctor, cid, p_date, p_time, p_service) returning id into bid;
  update public.patients set center_id = coalesce(center_id, cid), last_activity = current_date where id = pid;
  return bid;
end $$;

create function public.advance_booking(p_id text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.user_role := public.my_role(); b public.bookings;
begin
  perform public.require_role(array['doctor', 'center', 'admin']);
  select * into b from public.bookings where id = p_id for update;
  if not found then raise exception 'Appointment not found.'; end if;
  if not (r = 'admin' or (r = 'doctor' and b.doctor_id = auth.uid())
          or (r = 'center' and b.center_id = public.my_center())) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if b.status = 'Completed' then raise exception 'Already completed.'; end if;
  update public.bookings set status = case b.status
    when 'Pending' then 'Confirmed' when 'Confirmed' then 'In progress' else 'Completed' end
  where id = p_id;
  update public.patients set last_activity = current_date where id = b.patient_id;
end $$;

create function public.register_patient(p_name text, p_center text, p_care text) returns text
language plpgsql security definer set search_path = '' as $$
declare r public.user_role := public.my_role(); cid text; pid text;
begin
  perform public.require_role(array['center', 'admin']);
  cid := case when r = 'center' then public.my_center() else p_center end;
  if not exists (select 1 from public.centers where id = cid and status = 'Active') then
    raise exception 'Choose an active center.';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Enter the patient name.'; end if;
  insert into public.patients (name, center_id, care_stage) values (trim(p_name), cid, p_care) returning id into pid;
  return pid;
end $$;

create function public.add_center(p_name text, p_type text, p_city text, p_manager text) returns text
language plpgsql security definer set search_path = '' as $$
declare cid text;
begin
  perform public.require_role(array['admin']);
  insert into public.centers (name, type, city, manager) values (trim(p_name), p_type, trim(p_city), trim(p_manager))
  returning id into cid;
  return cid;
end $$;

create function public.activate_center(p_id text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_role(array['admin']);
  update public.centers set status = 'Active' where id = p_id;
end $$;

-- Patients send an inquiry for themselves; center managers and admins create requests for a patient.
create function public.create_order(p_patient text, p_product text, p_center text, p_qty int, p_purpose text) returns text
language plpgsql security definer set search_path = '' as $$
declare r public.user_role := public.my_role(); pid text; cid text; oid text;
begin
  perform public.require_role(array['patient', 'center', 'admin']);
  pid := case when r = 'patient' then public.my_patient() else p_patient end;
  if pid is null or not exists (select 1 from public.patients where id = pid) then
    raise exception 'Choose a patient.';
  end if;
  if r = 'center' and not public.can_see_patient(pid) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  cid := case when r = 'center' then public.my_center() else p_center end;
  if not exists (select 1 from public.centers where id = cid and status = 'Active') then
    raise exception 'Choose an active center.';
  end if;
  if not exists (select 1 from public.products where id = p_product) then
    raise exception 'Choose a product.';
  end if;
  insert into public.orders (patient_id, center_id, product_id, qty, purpose)
  values (pid, cid, p_product, coalesce(p_qty, 1), nullif(trim(p_purpose), '')) returning id into oid;
  update public.patients set last_activity = current_date where id = pid;
  return oid;
end $$;

create function public.advance_order(p_id text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.user_role := public.my_role(); o public.orders;
begin
  perform public.require_role(array['center', 'admin']);
  select * into o from public.orders where id = p_id for update;
  if not found then raise exception 'Request not found.'; end if;
  if r = 'center' and o.center_id is distinct from public.my_center() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if o.status = 'Fulfilled' then raise exception 'This request is already fulfilled.'; end if;
  update public.orders set status = case o.status when 'Pending review' then 'Ready at center' else 'Fulfilled' end
  where id = p_id;
end $$;

create function public.request_lab(p_panel int, p_center text, p_date date, p_note text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare pid text := public.my_patient(); lid uuid;
begin
  perform public.require_role(array['patient']);
  if not exists (select 1 from public.lab_panels where id = p_panel) then raise exception 'Choose a panel.'; end if;
  if not exists (select 1 from public.centers where id = p_center and status = 'Active') then
    raise exception 'Choose an active center.';
  end if;
  if p_date < (now() at time zone 'Asia/Manila')::date then
    raise exception 'Choose a date that is not in the past.';
  end if;
  insert into public.lab_requests (patient_id, panel_id, center_id, preferred_date, note)
  values (pid, p_panel, p_center, p_date, nullif(trim(p_note), '')) returning id into lid;
  update public.patients set last_activity = current_date where id = pid;
  return lid;
end $$;

create function public.review_lab(p_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare l public.lab_requests;
begin
  perform public.require_role(array['doctor', 'admin']);
  select * into l from public.lab_requests where id = p_id for update;
  if not found then raise exception 'Request not found.'; end if;
  if not public.can_see_clinical(l.patient_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if l.status <> 'Pending clinical review' then raise exception 'Already reviewed.'; end if;
  update public.lab_requests set status = case when p_approve then 'Approved' else 'Declined' end where id = p_id;
end $$;

-- Called after the file is stored; path must sit in the caller's own folder.
create function public.add_upload(p_path text, p_name text, p_label text, p_size int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_role(array['patient']);
  if split_part(p_path, '/', 1) <> auth.uid()::text then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.lab_uploads (patient_id, path, name, label, size_bytes)
  values (public.my_patient(), p_path, left(p_name, 100), left(coalesce(nullif(trim(p_label), ''), 'Lab result'), 80), p_size);
end $$;

create function public.add_marker(p_type int, p_value numeric, p_date date) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_role(array['patient']);
  if not exists (select 1 from public.marker_types where id = p_type) then raise exception 'Choose a biomarker.'; end if;
  insert into public.markers (patient_id, marker_type_id, value, date)
  values (public.my_patient(), p_type, p_value, p_date);
end $$;

-- ---------- grants: signed-in users may call these; each checks the caller's role itself ----------

do $$
declare f text;
begin
  foreach f in array array[
    'my_role()', 'my_center()', 'my_patient()', 'can_see_clinical(text)', 'can_see_patient(text)',
    'require_role(text[])',
    'book_appointment(text,uuid,text,date,time,text)', 'advance_booking(text)',
    'register_patient(text,text,text)', 'add_center(text,text,text,text)', 'activate_center(text)',
    'create_order(text,text,text,int,text)', 'advance_order(text)',
    'request_lab(int,text,date,text)', 'review_lab(uuid,boolean)',
    'add_upload(text,text,text,int)', 'add_marker(int,numeric,date)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
