-- In the subquery, an unqualified `name` meant lab_uploads.name (the filename), not the storage object's name,
-- so doctors could never open a patient's file. Qualify it.
drop policy "lab read" on storage.objects;
create policy "lab read" on storage.objects for select to authenticated
  using (bucket_id = 'lab-reports' and (
    (storage.foldername(objects.name))[1] = (select auth.uid())::text
    or exists (select 1 from public.lab_uploads u where u.path = objects.name)  -- RLS on lab_uploads applies
  ));
