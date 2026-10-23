-- Sign-up asks for birth date, phone and location. Stored on the profile, shown to admin,
-- and copied into the linked person only where that person's field is still empty.
alter table public.profiles
  add column if not exists birth_bs text,
  add column if not exists phone text,
  add column if not exists location text;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles(id, email, full_name, claim_father, claim_grand, birth_bs, phone, location)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
          nullif(trim(new.raw_user_meta_data->>'claim_father'), ''),
          nullif(trim(new.raw_user_meta_data->>'claim_grand'), ''),
          left(nullif(trim(new.raw_user_meta_data->>'birth_bs'), ''), 12),
          left(nullif(trim(new.raw_user_meta_data->>'phone'), ''), 20),
          left(nullif(trim(new.raw_user_meta_data->>'location'), ''), 120));
  return new;
end $$;

-- Google/Facebook sign-in: same identity step, plus the optional contact fields (once only).
-- (old 3-arg overload is left in place; the app always calls the 6-arg one)
create or replace function public.submit_identity(
  p_name text, p_father text, p_grand text,
  p_birth text, p_phone text, p_location text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'लगइन चाहिन्छ'; end if;
  if nullif(trim(p_name),'') is null or nullif(trim(p_father),'') is null or nullif(trim(p_grand),'') is null then
    raise exception 'नाम, बुबा र हजुरबुबाको नाम चाहिन्छ';
  end if;
  update profiles set
    full_name = trim(p_name), claim_father = trim(p_father), claim_grand = trim(p_grand),
    birth_bs = left(nullif(trim(p_birth),''), 12),
    phone = left(nullif(trim(p_phone),''), 20),
    location = left(nullif(trim(p_location),''), 120)
  where id = auth.uid() and claim_father is null and claim_grand is null
    and position_person_id is null and position_parent_id is null and position_grand_id is null;
end $$;
grant execute on function public.submit_identity(text,text,text,text,text,text) to authenticated;

-- Admin links the member to a person: copy sign-up details into EMPTY person fields only.
create or replace function public.set_position(target uuid, p_person uuid) returns void
language plpgsql security definer set search_path = public as $$
declare pr profiles;
begin
  if not is_admin() then raise exception 'अनुमति छैन'; end if;
  update profiles set position_person_id = p_person where id = target returning * into pr;
  if p_person is not null then
    update people set
      birth_bs = coalesce(nullif(birth_bs,''), pr.birth_bs),
      phone    = coalesce(nullif(phone,''), pr.phone),
      address  = coalesce(nullif(address,''), pr.location)
    where id = p_person;
  end if;
end $$;
