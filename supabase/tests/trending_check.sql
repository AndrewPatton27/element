-- =============================================================================
-- trending_check.sql: checks for 20261017070000_trending_foryou.sql
--   Trending (api.feed 'top' + engagement boost), Latest, hidden topics, For you v2
--
-- Supabase SQL editor: needs the two test users element-test-a@example.com and
-- element-test-b@example.com (Authentication -> Users -> Add user, "Auto Confirm User").
-- Paste the whole file and run it.
--   expected:     ERROR: ALL TRENDING CHECKS PASSED (test data rolled back on purpose)
--   any failure:  ERROR: FAIL: <what failed>
-- Signed-in users are simulated as in accounts_check.sql (role + request.jwt.claims).
-- Events are inserted directly (as the owner) to stand in for many api.track calls.
-- =============================================================================

do $$
declare
  ua    uuid;
  ub    uuid;
  base  numeric := round((extract(epoch from now()) / 3600)::numeric, 6);
  b     uuid;
  r     jsonb;
  page  jsonb;
  cur   text;
  seen  text[];
  ids   jsonb := '{}';
  got   text;
  ok    boolean;
  n     int;
  i     int;
  k1    text;
  k2    text;
  t0    timestamptz;
  mode  text;
begin
  select id into ua from auth.users where email = 'element-test-a@example.com';
  select id into ub from auth.users where email = 'element-test-b@example.com';
  if ua is null or ub is null then
    raise exception 'SETUP: create the users element-test-a@example.com and element-test-b@example.com first';
  end if;
  delete from core.user_events where user_id in (ua, ub);
  delete from core.user_prefs  where user_id in (ua, ub);
  update core.blurbs set status = 'hidden' where status = 'published';
  delete from core.user_events where created_at > now() - interval '48 hours';   -- quiet slate for Trending

  -- FED: importance 10, 2 h old; SMALL: importance 1.6, brand new (19.2 h behind FED);
  -- N1/N2: two close deals cards; F0..F25 fillers (markets/energy) far below
  insert into core.blurbs (dedupe_key, kind, headline, category, as_of, sort_at, rank_score)
  values ('tr-FED', 'summary', 'TR FED', 'economy', now(), now() - interval '2 hours', base - 2 + 8 * log(2, 10::numeric))
  returning id into b; ids := ids || jsonb_build_object('FED', b);
  insert into core.blurbs (dedupe_key, kind, headline, category, as_of, sort_at, rank_score)
  values ('tr-SMALL', 'summary', 'TR SMALL', 'tech', now(), now(), base + 8 * log(2, 1.6::numeric))
  returning id into b; ids := ids || jsonb_build_object('SMALL', b);
  insert into core.blurbs (dedupe_key, kind, headline, category, as_of, sort_at, rank_score)
  values ('tr-N1', 'summary', 'TR N1', 'deals', now(), now() - interval '1 minute', base + 1.0)
  returning id into b; ids := ids || jsonb_build_object('N1', b);
  insert into core.blurbs (dedupe_key, kind, headline, category, as_of, sort_at, rank_score)
  values ('tr-N2', 'summary', 'TR N2', 'deals', now(), now() - interval '2 minutes', base + 0.5)
  returning id into b; ids := ids || jsonb_build_object('N2', b);
  for i in 0 .. 25 loop
    insert into core.blurbs (dedupe_key, kind, headline, category, as_of, sort_at, rank_score)
    values ('tr-F' || i, 'summary', 'TR F' || i, case when i % 2 = 0 then 'markets' else 'energy' end,
            now(), now() - make_interval(mins => 10 + i), base - 10 - i)
    returning id into b; ids := ids || jsonb_build_object('F' || i, b);
  end loop;
  insert into core.blurb_sources (blurb_id, name, kind, url, license_class, is_primary)
  select x.id, 'SEC', 'filing', 'https://www.sec.gov/tr/' || x.id, 'company_filing', true
    from core.blurbs x where x.dedupe_key like 'tr-%';

  -- ---- 1. privileges ----------------------------------------------------------------
  foreach mode in array array['anon', 'authenticated'] loop
    perform set_config('role', mode, true);
    perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', mode)::text, true);
    ok := false;
    begin perform api.refresh_trending();
    exception when insufficient_privilege then ok := true; end;
    if not ok then raise exception 'FAIL: % can call api.refresh_trending', mode; end if;
    ok := false;
    begin perform count(*) from core.trend_boosts;
    exception when insufficient_privilege then ok := true; end;
    if not ok then raise exception 'FAIL: % can read core.trend_boosts', mode; end if;
  end loop;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  ok := false;
  begin perform api.my_categories();
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL: anon can call api.my_categories'; end if;

  -- ---- 2. before any engagement: importance x recency -------------------------------
  select string_agg(replace(x->>'headline', 'TR ', ''), ',' order by o) into got
    from jsonb_array_elements(api.feed('top', null, 10) -> 'items') with ordinality as t(x, o) where o <= 4;
  if got is distinct from 'FED,SMALL,N1,N2' then raise exception 'FAIL: trending order before engagement is %', got; end if;
  if (select count(*) from jsonb_array_elements(api.feed() -> 'items')) <> 20 then
    raise exception 'FAIL: api.feed() with defaults (old app call) broke';
  end if;

  -- ---- 3. engagement from both users, then a refresh --------------------------------
  perform set_config('role', 'none', true);
  insert into core.user_events (user_id, blurb_id, kind, dwell_ms)
  select u, (ids->>'SMALL')::uuid, k, case when k = 'dwell' then 9000 end
    from unnest(array[ua, ub]) u, unnest(array['view', 'like', 'open_detail', 'open_source', 'dwell']) k;
  insert into core.user_events (user_id, blurb_id, kind)                   -- N2: two likes
  select u, (ids->>'N2')::uuid, 'like' from unnest(array[ua, ub]) u;
  insert into core.user_events (user_id, blurb_id, kind)                   -- F1: one keen user only
  select ua, (ids->>'F1')::uuid, k from unnest(array['like', 'open_detail', 'open_source']) k;
  insert into core.user_events (user_id, blurb_id, kind)                   -- F2: two dislikes
  select u, (ids->>'F2')::uuid, 'dislike' from unnest(array[ua, ub]) u;
  r := core.refresh_trending();
  if (r->>'boosted')::int <> 3 then raise exception 'FAIL: refresh boosted % cards, expected 3 (SMALL, N2, F2): %', r->>'boosted', r; end if;

  perform set_config('role', 'anon', true);
  select string_agg(replace(x->>'headline', 'TR ', ''), ',' order by o) into got
    from jsonb_array_elements(api.feed('top', null, 10) -> 'items') with ordinality as t(x, o) where o <= 4;
  -- SMALL gets ~+4 h (16.4 points), still ~15 h behind FED: importance dominates.
  -- N2 (+2.6 h for two likes) passes N1.
  if got is distinct from 'FED,SMALL,N2,N1' then raise exception 'FAIL: trending order after engagement is %', got; end if;
  perform set_config('role', 'none', true);
  select max(boost) into k1 from core.trend_boosts where gen = (r->>'generation')::bigint;
  if k1::numeric > 6 or k1::numeric < 3.9 then raise exception 'FAIL: top boost % outside 3.9..6', k1; end if;
  if exists (select 1 from core.trend_boosts where blurb_id = (ids->>'F1')::uuid) then
    raise exception 'FAIL: a card with only one interested user got a boost';
  end if;
  if (select boost from core.trend_boosts where gen = (r->>'generation')::bigint and blurb_id = (ids->>'F2')::uuid) >= 0 then
    raise exception 'FAIL: two dislikes did not give a negative boost';
  end if;
  -- refresh again with nothing new: same boosts, new generation; old generations are trimmed
  for i in 1 .. 7 loop perform core.refresh_trending(); end loop;
  if (select count(*) from core.trend_generations) > 6 then raise exception 'FAIL: old trend generations not trimmed'; end if;

  -- ---- 4. Trending paging across a refresh: no repeats, nothing skipped -------------
  perform set_config('role', 'anon', true);
  page := api.feed('top', null, 10);
  seen := array(select x->>'id' from jsonb_array_elements(page->'items') x);
  cur  := page->>'next_cursor';
  if array_length(string_to_array(cur, '|'), 1) <> 3 then raise exception 'FAIL: trending cursor has no generation: %', cur; end if;
  -- F8 is on page 2; both users now love it (+~4 h would lift it into page 1's range)
  perform set_config('role', 'none', true);
  insert into core.user_events (user_id, blurb_id, kind, dwell_ms)
  select u, (ids->>'F8')::uuid, k, case when k = 'dwell' then 9000 end
    from unnest(array[ua, ub]) u, unnest(array['view', 'like', 'open_detail', 'open_source', 'dwell']) k;
  perform core.refresh_trending();
  perform set_config('role', 'anon', true);
  loop
    page := api.feed('top', cur, 10);
    for r in select value from jsonb_array_elements(page->'items') loop
      if (r->>'id') = any (seen) then raise exception 'FAIL: trending paging repeated % across a refresh', r->>'headline'; end if;
      seen := seen || (r->>'id');
    end loop;
    cur := page->>'next_cursor';
    exit when cur is null or cardinality(seen) > 100;
  end loop;
  if cardinality(seen) <> 30 then raise exception 'FAIL: trending paging across a refresh returned % cards, expected 30', cardinality(seen); end if;
  -- a fresh first page uses the new generation: F8 is now in the top 10
  if not exists (select 1 from jsonb_array_elements(api.feed('top', null, 10)->'items') x where x->>'headline' = 'TR F8') then
    raise exception 'FAIL: a fresh trending page does not show the newly boosted card';
  end if;
  -- an old 2-part cursor (older app build) still works
  page := api.feed('top', (base + 100)::text || '|ffffffff-ffff-ffff-ffff-ffffffffffff', 10);
  if jsonb_array_length(page->'items') <> 10 then raise exception 'FAIL: 2-part trending cursor broke'; end if;

  -- ---- 5. Latest is newest first --------------------------------------------------------
  seen := '{}'; cur := null; k1 := null;
  loop
    page := api.feed('latest', cur, 10);
    for r in select value from jsonb_array_elements(page->'items') loop
      if k1 is not null and (r->>'sort_at')::timestamptz > k1::timestamptz then
        raise exception 'FAIL: latest is not newest first at %', r->>'headline';
      end if;
      k1 := r->>'sort_at';
      seen := seen || (r->>'id');
    end loop;
    cur := page->>'next_cursor';
    exit when cur is null or cardinality(seen) > 100;
  end loop;
  if cardinality(seen) <> 30 or cardinality(seen) <> (select count(distinct x) from unnest(seen) x) then
    raise exception 'FAIL: latest paging returned % cards (expected 30, no repeats)', cardinality(seen);
  end if;

  -- ---- 6. hidden topics (signed in) vs anon ------------------------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  perform api.set_prefs(null, array['energy']);
  r := api.my_categories();
  if not exists (select 1 from jsonb_array_elements(r) x where x->>'slug' = 'energy' and (x->>'hidden')::boolean)
     or exists (select 1 from jsonb_array_elements(r) x where x->>'slug' = 'markets' and (x->>'hidden')::boolean) then
    raise exception 'FAIL: my_categories flags wrong: %', r;
  end if;
  foreach mode in array array['top', 'latest'] loop
    seen := '{}'; cur := null;
    loop
      page := api.feed(mode, cur, 10);
      for r in select value from jsonb_array_elements(page->'items') loop
        if r->>'category' = 'energy' then raise exception 'FAIL: hidden topic shown to A in %', mode; end if;
        if (r->>'id') = any (seen) then raise exception 'FAIL: % repeated for A', mode; end if;
        seen := seen || (r->>'id');
      end loop;
      cur := page->>'next_cursor';
      exit when cur is null or cardinality(seen) > 100;
    end loop;
    if cardinality(seen) <> 17 then raise exception 'FAIL: A got % cards in %, expected 17 (30 - 13 energy)', cardinality(seen), mode; end if;
  end loop;
  if jsonb_array_length(api.feed('top', null, 10, 'energy')->'items') <> 0 then
    raise exception 'FAIL: hidden topic returned through p_category';
  end if;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  if jsonb_array_length(api.feed('latest', null, 30, 'energy')->'items') <> 13 then
    raise exception 'FAIL: anon lost energy cards';
  end if;

  -- ---- 7. card keys: feed == feed_for_you minus my_reaction; detail present ------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  select string_agg(key, ',' order by key) into k1 from jsonb_object_keys(api.feed_for_you(null, 10)->'items'->0) key;
  select string_agg(key, ',' order by key) into k2
    from jsonb_object_keys((api.feed('top', null, 10)->'items'->0) || '{"my_reaction":null}'::jsonb) key;
  if k1 is distinct from k2 then raise exception 'FAIL: card keys differ: % vs %', k1, k2; end if;
  if k1 not like '%detail%' then raise exception 'FAIL: detail key missing'; end if;
  if (api.feed('top', null, 10)->'items'->0) ? 'my_reaction' then raise exception 'FAIL: api.feed leaks my_reaction'; end if;

  -- ---- 8. For you paging with fresh signals and a new card mid-scroll ------------------
  t0 := clock_timestamp();
  page := api.feed_for_you(null, 10);
  seen := array(select x->>'id' from jsonb_array_elements(page->'items') x);
  cur  := page->>'next_cursor';
  perform set_config('role', 'none', true);
  -- A reads every card on page 1 after it was served (each would now be -100 h) ...
  insert into core.user_events (user_id, blurb_id, kind, dwell_ms, created_at)
  select ua, x::uuid, 'dwell', 9000, clock_timestamp() + interval '1 second' from unnest(seen) x;
  -- ... and a big new card is published
  insert into core.blurbs (dedupe_key, kind, headline, category, as_of, sort_at, published_at, rank_score)
  values ('tr-NEW', 'summary', 'TR NEW', 'markets', now(), now(), clock_timestamp() + interval '1 second', base + 50);
  perform set_config('role', 'authenticated', true);
  loop
    page := api.feed_for_you(cur, 10);
    for r in select value from jsonb_array_elements(page->'items') loop
      if (r->>'id') = any (seen) then raise exception 'FAIL: for-you repeated % during a scroll', r->>'headline'; end if;
      if r->>'headline' = 'TR NEW' then raise exception 'FAIL: new card jumped into a running scroll'; end if;
      if r->>'category' = 'energy' then raise exception 'FAIL: hidden topic in For you'; end if;
      seen := seen || (r->>'id');
    end loop;
    cur := page->>'next_cursor';
    exit when cur is null or cardinality(seen) > 100;
  end loop;
  -- 17 non-energy cards, minus F2 (A disliked it)
  if cardinality(seen) <> 16 then raise exception 'FAIL: for-you scroll returned % cards, expected 16', cardinality(seen); end if;
  -- a fresh first page sees the new card and the reads
  page := api.feed_for_you(null, 30);
  if page->'items'->0->>'headline' <> 'TR NEW' then raise exception 'FAIL: refreshed For you does not start with the new card'; end if;
  -- an old 2-part cursor still works
  if jsonb_typeof(api.feed_for_you((base + 100)::text || '|ffffffff-ffff-ffff-ffff-ffffffffffff', 10)->'items') <> 'array' then
    raise exception 'FAIL: 2-part for-you cursor broke';
  end if;
  ok := false;
  begin perform api.feed_for_you('garbage', 10);
  exception when others then ok := sqlerrm = 'invalid_cursor'; end;
  if not ok then raise exception 'FAIL: bad for-you cursor accepted'; end if;

  -- ---- 9. no more than 2 in a row from one topic (when another topic is available) ------
  select max(run) into n from (
    select count(*) as run from (
      select o, cat, o - row_number() over (partition by cat order by o) as grp
        from (select o, x->>'category' as cat
                from jsonb_array_elements(api.feed_for_you(null, 30)->'items') with ordinality as t(x, o)) q) q2
     group by cat, grp) q3;
  if n > 2 then raise exception 'FAIL: % cards in a row from one topic', n; end if;

  -- ---- 10. cold start = Trending order, followed topic boosted --------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  perform set_config('role', 'none', true);
  delete from core.user_events where user_id = ub;            -- boosts already stored stay
  perform set_config('role', 'authenticated', true);
  if api.feed_for_you(null, 10)->'items'->0->>'headline' <> 'TR NEW'
     or api.feed_for_you(null, 10)->'items'->1->>'headline' <> 'TR FED' then
    raise exception 'FAIL: cold start does not follow Trending';
  end if;
  perform api.set_prefs(array['deals'], null);
  select o into n from jsonb_array_elements(api.feed_for_you(null, 30)->'items') with ordinality as t(x, o) where x->>'headline' = 'TR N1';
  select o into i from jsonb_array_elements(api.feed('top', null, 30)->'items') with ordinality as t(x, o) where x->>'headline' = 'TR N1';
  if n >= i then raise exception 'FAIL: following deals did not move N1 up (% vs Trending %)', n, i; end if;

  -- ---- 11. users cannot see each other's data -------------------------------------------
  if (api.get_prefs()->'hidden_categories') <> '[]'::jsonb then raise exception 'FAIL: B sees A''s hidden topics'; end if;
  if exists (select 1 from jsonb_array_elements(api.feed('latest', null, 30)->'items') x where x->>'category' = 'energy') is not true then
    raise exception 'FAIL: A''s hidden topic was applied to B';
  end if;

  raise exception 'ALL TRENDING CHECKS PASSED (test data rolled back on purpose)';
end;
$$;
