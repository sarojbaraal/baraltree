-- 20261022_extra_person_fields.sql
-- नयाँ व्यक्ति विवरण: मृत्यु स्थान, शिक्षा, पेशा, विवाह मिति (BS)।
alter table public.people add column if not exists death_place text;
alter table public.people add column if not exists education   text;
alter table public.people add column if not exists occupation  text;
alter table public.people add column if not exists marriage_bs text;

create or replace function public.import_people(payload jsonb)
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare r jsonb; m jsonb := '{}'; nid uuid; pid uuid; s uuid; n int := 0;
begin
  if not is_admin() then raise exception 'admin मात्र'; end if;
  for r in select * from jsonb_array_elements(payload) loop
    nid := case when r->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then (r->>'id')::uuid else gen_random_uuid() end;
    insert into people(id, name, gender, is_living, birth_bs, death_bs, phone, address, notes,
                       maiden_name, married_name, birth_place, facebook, death_place, education, occupation, marriage_bs)
    values (nid, trim(r->>'name'), nullif(r->>'gender',''), coalesce((r->>'is_living')::boolean, true),
            nullif(r->>'birth_bs',''), nullif(r->>'death_bs',''), nullif(r->>'phone',''), nullif(r->>'address',''), nullif(r->>'notes',''),
            nullif(r->>'maiden_name',''), nullif(r->>'married_name',''), nullif(r->>'birth_place',''), nullif(r->>'facebook',''),
            nullif(r->>'death_place',''), nullif(r->>'education',''), nullif(r->>'occupation',''), nullif(r->>'marriage_bs',''))
    on conflict (id) do update set name = excluded.name, gender = excluded.gender, is_living = excluded.is_living,
      birth_bs = excluded.birth_bs, death_bs = excluded.death_bs, phone = excluded.phone, address = excluded.address, notes = excluded.notes,
      -- अतिरिक्त स्तम्भ: फाइलमा भए मात्र बदल्ने (पुराना CSV ले यी मेट्दैन)
      maiden_name  = coalesce(excluded.maiden_name,  people.maiden_name),
      married_name = coalesce(excluded.married_name, people.married_name),
      birth_place  = coalesce(excluded.birth_place,  people.birth_place),
      facebook     = coalesce(excluded.facebook,     people.facebook),
      death_place  = coalesce(excluded.death_place,  people.death_place),
      education    = coalesce(excluded.education,    people.education),
      occupation   = coalesce(excluded.occupation,   people.occupation),
      marriage_bs  = coalesce(excluded.marriage_bs,  people.marriage_bs);
    m := m || jsonb_build_object(r->>'id', nid); n := n + 1;
  end loop;
  for r in select * from jsonb_array_elements(payload) loop
    update people set
      father_id = nullif(coalesce(m->>(r->>'father_id'), r->>'father_id'), '')::uuid,
      mother_id = nullif(coalesce(m->>(r->>'mother_id'), r->>'mother_id'), '')::uuid,
      spouse_id = nullif(coalesce(m->>(r->>'spouse_id'), r->>'spouse_id'), '')::uuid,
      more_spouse_ids = coalesce((select array_agg(nullif(coalesce(m->>x, x), '')::uuid)
                                  from jsonb_array_elements_text(coalesce(r->'more_spouse_ids', '[]'::jsonb)) as x where x <> ''), '{}'::uuid[])
    where id = (m->>(r->>'id'))::uuid;
  end loop;
  for r in select * from jsonb_array_elements(payload) loop
    pid := (m->>(r->>'id'))::uuid;
    for s in select unnest(array_remove(array[spouse_id] || more_spouse_ids, null)) from people where id = pid loop
      update people set
        more_spouse_ids = case when spouse_id is not null and spouse_id <> pid and not (pid = any(more_spouse_ids)) then array_append(more_spouse_ids, pid) else more_spouse_ids end,
        spouse_id = coalesce(spouse_id, pid)
      where id = s;
    end loop;
  end loop;
  return n;
end $function$;

create or replace function public.review_request(req uuid, approve boolean, reason text default null)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare r change_requests; d jsonb; fid uuid; mid uuid; sid uuid; pid uuid; xs uuid; fb text;
begin
  if not is_admin() then raise exception 'अनुमति छैन'; end if;
  select * into r from change_requests where id = req and status = 'pending' for update;
  if not found then raise exception 'अनुरोध फेला परेन वा पहिले नै समीक्षा भइसक्यो'; end if;

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
        insert into people(name) values (trim(d->>'spouse_name')) returning id into sid;
        d := d || jsonb_build_object('spouse_id', sid);
      end if;
      if r.action = 'update' and coalesce(trim(d->>'add_spouse_name'),'') <> '' and coalesce(d->>'add_spouse_id','') = '' then
        insert into people(name, gender)
        values (trim(d->>'add_spouse_name'), (select case gender when 'M' then 'F' when 'F' then 'M' end from people where id = r.person_id))
        returning id into xs;
        d := d || jsonb_build_object('add_spouse_id', xs);
      end if;
      fb := nullif(trim(d->>'facebook'), '');
      if fb is not null and fb !~* '^https://((www|m|web)\.)?(facebook|fb)\.com/' then fb := null; end if;
    end if;

    if r.action = 'add' then
      insert into people(name, gender, father_id, mother_id, spouse_id, is_living, birth_bs, death_bs, phone, address, notes,
                         maiden_name, married_name, birth_place, photo_url, facebook, death_place, education, occupation, marriage_bs)
      values (trim(d->>'name'), nullif(d->>'gender',''),
              nullif(d->>'father_id','')::uuid, nullif(d->>'mother_id','')::uuid, nullif(d->>'spouse_id','')::uuid,
              coalesce((d->>'is_living')::boolean, true),
              nullif(d->>'birth_bs',''), nullif(d->>'death_bs',''), nullif(d->>'phone',''), nullif(d->>'address',''), nullif(d->>'notes',''),
              nullif(d->>'maiden_name',''), nullif(d->>'married_name',''), nullif(d->>'birth_place',''), nullif(d->>'photo_url',''), fb,
              nullif(d->>'death_place',''), nullif(d->>'education',''), nullif(d->>'occupation',''), nullif(d->>'marriage_bs',''))
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
        marriage_bs  = case when d ? 'marriage_bs'  then nullif(d->>'marriage_bs','')  else marriage_bs end
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
