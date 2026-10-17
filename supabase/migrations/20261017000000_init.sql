-- =============================================================================
-- Element: initial schema (hackathon cut)
--
-- Three schemas:
--   ingest  private  raw collected items
--   core    private  published cards, sources, macro numbers, settings
--   api     public   the ONLY schema exposed through the Data API (views + RPCs)
--
-- In Supabase: Project Settings -> Data API -> Exposed schemas = `api` only.
--
-- The file is split into sections A-D. Every statement is written to be safe to
-- re-run (if not exists / create or replace / on conflict), so if one section
-- errors you can fix it and paste that section again.
--   A  schemas, tables, constraints, row-level security, privileges
--   B  ranking: params, event weights, refresh_rank, indexes
--   C  api: feed, numbers_to_know, app_config, categories, service-role RPCs
--   D  seed data
-- Requires Postgres 14+ (Supabase runs 15+).
-- =============================================================================


-- =============================================================================
-- A. SCHEMAS, TABLES, ROW-LEVEL SECURITY
-- =============================================================================

create schema if not exists ingest;
create schema if not exists core;
create schema if not exists api;

-- Nobody but the owner (and service_role through api RPCs) touches ingest/core.
revoke all on schema ingest from public, anon, authenticated;
revoke all on schema core   from public, anon, authenticated;
grant usage on schema api to anon, authenticated, service_role;

-- ---------- ingest.items: one collected filing / release --------------------
create table if not exists ingest.items (
  id            uuid primary key default gen_random_uuid(),
  source        text not null,                       -- 'sec_8k', 'sec_form4', 'fed_rss', ...
  external_id   text,
  url           text not null unique check (url like 'https://%'),
  title         text,
  body_text     text,
  published_at  timestamptz,
  fetched_at    timestamptz not null default now(),
  expires_at    timestamptz,
  license_class text not null
                check (license_class in ('public_domain', 'company_filing', 'guardian_noncomm', 'link_out', 'iex_hist')),
  use_level     text not null default 'full_summarize'
                check (use_level in ('full_summarize', 'facts_summarize', 'headline_link_only', 'data_only')),
  tickers       jsonb not null default '[]' check (jsonb_typeof(tickers) = 'array'),
  event_type    text,
  status        text not null default 'new'
                check (status in ('new', 'published', 'skipped', 'failed')),
  status_note   text,
  blurb_id      uuid
);
-- license_class never accepts 'dev_only': dev-only providers are not allowed here.

-- ---------- core.categories --------------------------------------------------
create table if not exists core.categories (
  slug       text primary key,
  name       text not null,
  sort_order int  not null
);

-- ---------- core.blurbs: the cards -------------------------------------------
create table if not exists core.blurbs (
  id             uuid primary key default gen_random_uuid(),
  dedupe_key     text not null unique,               -- item URL for filings, '<series>:<date>' for data cards
  kind           text not null check (kind in ('summary', 'data', 'link_out')),
  headline       text not null check (char_length(headline) between 1 and 200),
  body           text,
  category       text not null references core.categories (slug),
  event_type     text,
  status         text not null default 'published' check (status in ('published', 'hidden')),
  ai_generated   boolean not null default false,
  ai_label       text,
  attribution    text,
  delayed_hours  int,
  tickers        jsonb not null default '[]'          -- [{symbol, name, exchange}], max 5 (no tickers table in the hackathon cut)
                 check (jsonb_typeof(tickers) = 'array' and jsonb_array_length(tickers) <= 5),
  macro          jsonb not null default '[]'          -- MacroFact[], max 3, for kind 'data'
                 check (jsonb_typeof(macro) = 'array' and jsonb_array_length(macro) <= 3),
  as_of          timestamptz not null,
  published_at   timestamptz not null default now(),
  sort_at        timestamptz not null,
  updated_at     timestamptz,
  revision       int not null default 1,
  model          text,
  prompt_version text,
  -- ranking columns (section B explains them)
  source_count   int           not null default 1,
  importance     numeric(8,3)  not null default 2,
  rank_score     numeric(16,6) not null default round((extract(epoch from now()) / 3600)::numeric, 6),
  constraint blurbs_headline_len check (kind = 'link_out' or char_length(headline) <= 90),
  constraint blurbs_ai_label     check (ai_generated or ai_label is null)
);

create index if not exists blurbs_tickers_gin on core.blurbs using gin (tickers jsonb_path_ops);

-- ---------- core.blurb_sources: links on each card (>= 1, enforced in publish_blurb)
create table if not exists core.blurb_sources (
  id            bigint generated always as identity primary key,
  blurb_id      uuid not null references core.blurbs (id) on delete cascade,
  item_id       uuid references ingest.items (id) on delete set null,
  name          text not null,
  kind          text not null check (kind in ('filing', 'government', 'news')),
  doc_label     text,
  url           text not null check (url like 'https://%'),
  published_at  timestamptz,
  license_class text not null
                check (license_class in ('public_domain', 'company_filing', 'guardian_noncomm', 'link_out', 'iex_hist')),
  attribution   text,
  is_primary    boolean not null default false,
  position      int not null default 0
);
create index if not exists blurb_sources_blurb_idx on core.blurb_sources (blurb_id);

-- ---------- macro numbers ----------------------------------------------------
create table if not exists core.macro_series (
  series_id    text primary key,
  label        text not null,
  provider     text not null check (provider in ('fred', 'treasury')),
  source_name  text not null,                         -- full citation naming the original agency
  source_short text not null check (source_short <> 'FRED'),  -- never bare "FRED"
  source_url   text not null check (source_url like 'https://%'),
  unit         text not null,                         -- 'percent', 'usd_per_barrel', 'percent_yoy'
  frequency    text not null,                         -- 'daily', 'monthly'
  sort_order   int  not null,
  enabled      boolean not null default true
);

create table if not exists core.macro_observations (
  series_id     text not null references core.macro_series (series_id),
  obs_date      date not null,
  value         numeric not null,                     -- raw value used for display (CPI: year-over-year %)
  display_value text not null,                        -- "4.02%", "$61.40" (formatted by the ingest script)
  change_text   text,                                 -- "+0.06 pts"
  direction     text check (direction in ('up', 'down', 'flat')),
  period_label  text,                                 -- "Sep 2026" for monthly series
  fetched_at    timestamptz not null default now(),
  primary key (series_id, obs_date)
);

-- ---------- core.app_config: exactly one row ---------------------------------
create table if not exists core.app_config (
  id                        boolean primary key default true check (id),
  disclaimer                text    not null,
  ai_notice                 text    not null,
  required_notices          jsonb   not null default '[]' check (jsonb_typeof(required_notices) = 'array'),
  min_supported_app_version text    not null default '1.0.0',
  quotes_enabled            boolean not null default false,
  linkout_cards             boolean not null default false
);

-- ---------- RLS on every table, no policies = closed to anon/authenticated ----
alter table ingest.items             enable row level security;
alter table core.categories          enable row level security;
alter table core.blurbs              enable row level security;
alter table core.blurb_sources       enable row level security;
alter table core.macro_series        enable row level security;
alter table core.macro_observations  enable row level security;
alter table core.app_config          enable row level security;

revoke all on all tables    in schema ingest from public, anon, authenticated;
revoke all on all tables    in schema core   from public, anon, authenticated;
revoke all on all sequences in schema core   from public, anon, authenticated;


-- =============================================================================
-- B. RANKING  (importance x recency; see the ranking design notes)
--
--   importance = event_weight x authority(best source kind) x (1 + k ln(min(sources, cap)))
--   rank_score = hours_since_epoch(sort_at) + H log2(importance)
-- Sorting by rank_score desc == sorting by importance x 0.5^(age/H) desc, at any moment.
-- Doubling importance is worth one half-life (H = 8 hours) of head start.
-- To retune: update core.rank_params / core.rank_event_weights, then
--   select core.refresh_all_ranks();
-- =============================================================================

create table if not exists core.rank_params (
  key   text primary key,
  value numeric not null
);

create table if not exists core.rank_event_weights (
  event_type text primary key,
  weight     numeric not null check (weight > 0)
);

alter table core.rank_params        enable row level security;  -- no policies: private
alter table core.rank_event_weights enable row level security;
revoke all on core.rank_params, core.rank_event_weights from public, anon, authenticated;

-- Compute importance + rank_score for one card. Called by api.publish_blurb.
create or replace function core.refresh_rank(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  h numeric; k numeric; cap numeric;
  a_gov numeric; a_fil numeric; a_news numeric;
  v_kind text; et text; t timestamptz;
  n int; w numeric; auth numeric; imp numeric;
begin
  select value into h      from core.rank_params where key = 'half_life_hours';
  select value into k      from core.rank_params where key = 'coverage_k';
  select value into cap    from core.rank_params where key = 'coverage_cap';
  select value into a_gov  from core.rank_params where key = 'auth_government';
  select value into a_fil  from core.rank_params where key = 'auth_filing';
  select value into a_news from core.rank_params where key = 'auth_news';

  select b.kind, b.event_type, b.sort_at into v_kind, et, t from core.blurbs b where b.id = p_id;
  if not found then return; end if;

  -- data cards always rank as macro releases
  if v_kind = 'data' then et := 'macro_release'; end if;

  -- coverage: distinct outlets, at least 1
  select greatest(count(distinct s.name), 1) into n
    from core.blurb_sources s where s.blurb_id = p_id;

  -- authority: best source kind on the card (filing if no sources yet)
  select coalesce(max(case s.kind when 'government' then a_gov
                                  when 'filing'     then a_fil
                                  else a_news end), a_fil)
    into auth from core.blurb_sources s where s.blurb_id = p_id;

  -- event weight, falling back to the 'default' row
  select weight into w from core.rank_event_weights where event_type = et;
  if w is null then
    select weight into w from core.rank_event_weights where event_type = 'default';
  end if;

  imp := w * auth * (1 + k * ln(least(n::numeric, cap)));

  update core.blurbs
     set source_count = n,
         importance   = round(imp, 3),
         rank_score   = round(extract(epoch from t)::numeric / 3600 + h * log(2::numeric, imp), 6)
   where id = p_id;
end;
$$;

-- Recompute every card after changing a ranking setting (fine below ~10k cards).
-- plpgsql loop on purpose: a SQL-language function would stop after the first row.
create or replace function core.refresh_all_ranks()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare r record;
begin
  for r in select id from core.blurbs loop
    perform core.refresh_rank(r.id);
  end loop;
end;
$$;

revoke execute on function core.refresh_rank(uuid)   from public, anon, authenticated;
revoke execute on function core.refresh_all_ranks()  from public, anon, authenticated;
grant  execute on function core.refresh_rank(uuid)   to service_role;
grant  execute on function core.refresh_all_ranks()  to service_role;

-- Partial indexes: only published cards are ever read.
create index if not exists blurbs_rank_idx
  on core.blurbs (rank_score desc, id desc) where status = 'published';
create index if not exists blurbs_rank_cat_idx
  on core.blurbs (category, rank_score desc, id desc) where status = 'published';
create index if not exists blurbs_latest_idx
  on core.blurbs (sort_at desc, id desc) where status = 'published';
create index if not exists blurbs_latest_cat_idx
  on core.blurbs (category, sort_at desc, id desc) where status = 'published';


-- =============================================================================
-- C. API (the only exposed schema)
--   Guests (anon key):  api.feed, api.numbers_to_know, api.app_config, api.categories
--   service_role only:  api.upsert_item, api.set_item_status, api.publish_blurb, api.upsert_macro
-- Views are owned by the migration role and read core on its behalf, so anon
-- needs no access to core itself.
-- =============================================================================

-- ---------- api.feed ---------------------------------------------------------
-- p_mode    'top' (ranked, default) | 'latest' (newest first)
-- p_cursor  opaque '<key>|<uuid>' from next_cursor; null = first page
-- p_limit   default 20, clamped to 10..30
-- returns   { "items": BlurbCard[], "next_cursor": text | null }
create or replace function api.feed(
  p_mode     text default 'top',
  p_cursor   text default null,
  p_limit    int  default 20,
  p_category text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_mode     text := coalesce(p_mode, 'top');
  v_limit    int  := least(greatest(coalesce(p_limit, 20), 10), 30);
  v_rank_key numeric;
  v_time_key timestamptz;
  v_id       uuid;
  v_ids      uuid[];
  v_keys     text[];
  v_next     text;
  v_items    jsonb;
begin
  if v_mode not in ('top', 'latest') then
    raise exception 'invalid_mode' using errcode = 'PT422';
  end if;

  -- no cursor = start above everything (keeps the range test index-friendly)
  if p_cursor is null then
    v_rank_key := 1e12;
    v_time_key := 'infinity';
    v_id       := 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  else
    begin
      v_id := split_part(p_cursor, '|', 2)::uuid;
      if v_mode = 'top' then v_rank_key := split_part(p_cursor, '|', 1)::numeric;
      else                   v_time_key := split_part(p_cursor, '|', 1)::timestamptz;
      end if;
    exception when others then
      raise exception 'invalid_cursor' using errcode = 'PT422';
    end;
  end if;

  -- step 1: ids of this page, plus one extra row to know if a next page exists
  if v_mode = 'top' then
    select array_agg(s.id order by s.rank_score desc, s.id desc),
           array_agg(s.rank_score::text order by s.rank_score desc, s.id desc)
      into v_ids, v_keys
      from (
        select b.id, b.rank_score
          from core.blurbs b
         where b.status = 'published'
           and (p_category is null or b.category = p_category)
           and (b.rank_score, b.id) < (v_rank_key, v_id)
         order by b.rank_score desc, b.id desc
         limit v_limit + 1
      ) s;
  else
    select array_agg(s.id order by s.sort_at desc, s.id desc),
           array_agg(to_char(s.sort_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
                     order by s.sort_at desc, s.id desc)
      into v_ids, v_keys
      from (
        select b.id, b.sort_at
          from core.blurbs b
         where b.status = 'published'
           and (p_category is null or b.category = p_category)
           and (b.sort_at, b.id) < (v_time_key, v_id)
         order by b.sort_at desc, b.id desc
         limit v_limit + 1
      ) s;
  end if;

  v_ids := coalesce(v_ids, '{}');
  if cardinality(v_ids) > v_limit then
    v_next := v_keys[v_limit] || '|' || v_ids[v_limit];   -- cursor = last row returned
    v_ids  := v_ids[1:v_limit];
  end if;

  -- step 2: card JSON in the same order (shape = BlurbCard in the contract)
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', b.id, 'kind', b.kind, 'headline', b.headline, 'body', b.body,
      'category', b.category, 'event_type', b.event_type,
      'tickers', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'symbol', t.value ->> 'symbol',
                   'name', t.value ->> 'name',
                   'exchange', t.value -> 'exchange',
                   'quote', null)                       -- prices are never shown
                 order by t.ordinality)
            from jsonb_array_elements(b.tickers) with ordinality as t(value, ordinality)), '[]'::jsonb),
      'macro', b.macro,
      'sources', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'name', s.name, 'kind', s.kind, 'doc_label', s.doc_label, 'url', s.url,
                   'published_at', s.published_at, 'license_class', s.license_class,
                   'attribution', s.attribution, 'is_primary', s.is_primary)
                 order by s.is_primary desc, s.position, s.id)
            from core.blurb_sources s where s.blurb_id = b.id), '[]'::jsonb),
      'source_count', b.source_count,
      'as_of', b.as_of, 'published_at', b.published_at, 'sort_at', b.sort_at,
      'updated_at', b.updated_at, 'revision', b.revision,
      'freshness', jsonb_build_object('delayed_hours', b.delayed_hours),
      'ai', jsonb_build_object('generated', b.ai_generated, 'label', b.ai_label),
      'attribution', b.attribution,
      'image', null,
      'is_saved', false,
      'share_path', '/b/' || b.id,
      'importance', b.importance
    ) order by u.ord), '[]'::jsonb)
  into v_items
  from unnest(v_ids) with ordinality as u(id, ord)
  join core.blurbs b on b.id = u.id;

  return jsonb_build_object('items', v_items, 'next_cursor', v_next);
end;
$$;

revoke execute on function api.feed(text, text, int, text) from public;
grant  execute on function api.feed(text, text, int, text) to anon, authenticated, service_role;

-- ---------- api.numbers_to_know: latest value per enabled series -------------
create or replace view api.numbers_to_know as
select s.series_id,
       s.label,
       o.display_value     as value,
       o.change_text       as change,
       o.direction,
       o.period_label      as period,
       o.obs_date::text    as as_of,
       s.source_name,
       s.source_short,
       s.source_url,
       s.sort_order
  from core.macro_series s
  join lateral (
        select * from core.macro_observations mo
         where mo.series_id = s.series_id
         order by mo.obs_date desc
         limit 1
       ) o on true
 where s.enabled
 order by s.sort_order;

-- ---------- api.app_config ---------------------------------------------------
create or replace view api.app_config as
select disclaimer, ai_notice, required_notices, min_supported_app_version,
       quotes_enabled, linkout_cards
  from core.app_config;

-- ---------- api.categories ---------------------------------------------------
create or replace view api.categories as
select slug, name, sort_order from core.categories order by sort_order;

revoke all on api.numbers_to_know, api.app_config, api.categories from public;
grant select on api.numbers_to_know, api.app_config, api.categories to anon, authenticated, service_role;

-- ---------- service-role RPCs (the ingest script, secret key only) ----------

-- Insert a collected item, or touch it if the URL was seen before.
-- p: {source, external_id, url, title, body_text, published_at, expires_at,
--     license_class, use_level, tickers, event_type}
-- returns {id, is_new, status}: the script skips items whose status is not 'new'.
create or replace function api.upsert_item(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid; v_new boolean; v_status text;
begin
  insert into ingest.items (source, external_id, url, title, body_text, published_at, expires_at,
                            license_class, use_level, tickers, event_type)
  values (p ->> 'source', p ->> 'external_id', p ->> 'url', p ->> 'title', p ->> 'body_text',
          (p ->> 'published_at')::timestamptz, (p ->> 'expires_at')::timestamptz,
          p ->> 'license_class', coalesce(p ->> 'use_level', 'full_summarize'),
          coalesce(p -> 'tickers', '[]'::jsonb), p ->> 'event_type')
  on conflict (url) do update set fetched_at = now()
  returning id, (xmax = 0), status into v_id, v_new, v_status;
  return jsonb_build_object('id', v_id, 'is_new', v_new, 'status', v_status);
end;
$$;

-- Mark an item skipped/failed (with a short reason) so it is not retried.
create or replace function api.set_item_status(p_id uuid, p_status text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update ingest.items set status = p_status, status_note = left(p_note, 500) where id = p_id;
end;
$$;

-- Publish one card with its sources, then rank it.
-- p: {dedupe_key, item_id?, kind, headline, body, category, event_type, ai_generated,
--     tickers[{symbol,name,exchange}], macro[MacroFact], as_of, sort_at,
--     model?, prompt_version?, attribution?,
--     sources[{name,kind,doc_label,url,published_at,license_class,attribution,is_primary}]}
-- returns {status: 'published'|'duplicate'|'ticker_cap', id}
-- Refuses: zero or more than 8 sources, link_out while linkout_cards is off, unknown
-- license classes (incl. dev_only, via CHECK), a 4th card per ticker within 24 h.
create or replace function api.publish_blurb(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id       uuid;
  v_cfg      core.app_config%rowtype;
  v_cap      numeric;
  v_sort     timestamptz := (p ->> 'sort_at')::timestamptz;
  v_ai       boolean := coalesce((p ->> 'ai_generated')::boolean, false);
  v_nsrc     int := coalesce(jsonb_array_length(p -> 'sources'), 0);
  v_tickers  jsonb := coalesce(p -> 'tickers', '[]'::jsonb);
  v_sym      text;
  v_count    int;
  s          jsonb;
  i          int := 0;
begin
  select * into v_cfg from core.app_config where id;
  if not found then raise exception 'app_config row missing'; end if;

  if v_nsrc < 1 then raise exception 'publish_blurb: card needs at least one source'; end if;
  if v_nsrc > 8 then raise exception 'publish_blurb: at most 8 sources'; end if;
  if p ->> 'kind' = 'link_out' and not v_cfg.linkout_cards then
    raise exception 'publish_blurb: link_out cards are disabled';
  end if;

  -- duplicate (same filing / same data point): return the existing card
  select id into v_id from core.blurbs where dedupe_key = p ->> 'dedupe_key';
  if found then
    return jsonb_build_object('status', 'duplicate', 'id', v_id);
  end if;

  -- per-ticker cap: at most N cards per ticker within 24 h of this card's time
  select value into v_cap from core.rank_params where key = 'ticker_cap_24h';
  for v_sym in select t ->> 'symbol' from jsonb_array_elements(v_tickers) t loop
    select count(*) into v_count
      from core.blurbs b
     where b.tickers @> jsonb_build_array(jsonb_build_object('symbol', v_sym))
       and b.sort_at > v_sort - interval '24 hours'
       and b.sort_at < v_sort + interval '24 hours';
    if v_count >= coalesce(v_cap, 3) then
      return jsonb_build_object('status', 'ticker_cap', 'id', null, 'symbol', v_sym);
    end if;
  end loop;

  insert into core.blurbs (dedupe_key, kind, headline, body, category, event_type,
                           ai_generated, ai_label, attribution, tickers, macro,
                           as_of, sort_at, model, prompt_version)
  values (p ->> 'dedupe_key', p ->> 'kind', p ->> 'headline', p ->> 'body',
          p ->> 'category', p ->> 'event_type',
          v_ai, case when v_ai then v_cfg.ai_notice else null end,   -- label comes from app_config only
          p ->> 'attribution',
          (select coalesce(jsonb_agg(jsonb_build_object('symbol', t ->> 'symbol',
                                                        'name', t ->> 'name',
                                                        'exchange', t -> 'exchange')), '[]'::jsonb)
             from jsonb_array_elements(v_tickers) t),
          coalesce(p -> 'macro', '[]'::jsonb),
          coalesce((p ->> 'as_of')::timestamptz, v_sort), v_sort,
          p ->> 'model', p ->> 'prompt_version')
  returning id into v_id;

  for s in select value from jsonb_array_elements(p -> 'sources') loop
    insert into core.blurb_sources (blurb_id, item_id, name, kind, doc_label, url, published_at,
                                    license_class, attribution, is_primary, position)
    values (v_id, nullif(p ->> 'item_id', '')::uuid, s ->> 'name', s ->> 'kind', s ->> 'doc_label',
            s ->> 'url', (s ->> 'published_at')::timestamptz, s ->> 'license_class',
            s ->> 'attribution', coalesce((s ->> 'is_primary')::boolean, i = 0), i);
    i := i + 1;
  end loop;

  if p ? 'item_id' and nullif(p ->> 'item_id', '') is not null then
    update ingest.items set status = 'published', blurb_id = v_id where id = (p ->> 'item_id')::uuid;
  end if;

  perform core.refresh_rank(v_id);
  return jsonb_build_object('status', 'published', 'id', v_id);
end;
$$;

-- Store one macro observation (formatted by the ingest script).
-- p: {series_id, obs_date, value, display_value, change_text, direction, period_label}
create or replace function api.upsert_macro(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from core.macro_series where series_id = p ->> 'series_id' and enabled) then
    raise exception 'upsert_macro: unknown or disabled series %', p ->> 'series_id';
  end if;
  insert into core.macro_observations (series_id, obs_date, value, display_value, change_text, direction, period_label)
  values (p ->> 'series_id', (p ->> 'obs_date')::date, (p ->> 'value')::numeric, p ->> 'display_value',
          p ->> 'change_text', p ->> 'direction', p ->> 'period_label')
  on conflict (series_id, obs_date) do update
     set value = excluded.value, display_value = excluded.display_value,
         change_text = excluded.change_text, direction = excluded.direction,
         period_label = excluded.period_label, fetched_at = now();
end;
$$;

-- Supabase grants EXECUTE to anon/authenticated by default: take it away explicitly.
revoke execute on function api.upsert_item(jsonb)                from public, anon, authenticated;
revoke execute on function api.set_item_status(uuid, text, text) from public, anon, authenticated;
revoke execute on function api.publish_blurb(jsonb)              from public, anon, authenticated;
revoke execute on function api.upsert_macro(jsonb)               from public, anon, authenticated;
grant  execute on function api.upsert_item(jsonb)                to service_role;
grant  execute on function api.set_item_status(uuid, text, text) to service_role;
grant  execute on function api.publish_blurb(jsonb)              to service_role;
grant  execute on function api.upsert_macro(jsonb)               to service_role;


-- =============================================================================
-- D. SEED DATA (re-runnable; existing rows are left alone)
-- =============================================================================

insert into core.categories (slug, name, sort_order) values
  ('markets',          'Markets',           1),
  ('earnings',         'Earnings',          2),
  ('economy',          'Economy',           3),
  ('policy',           'Policy',            4),
  ('tech',             'Tech',              5),
  ('deals',            'Deals',             6),
  ('energy',           'Energy',            7),
  ('insider',          'Insider trades',    8),
  ('personal-finance', 'Personal finance',  9)
on conflict (slug) do nothing;

insert into core.rank_params (key, value) values
  ('half_life_hours', 8),
  ('coverage_k',      0.25),
  ('coverage_cap',    20),
  ('auth_government', 1.25),
  ('auth_filing',     1.0),
  ('auth_news',       0.8),
  ('ticker_cap_24h',  3)      -- not a score input: max cards per ticker within 24 h (publish_blurb)
on conflict (key) do nothing;

insert into core.rank_event_weights (event_type, weight) values
  ('fed', 8), ('macro_release', 8), ('earnings', 5), ('deal', 4),
  ('exec_change', 3), ('insider', 2), ('default', 2)
on conflict (event_type) do nothing;

-- Citation strings name the original agency (checked on each FRED series page, 2026-10-17).
insert into core.macro_series (series_id, label, provider, source_name, source_short, source_url, unit, frequency, sort_order) values
  ('DGS2',       '2-yr Treasury',          'fred', 'Board of Governors of the Federal Reserve System (US) via FRED', 'Federal Reserve via FRED', 'https://fred.stlouisfed.org/series/DGS2',       'percent',        'daily',   1),
  ('DGS10',      '10-yr Treasury',         'fred', 'Board of Governors of the Federal Reserve System (US) via FRED', 'Federal Reserve via FRED', 'https://fred.stlouisfed.org/series/DGS10',      'percent',        'daily',   2),
  ('DFF',        'Fed funds rate',         'fred', 'Board of Governors of the Federal Reserve System (US) via FRED', 'Federal Reserve via FRED', 'https://fred.stlouisfed.org/series/DFF',        'percent',        'daily',   3),
  ('CPIAUCSL',   'CPI inflation (yearly)', 'fred', 'U.S. Bureau of Labor Statistics via FRED',                  'BLS via FRED',             'https://fred.stlouisfed.org/series/CPIAUCSL',   'percent_yoy',    'monthly', 4),
  ('UNRATE',     'Unemployment rate',      'fred', 'U.S. Bureau of Labor Statistics via FRED',                  'BLS via FRED',             'https://fred.stlouisfed.org/series/UNRATE',     'percent',        'monthly', 5),
  ('DCOILWTICO', 'WTI crude oil',          'fred', 'U.S. Energy Information Administration via FRED',           'EIA via FRED',             'https://fred.stlouisfed.org/series/DCOILWTICO', 'usd_per_barrel', 'daily',   6)
on conflict (series_id) do nothing;

-- FRED notice wording verified against the FRED API terms (2026-10-17).
insert into core.app_config (id, disclaimer, ai_notice, required_notices, min_supported_app_version, quotes_enabled, linkout_cards)
values (
  true,
  'Informational only · Not investment advice',
  'AI-generated summary · may contain errors',
  jsonb_build_array(jsonb_build_object(
    'key', 'fred',
    'text', 'This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.',
    'url', 'https://fred.stlouisfed.org/',
    'placements', jsonb_build_array('numbers_panel', 'data_card', 'share', 'about'))),
  '1.0.0',
  false,
  false
)
on conflict (id) do nothing;
