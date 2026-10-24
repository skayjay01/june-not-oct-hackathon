-- B1: initial schema for Ask-a-Trend (tasks/build-plan.md, "Shared contracts").
-- Every table has RLS on with no policies: only server code holding
-- SUPABASE_SECRET_KEY can read or write. The browser never talks to these tables.

create extension if not exists pgcrypto;

-- Brands that signed up (US-001)
create table brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website_url text not null,
  instagram_handle text,
  extra_urls text[] not null default '{}',
  email text,
  slack_webhook_url text,
  digest_channel text not null default 'email' check (digest_channel in ('email', 'slack', 'whatsapp')),
  digest_frequency text not null default 'weekly' check (digest_frequency in ('daily', 'weekly')),
  crawl_status text not null default 'pending' check (crawl_status in ('pending', 'running', 'done', 'failed')),
  created_at timestamptz not null default now()
);

-- Text the crawler saved from a brand's site and Instagram (US-002, FR-1: text only)
create table crawl_pages (
  id bigint generated always as identity primary key,
  brand_id uuid not null references brands (id) on delete cascade,
  url text not null,
  kind text not null check (kind in ('about', 'product', 'alt', 'ig_bio', 'ig_caption', 'other')),
  text text not null,
  fetched_at timestamptz not null default now(),
  unique (brand_id, url, kind)
);

-- AI-written, user-editable style profile (US-002, FR-2)
create table brand_profiles (
  brand_id uuid primary key references brands (id) on delete cascade,
  style_tags text[] not null default '{}',
  price_min numeric,
  price_max numeric,
  currency text not null default 'USD',
  categories text[] not null default '{}',
  colors text[] not null default '{}',        -- names from data/curation/colors.json (FR-4)
  summary text,
  edited_fields text[] not null default '{}', -- fields the user changed; a re-crawl must not overwrite them
  updated_at timestamptz not null default now()
);

-- Source connectors: on/off switch + terms record (FR-7, FR-9, PRD §7.3)
create table sources (
  key text primary key,                      -- e.g. 'shopify_products', 'google_trends'
  name text not null,
  enabled boolean not null default true,
  licensed boolean not null default false,   -- true = bring-your-own-licence source (FR-8)
  terms_url text,
  terms_notes text,                          -- what we reviewed and what we collect
  last_run_at timestamptz,
  last_error text
);

-- The trend library (US-003). brand_id null = public data; set = that brand's licensed data only (FR-8).
create table trend_items (
  id bigint generated always as identity primary key,
  source text not null references sources (key),
  source_item_id text not null,              -- stable id within the source, for idempotent upserts
  brand_id uuid references brands (id) on delete cascade,
  type text not null check (type in ('product', 'keyword', 'color', 'fabric', 'pattern')),
  title text,
  category text,
  attributes jsonb not null default '{}',    -- { colors, silhouette, material, pattern, style_tags }
  price numeric,
  currency text,
  image_url text,
  link text,
  metrics jsonb not null default '{}',       -- e.g. { search_interest, growth }
  published_at timestamptz,
  collected_at timestamptz not null default now(),
  -- Re-runs upsert instead of duplicating; nulls not distinct so public rows (brand_id null) dedupe too.
  -- supabase-js: .upsert(rows, { onConflict: 'source,source_item_id,brand_id' })
  unique nulls not distinct (source, source_item_id, brand_id)
);
create index trend_items_type_category on trend_items (type, category);
create index trend_items_brand on trend_items (brand_id) where brand_id is not null;
create index trend_items_attributes on trend_items using gin (attributes);

-- Ranking weights, totaling 100 (US-007, FR-15)
create table weights (
  brand_id uuid primary key references brands (id) on delete cascade,
  preset text,
  price_fit int not null,
  social_buzz int not null,
  growth_speed int not null,
  competitor_adoption int not null,
  style_fit int not null,
  updated_at timestamptz not null default now(),
  check (price_fit + social_buzz + growth_speed + competitor_adoption + style_fit = 100)
);

-- Digests built and sent (US-004)
create table digests (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands (id) on delete cascade,
  spec jsonb not null,                       -- DigestSpec
  channel text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- 👍/👎 per digest item (US-004, FR-6)
create table feedback (
  id bigint generated always as identity primary key,
  brand_id uuid not null references brands (id) on delete cascade,
  digest_id uuid not null references digests (id) on delete cascade,
  item_key text not null,                    -- which trend element / example in the digest
  vote smallint not null check (vote in (-1, 1)),
  created_at timestamptz not null default now(),
  unique (digest_id, item_key)               -- re-clicking changes the vote instead of adding rows
);

-- Finished dashboards: cache for repeat questions + pre-generated demo content (FR-19, US-006, US-010)
create table saved_answers (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands (id) on delete cascade,
  question text not null,
  question_hash text not null,               -- hash of (brand_id, normalized question)
  spec jsonb not null,                       -- DashboardSpec
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  unique (question_hash)
);

-- Per-step timing for every live request (FR-20)
create table latency_log (
  id bigint generated always as identity primary key,
  request_id uuid not null,
  step text not null check (step in ('interpret', 'match', 'assemble', 'design', 'crawl', 'profile', 'digest', 'send')),
  ms int not null,
  model text,
  created_at timestamptz not null default now()
);
create index latency_log_request on latency_log (request_id);

alter table brands enable row level security;
alter table crawl_pages enable row level security;
alter table brand_profiles enable row level security;
alter table sources enable row level security;
alter table trend_items enable row level security;
alter table weights enable row level security;
alter table digests enable row level security;
alter table feedback enable row level security;
alter table saved_answers enable row level security;
alter table latency_log enable row level security;

-- Connectors planned for the demo (PRD §7.2). Terms notes come from tasks/research-2026-10-24.md.
insert into sources (key, name, enabled, licensed, terms_url, terms_notes) values
  ('brand_site', 'Brand website + Instagram text', true, false, null, 'Public pages of the onboarding brand only; text only (FR-1); robots.txt respected'),
  ('shopify_products', 'Store public product lists', true, false, null, 'Public /products.json of stores in data/curation/stores.csv; per-store terms checked by Blair (C3); robots.txt respected'),
  ('google_trends', 'Google Trends', true, false, 'https://policies.google.com/terms', 'Official API invite-only; unofficial explore queries with caching + pre-pulled fallback file'),
  ('pinterest_trends', 'Pinterest Trends', false, false, 'https://policy.pinterest.com/en/developer-guidelines', 'Official v5 API only, after app approval; guidelines ban scraping and storing results'),
  ('announced_colors', 'Publicly announced colors (WGSN x Coloro, Pantone)', true, false, null, 'Entered by hand from press releases'),
  ('met_museum', 'Met Museum open access', false, false, 'https://www.metmuseum.org/policies/terms-and-conditions', 'Official API, CC0 records (P1)'),
  ('cooper_hewitt', 'Cooper Hewitt collection', false, false, 'https://www.cooperhewitt.org/open-source-at-cooper-hewitt/', 'Official API, CC0 records (P1)');
