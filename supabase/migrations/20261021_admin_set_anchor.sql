-- 20261021_admin_set_anchor.sql
-- एडमिनले अर्को सदस्यको नाता-गणना सन्दर्भ ("म फलानाको … हुँ") तोक्ने function।
-- Supabase SQL Editor मा पूरै paste गरी एकपटक Run गर्नुहोस् (दोहोर्याएर चलाए पनि हुन्छ)।
alter table public.profiles add column if not exists custom_anchor jsonb;

create or replace function public.admin_set_anchor(p_user uuid, p_target uuid, p_rel text)
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if not is_admin() then raise exception 'admin मात्र'; end if;
  if not exists (select 1 from profiles where id = p_user) then raise exception 'सदस्य फेला परेन'; end if;
  if p_target is null then update profiles set custom_anchor = null where id = p_user; return; end if;
  if p_rel not in ('son','daughter','father','mother','husband','wife','brother','sister') then raise exception 'अमान्य साइनो'; end if;
  if not exists (select 1 from people where id = p_target) then raise exception 'व्यक्ति फेला परेन'; end if;
  update profiles set custom_anchor = jsonb_build_object('target_id', p_target, 'relation_type', p_rel) where id = p_user;
end $function$;

revoke all on function public.admin_set_anchor(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_set_anchor(uuid, uuid, text) to authenticated;
