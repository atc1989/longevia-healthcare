-- LONGEVIA schema. Browsers only read; all writes go through functions in 0002.

create type public.user_role as enum ('patient', 'doctor', 'center', 'admin');

create sequence public.center_seq start 1;
create sequence public.patient_seq start 1001;
create sequence public.booking_seq start 2401;
create sequence public.order_seq start 601;

create table public.centers (
  id text primary key default 'CTR-' || lpad(nextval('public.center_seq')::text, 3, '0'),
  name text not null check (length(name) between 1 and 80),
  city text not null check (length(city) between 1 and 70),
  type text not null check (type in ('Company-owned', 'Outsourced partner')),
  manager text not null check (length(manager) between 1 and 70),
  status text not null default 'Pending' check (status in ('Pending', 'Active'))
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'patient',
  full_name text,
  center_id text references public.centers (id)
);

-- user_id is null for patients a center registered on someone's behalf.
create table public.patients (
  id text primary key default 'PT-' || nextval('public.patient_seq'),
  user_id uuid unique references auth.users (id) on delete cascade,
  name text not null check (length(name) between 1 and 70),
  center_id text references public.centers (id),
  care_stage text not null default 'Initial assessment'
    check (care_stage in ('Initial assessment', 'Follow-up program', 'Diagnostics review')),
  status text not null default 'Active',
  last_activity date not null default current_date,
  created_at timestamptz not null default now()
);

create table public.bookings (
  id text primary key default 'GG-' || nextval('public.booking_seq'),
  patient_id text not null references public.patients (id),
  doctor_id uuid not null references public.profiles (id),
  center_id text not null references public.centers (id),
  date date not null,
  time time not null,
  service text not null check (service in ('Initial consultation', 'Follow-up review', 'Lab result review')),
  status text not null default 'Pending' check (status in ('Pending', 'Confirmed', 'In progress', 'Completed')),
  created_at timestamptz not null default now()
);

-- Config tables (seeded below)
create table public.lab_panels (
  id int generated always as identity primary key,
  name text not null,
  description text not null
);
create table public.products (
  id text primary key,
  name text not null,
  category text not null,
  description text not null,
  requires_review boolean not null
);
create table public.marker_types (
  id int generated always as identity primary key,
  name text not null,
  unit text not null
);

create table public.orders (
  id text primary key default 'ORD-' || nextval('public.order_seq'),
  patient_id text not null references public.patients (id),
  center_id text not null references public.centers (id),
  product_id text not null references public.products (id),
  qty int not null default 1 check (qty between 1 and 3),
  purpose text,
  status text not null default 'Pending review' check (status in ('Pending review', 'Ready at center', 'Fulfilled')),
  created_at timestamptz not null default now()
);

create table public.lab_requests (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null references public.patients (id),
  panel_id int not null references public.lab_panels (id),
  center_id text not null references public.centers (id),
  preferred_date date not null,
  note text check (length(note) <= 200),
  status text not null default 'Pending clinical review'
    check (status in ('Pending clinical review', 'Approved', 'Declined')),
  created_at timestamptz not null default now()
);

create table public.lab_uploads (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null references public.patients (id),
  path text not null unique,
  name text not null,
  label text not null,
  size_bytes int not null,
  created_at timestamptz not null default now()
);

create table public.markers (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null references public.patients (id),
  marker_type_id int not null references public.marker_types (id),
  value numeric not null check (value >= 0),
  date date not null,
  created_at timestamptz not null default now()
);

create index on public.bookings (patient_id);
create index on public.bookings (doctor_id);
create index on public.bookings (center_id);
create index on public.orders (patient_id);
create index on public.orders (center_id);
create index on public.lab_requests (patient_id);
create index on public.lab_uploads (patient_id);
create index on public.markers (patient_id);

-- Seed config only. No people, no bookings.
insert into public.lab_panels (name, description) values
  ('Complete Blood Count (CBC)', 'Blood cells and basic hematology assessment'),
  ('Lipid Profile', 'Cholesterol and triglyceride testing'),
  ('Fasting Blood Sugar / HbA1c', 'Glucose and longer-term glucose markers'),
  ('Liver & Kidney Function', 'Organ function laboratory assessment'),
  ('Vitamin D', 'Vitamin D level assessment');

insert into public.products (id, name, category, description, requires_review) values
  ('gg-supplement', 'GutGuard Wellness Supplement', 'Supplement', 'Center-stock wellness product. Confirm label, suitability and availability.', true),
  ('vitamin-support', 'Daily Nutrient Support', 'Supplement', 'Vitamin and mineral supplement. Ask your center about availability.', false),
  ('rx-med', 'Prescription Medication', 'Prescription', 'Clinician-selected medication only; no specific treatment is advertised.', true),
  ('peptide', 'Peptide Therapy Consultation', 'Physician-only', 'Specialist assessment only. No experimental or unapproved peptide sales.', true);

insert into public.marker_types (name, unit) values
  ('HbA1c', '%'), ('Fasting glucose', 'mg/dL'), ('Total cholesterol', 'mg/dL'),
  ('Vitamin D', 'ng/mL'), ('Hemoglobin', 'g/dL'), ('Creatinine', 'mg/dL');

-- Private bucket for lab reports: 10 MB, PDF/JPG/PNG only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lab-reports', 'lab-reports', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- Every new auth user becomes a patient with a patient record.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  insert into public.patients (user_id, name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), 'New patient'));
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
