-- Bring-your-own-licence sources a brand connects with its own API key (FR-8), e.g. Perplexity.
-- The key is stored encrypted by the server (lib/sources/secret-box.ts); rows it pulls go into
-- trend_items with this brand_id, so only this brand sees them. Disconnecting deletes both.
create table source_connections (
  brand_id uuid not null references brands (id) on delete cascade,
  source_key text not null,
  secret_enc text not null,
  key_hint text,                             -- last 4 characters, to show which key is connected
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_error text,
  primary key (brand_id, source_key)
);

alter table source_connections enable row level security;
