# Grading rubric (C6)

Owner: Blair (Workstream C). Written 2026-10-24. Score every demo output in [`scores.csv`](scores.csv) before the presentation; file anything below 3 as a GitHub issue for its owner (profiles and digests → Yishan; rendering, links and speed → Yizhi).

## Scale

| Score | Meaning |
|---|---|
| 4 | Excellent: a trend director would sign off as is |
| 3 | Good: usable, minor polish only |
| 2 | Fair: right idea, needs a fix before the demo |
| 1 | Poor: wrong, invented or unusable |

**Pass bar:** every criterion scores 3 or more (build plan C6: every demo output rated at least "good").

## Automatic fails

Any one of these scores the whole output 1, whatever else it gets right:

- An invented product, image, price or color name (PRD FR-3, FR-4)
- A chart or digest item with no source, or a source link that doesn't open
- Data collected from a site our rules exclude (Zara, SHEIN, F-Trend, Première Vision pages, any `public_product_list = no` store)
- One brand's licensed data shown to another brand (FR-8)

## Brand profiles (A2)

| Criterion | What a 3 looks like |
|---|---|
| `accurate` | Style tags, price range, categories and colors match the brand as a founder would describe it |
| `vocab` | Every tag, category and color id comes from data/curation |
| `summary` | The one-paragraph summary sounds like the brand, with nothing invented |
| `no_edits` | The founder would save it without major edits |

## Digests (A6)

| Criterion | What a 3 looks like |
|---|---|
| `on_trend` | Each trend element is backed by evidence: a house cross-check weight of 1.5 or more, a Lyst or search signal, or a runway row |
| `fits_brand` | Each element suits the brand's style and price tier; the 'fits your brand because' line is specific |
| `real_examples` | 3–5 real products per element, links open, prices in the brand's range, no invented items |
| `color_names` | Colors are named only from colors.json |
| `timing` | Right moment for this brand: a trend already at Zara is not sold as 'early' to a mass-market brand, and a luxury-only trend is not pushed on a price-sensitive brand yet |
| `founder_use` | A founder would forward it to their design team |

## Dashboards (A5)

| Criterion | What a 3 looks like |
|---|---|
| `answers` | Answers the question asked, in the first sentence of the summary |
| `matches_key` | Agrees with the 'good answer' in demo-set.md, or explains why not |
| `evidence` | Every widget shows source and date range, and clicking a chart opens the real records behind it |
| `chart_fit` | Chart types suit the question (e.g. trend line for 'still rising?') |
| `speed` | Rehearsed questions load in under 2 seconds; live ones in under 30 |
| `founder_use` | A founder would act on it |

## Fashion checks to apply while scoring

- **House weighting.** Digest and dashboard rankings should favor signals with a higher `weight` in `brand-weights.json`: Prada confirmed by Chanel, Miu Miu or Saint Laurent; Saint Laurent on jackets and outerwear; Chanel and Miu Miu on bags. A 1.0 signal outranking a 2.5 one needs a reason.
- **Trickle-down timing.** Check `trickle-down.csv`. For Massimo Dutti and Damson Madder, trends already at Zara are table stakes, not news. For Miu Miu and Prada, Zara adoption is a reason to move on.
- **Reliability.** Evidence rows marked `vendor_figure`, `headline_only`, `listing_only` or `blair_observation` can support a point but shouldn't be its only evidence on screen.
- **Shape language.** Jackets, bottoms, shoes and bags should be described with ids from `attributes.json` (e.g. `cropped`, `knee-length`, `slim-flat-sneaker`, `flap-chain`), not free text.

## What to score

- 6 brand profiles and 6 digests (one per demo brand in `data/curation/demo-set.md`)
- 5 dashboards (the demo questions)
- `scores.csv` has one row per output and criterion, ready to fill in.
