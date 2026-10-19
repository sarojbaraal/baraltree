-- 20261019_vansh_legacy_schema.sql
-- हाम्रो वंशावली (Vansavali) — खाली Supabase project मा पूरा schema बनाउँछ।
-- schema.sql + migration.sql + 002..010 को अन्तिम अवस्था, साथै एपले चलाउने तर docs मा नभएका
-- invite / submit_identity functions र people को अतिरिक्त स्तम्भ (photo_url, birth_place, ai_*) ।
-- नोट: यो repo को 20261016_phase1 (vector/ai_suggestions) migration भन्दा फरक र त्यसको सट्टा हो।

-- ============ तालिकाहरू ============
create table public.people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  gender text check (gender in ('M','F','O')),
  father_id uuid references public.people(id) on delete set null,
  mother_id uuid references public.people(id) on delete set null,
  spouse_id uuid references public.people(id) on delete set null,
  more_spouse_ids uuid[] not null default '{}',
  is_living boolean not null default true,
  birth_bs text,
  death_bs text,
  phone text,
  address text,
  notes text,
  maiden_name text,
  married_name text,
  birth_place text,
  email text,
  facebook text,
  photo_url text,
  ai_summary text,
  ai_tags text[] default '{}',
  created_at timestamptz default now()
);
create index idx_people_father on public.people(father_id);
create index idx_people_mother on public.people(mother_id);
create index idx_people_spouse on public.people(spouse_id);

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  full_name text,
  role text not null default 'pending' check (role in ('pending','member','admin')),
  roles text[] not null default '{}',
  position_person_id uuid references public.people(id) on delete set null,
  position_parent_id uuid references public.people(id) on delete set null,
  position_grand_id uuid references public.people(id) on delete set null,
  claim_father text,
  claim_grand text,
  created_at timestamptz default now()
);

create table public.change_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references public.profiles(id),
  action text not null check (action in ('add','update','delete')),
  person_id uuid references public.people(id) on delete cascade,
  payload jsonb not null default '{}',
  note text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reject_reason text,
  reviewed_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  reviewed_at timestamptz
);

create table public.audit_log (
  id bigserial primary key,
  at timestamptz default now(),
  actor uuid,
  table_name text,
  op text,
  row_id uuid,
  old_data jsonb,
  new_data jsonb
);

create table public.invites (
  token text primary key,
  person_id uuid not null references public.people(id) on delete cascade,
  roles text[] not null default '{general}',
  created_by uuid,
  created_at timestamptz default now(),
  claimed_by uuid,
  claimed_at timestamptz
);

create table public.user_layout (
  user_id uuid primary key references auth.users on delete cascade,
  layout jsonb not null default '{}',
  updated_at timestamptz default now()
);

-- ============ भूमिका सहायकहरू ============
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists(select 1 from profiles where id = auth.uid() and (role = 'admin' or 'admin' = any(roles))) $$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as
$$ select exists(select 1 from profiles where id = auth.uid() and (role = 'admin' or roles && '{admin,moderator}'::text[])) $$;

-- नयाँ user दर्ता हुँदा 'pending' profile (दाबी सहित)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles(id, email, full_name, claim_father, claim_grand)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
          nullif(trim(new.raw_user_meta_data->>'claim_father'), ''),
          nullif(trim(new.raw_user_meta_data->>'claim_grand'), ''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- audit
create or replace function public.log_people() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log(actor, table_name, op, row_id, old_data, new_data)
  values (auth.uid(), 'people', tg_op, coalesce(new.id, old.id),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;
create trigger people_audit after insert or update or delete on public.people
  for each row execute function public.log_people();

-- ============ जोडी मिलान (004) ============
create or replace function public.sync_couple(a uuid) returns void
language plpgsql security definer set search_path = public as $$
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
end $$;

create or replace function public.sync_couple_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare x uuid;
begin
  perform sync_couple(new.id);
  perform sync_couple(new.father_id);
  perform sync_couple(new.mother_id);
  foreach x in array array_append(new.more_spouse_ids, new.spouse_id) loop
    perform sync_couple(x);
  end loop;
  return null;
end $$;
create trigger people_sync_couple
  after insert or update of spouse_id, more_spouse_ids, father_id, mother_id on public.people
  for each row when (pg_trigger_depth() = 0)
  execute function public.sync_couple_trg();

-- ============ एडमिन कार्यहरू ============
create or replace function public.set_roles(target uuid, new_roles text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'अनुमति छैन'; end if;
  if not (new_roles <@ array['general','premium','moderator','admin']) then raise exception 'अमान्य भूमिका'; end if;
  update profiles set roles = new_roles,
    role = case when 'admin' = any(new_roles) then 'admin' when cardinality(new_roles) > 0 then 'member' else 'pending' end
  where id = target;
end $$;

create or replace function public.set_position(target uuid, p_person uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'अनुमति छैन'; end if;
  update profiles set position_person_id = p_person where id = target;
end $$;

create or replace function public.set_member_role(target uuid, new_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin मात्र'; end if;
  if new_role not in ('pending','member','admin') then raise exception 'गलत role'; end if;
  update profiles set role = new_role where id = target;
end $$;

create or replace function public.set_facebook(pid uuid, url text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin मात्र'; end if;
  if nullif(trim(url),'') is not null and url !~* '^https://((www|m|web)\.)?(facebook|fb)\.com/' then raise exception 'अमान्य Facebook लिंक'; end if;
  update people set facebook = nullif(trim(url),'') where id = pid;
end $$;

create or replace function public.set_marital_names(pid uuid, maiden text, married text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin मात्र'; end if;
  update people set
    maiden_name = case when gender='F' then nullif(trim(maiden),'') end,
    married_name = case when gender='F' then nullif(trim(married),'') end
  where id = pid;
end $$;

-- ============ प्रयोगकर्ताको आफ्नै स्थान / दाबी ============
create or replace function public.set_my_position(p_person uuid, p_parent uuid) returns void
language sql security definer set search_path = public as $$
  update profiles set position_person_id = p_person, position_parent_id = p_parent
  where id = auth.uid() and position_person_id is null and position_parent_id is null $$;

create or replace function public.set_my_claim(p_father text, p_grand text) returns void
language sql security definer set search_path = public as $$
  update profiles set claim_father = nullif(trim(p_father),''), claim_grand = nullif(trim(p_grand),'')
  where id = auth.uid() and claim_father is null and claim_grand is null
    and position_person_id is null and position_parent_id is null and position_grand_id is null $$;

-- सामाजिक लगइन पछि नाम + बुबा + हजुरबुबा बुझाउने (एक पटक मात्र)
create or replace function public.submit_identity(p_name text, p_father text, p_grand text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'लगइन चाहिन्छ'; end if;
  if nullif(trim(p_name),'') is null or nullif(trim(p_father),'') is null or nullif(trim(p_grand),'') is null then
    raise exception 'नाम, बुबा र हजुरबुबाको नाम चाहिन्छ';
  end if;
  update profiles set full_name = trim(p_name), claim_father = trim(p_father), claim_grand = trim(p_grand)
  where id = auth.uid() and claim_father is null and claim_grand is null
    and position_person_id is null and position_parent_id is null and position_grand_id is null;
end $$;

-- ============ निम्तो (invite) ============
create or replace function public.create_invite(p_person uuid, p_roles text[]) returns text
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if not is_admin() then raise exception 'अनुमति छैन'; end if;
  if not exists (select 1 from people where id = p_person) then raise exception 'व्यक्ति फेला परेन'; end if;
  if p_roles is null or cardinality(p_roles) = 0 or not (p_roles <@ array['general','premium','moderator','admin']) then
    raise exception 'अमान्य भूमिका';
  end if;
  delete from invites where person_id = p_person and claimed_at is null;   -- पुरानो लिंक रद्द
  t := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into invites(token, person_id, roles, created_by) values (t, p_person, p_roles, auth.uid());
  return t;
end $$;

-- लगइन अघि निम्तोको नाम देखाउन (टोकन भएकाले मात्र)
create or replace function public.invite_info(p_token text) returns table(person_name text)
language sql stable security definer set search_path = public as $$
  select p.name from invites i join people p on p.id = i.person_id
  where i.token = p_token and i.claimed_at is null $$;

create or replace function public.claim_invite(p_token text) returns text
language plpgsql security definer set search_path = public as $$
declare i invites; nm text;
begin
  if auth.uid() is null then raise exception 'लगइन चाहिन्छ'; end if;
  select * into i from invites where token = p_token and claimed_at is null for update;
  if not found then raise exception 'निम्तो अमान्य वा प्रयोग भइसकेको छ'; end if;
  if not exists (select 1 from profiles where id = auth.uid()) then raise exception 'प्रोफाइल फेला परेन'; end if;
  update profiles set
    position_person_id = i.person_id,
    roles = array(select distinct x from unnest(coalesce(roles, '{}') || i.roles) x),
    role = case when 'admin' = any(i.roles) or role = 'admin' then 'admin' else 'member' end
  where id = auth.uid();
  update invites set claimed_by = auth.uid(), claimed_at = now() where token = p_token;
  select name into nm from people where id = i.person_id;
  return nm;
end $$;

-- ============ अनुरोध स्वीकृति ============
create or replace function public.review_request(req uuid, approve boolean, reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r change_requests; d jsonb; fid uuid; mid uuid; sid uuid; pid uuid; xs uuid; fb text;
begin
  if not is_staff() then raise exception 'अनुमति छैन'; end if;
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
                         maiden_name, married_name, birth_place, photo_url, facebook)
      values (trim(d->>'name'), nullif(d->>'gender',''),
              nullif(d->>'father_id','')::uuid, nullif(d->>'mother_id','')::uuid, nullif(d->>'spouse_id','')::uuid,
              coalesce((d->>'is_living')::boolean, true),
              nullif(d->>'birth_bs',''), nullif(d->>'death_bs',''), nullif(d->>'phone',''), nullif(d->>'address',''), nullif(d->>'notes',''),
              nullif(d->>'maiden_name',''), nullif(d->>'married_name',''), nullif(d->>'birth_place',''), nullif(d->>'photo_url',''), fb)
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
        facebook     = case when d ? 'facebook'     then fb                            else facebook end
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
end $$;

-- ============ CSV/Excel/JSON आयात ============
create or replace function public.import_people(payload jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare r jsonb; m jsonb := '{}'; nid uuid; pid uuid; s uuid; n int := 0;
begin
  if not is_admin() then raise exception 'admin मात्र'; end if;
  for r in select * from jsonb_array_elements(payload) loop
    nid := case when r->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then (r->>'id')::uuid else gen_random_uuid() end;
    insert into people(id, name, gender, is_living, birth_bs, death_bs, phone, address, notes,
                       maiden_name, married_name, birth_place, facebook)
    values (nid, trim(r->>'name'), nullif(r->>'gender',''), coalesce((r->>'is_living')::boolean, true),
            nullif(r->>'birth_bs',''), nullif(r->>'death_bs',''), nullif(r->>'phone',''), nullif(r->>'address',''), nullif(r->>'notes',''),
            nullif(r->>'maiden_name',''), nullif(r->>'married_name',''), nullif(r->>'birth_place',''), nullif(r->>'facebook',''))
    on conflict (id) do update set name = excluded.name, gender = excluded.gender, is_living = excluded.is_living,
      birth_bs = excluded.birth_bs, death_bs = excluded.death_bs, phone = excluded.phone, address = excluded.address, notes = excluded.notes,
      -- अतिरिक्त स्तम्भ: फाइलमा भए मात्र बदल्ने (12-स्तम्भ CSV ले यी मेट्दैन)
      maiden_name  = coalesce(excluded.maiden_name,  people.maiden_name),
      married_name = coalesce(excluded.married_name, people.married_name),
      birth_place  = coalesce(excluded.birth_place,  people.birth_place),
      facebook     = coalesce(excluded.facebook,     people.facebook);
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
end $$;

-- ============ get_people (008, इमेल सीमित) ============
create or replace function public.get_people(p_role text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  pr profiles; rs text[]; r text; staff boolean; f uuid; gf uuid;
  lk uuid[] := '{}'; ed uuid[] := '{}';
begin
  select * into pr from profiles where id = auth.uid();
  if not found then return '[]'::jsonb; end if;
  rs := coalesce(pr.roles, '{}');
  if pr.role = 'admin' then rs := array['admin','moderator','premium','general'];
  elsif pr.role = 'member' and cardinality(rs) = 0 then rs := array['general']; end if;
  if cardinality(rs) = 0 then return '[]'::jsonb; end if;
  r := case when p_role = any(rs) then p_role
            else (select x from unnest(array['admin','moderator','premium','general']) x where x = any(rs) limit 1) end;
  staff := r in ('admin','moderator');

  if not staff then
    lk := array(
      with recursive
      dau as (
        select id from people
        where gender = 'F' and (father_id is not null or mother_id is not null)
          and (spouse_id is not null or cardinality(more_spouse_ids) > 0)
      ),
      locked(id) as (
        select s from people p join dau on dau.id = p.id, unnest(array[p.spouse_id] || p.more_spouse_ids) s where s is not null
        union
        select c.id from people c join dau on c.father_id = dau.id or c.mother_id = dau.id
        union
        select x.n from locked l join people p on p.id = l.id
          cross join lateral (
            select unnest(array[p.spouse_id] || p.more_spouse_ids) as n
            union all
            select c.id from people c where c.father_id = p.id or c.mother_id = p.id
          ) x
        where x.n is not null
      )
      select id from locked);

    if r = 'premium' then
      f := case when pr.position_person_id is not null then (select father_id from people where id = pr.position_person_id)
                when pr.position_parent_id is not null then (select case when gender = 'F' then spouse_id else id end from people where id = pr.position_parent_id)
                else null end;
      gf := coalesce(pr.position_grand_id, (select father_id from people where id = f), f);
      if gf is not null then
        ed := array(
          with recursive dd(id) as (
            select gf
            union
            select c.id from people c join dd on c.father_id = dd.id or c.mother_id = dd.id
          )
          select id from dd
          union
          select s from people p join dd on dd.id = p.id, unnest(array[p.spouse_id] || p.more_spouse_ids) s where s is not null);
      end if;
    end if;
  end if;

  return coalesce((select jsonb_agg(
    case
      when staff then to_jsonb(p) || '{"is_locked":false}'::jsonb
      when p.id = any(lk) and r = 'general' then
        jsonb_build_object('id', p.id, 'name', '••••••', 'gender', p.gender, 'father_id', p.father_id, 'mother_id', p.mother_id,
          'spouse_id', p.spouse_id, 'more_spouse_ids', p.more_spouse_ids, 'is_living', p.is_living, 'created_at', p.created_at, 'is_locked', true)
      when p.id = any(lk) and r = 'premium' and not (p.id = any(ed)) then
        jsonb_build_object('id', p.id, 'name', p.name, 'gender', p.gender, 'father_id', p.father_id, 'mother_id', p.mother_id,
          'spouse_id', p.spouse_id, 'more_spouse_ids', p.more_spouse_ids, 'is_living', p.is_living, 'created_at', p.created_at, 'is_locked', false, 'name_only', true)
      else
        (to_jsonb(p) - 'email') || '{"is_locked":false}'::jsonb
          || case when p.id = pr.position_person_id then jsonb_build_object('email', p.email) else '{}'::jsonb end
    end order by p.created_at) from people p), '[]'::jsonb);
end $$;

-- ============ Row Level Security ============
alter table public.people enable row level security;          -- कुनै policy छैन: सिधै पहुँच बन्द, get_people मात्र
alter table public.profiles enable row level security;
alter table public.change_requests enable row level security;
alter table public.audit_log enable row level security;
alter table public.invites enable row level security;         -- कुनै policy छैन
alter table public.user_layout enable row level security;

create policy "own profile or staff" on public.profiles for select using (id = auth.uid() or public.is_staff());
create policy "editors insert requests" on public.change_requests for insert with check (
  requested_by = auth.uid() and status = 'pending' and exists
  (select 1 from public.profiles where id = auth.uid() and (role = 'admin' or roles && '{premium,moderator,admin}'::text[])));
create policy "read requests" on public.change_requests for select using (requested_by = auth.uid() or public.is_staff());
create policy "admin deletes requests" on public.change_requests for delete using (public.is_admin());
create policy "admin reads audit" on public.audit_log for select using (public.is_admin());
create policy "own layout" on public.user_layout for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============ अनुमति: पहिले सबै बन्द, अनि आवश्यक मात्र खोल्ने ============
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.audit_log to authenticated;
grant select, insert, delete on public.change_requests to authenticated;
grant select, insert, update on public.user_layout to authenticated;

grant execute on function
  public.my_role(), public.is_admin(), public.is_staff(),
  public.get_people(text), public.import_people(jsonb), public.review_request(uuid, boolean, text),
  public.set_roles(uuid, text[]), public.set_position(uuid, uuid), public.set_member_role(uuid, text),
  public.set_facebook(uuid, text), public.set_marital_names(uuid, text, text),
  public.set_my_position(uuid, uuid), public.set_my_claim(text, text), public.submit_identity(text, text, text),
  public.create_invite(uuid, text[]), public.claim_invite(text)
to authenticated;
grant execute on function public.invite_info(text) to anon, authenticated;

-- ============ फोटो भण्डार ============
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do nothing;

create policy "photos upload" on storage.objects for insert to authenticated with check (bucket_id = 'profile-photos');
create policy "photos update" on storage.objects for update to authenticated using (bucket_id = 'profile-photos') with check (bucket_id = 'profile-photos');
