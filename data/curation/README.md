# Workstream C — curation and evaluation (hand-off, 24 Oct 2026)

Owner: Blair. Everything here is data the engine and crawler read; nothing in this folder is code.

## What's done

| Task | Files | Status |
|---|---|---|
| C1 vocabulary | `style-tags.json`, `categories.json`, `attributes.json` | Done. 40 style tags; attributes include `shoe_shapes` and `bag_shapes` |
| C2 colors | `colors.json` | Done. 78 colors, each with a short `code` (e.g. `PU-05`) |
| C3 sources | `stores.csv`, `keywords.csv`, `source-notes.md` | Done. 29 crawlable stores, 36 keywords. Store terms **not reviewed** yet |
| C4 demo set | `demo-set.md` | Done. 7 brands after COS was added at 12:10; `lib/engine/demo-plan.ts` has the first 6 and needs COS |
| C5 presets | `presets.json` | Done. 3 presets, each totaling 100 |
| C6 evaluation | `../../evals/rubric.md`, `../../evals/scores.csv` | Rubric done. **Scoring not done**: no demo outputs existed at 12:15 |
| Extra | `editorial-signals.csv`, `brand-weights.json`, `trickle-down.csv` | Done. 145 signals; house weighting v0.3 plus follower brands (COS, Massimo Dutti, Zara); 17 trickle-down rows |

## What each extra file is for

- **`editorial-signals.csv`** — runway, Lyst Index and trend-data facts, one per row, each with source link, date read and a reliability flag (`read`, `vendor_figure`, `headline_only`, `listing_only`, `blair_observation`). The evidence behind the demo answers.
- **`brand-weights.json`** — how much a house's signal counts, by category. Prada leads color, fabric and design; Saint Laurent co-leads jackets and outerwear; Chanel and Miu Miu lead bags. Each cross-check row has a computed `weight` (1.0–3.0) to multiply a trend's score by.
- **`trickle-down.csv`** — trends moving from luxury to mid-market to mass, with Blair's hand check of Zara on 24 Oct. Zara itself is never crawled.

## Needed from others

- **Yishan (engine):** add COS to `DEMO_BRANDS` in `lib/engine/demo-plan.ts` as a reference brand (preset `price-sensitive`, tags `minimalist`, `quiet-luxury`, `tailored`, tier mid-premium).
- **Yishan (engine):** nothing in `lib/` reads `editorial-signals.csv`, `brand-weights.json` or `trickle-down.csv` yet. For the demo rankings to reflect the house weighting, the matcher needs to load them (multiply by `results[].weight`). Ask Blair if another shape is easier.
- **Yizhi (data):** crawl only `stores.csv` rows with `public_product_list = yes`; recheck Cuyana. The migration comments say `colors` stores color *names*, but the contracts use color *ids* (e.g. `cloud-dancer`); worth aligning.
- **Whoever runs the demo pre-generator:** tell Blair when outputs exist so they can be scored.

## Still open for Blair (after 1 pm)

- Score every demo output in `evals/scores.csv`; file anything under 3 as an issue.
- Review each crawlable store's terms of use (`stores.csv` → `terms_reviewed`).
- Find a published source for Saint Laurent's stand-up collar bomber and suede jackets (currently Blair's observation).

## Reliability

vogue.com blocked our research tools, so Vogue is not a cited source. Lyst figures come from press coverage of the Index. Runway details come from one press review per show. Weight multipliers are Claude's proposal for Blair's direction and can be changed in `brand-weights.json`.
