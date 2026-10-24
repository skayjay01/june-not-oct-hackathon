# Demo set (C4)

Owner: Blair (Workstream C). Decided 2026-10-24. Yishan and Yizhi build to this.

Evidence for every question lives in [`editorial-signals.csv`](editorial-signals.csv), each row with its source link. Colors use codes from [`colors.json`](colors.json); style tags come from [`style-tags.json`](style-tags.json).

## Demo brands (6)

Two groups, because the big houses can't be crawled the same way.

**Crawlable** — public product list checked 2026-10-24. Profile from the brand's own site text; examples from its product list.

| Brand | Site | Style tags | Price tier | Weight preset |
|---|---|---|---|---|
| Aimé Leon Dore | aimeleondore.com | preppy, streetwear, old-money | premium | Niche streetwear |
| Damson Madder | damsonmadder.com | romantic, dopamine, maximalist | contemporary (dress ~£85) | Price-sensitive / mass market |
| Paloma Wool | palomawool.com | avant-garde, sustainable, minimalist | contemporary (~130) | Fashion house / editorial |

**Reference** — large houses with no public product list we can use (*not checked; assume no*). Profile text is pasted in by hand (allowed by PRD US-002 / §7.2); trend evidence comes from `editorial-signals.csv` (runway and Lyst rows).

| Brand | Style tags | Price tier | Weight preset | Key signal |
|---|---|---|---|---|
| Miu Miu | ugly-chic, preppy, ballet-core | luxury | Fashion house / editorial | Lyst #2 in Q2 2026, searches +30% |
| Prada | minimalist, avant-garde, tailored | luxury | Fashion house / editorial | Green on SS27 runway |
| Massimo Dutti | quiet-luxury, tailored, minimalist | mid-premium | Price-sensitive / mass market | Lyst biggest climber Q2 2026 (+8 places) |

Note: the PRD targets $10M–$100M brands. Miu Miu, Prada and Massimo Dutti are far larger; they are here as recognizable references for the pitch, not as target customers.

## Demo questions (5)

### 1. Should our spring 2027 dresses lean green or orange?
- **Brand:** Damson Madder
- **Charts:** color swatches, ranked bar
- **Evidence:** `green-ss27`, `orange-ss27`
- **Good answer:** both are runway-backed for SS27. Show the green and orange shades from our list, a count of shows using each, and 3–5 real dresses under $100 from similar stores. Recommend one shade family that fits Damson Madder's playful prints.

### 2. Is butter yellow still rising, or has it peaked?
- **Brand:** any (best with Massimo Dutti or Damson Madder)
- **Charts:** trend line, comparison
- **Evidence:** `buttercream-fw26`, `butter-to-primary-ss26`, `butter-fading`
- **Good answer:** a two-year search line for butter yellow next to primary yellow, plus new-arrival counts by month. Verdict: peaking in mass market, still alive in luxury (Chanel, Tod's). The signals conflict on purpose; this shows why data beats opinion.

### 3. Which prints should we add for fall?
- **Brand:** Massimo Dutti (was Rouje; Rouje is no longer a demo brand)
- **Charts:** ranked bar, image grid
- **Evidence:** `artistic-florals-fw26` (+169%), `animal-stripes-fw26` (+49%), `tartan-fw26` (+40%), `argyle-fw26` (+24%)
- **Good answer:** ranked bar of print growth, filtered to prints that fit a polished, quiet-luxury brand: tartan and argyle rank above animal stripes for Massimo Dutti, even though stripes grew faster. Real examples from similar stores.

### 4. Is preppy tailoring coming back for spring 2027?
- **Brand:** Aimé Leon Dore
- **Charts:** big number, image grid
- **Evidence:** `prep-tailoring-ss27`, `lyst-q2-miumiu`, `lyst-q2-massimodutti`
- **Good answer:** yes, with runway and shopper demand behind it. Big-number card for the count of SS27 shows, Lyst movement for preppy-leaning brands, and an image grid of blazers, knit polos and pleated trousers.

### 5. How big is the sports-merch moment, and should we do a team collab?
- **Brand:** Aimé Leon Dore
- **Charts:** big number, trend line
- **Evidence:** `lyst-q2-knicks-cap` (+4,276%), `lyst-q2-miumiu` (New Balance collab)
- **Good answer:** big-number card for the Knicks cap spike, a search line for team caps, and a note that ALD already sells an Olympiacos F.C. beanie, so the fit is proven. Flag that one viral item can fade fast.

## Reliability

- vogue.com blocked our research tools, so Vogue is not a cited source.
- Lyst figures come from press coverage of the Lyst Index, not Lyst's own page.
- Trendalytics growth figures are vendor numbers we can't check independently (`reliability = vendor_figure`).
- Rows marked `headline_only` were seen as headlines, not read in full.
