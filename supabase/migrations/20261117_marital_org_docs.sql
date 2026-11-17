-- 20261117_marital_org_docs.sql
-- 1) people: marital_status (default 'unknown'), organization (workplace), documents (PDF list)
-- 2) one-to-one couples share marriage date; an unknown gender is filled with the opposite of the spouse's
-- 3) private `person-docs` bucket for PDFs (handwriting / works)
-- 4) review_request / get_people updated for the new fields
-- Project: bbrdnjkbmjwdgwahkbro. Additive; existing rows keep working.

-- ---------- 1) columns ----------
alter table public.people
  add column if not exists marital_status text not null default 'unknown',
  add column if not exists organization text,
  add column if not exists documents jsonb not null default '[]'::jsonb;

alter table public.people drop constraint if exists people_marital_status_chk;
alter table public.people add constraint people_marital_status_chk
  check (marital_status in ('married', 'unmarried', 'divorced', 'unknown'));
alter table public.people drop constraint if exists people_documents_chk;
alter table public.people add constraint people_documents_chk
  check (jsonb_typeof(documents) = 'array' and jsonb_array_length(documents) <= 10);

-- ---------- backfill (audit trigger paused: this is a bulk data fix, not a user edit) ----------
alter table public.people disable trigger people_audit;
-- anyone already linked to a spouse is married
update public.people set marital_status = 'married'
 where marital_status = 'unknown' and (spouse_id is not null or cardinality(more_spouse_ids) > 0);
-- one-to-one couples: share the marriage date and fill an unknown gender
update public.people a set marriage_bs = b.marriage_bs
  from public.people b
 where a.spouse_id = b.id and b.spouse_id = a.id
   and cardinality(a.more_spouse_ids) = 0 and cardinality(b.more_spouse_ids) = 0
   and coalesce(a.marriage_bs, '') = '' and coalesce(b.marriage_bs, '') <> '';
update public.people a set gender = case b.gender when 'M' then 'F' else 'M' end
  from public.people b
 where a.spouse_id = b.id and b.spouse_id = a.id
   and cardinality(a.more_spouse_ids) = 0 and cardinality(b.more_spouse_ids) = 0
   and coalesce(a.gender, '') = '' and b.gender in ('M', 'F');
alter table public.people enable trigger people_audit;

-- ---------- 2) couple sync ----------
-- (a) when two people become a mutual one-to-one couple (existing hook; body below keeps the old logic and adds the new)
create or replace function public.sync_couple(a uuid) returns void
language plpgsql security definer set search_path to 'public' as $function$
declare pa people; pb people; ga text;
begin
  if a is null then return; end if;
  select * into pa from people where id = a; if not found then return; end if;
  if pa.spouse_id is null or cardinality(pa.more_spouse_ids) > 0 then return; end if;
  select * into pb from people where id = pa.spouse_id; if not found then return; end if;
  if pb.spouse_id is distinct from pa.id or cardinality(pb.more_spouse_ids) > 0 then return; end if;

  ga := coalesce(pa.gender, case pb.gender when 'M' then 'F' when 'F' then 'M' end);
  if ga = 'M' then
    update people set mother_id = pb.id where father_id = pa.id and mother_id is null;
    update people set father_id = pa.id where mother_id = pb.id and father_id is null;
  elsif ga = 'F' then
    update people set father_id = pb.id where mother_id = pa.id and father_id is null;
    update people set mother_id = pa.id where father_id = pb.id and mother_id is null;
  end if;

  if coalesce(pa.address,'') = '' and coalesce(pb.address,'') <> '' then
    update people set address = pb.address where id = pa.id;
  elsif coalesce(pb.address,'') = '' and coalesce(pa.address,'') <> '' then
    update people set address = pa.address where id = pb.id;
  end if;

  -- new: marriage date is one fact for both
  if coalesce(pa.marriage_bs,'') = '' and coalesce(pb.marriage_bs,'') <> '' then
    update people set marriage_bs = pb.marriage_bs where id = pa.id;
  elsif coalesce(pb.marriage_bs,'') = '' and coalesce(pa.marriage_bs,'') <> '' then
    update people set marriage_bs = pa.marriage_bs where id = pb.id;
  end if;
  -- new: an unknown gender becomes the opposite of the spouse's (a known gender is never overwritten)
  if coalesce(pa.gender,'') = '' and pb.gender in ('M','F') then
    update people set gender = case pb.gender when 'M' then 'F' else 'M' end where id = pa.id;
  elsif coalesce(pb.gender,'') = '' and pa.gender in ('M','F') then
    update people set gender = case pa.gender when 'M' then 'F' else 'M' end where id = pb.id;
  end if;
  -- new: a linked couple is married unless already recorded as divorced
  update people set marital_status = 'married'
   where id in (pa.id, pb.id) and marital_status in ('unknown', 'unmarried');
end $function$;

-- (b) when marriage date / gender / marital status of one partner is edited, the other follows
create or replace function public.sync_couple_fields_trg() returns trigger
language plpgsql security definer set search_path to 'public' as $function$
declare pb people;
begin
  if new.spouse_id is null or cardinality(new.more_spouse_ids) > 0 then return null; end if;
  select * into pb from people where id = new.spouse_id;
  if not found or pb.spouse_id is distinct from new.id or cardinality(pb.more_spouse_ids) > 0 then return null; end if;

  if new.marriage_bs is distinct from old.marriage_bs and pb.marriage_bs is distinct from new.marriage_bs then
    update people set marriage_bs = new.marriage_bs where id = pb.id;
  end if;
  if new.gender is distinct from old.gender and new.gender in ('M','F') and coalesce(pb.gender,'') = '' then
    update people set gender = case new.gender when 'M' then 'F' else 'M' end where id = pb.id;
  end if;
  if new.marital_status is distinct from old.marital_status and new.marital_status in ('married','divorced')
     and pb.marital_status in ('unknown','unmarried') then
    update people set marital_status = new.marital_status where id = pb.id;
  end if;
  return null;
end $function$;
revoke execute on function public.sync_couple_fields_trg() from public, anon, authenticated;

drop trigger if exists people_sync_couple_fields on public.people;
create trigger people_sync_couple_fields
  after update of marriage_bs, gender, marital_status on public.people
  for each row when (pg_trigger_depth() = 0)
  execute function public.sync_couple_fields_trg();

-- ---------- 3) PDF bucket (private; the path is only revealed through get_people, which is visibility-filtered) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('person-docs', 'person-docs', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = 10485760, allowed_mime_types = array['application/pdf'];

drop policy if exists "person-docs insert" on storage.objects;
drop policy if exists "person-docs read" on storage.objects;
drop policy if exists "person-docs delete" on storage.objects;
create policy "person-docs insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'person-docs' and exists (
    select 1 from public.profiles pr where pr.id = auth.uid() and pr.suspended_at is null
       and (pr.role in ('admin', 'member') or cardinality(coalesce(pr.roles, '{}')) > 0)));
create policy "person-docs read" on storage.objects for select to authenticated
  using (bucket_id = 'person-docs' and exists (
    select 1 from public.profiles pr where pr.id = auth.uid() and pr.suspended_at is null
       and (pr.role in ('admin', 'member') or cardinality(coalesce(pr.roles, '{}')) > 0)));
create policy "person-docs delete" on storage.objects for delete to authenticated
  using (bucket_id = 'person-docs' and public.is_admin());

-- ---------- 4a) get_people: general members do not see others' documents (same rule as notes) ----------
create or replace function public.get_people(p_role text default null::text, p_as_person uuid default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare
  pr profiles; rs text[]; r text; adm boolean; real_admin boolean;
  own uuid; vis uuid[] := '{}'; near uuid[] := '{}'; bsy int;
begin
  select * into pr from profiles where id = auth.uid();
  if not found or pr.suspended_at is not null then return '[]'::jsonb; end if;
  rs := coalesce(pr.roles, '{}');
  real_admin := pr.role = 'admin' or 'admin' = any(rs);
  if pr.role = 'admin' then rs := array['admin','moderator','premium','general'];
  elsif pr.role = 'member' and cardinality(rs) = 0 then rs := array['general']; end if;
  if cardinality(rs) = 0 then return '[]'::jsonb; end if;
  r := case when p_role = any(rs) then p_role
            else (select x from unnest(array['admin','moderator','premium','general']) x where x = any(rs) limit 1) end;
  adm := r = 'admin';

  -- an admin may preview as a given person (read only; nothing else changes)
  own := case when real_admin and p_as_person is not null then p_as_person else pr.position_person_id end;

  if not adm then
    vis := vis_ids(pr, own, r);
    near := imm_ids(own) || branch_ids(pr, own);
    if not (real_admin and p_as_person is not null) then
      vis := vis || array(select person_id from view_grants where user_id = pr.id);
    end if;
  end if;
  bsy := extract(year from now())::int + case when now() >= make_date(extract(year from now())::int, 4, 14) then 57 else 56 end;

  return coalesce((select jsonb_agg(
    case
      when adm then to_jsonb(p) || '{"is_locked":false}'::jsonb
      when not coalesce(p.id = any(vis), false) then
        jsonb_build_object('id', p.id, 'name', '••••••', 'gender', p.gender, 'father_id', p.father_id, 'mother_id', p.mother_id,
          'spouse_id', p.spouse_id, 'more_spouse_ids', p.more_spouse_ids, 'is_living', p.is_living, 'created_at', p.created_at, 'is_locked', true)
      else
        (case when r = 'general' and p.id is distinct from own
              then to_jsonb(p) - 'email' - 'phone' - 'address' - 'notes' - 'documents'
              else to_jsonb(p) - 'email' end)
          - case when coalesce(p.is_living, true) and p.birth_bs ~ '^[0-9]{4}' and substr(p.birth_bs, 1, 4)::int >= bsy - 18
                      and not coalesce(p.id = any(near), false)
                 then array['birth_bs', 'photo_url'] else '{}'::text[] end
          || '{"is_locked":false}'::jsonb
          || case when p.id = own then jsonb_build_object('email', p.email) else '{}'::jsonb end
    end order by p.created_at) from people p), '[]'::jsonb);
end $function$;
grant execute on function public.get_people(text, uuid) to authenticated;

-- ---------- 4b) review_request: new fields; a newly typed spouse gets the opposite gender, 'married' and the marriage date ----------
create or replace function public.review_request(req uuid, approve boolean, reason text default null)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare r change_requests; d jsonb; fid uuid; mid uuid; sid uuid; pid uuid; xs uuid; fb text; og text; docs jsonb;
begin
  select * into r from change_requests where id = req and status = 'pending' for update;
  if not found then raise exception 'अनुरोध फेला परेन वा पहिले नै समीक्षा भइसक्यो'; end if;
  -- admin: anything. moderator: someone else's request. auto: set by submit_request for a बंशज inside their own branch.
  if not (is_admin() or current_setting('app.auto_approve', true) = 'on'
          or (is_staff() and r.requested_by is distinct from auth.uid())) then
    raise exception 'अनुमति छैन';
  end if;

  if approve then
    d := r.payload;
    if r.action <> 'delete' then
      if coalesce(trim(d->>'father_name'),'') <> '' and coalesce(d->>'father_id','') = '' then
        insert into people(name, gender) values (trim(d->>'father_name'), 'M') returning id into fid;
        d := d || jsonb_build_object('father_id', fid);
      end if;
      if coalesce(trim(d->>'mother_name'),'') <> '' and coalesce(d->>'mother_id','') = '' then
        insert into people(name, gender) values (trim(d->>'mother_name'), 'F') returning id into mid;
        d := d || jsonb_build_object('mother_id', mid);
      end if;
      if coalesce(trim(d->>'spouse_name'),'') <> '' and coalesce(d->>'spouse_id','') = '' then
        og := case coalesce(nullif(d->>'gender',''), (select gender from people where id = r.person_id))
                when 'M' then 'F' when 'F' then 'M' end;
        insert into people(name, gender, marital_status, marriage_bs)
        values (trim(d->>'spouse_name'), og, 'married', nullif(d->>'marriage_bs','')) returning id into sid;
        d := d || jsonb_build_object('spouse_id', sid);
      end if;
      if r.action = 'update' and coalesce(trim(d->>'add_spouse_name'),'') <> '' and coalesce(d->>'add_spouse_id','') = '' then
        insert into people(name, gender, marital_status)
        values (trim(d->>'add_spouse_name'), (select case gender when 'M' then 'F' when 'F' then 'M' end from people where id = r.person_id), 'married')
        returning id into xs;
        d := d || jsonb_build_object('add_spouse_id', xs);
      end if;
      fb := nullif(trim(d->>'facebook'), '');
      if fb is not null and fb !~* '^https://((www|m|web)\.)?(facebook|fb)\.com/' then fb := null; end if;
      if d ? 'documents' then
        if jsonb_typeof(d->'documents') <> 'array' or jsonb_array_length(d->'documents') > 10 then
          raise exception 'कागजातको सूची मिलेन (बढीमा १०)';
        end if;
        -- keep only name / path / size, and only files that really exist in the bucket
        docs := coalesce((
          select jsonb_agg(jsonb_build_object(
                   'path', e->>'path',
                   'name', left(coalesce(nullif(e->>'name',''), 'document.pdf'), 120),
                   'size', case when (e->>'size') ~ '^[0-9]{1,9}$' then (e->>'size')::bigint else 0 end))
            from jsonb_array_elements(d->'documents') e
           where exists (select 1 from storage.objects o where o.bucket_id = 'person-docs' and o.name = e->>'path')
        ), '[]'::jsonb);
      end if;
    end if;

    if r.action = 'add' then
      insert into people(name, gender, father_id, mother_id, spouse_id, is_living, birth_bs, death_bs, phone, address, notes,
                         maiden_name, married_name, birth_place, photo_url, facebook, death_place, education, occupation, marriage_bs,
                         marital_status, organization, documents)
      values (trim(d->>'name'), nullif(d->>'gender',''),
              nullif(d->>'father_id','')::uuid, nullif(d->>'mother_id','')::uuid, nullif(d->>'spouse_id','')::uuid,
              coalesce((d->>'is_living')::boolean, true),
              nullif(d->>'birth_bs',''), nullif(d->>'death_bs',''), nullif(d->>'phone',''), nullif(d->>'address',''), nullif(d->>'notes',''),
              nullif(d->>'maiden_name',''), nullif(d->>'married_name',''), nullif(d->>'birth_place',''), nullif(d->>'photo_url',''), fb,
              nullif(d->>'death_place',''), nullif(d->>'education',''), nullif(d->>'occupation',''), nullif(d->>'marriage_bs',''),
              coalesce(nullif(d->>'marital_status',''), case when nullif(d->>'spouse_id','') is not null then 'married' else 'unknown' end),
              nullif(d->>'organization',''), coalesce(docs, '[]'::jsonb))
      returning id into pid;
    elsif r.action = 'update' then
      pid := r.person_id;
      update people set
        name         = coalesce(nullif(trim(d->>'name'),''), name),
        gender       = coalesce(nullif(d->>'gender',''), gender),
        father_id    = case when d ? 'father_id' then nullif(d->>'father_id','')::uuid else father_id end,
        mother_id    = case when d ? 'mother_id' then nullif(d->>'mother_id','')::uuid else mother_id end,
        spouse_id    = case when d ? 'spouse_id' then nullif(d->>'spouse_id','')::uuid else spouse_id end,
        is_living    = coalesce((d->>'is_living')::boolean, is_living),
        birth_bs     = case when d ? 'birth_bs'     then nullif(d->>'birth_bs','')     else birth_bs end,
        death_bs     = case when d ? 'death_bs'     then nullif(d->>'death_bs','')     else death_bs end,
        phone        = case when d ? 'phone'        then nullif(d->>'phone','')        else phone end,
        address      = case when d ? 'address'      then nullif(d->>'address','')      else address end,
        notes        = case when d ? 'notes'        then nullif(d->>'notes','')        else notes end,
        maiden_name  = case when d ? 'maiden_name'  then nullif(d->>'maiden_name','')  else maiden_name end,
        married_name = case when d ? 'married_name' then nullif(d->>'married_name','') else married_name end,
        birth_place  = case when d ? 'birth_place'  then nullif(d->>'birth_place','')  else birth_place end,
        photo_url    = case when d ? 'photo_url'    then nullif(d->>'photo_url','')    else photo_url end,
        facebook     = case when d ? 'facebook'     then fb                            else facebook end,
        death_place  = case when d ? 'death_place'  then nullif(d->>'death_place','')  else death_place end,
        education    = case when d ? 'education'    then nullif(d->>'education','')    else education end,
        occupation   = case when d ? 'occupation'   then nullif(d->>'occupation','')   else occupation end,
        marriage_bs  = case when d ? 'marriage_bs'  then nullif(d->>'marriage_bs','')  else marriage_bs end,
        marital_status = coalesce(nullif(d->>'marital_status',''), marital_status),
        organization = case when d ? 'organization' then nullif(d->>'organization','') else organization end,
        documents    = case when d ? 'documents'    then coalesce(docs, '[]'::jsonb)   else documents end
      where id = pid;
      if coalesce(d->>'add_spouse_id','') <> '' then
        xs := (d->>'add_spouse_id')::uuid;
        update people set
          more_spouse_ids = case when spouse_id is not null and spouse_id <> xs and not (xs = any(more_spouse_ids)) then array_append(more_spouse_ids, xs) else more_spouse_ids end,
          spouse_id = coalesce(spouse_id, xs)
        where id = pid;
        update people set
          more_spouse_ids = case when spouse_id is not null and spouse_id <> pid and not (pid = any(more_spouse_ids)) then array_append(more_spouse_ids, pid) else more_spouse_ids end,
          spouse_id = coalesce(spouse_id, pid)
        where id = xs;
      end if;
    elsif r.action = 'delete' then
      delete from people where id = r.person_id;
    end if;

    if r.action in ('add','update') then
      select father_id, mother_id, spouse_id into fid, mid, sid from people where id = pid;
      if fid is not null and mid is not null then
        update people set spouse_id = mid where id = fid and spouse_id is null;
        update people set spouse_id = fid where id = mid and spouse_id is null;
      end if;
      if sid is not null then
        update people set spouse_id = pid where id = sid and spouse_id is null;
      end if;
    end if;

    update change_requests set status='approved', reviewed_by=auth.uid(), reviewed_at=now() where id=req;
  else
    update change_requests set status='rejected', reject_reason=reason, reviewed_by=auth.uid(), reviewed_at=now() where id=req;
  end if;
end $function$;
