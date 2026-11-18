-- New Supabase projects don't auto-grant table access to API roles. Browsers read only;
-- RLS (0002) decides which rows. Writes go through the security definer functions.
grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;
