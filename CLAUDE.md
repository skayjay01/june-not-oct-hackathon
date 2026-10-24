# June not Oct Hackathon

Hackathon project with two teammates, who have access to this project's resources only, never other company resources.

- **Yizhi** — yhuang@mba2028.hbs.edu, GitHub `coachbhuang`
- **Blair** — blzhang@mba2027.hbs.edu, GitHub `zhangjiayuanmun9-code`

## Stack

Build on Next.js (App Router) + TypeScript, hosted on Vercel, with Supabase for the database. Never introduce another host or database. Read Supabase settings only from the three env vars `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (browser-safe) and `SUPABASE_SECRET_KEY` (server only, never imported into client code). Never commit env files or keys. Setup steps for a new machine are in `README.md` under "Getting set up".

## Resources

- GitHub: private repo `skayjay01/june-not-oct-hackathon`; teammates are collaborators on this repo only.
- Supabase: own Free org `surlnraifarglsjltosg`, project ref `dwgpfheyfaovmclswwlg` (us-east-1); teammates are Administrators of this org only. DB password: vault `june_hackathon/SUPABASE_DB_PASSWORD`.
- Vercel: project `june-not-oct-hackathon` in the company Pro team, git-linked to the repo, with the three Supabase env vars set for all environments; live at `https://june-not-oct-hackathon.vercel.app`; preview links open without a Vercel login; teammates are never added to the Vercel team and build through GitHub (every push deploys; PRs get preview links).

Work split and folder ownership: `tasks/build-plan.md`. Stay inside your workstream's folders.
