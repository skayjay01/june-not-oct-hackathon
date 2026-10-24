# Database migrations (Workstream B)

SQL files in `migrations/` run in filename order. To apply them to the team's Supabase project
(`dwgpfheyfaovmclswwlg`), use the DB password from vault `june_hackathon/SUPABASE_DB_PASSWORD`:

```sh
# Connection string: Supabase dashboard → Connect → Session pooler (put the password in place of [YOUR-PASSWORD])
npx supabase@2.122.0 db push --db-url "<session pooler connection string>"
```

No CLI handy? Paste a migration file into Supabase → SQL Editor → Run.

Every table has row-level security on with no policies, so only server code using
`SUPABASE_SECRET_KEY` (`lib/db/server.ts`) can read or write. Licensed rows in `trend_items`
(`brand_id` set) must always be filtered by the requesting brand in server queries (FR-8).
New tables or column changes: add a new migration file and tell its readers (see `tasks/build-plan.md`).
