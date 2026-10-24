-- get_people: ordinary (general) members no longer receive other people's phone, address and notes.
-- Before this, the browser of every member got those columns for all unlocked people and the UI only hid them.
-- Staff and premium are unchanged. A member still gets everything on their own row.
create or replace function public.get_people(p_role text default null::text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
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
        (case when r = 'general' and p.id is distinct from pr.position_person_id
              then to_jsonb(p) - 'email' - 'phone' - 'address' - 'notes'
              else to_jsonb(p) - 'email' end) || '{"is_locked":false}'::jsonb
          || case when p.id = pr.position_person_id then jsonb_build_object('email', p.email) else '{}'::jsonb end
    end order by p.created_at) from people p), '[]'::jsonb);
end $function$;
