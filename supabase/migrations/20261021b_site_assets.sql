-- 20261021b_site_assets.sql
-- सार्वजनिक `site-assets` भण्डार: एडमिनले male.svg / female.svg (सबैका डिफल्ट अवतार) राख्न सक्छ।
-- Supabase SQL Editor मा पूरै paste गरी एकपटक Run गर्नुहोस् (दोहोर्याएर चलाए पनि हुन्छ)।
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-assets', 'site-assets', true, 524288, array['image/svg+xml','image/png','image/webp','image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 524288,
  allowed_mime_types = array['image/svg+xml','image/png','image/webp','image/jpeg'];

drop policy if exists "site-assets read"   on storage.objects;
drop policy if exists "site-assets insert" on storage.objects;
drop policy if exists "site-assets update" on storage.objects;
drop policy if exists "site-assets delete" on storage.objects;

create policy "site-assets read"   on storage.objects for select to anon, authenticated using (bucket_id = 'site-assets');
create policy "site-assets insert" on storage.objects for insert to authenticated with check (bucket_id = 'site-assets' and public.is_admin());
create policy "site-assets update" on storage.objects for update to authenticated using (bucket_id = 'site-assets' and public.is_admin()) with check (bucket_id = 'site-assets' and public.is_admin());
create policy "site-assets delete" on storage.objects for delete to authenticated using (bucket_id = 'site-assets' and public.is_admin());
