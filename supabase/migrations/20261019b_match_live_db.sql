-- 20261019b_match_live_db.sql
-- पुरानो (live) database को function परिभाषासँग नयाँ project मिलाउने patch।
-- 20261019_vansh_legacy_schema.sql चलिसकेपछि Supabase SQL Editor मा पूरै paste गरी एकपटक Run गर्नुहोस्।

-- १) live मा भएका अतिरिक्त स्तम्भ
alter table public.people   add column if not exists login_provider text, add column if not exists avatar_url text;
alter table public.profiles add column if not exists custom_anchor jsonb;

-- २) invites: live को आकार (id, expires_at, used_by, used_at)। तालिका अहिले खाली छ।
drop table if exists public.invites;
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  person_id uuid not null references public.people(id) on delete cascade,
  roles text[] not null default '{general}',
  created_by uuid,
  created_at timestamptz default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  used_by uuid,
  used_at timestamptz
);
alter table public.invites enable row level security;
revoke all on public.invites from anon, authenticated;

-- ३) live का invite functions (हुबहु); पहिलो migration का फरक signature हटाउने (नत्र RPC अस्पष्ट हुन्छ)
drop function if exists public.create_invite(uuid, text[]);
drop function if exists public.invite_info(text);

create or replace function public.create_invite(p_person uuid, p_roles text[] default array['general'::text], p_days integer default 14)
returns text language plpgsql security definer set search_path to 'public' as $function$
declare t text;
begin
  if not is_admin() then raise exception 'admin मात्र'; end if;
  if not exists (select 1 from people where id = p_person) then raise exception 'व्यक्ति फेला परेन'; end if;
  if cardinality(p_roles) = 0 or not (p_roles <@ array['general','premium','moderator']) then raise exception 'अमान्य भूमिका'; end if;
  delete from invites where person_id = p_person and used_at is null;   -- एक व्यक्तिको एउटै सक्रिय लिंक
  t := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into invites(token, person_id, roles, created_by, expires_at) values (t, p_person, p_roles, auth.uid(), now() + make_interval(days => p_days));
  return t;
end $function$;

create or replace function public.invite_info(p_token text)
returns table(person_name text, father_name text, birth_bs text)
language sql stable security definer set search_path to 'public' as $function$
  select p.name, f.name, p.birth_bs::text from invites i join people p on p.id = i.person_id left join people f on f.id = p.father_id
  where i.token = p_token and i.used_at is null and i.expires_at > now() $function$;

create or replace function public.claim_invite(p_token text)
returns text language plpgsql security definer set search_path to 'public' as $function$
declare i invites; u record;
begin
  if auth.uid() is null then raise exception 'पहिले लगइन गर्नुहोस्'; end if;
  select * into i from invites where token = p_token and used_at is null and expires_at > now() for update;
  if not found then raise exception 'निम्तो लिंक अमान्य छ, म्याद सकिएको छ वा पहिले नै प्रयोग भइसकेको छ'; end if;
  select email, raw_user_meta_data as m, raw_app_meta_data as a into u from auth.users where id = auth.uid();
  update profiles set position_person_id = i.person_id, position_parent_id = null, position_grand_id = null,
    roles = case when cardinality(roles) = 0 then i.roles else roles end,
    role = case when role = 'pending' then 'member' else role end
  where id = auth.uid();
  update people set email = coalesce(u.email, email),
    login_provider = coalesce(u.a->>'provider', login_provider),
    avatar_url = coalesce(u.m->>'avatar_url', u.m->>'picture', avatar_url)
  where id = i.person_id;
  update invites set used_by = auth.uid(), used_at = now() where id = i.id;
  return (select name from people where id = i.person_id);
end $function$;

-- ४) live का अरू functions
create or replace function public.set_ai_summary(pid uuid, summary text, tags text[])
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if not is_admin() then raise exception 'admin मात्र'; end if;
  update people set ai_summary = nullif(trim(summary),''), ai_tags = coalesce(tags,'{}') where id = pid;
end $function$;

create or replace function public.set_my_anchor(p_target uuid, p_rel text)
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if p_target is null then update profiles set custom_anchor = null where id = auth.uid(); return; end if;
  if p_rel not in ('son','daughter','father','mother','husband','wife','brother','sister') then raise exception 'अमान्य साइनो'; end if;
  if not exists (select 1 from people where id = p_target) then raise exception 'व्यक्ति फेला परेन'; end if;
  update profiles set custom_anchor = jsonb_build_object('target_id', p_target, 'relation_type', p_rel) where id = auth.uid();
end $function$;

-- ५) review_request: live जस्तै एडमिन मात्र
do $$
declare d text;
begin
  select pg_get_functiondef('public.review_request(uuid,boolean,text)'::regprocedure) into d;
  execute replace(d, 'if not is_staff() then', 'if not is_admin() then');
end $$;

-- ६) अनुमति (revoke पछि फेरि खोल्ने)
revoke all on function public.create_invite(uuid, text[], integer), public.invite_info(text), public.claim_invite(text),
  public.set_ai_summary(uuid, text, text[]), public.set_my_anchor(uuid, text) from public, anon, authenticated;
grant execute on function public.create_invite(uuid, text[], integer), public.claim_invite(text),
  public.set_ai_summary(uuid, text, text[]), public.set_my_anchor(uuid, text) to authenticated;
grant execute on function public.invite_info(text) to anon, authenticated;
