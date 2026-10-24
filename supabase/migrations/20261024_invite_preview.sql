-- 30-second family preview for an invite link, enforced on the server.
-- A visitor with a valid link may see the invited person's own "परिवार" neighbourhood, read-only, once per link
-- for 30 seconds. Afterwards the same link only works for sign-up (claim_invite).
-- Returned per person: name, gender, living flag, parent/spouse links, birth YEAR, photo. Never phone, e-mail,
-- address, notes, full dates or locked (married-daughter) branches.
alter table public.invites
  add column if not exists preview_started_at timestamptz,
  add column if not exists preview_calls integer not null default 0;

-- failed-token log: global throttle (anon callers have no identity to rate-limit by)
create table if not exists public.invite_probe (at timestamptz not null default now());
alter table public.invite_probe enable row level security;
revoke all on public.invite_probe from anon, authenticated;

create or replace function public.invite_preview(p_token text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare i invites; secs numeric; lk uuid[]; ppl jsonb;
begin
  if p_token is null or length(p_token) < 32 or length(p_token) > 128 then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  delete from invite_probe where at < now() - interval '1 minute';
  if (select count(*) from invite_probe) >= 40 then
    return jsonb_build_object('ok', false, 'reason', 'busy');
  end if;
  select * into i from invites where token = p_token and used_at is null and expires_at > now() for update;
  if not found then
    insert into invite_probe default values;
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if i.preview_started_at is null then
    update invites set preview_started_at = now(), preview_calls = 1 where id = i.id;
    secs := 30;
  else
    if i.preview_calls >= 6 then return jsonb_build_object('ok', true, 'expired', true); end if;
    update invites set preview_calls = preview_calls + 1 where id = i.id;
    secs := 30 - extract(epoch from (now() - i.preview_started_at));
  end if;
  if secs <= 0 then return jsonb_build_object('ok', true, 'expired', true); end if;

  -- locked branches (same rule as get_people for general members)
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

  -- neighbourhood: up to great-grandparents, everything below them, and spouses
  ppl := coalesce((
    with recursive
    up(id, d) as (
      select i.person_id, 0
      union all
      select x.n, up.d + 1 from up join people p on p.id = up.id
        cross join lateral (values (p.father_id), (p.mother_id)) x(n)
      where x.n is not null and up.d < 3
    ),
    down(id) as (
      select id from up
      union
      select c.id from people c join down on c.father_id = down.id or c.mother_id = down.id
    ),
    base(id) as (
      select id from down
      union
      select s from people p join down on down.id = p.id, unnest(array[p.spouse_id] || p.more_spouse_ids) s where s is not null
    )
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'gender', p.gender, 'is_living', p.is_living,
      'father_id', p.father_id, 'mother_id', p.mother_id, 'spouse_id', p.spouse_id, 'more_spouse_ids', p.more_spouse_ids,
      'birth_bs', nullif(left(coalesce(p.birth_bs, ''), 4), ''), 'photo_url', p.photo_url, 'created_at', p.created_at))
    from (select * from people where id in (select id from base) and not (id = any(lk)) order by created_at limit 250) p
  ), '[]'::jsonb);

  return jsonb_build_object('ok', true, 'expired', false, 'seconds_left', floor(secs), 'me_id', i.person_id, 'people', ppl);
end $function$;

revoke all on function public.invite_preview(text) from public, anon, authenticated;
grant execute on function public.invite_preview(text) to anon, authenticated;
