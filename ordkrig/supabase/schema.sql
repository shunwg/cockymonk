-- ============================================================================
-- Word War 1 – Fase 1: ekte flerspiller-rom (Supabase)
-- ----------------------------------------------------------------------------
-- Kjør HELE denne i Supabase → SQL Editor → New query → Run.
-- Trygg å kjøre på nytt: den dropper og bygger tabellene fra bunnen.
--
-- Modell (MVP): "vert-styrt". Første spiller i et rom er vert og driver fasene
-- (velger ord, teller ned, regner poeng) og skriver til `rooms`. Alle andre
-- telefoner leser rom-raden + svar + stemmer i sanntid og viser det samme.
-- ============================================================================

-- === Frisk start ===========================================================
drop table if exists votes cascade;
drop table if exists answers cascade;
drop table if exists room_players cascade;
drop table if exists rooms cascade;

-- === ROM ===================================================================
create table rooms (
  id             uuid primary key default gen_random_uuid(),
  status         text not null default 'lobby',       -- lobby | playing | finished
  phase          text not null default 'MATCHMAKING', -- MATCHMAKING | WRITING | VOTING | REVEAL
  round_number   int  not null default 0,
  word           text,
  definition     text,
  next_word      text,                                 -- forhåndsvalgt til lobby-visning
  next_definition text,
  phase_ends_at  timestamptz,
  host_id        uuid,                                 -- verten som driver fasene
  max_players    int  not null default 5,
  lang           text not null default 'no',           -- liga: 'no' | 'en' (helt atskilt)
  created_at     timestamptz not null default now()
);

-- === SPILLERE I ROM ========================================================
create table room_players (
  id             uuid primary key default gen_random_uuid(),
  room_id        uuid not null references rooms(id) on delete cascade,
  user_id        uuid not null,                        -- auth.uid() (anonym bruker)
  username       text not null,
  is_host        boolean not null default false,
  is_bot         boolean not null default false,       -- botter er ekte rader; UI skiller ikke
  session_score  int not null default 0,
  ready          boolean not null default false,       -- "klar til neste runde"
  waiting        boolean not null default false,       -- hoppet inn i PÅGÅENDE spill:
                                                        -- venter (i "fake matchmaking")
                                                        -- til neste runde, da en bot ryker
  joined_at      timestamptz not null default now(),
  left_at        timestamptz,                           -- soft-leave (forsvinner fra lista)
  unique (room_id, user_id)
);

-- === SVAR ==================================================================
create table answers (
  id             uuid primary key default gen_random_uuid(),
  room_id        uuid not null references rooms(id) on delete cascade,
  round_number   int  not null,
  author_id      uuid,                                  -- null = fasit (det ekte svaret)
  text           text not null default '',
  is_correct     boolean not null default false,
  is_empty       boolean not null default false,        -- fryst/ikke levert → ikke stembart
  sort_key       double precision not null default random(),  -- felles stokkerekkefølge
  created_at     timestamptz not null default now(),
  unique (room_id, round_number, author_id)
);

-- === STEMMER ===============================================================
create table votes (
  id             uuid primary key default gen_random_uuid(),
  room_id        uuid not null references rooms(id) on delete cascade,
  round_number   int  not null,
  voter_id       uuid not null,
  answer_id      uuid not null references answers(id) on delete cascade,
  created_at     timestamptz not null default now(),
  unique (room_id, round_number, voter_id)
);

-- === Indekser for raske sanntidsoppslag ===================================
create index on room_players (room_id);
create index on answers (room_id, round_number);
create index on votes (room_id, round_number);
create index on rooms (status, created_at);

-- === Sanntid: send endringer til klientene =================================
alter publication supabase_realtime add table rooms;
alter publication supabase_realtime add table room_players;
alter publication supabase_realtime add table answers;
alter publication supabase_realtime add table votes;

-- === Tabell-rettigheter (GRANT) ============================================
-- VIKTIG: RLS bestemmer HVILKE rader, men rollene må også ha GRANT for å røre
-- tabellen i det hele tatt. Uten dette får REST-kall «permission denied».
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;

-- === Tilgangsregler (RLS) ==================================================
-- MVP for lukket testing: både anon og pålogget (anonym) bruker kan lese/skrive.
-- Vi strammer inn (kun eget rom/egne rader) i en senere fase.
alter table rooms        enable row level security;
alter table room_players enable row level security;
alter table answers      enable row level security;
alter table votes        enable row level security;

create policy "rw rooms"   on rooms        for all to anon, authenticated using (true) with check (true);
create policy "rw players" on room_players for all to anon, authenticated using (true) with check (true);
create policy "rw answers" on answers      for all to anon, authenticated using (true) with check (true);
create policy "rw votes"   on votes        for all to anon, authenticated using (true) with check (true);

-- === UNIKE BRUKERNAVN ======================================================
-- Automatisk tildelte navn (LurGaupe, Hundegjeit …) kreves her – primary key
-- garanterer at ingen får samme navn (kollisjon → klienten prøver et nytt).
create table if not exists claimed_usernames (
  username   text primary key,          -- lowercase-nøkkel (unikhet)
  display    text not null,             -- slik navnet vises (CamelCase)
  user_id    uuid not null,
  created_at timestamptz not null default now()
);
grant select, insert on claimed_usernames to anon, authenticated;
alter table claimed_usernames enable row level security;
create policy "claim names" on claimed_usernames
  for all to anon, authenticated using (true) with check (true);

-- === GLOBAL RANGLISTE ======================================================
-- Hver klient speiler sin lokale rating hit etter hver runde. Ranglisten i
-- profilen leser alle rader sortert på rating.
create table if not exists ratings (
  user_id    uuid not null,
  lang       text not null default 'no', -- egen rangliste per liga
  username   text not null,
  rating     int  not null,
  rounds     int  not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, lang)
);
grant select, insert, update on ratings to anon, authenticated;
alter table ratings enable row level security;
create policy "rw ratings" on ratings
  for all to anon, authenticated using (true) with check (true);

-- === Matchmaking: bli med i et åpent rom, ellers lag et nytt (atomisk) =====
-- Klienten kaller: supabase.rpc('join_open_room', { p_username: 'Navn', p_lang: 'no' })
drop function if exists join_open_room(text);
create or replace function join_open_room(p_username text, p_lang text default 'no')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id uuid;
begin
  -- Finn eldste rom i LIGAEN i lobby med ledig MENNESKE-plass (botter teller
  -- ikke mot kapasiteten – et menneske overtar plassen til en bot).
  select r.id into v_room_id
  from rooms r
  where r.status = 'lobby'
    and r.lang = p_lang
    -- Ferskhetsvakt: et ekte matchmaking-rom er maks ~18 sek gammelt. Eldre
    -- lobby-rom er rester (noen forlot uten å fullføre) og skal aldri gjenbrukes
    -- – ellers lander nye spillere i et rom "fullt" av gamle botter.
    and r.created_at > now() - interval '2 minutes'
    and (select count(*) from room_players rp
         where rp.room_id = r.id and rp.left_at is null and rp.is_bot = false) < r.max_players
  order by r.created_at asc
  limit 1
  for update;   -- IKKE «skip locked»: en joiner skal VENTE på et rom som verten
                 -- akkurat oppdaterer, ikke hoppe over det og lage et nytt (→ da
                 -- havner to venner i hvert sitt rom).

  if v_room_id is not null then
    -- bli med i det ledige lobby-rommet
    insert into room_players (room_id, user_id, username, is_host)
    values (v_room_id, auth.uid(), p_username, false)
    on conflict (room_id, user_id)
      do update set left_at = null, waiting = false, username = excluded.username;
    return v_room_id;
  end if;

  -- Ingen ledige → lag nytt rom i ligaen, du blir vert
  insert into rooms (host_id, lang) values (auth.uid(), p_lang) returning id into v_room_id;
  insert into room_players (room_id, user_id, username, is_host)
  values (v_room_id, auth.uid(), p_username, true);
  return v_room_id;
end;
$$;

-- === HOPP INN I PÅGÅENDE SPILL =============================================
-- Egen knapp på hjemskjermen: lyser når et spill står i ventefasen (REVEAL/
-- mellomrunde) med minst én aktiv bot og ledig menneskeplass. Den som hopper
-- inn settes som `waiting`, lander i den EKTE mellomrunde-lobbyen, og
-- aktiveres av verten ved neste rundestart (nyeste bot gir fra seg plassen).

drop function if exists joinable_game_exists();
create or replace function joinable_game_exists(p_lang text default 'no')
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from rooms r
    where r.status = 'playing'
      and r.lang = p_lang
      and (
        -- MIDT I SKRIVERUNDEN: >15 sek igjen OG en bot som ikke har levert svar
        -- ennå → spilleren tar over boten og skriver sitt eget svar i runden.
        (r.phase = 'WRITING'
          and r.phase_ends_at > now() + interval '15 seconds'
          and exists (select 1 from room_players rp
                      where rp.room_id = r.id and rp.left_at is null and rp.is_bot
                        and not exists (select 1 from answers a
                                        where a.room_id = r.id
                                          and a.round_number = r.round_number
                                          and a.author_id = rp.user_id)))
        or
        -- MIDT I GJETTEFASEN: >15 sek igjen OG en bot som ikke har STEMT ennå →
        -- ta over den og stem selv. (Botens innleverte svar blir stående som
        -- foreldreløst – stemmer på det gir ingen poeng til noen.)
        (r.phase = 'VOTING'
          and r.phase_ends_at > now() + interval '15 seconds'
          and exists (select 1 from room_players rp
                      where rp.room_id = r.id and rp.left_at is null and rp.is_bot
                        and not exists (select 1 from votes v
                                        where v.room_id = r.id
                                          and v.round_number = r.round_number
                                          and v.voter_id = rp.user_id)))
        or
        -- VENTEFASEN: inn som ventende, med fra neste runde (bot ryker da)
        (r.phase = 'REVEAL' and r.phase_ends_at > now()
          and exists (select 1 from room_players rp
                      where rp.room_id = r.id and rp.left_at is null and rp.is_bot))
      )
      and (select count(*) from room_players rp
           where rp.room_id = r.id and rp.left_at is null and rp.is_bot = false) < r.max_players
  );
$$;

drop function if exists join_ongoing_room(text);
create or replace function join_ongoing_room(p_username text, p_lang text default 'no')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id uuid;
  v_round int;
  v_bot uuid;
begin
  -- 1) MIDT I SKRIVERUNDEN: ta over en bot som ikke har LEVERT svar (>15 sek igjen).
  --    Spilleren er med i runden UMIDDELBART og skriver sitt eget svar.
  select r.id, r.round_number into v_room_id, v_round
  from rooms r
  where r.status = 'playing'
    and r.lang = p_lang
    and r.phase = 'WRITING'
    and r.phase_ends_at > now() + interval '15 seconds'
    and exists (select 1 from room_players rp
                where rp.room_id = r.id and rp.left_at is null and rp.is_bot
                  and not exists (select 1 from answers a
                                  where a.room_id = r.id and a.round_number = r.round_number
                                    and a.author_id = rp.user_id))
    and (select count(*) from room_players rp
         where rp.room_id = r.id and rp.left_at is null and rp.is_bot = false) < r.max_players
  order by r.created_at asc
  limit 1
  for update;

  if v_room_id is not null then
    select rp.user_id into v_bot
    from room_players rp
    where rp.room_id = v_room_id and rp.left_at is null and rp.is_bot
      and not exists (select 1 from answers a
                      where a.room_id = v_room_id and a.round_number = v_round
                        and a.author_id = rp.user_id)
    order by rp.joined_at desc
    limit 1;
    update room_players set left_at = now() where room_id = v_room_id and user_id = v_bot;
    insert into room_players (room_id, user_id, username, is_host, waiting)
    values (v_room_id, auth.uid(), p_username, false, false)
    on conflict (room_id, user_id)
      do update set left_at = null, waiting = false, username = excluded.username;
    return v_room_id;
  end if;

  -- 2) MIDT I GJETTEFASEN: ta over en bot som ikke har STEMT (>15 sek igjen).
  --    Botens svar blir stående uten eier – stemmer på det gir ingen poeng.
  select r.id, r.round_number into v_room_id, v_round
  from rooms r
  where r.status = 'playing'
    and r.lang = p_lang
    and r.phase = 'VOTING'
    and r.phase_ends_at > now() + interval '15 seconds'
    and exists (select 1 from room_players rp
                where rp.room_id = r.id and rp.left_at is null and rp.is_bot
                  and not exists (select 1 from votes v
                                  where v.room_id = r.id and v.round_number = r.round_number
                                    and v.voter_id = rp.user_id))
    and (select count(*) from room_players rp
         where rp.room_id = r.id and rp.left_at is null and rp.is_bot = false) < r.max_players
  order by r.created_at asc
  limit 1
  for update;

  if v_room_id is not null then
    select rp.user_id into v_bot
    from room_players rp
    where rp.room_id = v_room_id and rp.left_at is null and rp.is_bot
      and not exists (select 1 from votes v
                      where v.room_id = v_room_id and v.round_number = v_round
                        and v.voter_id = rp.user_id)
    order by rp.joined_at desc
    limit 1;
    update room_players set left_at = now() where room_id = v_room_id and user_id = v_bot;
    insert into room_players (room_id, user_id, username, is_host, waiting)
    values (v_room_id, auth.uid(), p_username, false, false)
    on conflict (room_id, user_id)
      do update set left_at = null, waiting = false, username = excluded.username;
    return v_room_id;
  end if;

  -- 3) VENTEFASEN: inn som ventende – aktiveres ved neste rundestart (bot ryker da)
  select r.id into v_room_id
  from rooms r
  where r.status = 'playing'
    and r.lang = p_lang
    and r.phase = 'REVEAL'
    and r.phase_ends_at > now()
    and exists (select 1 from room_players rp
                where rp.room_id = r.id and rp.left_at is null and rp.is_bot)
    and (select count(*) from room_players rp
         where rp.room_id = r.id and rp.left_at is null and rp.is_bot = false) < r.max_players
  order by r.created_at asc
  limit 1
  for update;

  if v_room_id is not null then
    insert into room_players (room_id, user_id, username, is_host, waiting)
    values (v_room_id, auth.uid(), p_username, false, true)
    on conflict (room_id, user_id)
      do update set left_at = null, waiting = true, username = excluded.username;
    return v_room_id;
  end if;

  return null; -- vinduet lukket seg – klienten faller tilbake til vanlig matchmaking
end;
$$;

grant execute on function joinable_game_exists(text) to anon, authenticated;
grant execute on function join_ongoing_room(text, text) to anon, authenticated;
grant execute on function join_open_room(text, text) to anon, authenticated;

