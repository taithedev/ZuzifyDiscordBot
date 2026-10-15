insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('zuzify-private','zuzify-private',false,10485760,array['image/png','image/jpeg','image/webp','image/gif','application/pdf','text/plain','application/json'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

do $$
begin
 if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='zuzify_private_service_select') then
  create policy zuzify_private_service_select on storage.objects for select to service_role using (bucket_id='zuzify-private');
 end if;
 if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='zuzify_private_service_insert') then
  create policy zuzify_private_service_insert on storage.objects for insert to service_role with check (bucket_id='zuzify-private');
 end if;
 if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='zuzify_private_service_update') then
  create policy zuzify_private_service_update on storage.objects for update to service_role using (bucket_id='zuzify-private') with check (bucket_id='zuzify-private');
 end if;
 if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='zuzify_private_service_delete') then
  create policy zuzify_private_service_delete on storage.objects for delete to service_role using (bucket_id='zuzify-private');
 end if;
end $$;
