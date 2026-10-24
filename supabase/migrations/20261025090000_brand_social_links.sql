-- Onboarding finds a brand's social accounts from its name: one profile link per platform,
-- e.g. {"instagram": "https://www.instagram.com/brand/", "tiktok": "https://www.tiktok.com/@brand"}.
-- instagram_handle stays as the Instagram connector's input.
alter table brands add column if not exists social_links jsonb not null default '{}'::jsonb;
