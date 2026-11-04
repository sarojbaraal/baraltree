-- 1) Visibility rules per role (get_people) and 2) admin: suspend / delete a member.
--
-- Five roles. Surname test: the last word of the name is "बराल".
-- general   (सामान्य) : Baral-surname men only (+ own record and immediate family)
-- premium   (बंशज)    : Baral men, women named Baral, Baral-born daughters (married away or not), everyone below the
--                      member's grandfather and below the mother's grandfather
-- moderator           : everyone, except other people's maternal side
-- other     (अन्य)    : everyone below the member's own grandfather (sons' line + daughters' branches)
-- admin               : everything
-- "Maternal side" = the natal family (ancestors, their other descendants) of a woman who married into the Baral family;
-- it stays hidden except the viewer's own mother's side. The Baral line itself is never hidden by this.
-- Everyone outside a viewer's set is returned as a locked placeholder ("••••••") so the chart keeps its shape.

create or replace function public.is_baral_name(n text) returns boolean
language sql immutable as $$ select coalesce(n, '') ~ '(^|\s)बराल\s*$' $$;

alter table public.profiles add column if not exists suspended_at timestamptz;

create or replace function public.get_people(p_role text default null::text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare
  pr profiles; rs text[]; r text; adm boolean;
  own uuid; f uuid; gf uuid; mo uuid; mf uuid; mgf uuid;
  vis uuid[] := '{}';
begin
  select * into pr from profiles where id = auth.uid();
  if not found or pr.suspended_at is not null then return '[]'::jsonb; end if;
  rs := coalesce(pr.roles, '{}');
  if pr.role = 'admin' then rs := array['admin','moderator','premium','general','other'];
  elsif pr.role = 'member' and cardinality(rs) = 0 then rs := array['general']; end if;
  if cardinality(rs) = 0 then return '[]'::jsonb; end if;
  r := case when p_role = any(rs) then p_role
            else (select x from unnest(array['admin','moderator','premium','general','other']) x where x = any(rs) limit 1) end;
  adm := r = 'admin';

  own := pr.position_person_id;

  if not adm then
    -- own grandfather (same rule as the premium edit branch)
    f := case when own is not null then (select father_id from people where id = own)
              when pr.position_parent_id is not null then (select case when gender = 'F' then spouse_id else id end from people where id = pr.position_parent_id)
              else null end;
    gf := coalesce(pr.position_grand_id, (select father_id from people where id = f), f);
    -- mother's grandfather
    mo := case when own is not null then (select mother_id from people where id = own) else null end;
    mf := (select father_id from people where id = mo);
    mgf := coalesce((select father_id from people where id = mf), mf);

    -- the member's own record and immediate family
    vis := array(
      select id from people where id = own
      union select s from people p, unnest(array[p.spouse_id] || coalesce(p.more_spouse_ids, '{}')) s where p.id = own and s is not null
      union select x from people p, unnest(array[p.father_id, p.mother_id]) x where p.id = own and x is not null
      union select id from people where own is not null and (father_id = own or mother_id = own));

    if r = 'general' then
      vis := vis || array(select id from people where gender = 'M' and is_baral_name(name));
    elsif r = 'premium' then
      vis := vis || array(
        select id from people where gender = 'M' and is_baral_name(name)
        union select id from people where gender = 'F' and is_baral_name(name)
        union select d.id from people d join people fa on fa.id = d.father_id
          where d.gender = 'F' and fa.gender = 'M' and is_baral_name(fa.name)
        union (
          with recursive dd(id) as (
            select x from unnest(array[gf, mgf]) x where x is not null
            union
            select c.id from people c join dd on c.father_id = dd.id or c.mother_id = dd.id
          )
          select id from dd
          union
          select s from people p join dd on dd.id = p.id, unnest(array[p.spouse_id] || coalesce(p.more_spouse_ids, '{}')) s where s is not null));
    elsif r = 'other' then
      if gf is not null then
        vis := vis || array(
          with recursive dd(id) as (
            select gf
            union
            select c.id from people c join dd on c.father_id = dd.id or c.mother_id = dd.id
          )
          select id from dd
          union
          select s from people p join dd on dd.id = p.id, unnest(array[p.spouse_id] || coalesce(p.more_spouse_ids, '{}')) s where s is not null);
      end if;
    else
      -- moderator: everyone except other people's maternal side
      vis := array(
        with recursive
        wives as (
          select w.id from people w
          where w.gender = 'F' and (w.father_id is not null or w.mother_id is not null)
            and w.id is distinct from mo
            and not coalesce((select is_baral_name(f.name) from people f where f.id = w.father_id), false)
            and (exists (select 1 from people sp where (sp.id = w.spouse_id or sp.id = any(coalesce(w.more_spouse_ids, '{}')))
                         and sp.gender = 'M' and is_baral_name(sp.name))
                 or exists (select 1 from people c join people fa on fa.id = c.father_id
                         where c.mother_id = w.id and fa.gender = 'M' and is_baral_name(fa.name)))
        ),
        anc(id) as (
          select x from wives w join people p on p.id = w.id, unnest(array[p.father_id, p.mother_id]) x where x is not null
          union
          select y from anc a join people p on p.id = a.id, unnest(array[p.father_id, p.mother_id]) y where y is not null
        ),
        cand(id) as (
          select id from anc
          union
          select c.id from people c join cand on c.father_id = cand.id or c.mother_id = cand.id
        ),
        keep(id) as (
          select id from wives
          union
          select c.id from people c join keep on c.father_id = keep.id or c.mother_id = keep.id
        ),
        hid(id) as (
          select id from cand
          union
          select s from people p join cand on cand.id = p.id, unnest(array[p.spouse_id] || coalesce(p.more_spouse_ids, '{}')) s where s is not null
        )
        select id from people
        where id not in (select id from hid where id is not null)
           or id in (select id from keep)
           or is_baral_name(name)
           or id = any(vis));
    end if;
  end if;

  return coalesce((select jsonb_agg(
    case
      when adm then to_jsonb(p) || '{"is_locked":false}'::jsonb
      when not coalesce(p.id = any(vis), false) then
        jsonb_build_object('id', p.id, 'name', '••••••', 'gender', p.gender, 'father_id', p.father_id, 'mother_id', p.mother_id,
          'spouse_id', p.spouse_id, 'more_spouse_ids', p.more_spouse_ids, 'is_living', p.is_living, 'created_at', p.created_at, 'is_locked', true)
      else
        (case when r = 'general' and p.id is distinct from own
              then to_jsonb(p) - 'email' - 'phone' - 'address' - 'notes'
              else to_jsonb(p) - 'email' end) || '{"is_locked":false}'::jsonb
          || case when p.id = own then jsonb_build_object('email', p.email) else '{}'::jsonb end
    end order by p.created_at) from people p), '[]'::jsonb);
end $function$;

-- request history must survive deleting the requester's account
alter table public.change_requests alter column requested_by drop not null;
alter table public.change_requests drop constraint if exists change_requests_requested_by_fkey,
  add constraint change_requests_requested_by_fkey foreign key (requested_by) references public.profiles(id) on delete set null;
alter table public.change_requests drop constraint if exists change_requests_reviewed_by_fkey,
  add constraint change_requests_reviewed_by_fkey foreign key (reviewed_by) references public.profiles(id) on delete set null;

create or replace function public.set_roles(target uuid, new_roles text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'अनुमति छैन'; end if;
  if not (new_roles <@ array['general','premium','moderator','admin','other']) then raise exception 'अमान्य भूमिका'; end if;
  update profiles set roles = new_roles,
    role = case when 'admin' = any(new_roles) then 'admin' when cardinality(new_roles) > 0 then 'member' else 'pending' end
  where id = target;
end $$;

-- ---- admin: suspend / un-suspend / delete a member ----
create or replace function public.admin_suspend_user(p_user uuid, p_suspend boolean) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not is_admin() then raise exception 'अनुमति छैन'; end if;
  if p_user = auth.uid() then raise exception 'आफैंलाई निलम्बन गर्न मिल्दैन'; end if;
  update profiles set suspended_at = case when p_suspend then now() end where id = p_user;
  -- a suspended account also cannot sign in again or refresh its session
  update auth.users set banned_until = case when p_suspend then 'infinity'::timestamptz end where id = p_user;
end $$;

create or replace function public.admin_delete_user(p_user uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not is_admin() then raise exception 'अनुमति छैन'; end if;
  if p_user = auth.uid() then raise exception 'आफैंलाई मेट्न मिल्दैन'; end if;
  -- the person's own record in the family tree stays; only the sign-in account goes
  delete from change_requests where requested_by = p_user and status = 'pending';
  delete from auth.users where id = p_user;
end $$;

revoke all on function public.admin_suspend_user(uuid, boolean) from public, anon;
revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_suspend_user(uuid, boolean) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
