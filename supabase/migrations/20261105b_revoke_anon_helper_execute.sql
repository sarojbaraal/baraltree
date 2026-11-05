-- 20261105b_revoke_anon_helper_execute.sql
-- Supabase security advisor: SECURITY DEFINER functions callable by anon/authenticated.
-- Only EXECUTE grants and search_path change here; no function logic is touched.
-- Project: bbrdnjkbmjwdgwahkbro

-- 1) Internal visibility helpers: only get_people / request_mode / vis_ids / branch_ids
--    (all SECURITY DEFINER, run as owner) call them. Nobody needs to call them over the API.
revoke execute on function
  public.vis_ids(public.profiles, uuid, text),
  public.imm_ids(uuid),
  public.down_ids(uuid[]),
  public.branch_ids(public.profiles, uuid),
  public.grand_of(public.profiles, uuid)
from public, anon, authenticated;

-- 2) Functions that need a signed-in user (they use auth.uid()): remove PUBLIC/anon, keep authenticated.
revoke execute on function
  public.admin_revoke_view(uuid, uuid),
  public.admin_view_requests(),
  public.get_people(text, uuid),
  public.log_print(text),
  public.request_mode(uuid),
  public.request_view(uuid, text),
  public.review_view_request(uuid, boolean),
  public.submit_identity(text, text, text, text, text, text),
  public.submit_request(jsonb)
from public, anon;

grant execute on function
  public.admin_revoke_view(uuid, uuid),
  public.admin_view_requests(),
  public.get_people(text, uuid),
  public.log_print(text),
  public.request_mode(uuid),
  public.request_view(uuid, text),
  public.review_view_request(uuid, boolean),
  public.submit_identity(text, text, text, text, text, text),
  public.submit_request(jsonb)
to authenticated;

-- 3) invite_info / invite_preview stay callable by anon (invite landing page, token required).

-- 4) Fix mutable search_path warning on pure string helpers.
alter function public.surname_of(text)  set search_path = public, pg_catalog;
alter function public.is_baral_name(text) set search_path = public, pg_catalog;
