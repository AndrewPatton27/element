-- Checks for 20261018000000_brief_search_follow.sql; runs after migration 090000.
-- Every row is inserted inside this DO statement and rolled back by the final deliberate error.
do $$
declare
  ids uuid[] := array_fill(null::uuid, array[7]);
  cat text;
  i int;
  r jsonb;
  cursor_ text;
  first_id text;
begin
  select slug into cat from core.categories order by sort_order limit 1;
  for i in 1..7 loop
    insert into core.blurbs (dedupe_key,kind,headline,body,category,status,tickers,as_of,published_at,sort_at,importance)
    values ('briefcheck:'||i,'summary',case when i=1 then 'AAPL quarterly results' else 'Brief check story '||i end,
      'Searchable demo body for the test.',cat,'published',
      case when i in (1,2) then '[{"symbol":"AAPL","name":"Apple Inc.","exchange":"Nasdaq"}]'::jsonb else '[]'::jsonb end,
      now()-make_interval(hours=>i),now()-make_interval(hours=>i),now()-make_interval(hours=>i),10-i)
    returning id into ids[i];
    insert into core.blurb_sources (blurb_id,name,kind,url,license_class,is_primary)
    values (ids[i],case when i=1 then 'Apple News Desk' else 'Brief Test Source' end,'news','https://example.com/briefcheck/'||i,'company_filing',true);
  end loop;

  r := api.search('AAPL',null,1);
  if jsonb_array_length(r->'items') <> 1 or r->'next_cursor' is null then raise exception 'FAIL: search first page / ticker fallback'; end if;
  first_id := r->'items'->0->>'id'; cursor_ := r->>'next_cursor';
  r := api.search('AAPL',cursor_,1);
  if jsonb_array_length(r->'items') <> 1 or r->'items'->0->>'id' = first_id then raise exception 'FAIL: search cursor paging'; end if;
  if jsonb_array_length(api.search('x',null,20)->'items') <> 0 then raise exception 'FAIL: short search'; end if;
  if not exists (select 1 from jsonb_array_elements(api.related_cards(ids[1],5)) x where x->>'id'=ids[2]::text) then raise exception 'FAIL: related ticker match'; end if;

  r := api.following_feed(array[cat],array[]::text[],array[]::text[],null,10);
  if jsonb_array_length(r->'items') < 1 or r->'items'->0->>'follow_reason' not like 'Because you follow %' then raise exception 'FAIL: following direct match/reason'; end if;
  r := api.following_feed(array[]::text[],array[]::text[],array[]::text[],null,10);
  if r->'items' is null then raise exception 'FAIL: empty following fallback'; end if;

  r := api.daily_brief();
  if jsonb_typeof(r->'headline_cards') <> 'array' or jsonb_array_length(r->'headline_cards') > 3 or jsonb_array_length(r->'sections') > 5 or jsonb_array_length(r->'numbers') > 4 then raise exception 'FAIL: daily brief shape/limits'; end if;
  r := api.weekly_brief();
  if (r->>'window_hours')::int <> 168 or jsonb_array_length(r->'movers') > 4 then raise exception 'FAIL: weekly brief shape/limits'; end if;
  if has_function_privilege('anon','api.search(text,text,integer)','execute') is not true
     or has_function_privilege('authenticated','api.following_feed(text[],text[],text[],text,integer)','execute') is not true
     or has_function_privilege('anon','api.daily_brief()','execute') is not true then raise exception 'FAIL: RPC grants'; end if;

  raise exception 'ALL BRIEF SEARCH FOLLOW CHECKS PASSED (test rows rolled back on purpose)';
end $$;
