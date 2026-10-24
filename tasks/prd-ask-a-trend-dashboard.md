# PRD: Ask-a-Trend — Style-Matched Fashion Trend Digest + AI Dashboards

> **Status:** v1.0 (final for hackathon build), 2026-10-24. Built from three team discussion transcripts plus a first research pass (`tasks/research-2026-10-24.md`). Team decisions are recorded in §2. Remaining **[ASSUMPTION]** items are defaults the build can proceed on.

## 1. Introduction / Overview

Trend-following fashion brands — fast fashion and mass-market labels such as Zara, Cider, Fashion Nova and SHEIN — live or die by how quickly they spot what customers want next. SHEIN's Guangzhou flexible supply chain turns a small test order around in about 10 days, and the front of that pipeline is trend research.

Brands research trends in-house (at a $10M–$100M brand, often the founder plus one or two people) or buy reports from firms like WGSN and Heuritech, which cost roughly $10k–$35k a year. Big platforms have started adding "ask a question" chat (EDITED's AskEDITED, Future Snoops' MUSE), but each answers only from its own data, sells to enterprises, and none learns a small brand's own style or sends it tailored ideas.

**Ask-a-Trend fills that gap with two surfaces:**

1. **Style-matched digest (lead feature).** A brand gives us its website and Instagram. We read the *text* there (About Us, product descriptions, image alt text, captions), have the AI write a brand-style profile, and then push a regular digest of on-trend inspiration that fits that style — real finished-product examples, colors, and (where licensed) fabrics and patterns — to email or Slack.
2. **Ask-a-question dashboard (supporting feature).** A user types a plain-language question (*"Which colors are gaining traction in summer dresses under $50?"*). The AI interprets it, matches it against the trend database using that brand's profile and weights, and generates a dashboard for that question.

**End-to-end flow (shared by both surfaces):** Ask or schedule → AI interprets the style/segment and what the user cares about → match against the trend database, scored by dimension weights → assemble the dashboard or digest spec → design step styles it.

**Positioning:** complements a brand's in-house or outsourced research, and replaces the manual first pass (scanning social media and competitor new arrivals). Priced for founder-led brands that can't afford enterprise tools **[ASSUMPTION: test $99 / $199 / $499 per month]**.

### Ideas considered and set aside
- **World Chaos Index** — no clear paying market and people become desensitized to war news. Better as an open-source / not-for-profit project with an expert advisory board.
- **Podcast production automation** — the team already has its own editing workflow.

## 2. Team Decisions (2026-10-24)

| # | Decision | Detail |
|---|---|---|
| D1 | **Lead feature: style-matched digest** | Gets most build time and leads the pitch. The question-to-dashboard flow is a supporting feature. |
| D2 | **AI runs on the founder's existing subscriptions** | Multiple accounts with automatic failover when one runs out, reusing the founder's existing internal "IT assistant" setup. Fast, cheap models by default. Risk noted in §8; paid developer API keys are the fallback. |
| D3 | **Bring-your-own-licence for paid sources** | We build and maintain integrations for licensed sources (WGSN, Coloro, Pantone, Première Vision, F-Trend, Heuritech, etc.). The client connects its own licence or key; we never resell their data. |
| D4 | **Gather as many sources as possible** | A crawler collects every useful publicly available source, following industry best practice (§7.3). Where a source is licence-only, we use its public pages or a third-party route. |
| D5 | **Text, not images, for style** | Brand style and trend attributes come from text. No image-recognition model — processing cost is too high, and text is usually enough. |
| D6 | **Show real examples, don't generate designs** | Digests show representative real finished products the AI picks; no AI-generated designs. |
| D7 | **Fixed color list** | Color trends are named from a predefined list passed to the AI, so names stay consistent. |
| D8 | **Channels: email + Slack live; WhatsApp demo** **[ASSUMPTION]** | WhatsApp runs on Meta's free test number (up to 5 recipients) for the demo; production WhatsApp later. |

## 3. Goals

- A new brand can go from entering its website to receiving its first style-matched digest in **under 5 minutes**.
- Every digest item and every chart traces back to a real record the user can open (no invented data).
- Brand-style profiles are accurate enough that the founder and at least 2 other operators rate their own profile "accurate" without major edits.
- Rehearsed demo questions load in **under 2 seconds**; live questions produce a full dashboard in **under 30 seconds** **[ASSUMPTION]**.
- The pitch answers "who pays?" with the founder as the first validating customer and at least one operator who says they would pay.

## 4. User Stories

**Primary user:** the founder or 1–3-person product/trend team at a small-to-mid trend-following brand (~$10M–$100M revenue).

Priority: **P0** = must ship for the demo, **P1** = ship if time allows.

### US-001 (P0): Onboard a brand
**Description:** As a founder, I want to enter my website and Instagram so the product learns my brand without me describing it.

**Acceptance Criteria:**
- [ ] Onboarding form accepts brand name, website URL, Instagram handle, optional extra URLs (e.g., competitors the brand watches), and digest channel + frequency.
- [ ] Submitting starts a background crawl and shows progress; the page does not hang.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-002 (P0): Build the brand-style profile from text
**Description:** As a founder, I want an AI-written profile of my brand's style so recommendations fit my look.

**Acceptance Criteria:**
- [ ] The crawler collects text only: About Us, product titles/descriptions/tags, image alt text, Instagram bio and captions. No images are analyzed.
- [ ] The AI produces: 3–5 style tags, typical price range, core categories, typical colors (from the fixed color list), and a one-paragraph summary.
- [ ] The user can edit any field before saving; edits are kept on re-crawl.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-003 (P0): Collect trend data
**Description:** As a developer, I need a pre-collected trend database so digests and dashboards are fast and don't depend on live crawling.

**Acceptance Criteria:**
- [ ] Source connectors load data into the database on a schedule, each tagged with source, date, category, attributes (color, silhouette, material, pattern, style tags), price, image URL and link.
- [ ] At least the P0 sources in §7.2 are connected before the demo.
- [ ] The crawler follows the rules in §7.3; every source has a recorded entry of what was collected and under what terms.
- [ ] Re-running a connector does not create duplicates.

### US-004 (P0): Receive a style-matched digest
**Description:** As a founder, I want on-trend inspiration that fits my style sent to my email or Slack so I collect design ideas without going looking.

**Acceptance Criteria:**
- [ ] Each digest names 2–4 trending elements relevant to the brand profile (e.g., "butter yellow", "barrel-leg denim"), each with a one-sentence reason and a "fits your brand because…" line.
- [ ] Each element shows 3–5 real finished-product examples from the database, with source links.
- [ ] Colors use names from the fixed color list.
- [ ] Delivered by email and by Slack; a "send test digest now" button exists for the demo.
- [ ] Each item has 👍 / 👎 feedback that is stored.
- [ ] Typecheck/lint passes.

### US-005 (P0): Ask a question, get a dashboard
**Description:** As a founder, I want to type a trend question and get a dashboard built for it.

**Acceptance Criteria:**
- [ ] Home screen has a prominent question box with 3–5 example questions.
- [ ] The AI returns a JSON dashboard spec (title, summary, widgets with chart type + predefined query + caption) that validates against a schema; invalid output retries once, then shows a friendly error.
- [ ] Widgets render from the fixed component set (FR-12) and show source and date range.
- [ ] Results are filtered and ranked using the user's brand profile and weights.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-006 (P0): Fast demo path
**Description:** As a presenter, I want rehearsed questions and demo brands to load instantly.

**Acceptance Criteria:**
- [ ] Dashboards for rehearsed questions and profiles/digests for demo brands are generated ahead of time and stored.
- [ ] Rehearsed questions load in under 2 seconds.
- [ ] Every live request logs time spent in: AI interpretation, data matching, assembly, design.

### US-007 (P1): Adjust weights and presets
**Description:** As a founder, I want to tune how much each dimension counts (price range, social buzz, growth speed, competitor adoption) so results match what my kind of brand cares about.

**Acceptance Criteria:**
- [ ] Defaults follow industry best practice, documented with a one-line reason each.
- [ ] Presets: "Price-sensitive / mass market", "Niche streetwear", "Fashion house / editorial".
- [ ] Sliders always total 100%; changing them re-ranks without calling the AI again.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-008 (P1): Connect a licensed source (bring your own licence)
**Description:** As a brand with an existing WGSN/Coloro/Pantone/other subscription, I want to plug in my licence so my digest and dashboards include that data.

**Acceptance Criteria:**
- [ ] A Sources settings page lists each supported licensed source with a "Connect" action (API key, or upload of licensed exports where no API exists).
- [ ] Licensed data is stored per brand and only ever shown to that brand.
- [ ] Disconnecting removes that brand's licensed data.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-009 (P1): Follow-up questions and evidence panel
**Description:** As a founder, I want to refine a dashboard with a follow-up and click any chart element to see the real items behind it.

**Acceptance Criteria:**
- [ ] Follow-up box under the dashboard updates it in place, with a back button.
- [ ] Clicking a bar/point/row opens a panel of the underlying real records (image, source, date, link).
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-010 (P1): WhatsApp digest (demo) and saved/shared dashboards
**Description:** As a founder, I want the digest on WhatsApp and to share a saved dashboard with my team.

**Acceptance Criteria:**
- [ ] WhatsApp delivery works to the demo test number's approved recipients.
- [ ] "Save" stores a dashboard and returns a shareable link that re-renders without calling the AI.

## 5. Functional Requirements

**Brand profile & digest**
- FR-1: Brand style must be inferred from crawled text only (About Us, product text, alt text, Instagram bio/captions), never from image recognition.
- FR-2: The brand profile must be stored, editable, and used to filter and rank both digests and dashboards for that brand.
- FR-3: Digests must contain only real records from the database, chosen by the AI as representative of a trend; no generated designs or images.
- FR-4: Color trends must be named from a fixed color list passed to the AI; the AI may not invent color names.
- FR-5: Digests must be deliverable by email and Slack, on a daily or weekly schedule, with a manual "send now".
- FR-6: Digest feedback (👍/👎 per item) must be stored and used to adjust future ranking for that brand **[P1 for the adjustment; storage is P0]**.

**Data**
- FR-7: Each source must be a separate connector that can be switched on or off without code changes elsewhere.
- FR-8: Licensed sources must use the client's own licence (bring your own licence) and keep that data visible only to that client.
- FR-9: The crawler must follow §7.3.
- FR-10: No live crawling during a user request; all data is pre-collected.

**Question-to-dashboard**
- FR-11: Accept a free-text question up to 500 characters; the AI returns a schema-validated JSON spec; the AI never returns code or HTML to the browser.
- FR-12: Widgets render only from a fixed set: trend line, ranked bar chart, image grid, big-number card, side-by-side comparison, color swatch palette.
- FR-13: Widget data comes from predefined, parameterized queries chosen by the AI, not free-form database queries.
- FR-14: Every widget shows its data source and date range; out-of-scope or no-data questions get a plain message and a suggested alternative.
- FR-15: Results are ranked using per-dimension weights with defaults, presets, and user-adjustable sliders.

**AI & performance**
- FR-16: All AI calls go through one internal provider layer supporting Gemini, OpenAI and Claude, so the model can be changed by configuration.
- FR-17: The provider layer must hold several accounts and fail over automatically when one runs out of quota or errors, without the user seeing an error.
- FR-18: Routine steps use a fast, low-cost model; expensive models are not used by default.
- FR-19: Repeated identical questions are served from cache; rehearsed demo content is pre-generated.
- FR-20: Per-step latency is logged for every live request.
- FR-21: Account credentials and keys stay on the server and are never sent to the browser or committed to the repo.

## 6. Non-Goals (Out of Scope)

- No podcast features and no World Chaos Index.
- No image recognition or computer-vision style model.
- No AI-generated product images or designs.
- No trend *forecasting* model predicting future demand; v1 shows current and recent signals.
- No supplier sourcing, ordering or supply-chain integration.
- No reselling or redistributing licensed data across clients.
- No getting past logins, paywalls or anti-bot protections (§7.3).
- No billing or team management for the hackathon build **[ASSUMPTION]**.

## 7. Technical Considerations

### 7.1 Stack
- **Hosting:** Vercel project `june-not-oct-hackathon`, auto-deploys from this repo.
- **Database:** the team's Supabase project (see `CLAUDE.md`).
- **AI:** provider layer per FR-16/17 on the founder's subscriptions (D2). Day 1: time **Gemini 3.8 Flash** and **Claude Haiku 5.5** on real prompts at low thinking settings and pick the default. Research found Gemini 3.8 Flash at full thinking takes ~25 seconds before its first output, so keep thinking low. Gemini 3.8 Flash's API price doubles on 2027-01-01 (relevant only on the paid-key fallback).
- **Structured output:** use each provider's JSON-schema mode; keep the dashboard schema shallow; stream partial JSON so widgets appear one by one.
- **Email:** Resend (free for 3,000 emails/month). **Slack:** incoming webhook per workspace. **WhatsApp:** Meta Cloud API test number for the demo.

### 7.2 Source plan

| Priority | Source | What it gives | Route |
|---|---|---|---|
| P0 | Client's own website + Instagram | Brand-style text | Crawl public pages; Instagram via official Business Discovery API where approved, otherwise text the client pastes in |
| P0 | Public product lists of small/mid online stores (many Shopify stores expose these) | New-arrival products, tags, prices, images | Crawler |
| P0 | Pinterest Trends | Growing fashion keywords by region | Official API (apply day 1; approval time unknown) |
| P0 | Google Trends | Search-interest curves | Unofficial library with caching plus a pre-pulled fallback file (official API is invite-only) |
| P0 | Publicly announced colors (WGSN × Coloro, Pantone Color of the Year and key colors) | Seed for the fixed color list | Entered by hand from press releases |
| P1 | Met Museum and Cooper Hewitt open collections | Textile and pattern inspiration (free to reuse) | Official APIs |
| P1 | Première Vision Paris | Fabric trend decoding | Public pages for reference; full content via client's licence |
| P1 | F-Trend | Colors, patterns, garment categories | Bring your own licence. **Confirm which F-Trend is meant** — f-trend.com is run by an Indian company; a Chinese trend platform would be a different source. |
| P1 | WGSN / Coloro / Pantone / Heuritech | Forecasts, full color systems | Bring your own licence (WGSN has an enterprise API) |
| P1 | Reddit, TikTok Creative Center | Discussion and social signals | Reddit official API (commercial use needs an agreement); TikTok via third-party providers |
| Ref | SHEIN, Zara, Cider, Fashion Nova | Competitor new arrivals | Their terms prohibit automated collection or the public product list is off: use manually as references, or via a third-party data provider |

### 7.3 Crawler rules (industry best practice)
- Respect each site's robots.txt and published rate limits; crawl slowly and identify the crawler honestly.
- Collect only pages visible without logging in; never get past logins, paywalls, CAPTCHAs or anti-bot systems.
- Licensed or paywalled content enters only through the client's own licence (D3).
- Store links and short excerpts plus our own extracted attributes; link out to images rather than re-hosting them **[ASSUMPTION]**.
- Keep a per-source record of terms reviewed and what is collected; switch a connector off on any complaint.

### 7.4 Moat
Pure SaaS is hard to defend and we hold no proprietary raw data. The moat is: (1) a brand-style profile that improves with every 👍/👎; (2) trends filtered to *this brand's* look rather than a generic forecast; (3) blending many free sources with each client's licensed ones; (4) living in the founder's inbox and Slack, a habit no dashboard tool has; (5) self-serve pricing far below enterprise tools.

## 8. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **Subscription terms (D2).** Claude, ChatGPT and Gemini consumer terms prohibit automated or third-party use of subscriptions and sharing accounts; OpenAI also prohibits circumventing rate limits. | Accounts could be suspended, possibly mid-demo. | Pre-generate all demo content (US-006); keep a paid developer key configured as a last fallback (est. $1–$25 for the whole demo); move to paid keys before any real customers. |
| Source access and terms | Data gaps; takedown requests | Many sources (§7.2), crawler rules (§7.3), connectors can be switched off. |
| Thin data for niche questions | Sparse dashboards | Lead with the digest (D1); the question box suggests answerable alternatives (FR-14). |
| Latency | Slow live demo | Low thinking, streaming, caching, pre-generation (FR-18–20). |
| API approvals (Pinterest, Meta) arrive late | Missing P0 source | Apply on day 1; Google Trends and store product lists don't need approval. |

## 9. Success Metrics

- Demo: onboarding → first digest in under 5 minutes, live, with no errors; all rehearsed questions render correctly.
- Profile accuracy: founder + 2 operators rate their profile "accurate".
- Digest usefulness: ≥60% 👍 across demo-brand digest items **[ASSUMPTION]**.
- Demand: at least 3 operators from the founder's network say they'd read it weekly; at least 1 says they'd pay at a tested price point.

## 10. Remaining Open Questions

1. **Which F-Trend** — the Indian site f-trend.com, or a Chinese trend platform?
2. **Demo brands and questions** — which 3 brands and 5 questions do we rehearse? These decide what data to collect first.
3. **Default weights** — what are the industry-best-practice values for each preset?
4. **Hackathon logistics** — deadline, judging criteria, and owners for data, AI, front end, and pitch.
5. **Price point to test** — $99, $199 or $499 per month.
