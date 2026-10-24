# Demo script: Ask-a-Trend (~6 minutes)

A click-by-click run of the live demo, with what to say at each step and what to do if something stalls. Built on the [PRD](prd-ask-a-trend-dashboard.md), Blair's [demo set](../data/curation/demo-set.md) and Yishan's demo pre-generator (`lib/engine/demo-plan.ts`).

**Site:** https://june-not-oct-hackathon.vercel.app (open on a laptop; the pages also work at phone width)

## Before the demo (morning of)

| # | Check | Who |
|---|---|---|
| 1 | **Refresh the trend library:** open `/sources` → **Run now** (about 40 s). Store products should show ~1,900 items with today's date. | Yizhi |
| 2 | **Pre-generate demo answers:** run the demo pre-generator (`scripts/pregenerate-demo.ts`) so the 5 rehearsed questions load instantly ("Saved answer"). | Yishan |
| 3 | **Digest channel works:** either the email key (Resend) is set, or the demo brand's Settings has a Slack webhook into a channel on screen. Press **Send test digest now** once to confirm it arrives. | Yishan / Yizhi |
| 4 | **Google Trends CSVs** are in `data/snapshots/google-trends/` and `/sources` shows Google Trends items (needed for the butter-yellow trend line). | Blair |
| 5 | **Plain colors** (red, green, blue…) are in `colors.json` and the library has been re-run, so color charts aren't thin. | Blair |
| 6 | **Rehearse** steps 2–6 below end to end, twice, on the presentation laptop and network. After each rehearsal, delete the brand you signed up (brand **Settings → Delete brand**) so the live sign-up starts clean. | All |
| 7 | **Backup tabs open** (see "If something stalls"). | Presenter |

## The run

### 1. The problem (30 s, slides or talk)
> "A $10–100M trend-following brand has a founder and one or two people doing trend research. WGSN costs $10–35k a year. The enterprise chat tools only answer from their own data, and none of them learn *your* style or bring ideas to you."

### 2. Sign up a brand live (60–90 s), the lead feature
1. Home → **Add your brand**.
2. Name **Rouje**, website **rouje.com** (a Parisian-chic store from Blair's list that isn't one of the demo brands), email = the presenter's address. Click **Learn my brand**.
3. While the two steps tick ("Reading the words on your site" → "Writing your style profile"):
   > "We read the words on the site — About page, product names and descriptions, image alt text — not the pictures. That's cheap and it's enough."
4. The profile appears: summary, style tags, categories, colors, price range.
   > "The founder checks it. Anything they edit is kept forever, even when we re-read the site."
5. Change one style tag → **Save profile** → "Saved…".

*Founder in the room? Use their brand instead of Rouje (a Shopify site works best).*

### 3. The digest arrives (60 s), the habit
1. On the same page, under **Your trend digest**, click **Send test digest now**.
2. Show it landing (inbox or Slack), then click **View it** for the web version:
   > "Two to four trends picked for *this* brand, each with a one-line reason, why it fits them, and 3–5 real products on shelves now, with links. No AI-generated designs."
3. Click **👍 More like this** on one trend.
   > "Every 👍 and 👎 changes what they get next week. That's the moat: the profile gets better the more they use it."

### 4. Ask a question (90 s), the supporting feature
1. Home → in **Ask a trend question**, pick **Massimo Dutti** → click the example **Which prints should we add for fall?** (pre-generated: loads instantly).
   > "Plain-language question in, a dashboard built for that question out."
2. Click a bar in **Rising patterns** → the evidence panel opens:
   > "Every number traces back to real records you can open."
3. Type a follow-up in **Refine this**, e.g. *Only under $150*, → **Update**. Then **← Back to the previous dashboard**.
4. Optional second question for **Aimé Leon Dore**: *How big is the sports-merch moment, and should we do a team collab?*

### 5. Tune what matters (30 s)
1. Under the dashboard: **Adjust what matters** → switch preset to **Fashion house / editorial**.
2. Point at "Re-ranked in ~500 ms, no AI call" and the reordered bars:
   > "A mass-market brand and a fashion house care about different signals. Same data, different ranking, instantly."

### 6. Bring your own licence (20 s, optional)
Brand **Settings → Your paid trend sources**:
> "If they already pay for WGSN or Pantone, they upload their export. It joins their digest and dashboards, only they see it, and we never resell it."

### 7. Close (30 s)
> "Self-serve at $99–$499 a month, against $10–35k for the enterprise tools. It lives in the founder's inbox and Slack, learns their style, and blends free sources with the ones they already pay for."

Ask for the room: *Who would read this weekly? Who would pay?* (PRD success metric.)

## If something stalls

| Symptom | Do this |
|---|---|
| Sign-up spins past ~2 min, or says it couldn't finish | Switch to the pre-made **Damson Madder** brand page (Home → Brands) and continue from step 2.4 with its profile. |
| Digest doesn't arrive by email/Slack | Click **View it** (the web version always works) and carry on. The status line says which key is missing. |
| A question takes long or errors | Use one of the 5 example questions on its rehearsed brand: they're pre-generated and load instantly. |
| Charts look thin | Pick a question about prints or patterns (best data coverage); avoid color-only questions until Blair's plain colors are in. |
| Site down or network fails | Screenshots or a screen recording of a full rehearsal (record one at check #6). |

## Known limits (be honest if asked)
- Store data comes from ~28 independent Shopify stores' public product lists; big fast-fashion players (SHEIN, Zara, Cider) forbid automated collection, so they're references only.
- Google Trends is imported from hand-downloaded charts, because Google blocks automated access. The official API is invite-only.
- Prices are in each store's currency.
- WhatsApp is demo-only (Meta test number, up to 5 recipients).
