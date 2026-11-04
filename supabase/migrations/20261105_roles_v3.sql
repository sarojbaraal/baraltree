-- Roles v3: four roles (general, बंशज = premium, moderator, admin), surname-relative visibility, minors masked outside the
-- near family, "request to view" for locked cards, scope-checked submit_request, print log.
-- Rules (S = the member's surname set: own surname, father's surname, spouse's surname; default बराल):
--   general   : men with surname S, women named S (married in), daughters of S men, + own record and immediate family
--   premium / moderator: the above + everyone below the member's grandfather and the mother's grandfather
--             + husbands, children and descendants of S-born daughters
--   admin     : everything
--   "near family" = immediate family + everyone below the member's own grandfather: their birth date and photo are shown
--   even when under 18; for a minor anywhere else both are removed.
-- Maternal side of anyone else is outside every set above, so it is never sent.

-- ---------- helpers ----------
create or replace function public.surname_of(n text) returns text language sql immutable as $$
  select case lower(regexp_replace(trim(coalesce(n, '')), '^.*\s', ''))
    when 'baral' then 'बराल' else regexp_replace(trim(coalesce(n, '')), '^.*\s', '') end $$;

-- the 'other' role is gone
update public.profiles set roles = array_remove(roles, 'other') where 'other' = any(roles);
update public.profiles set role = 'pending' where role = 'member' and cardinality(roles) = 0;

create or replace function public.set_roles(target uuid, new_roles text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'अनुमति छैन'; end if;
  if not (new_roles <@ array['general','premium','moderator','admin']) then raise exception 'अमान्य भूमिका'; end if;
  update profiles set roles = new_roles,
    role = case when 'admin' = any(new_roles) then 'admin' when cardinality(new_roles) > 0 then 'member' else 'pending' end
  where id = target;
end $$;

-- children / descendants (with their spouses) of a set of people
create or replace function public.down_ids(seed uuid[]) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array(
    with recursive dd(id) as (
      select x from unnest(seed) x where x is not null
      union
      select c.id from people c join dd on c.father_id = dd.id or c.mother_id = dd.id
    )
    select id from dd
    union
    select s from people p join dd on dd.id = p.id, unnest(array[p.spouse_id] || coalesce(p.more_spouse_ids, '{}')) s where s is not null
  ), '{}') $$;

-- own record, spouses, parents, children
create or replace function public.imm_ids(own uuid) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array(
    select id from people where id = own
    union select s from people p, unnest(array[p.spouse_id] || coalesce(p.more_spouse_ids, '{}')) s where p.id = own and s is not null
    union select x from people p, unnest(array[p.father_id, p.mother_id]) x where p.id = own and x is not null
    union select id from people where own is not null and (father_id = own or mother_id = own)
  ), '{}') $$;

-- the member's grandfather (father's father, else father), as for the premium edit branch
create or replace function public.grand_of(pr profiles, own uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(pr.position_grand_id,
    (select father_id from people where id = f.id), f.id)
  from (select case when own is not null then (select father_id from people where id = own)
                    when pr.position_parent_id is not null then (select case when gender = 'F' then spouse_id else id end from people where id = pr.position_parent_id)
               end as id) f $$;

-- everything below the member's grandfather: the "own branch" (edit and print scope, minors visible)
create or replace function public.branch_ids(pr profiles, own uuid) returns uuid[]
language sql stable security definer set search_path = public as $$
  select public.down_ids(array[public.grand_of(pr, own)]) $$;

create or replace function public.vis_ids(pr profiles, own uuid, r text) returns uuid[]
language plpgsql stable security definer set search_path = public as $$
declare
  sn text[]; vp uuid; gf uuid; mo uuid; mf uuid; mgf uuid;
  base uuid[]; sd uuid[]; out uuid[];
begin
  vp := coalesce(own, pr.position_parent_id, pr.position_grand_id);
  sn := array(
    select distinct surname_of(n) from (
      select name n from people where id = vp
      union all select f.name from people p join people f on f.id = p.father_id where p.id = vp
      union all select s.name from people p, unnest(array[p.spouse_id] || coalesce(p.more_spouse_ids, '{}')) sid
                join people s on s.id = sid where p.id = vp
    ) q where n is not null);
  if cardinality(sn) = 0 then sn := array['बराल']; end if;

  sd := array(select d.id from people d join people fa on fa.id = d.father_id
              where d.gender = 'F' and fa.gender = 'M' and surname_of(fa.name) = any(sn));
  base := imm_ids(own) || array(
            select id from people where gender = 'M' and surname_of(name) = any(sn)
            union select id from people where gender = 'F' and surname_of(name) = any(sn)) || sd;

  if r in ('premium', 'moderator') then
    gf := grand_of(pr, own);
    mo := (select mother_id from people where id = own);
    mf := (select father_id from people where id = mo);
    mgf := coalesce((select father_id from people where id = mf), mf);
    base := base || down_ids(array[gf, mgf]) || down_ids(sd);
  end if;
  return base;
end $$;

-- ---------- view access (locked cards) ----------
create table if not exists public.view_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz
);
create table if not exists public.view_grants (
  user_id uuid not null references public.profiles(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, person_id)
);
alter table public.view_requests enable row level security;
alter table public.view_grants enable row level security;

create or replace function public.request_view(p_person uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'लगइन आवश्यक छ'; end if;
  if exists (select 1 from view_requests where user_id = auth.uid() and person_id = p_person and status = 'pending') then
    raise exception 'यो व्यक्तिको अनुरोध पहिले नै पर्खाइमा छ';
  end if;
  insert into view_requests(user_id, person_id, reason) values (auth.uid(), p_person, nullif(trim(coalesce(p_reason, '')), ''));
end $$;

create or replace function public.admin_view_requests() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'अनुमति छैन'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', v.id, 'status', v.status, 'reason', v.reason, 'created_at', v.created_at,
    'user_id', v.user_id, 'user_name', coalesce(u.full_name, u.email),
    'person_id', v.person_id, 'person_name', p.name) order by v.created_at desc)
    from view_requests v join profiles u on u.id = v.user_id join people p on p.id = v.person_id), '[]'::jsonb);
end $$;

create or replace function public.review_view_request(p_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v view_requests;
begin
  if not is_admin() then raise exception 'अनुमति छैन'; end if;
  select * into v from view_requests where id = p_id and status = 'pending' for update;
  if not found then raise exception 'अनुरोध फेला परेन वा पहिले नै समीक्षा भइसक्यो'; end if;
  update view_requests set status = case when p_approve then 'approved' else 'rejected' end,
    reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
  if p_approve then
    insert into view_grants(user_id, person_id, granted_by) values (v.user_id, v.person_id, auth.uid())
    on conflict do nothing;
  end if;
end $$;

create or replace function public.admin_revoke_view(p_user uuid, p_person uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'अनुमति छैन'; end if;
  delete from view_grants where user_id = p_user and person_id = p_person;
end $$;

-- ---------- get_people ----------
drop function if exists public.get_people(text);
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
              then to_jsonb(p) - 'email' - 'phone' - 'address' - 'notes'
              else to_jsonb(p) - 'email' end)
          - case when coalesce(p.is_living, true) and p.birth_bs ~ '^[0-9]{4}' and substr(p.birth_bs, 1, 4)::int >= bsy - 18
                      and not coalesce(p.id = any(near), false)
                 then array['birth_bs', 'photo_url'] else '{}'::text[] end
          || '{"is_locked":false}'::jsonb
          || case when p.id = own then jsonb_build_object('email', p.email) else '{}'::jsonb end
    end order by p.created_at) from people p), '[]'::jsonb);
end $function$;
grant execute on function public.get_people(text, uuid) to authenticated;

-- ---------- requests ----------
create or replace function public.review_request(req uuid, approve boolean, reason text default null)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare r change_requests; d jsonb; fid uuid; mid uuid; sid uuid; pid uuid; xs uuid; fb text;
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

-- Who may change what, and whether it needs approval.
--   general   : only own record / immediate family; always needs approval
--   premium   : inside the own branch (below the grandfather) applies at once; elsewhere (anything visible) needs approval
--   moderator : anything visible; needs another moderator's or the admin's approval
--   admin     : anything (the client approves right away)
create or replace function public.request_mode(p_anchor uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare pr profiles; rs text[]; r text; own uuid; v uuid[];
begin
  select * into pr from profiles where id = auth.uid();
  if not found or pr.suspended_at is not null then raise exception 'अनुमति छैन'; end if;
  rs := coalesce(pr.roles, '{}');
  if pr.role = 'admin' or 'admin' = any(rs) then return 'admin'; end if;
  r := (select x from unnest(array['moderator','premium','general']) x where x = any(rs) limit 1);
  if r is null then raise exception 'अनुमति छैन'; end if;
  own := pr.position_person_id;
  if p_anchor is null then
    -- a brand-new unattached person: only staff
    if r = 'general' or r = 'premium' then raise exception 'अनुमति छैन: नयाँ व्यक्तिलाई कुनै नजिकको सदस्यसँग जोडेर थप्नुहोस्'; end if;
    return 'pending';
  end if;
  if r = 'general' then
    if p_anchor = any(imm_ids(own)) then return 'pending'; end if;
    raise exception 'अनुमति छैन: सामान्य सदस्यले आफ्नो र आफ्नो नजिकको परिवारमा मात्र परिवर्तन माग्न सक्छन्';
  end if;
  v := vis_ids(pr, own, r);
  if not (p_anchor = any(v) or p_anchor = any(imm_ids(own))) then raise exception 'अनुमति छैन: यो व्यक्ति तपाईंको पहुँचभन्दा बाहिर छ'; end if;
  if r = 'premium' and p_anchor = any(branch_ids(pr, own)) then return 'direct'; end if;
  return 'pending';
end $$;

create or replace function public.submit_request(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare x jsonb; anchor uuid; mode text; rid uuid; out jsonb := '[]'::jsonb; d jsonb;
begin
  if auth.uid() is null then raise exception 'लगइन आवश्यक छ'; end if;
  for x in select * from jsonb_array_elements(p_rows) loop
    d := coalesce(x->'payload', '{}'::jsonb);
    anchor := coalesce(nullif(x->>'person_id', '')::uuid, nullif(d->>'father_id', '')::uuid, nullif(d->>'mother_id', '')::uuid,
                       nullif(d->>'spouse_id', '')::uuid, nullif(d->>'add_spouse_id', '')::uuid);
    mode := request_mode(anchor);
    insert into change_requests(requested_by, action, person_id, payload, note, status)
    values (auth.uid(), x->>'action', nullif(x->>'person_id', '')::uuid, d, nullif(x->>'note', ''), 'pending')
    returning id into rid;
    if mode = 'direct' then
      perform set_config('app.auto_approve', 'on', true);
      perform review_request(rid, true);
      perform set_config('app.auto_approve', 'off', true);
    end if;
    out := out || jsonb_build_array(jsonb_build_object('id', rid, 'applied', mode = 'direct'));
  end loop;
  return out;
end $$;
grant execute on function public.submit_request(jsonb) to authenticated;

-- direct inserts are closed; everything goes through submit_request
drop policy if exists "editors insert requests" on public.change_requests;

-- who printed what (admin reads audit_log)
create or replace function public.log_print(p_scope text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log(actor, table_name, op, new_data)
  values (auth.uid(), 'print', 'PRINT', jsonb_build_object('scope', left(coalesce(p_scope, ''), 200)));
end $$;
grant execute on function public.log_print(text) to authenticated;
