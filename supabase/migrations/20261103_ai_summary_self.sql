-- "तपाईंको कथा": an AI summary written in the second person ("तपाईं ...") for the signed-in person's own home screen.
-- It is separate from ai_summary (third person, shown on the profile panel to everybody who may see the profile).
-- Written only by the generate-ai-insights edge function (service role): by an admin, or by the person for themselves
-- (not more than once per 6 hours, so nobody can run up the AI bill).
alter table public.people
  add column if not exists ai_summary_self text,
  add column if not exists ai_summary_self_at timestamptz;
