# PRD: Ask-a-Trend — AI-Generated Fashion Trend Dashboards

> **Status:** Draft v0.3 (2026-10-24). Built from the team's first three discussion transcripts (v0.2 added the question-to-dashboard flow, adjustable weights, latency, model and cost strategy, and data coverage; v0.3 adds brand-style onboarding, the pushed inspiration feed, and new data sources). Will be revised once the full voice-to-text transcripts of all team conversations are added. Items marked **[ASSUMPTION]** are placeholders the team has not yet decided.

## 1. Introduction / Overview

Fashion brands that follow trends — fast fashion and mass-market labels such as Zara, Cider, Fashion Nova and SHEIN — live or die by how quickly they spot what customers want next. SHEIN's Guangzhou-based flexible supply chain can turn a small test order around in roughly 10 days, and the very front of that pipeline is trend research.

Today brands do this research in one of two ways:

- **In-house.** Product or development staff track trends themselves. The smaller the brand, the more centralized this is: a brand doing tens of millions of dollars in revenue often has the founder plus one or two people doing it. Larger brands split it across specialized roles.
- **Outsourced.** Brands buy reports or consulting from third-party trend-research firms.

**Ask-a-Trend** lets someone on a brand's team type a plain-language question (for example, *"What colors are gaining traction in women's summer dresses under $50?"*). An AI model interprets the question, pulls the relevant trend data, and **generates a dashboard built for that specific question** — charts, rankings and example images — instead of showing a fixed, one-size-fits-all dashboard.

**How a question becomes a dashboard (end-to-end flow):**

1. **Ask** — the user types a question.
2. **Interpret** — the AI works out *which style/segment* the question is about (e.g., niche streetwear vs. high fashion) and *what the user cares about* (e.g., price range, color, silhouette, speed of growth).
3. **Match** — the backend matches that interpretation against the trend database and scores results using the dimension weights for that user (see US-008).
4. **Assemble** — the system builds the dashboard spec from the matched data.
5. **Design** — a design step (the AI applying a design skill / style guide) lays out and styles the dashboard so it looks polished rather than generic.

**Why a question-driven dashboard instead of a fixed one:** A static dashboard feels stale, and different brands care about very different segments (a small brand may only care about one style niche). Generating the view from the user's question fits each brand's niche and feels AI-native, which also makes for a stronger demo.

**Second surface — a personalized trend feed pushed to the brand.** Beyond answering questions, the product learns each client brand's style and proactively sends it on-trend inspiration:

1. **Onboard** — the client gives us its own website, Instagram and any other data sources it already uses.
2. **Understand the brand** — we crawl the *text* on those pages (About Us, product descriptions, image alt text, Instagram captions) and have the AI write a brand-style profile. No image recognition: training a style-recognition image model is not hard, but the processing cost is too high, and text is usually enough.
3. **Personalize** — the brand profile filters and ranks trends, so the client gets a company-specific view of what's trending *for their style*.
4. **Push** — the system sends a regular digest by email, Slack or WhatsApp, without the client having to log in.

**Positioning:** The product can *complement* a brand's existing in-house or outsourced research, or *replace* parts of that workflow (e.g., the manual first pass of scanning social media and competitor new arrivals).

### Background: ideas considered and set aside

- **World Chaos Index** (a COVID-dashboard-style tracker of global instability and proximity to world war). Set aside as the hackathon product because there is no clear paying market and people become desensitized to war news. If pursued, it fits better as an open-source / not-for-profit project with an expert advisory board.
- **Podcast production automation.** Dropped from scope; the team already has its own internal editing workflow for remotely recorded episodes.

## 2. Goals

- A user can go from typing a question to seeing a relevant, readable dashboard in **under 30 seconds** **[ASSUMPTION — target]**.
- Every dashboard is **specific to the question asked** — different questions produce visibly different layouts and charts, not the same template with new numbers.
- Every chart traces back to real data the user can inspect (no invented numbers).
- The demo works reliably end-to-end on at least **5 rehearsed questions** for the hackathon presentation.
- The pitch can credibly answer "who pays?" — B2B / enterprise fashion brands, with the founder (an actual user of this kind of research) as the first validating customer.

## 3. User Stories

**Primary user [ASSUMPTION]:** the founder or a 1–3-person product/trend team at a small-to-mid-size trend-following fashion brand (roughly $10M–$100M revenue).

### US-001: Ask a trend question
**Description:** As a brand founder, I want to type a question in plain English so that I don't have to learn a dashboard tool or filter menus.

**Acceptance Criteria:**
- [ ] The home screen shows a single prominent text box with a submit button and 3–5 clickable example questions.
- [ ] Pressing Enter or clicking submit sends the question; empty input is rejected with an inline message.
- [ ] A loading state is shown within 300 ms of submitting.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-002: AI turns the question into a dashboard plan
**Description:** As a developer, I need the AI model to convert a question into a structured dashboard specification so the front end can render it safely and consistently.

**Acceptance Criteria:**
- [ ] The backend sends the question to the AI API along with the list of available data sources and chart types.
- [ ] The AI returns a JSON spec (title, list of widgets, each with a chart type, data query, and one-line explanation) that validates against a defined schema.
- [ ] If the AI returns invalid JSON or an unknown chart type, the backend retries once, then returns a friendly error.
- [ ] The AI never returns raw HTML or executable code to the browser.
- [ ] Typecheck/lint passes.

### US-003: Render the generated dashboard
**Description:** As a user, I want to see my answer as charts, rankings and example images so I can grasp the trend at a glance.

**Acceptance Criteria:**
- [ ] The front end renders each widget in the spec using a fixed component library (see FR-6).
- [ ] The dashboard has a title restating the question and a 2–3 sentence written summary at the top.
- [ ] Each widget shows a short caption saying what it shows and where the data came from.
- [ ] Layout works on a laptop screen and a phone-width screen.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-004: Refine with a follow-up question
**Description:** As a user, I want to ask a follow-up ("now only show denim", "compare to last year") so I can drill in without starting over.

**Acceptance Criteria:**
- [ ] A follow-up box appears under the current dashboard.
- [ ] Follow-ups are sent with the previous question and spec as context, and the dashboard updates in place.
- [ ] The user can go back to the previous version of the dashboard.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-005: See the evidence behind a trend
**Description:** As a user, I want to click on a chart element and see the underlying examples (products, posts, images) so I can trust the insight before acting on it.

**Acceptance Criteria:**
- [ ] Clicking a bar, point or ranking row opens a side panel listing the underlying items with image, source, date and link.
- [ ] Items in the panel are real records from the dataset, not AI-generated.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-006: Collect and store trend data
**Description:** As a developer, I need a pre-collected dataset of fashion trend signals stored in the database so dashboards load fast and the demo doesn't depend on live scraping.

**Acceptance Criteria:**
- [ ] A script loads data from the chosen sources (see Open Questions) into Supabase tables.
- [ ] Each record has at minimum: source, date, category, attributes (color, silhouette, material, style tags), price if available, image URL, and link.
- [ ] The dataset covers at least the categories used in the rehearsed demo questions.
- [ ] Re-running the script does not create duplicate records.

### US-007: Save and share a dashboard
**Description:** As a founder, I want to save a dashboard and share a link with my team so we can discuss it.

**Acceptance Criteria:**
- [ ] A "Save" button stores the question and generated spec and returns a shareable link.
- [ ] Opening the link re-renders the same dashboard without calling the AI again.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-008: Adjust how trends are weighted
**Description:** As a user, I want to choose or tune how much each dimension (e.g., price range, social buzz, growth speed, competitor adoption) counts, so the results match what my kind of brand cares about.

**Acceptance Criteria:**
- [ ] Default weights follow industry best practice and are documented in the codebase, with a one-line reason for each.
- [ ] A Settings page offers at least 3 presets **[ASSUMPTION — examples]**: "Price-sensitive / mass market", "Niche streetwear", "Fashion house / editorial (Vogue-style)".
- [ ] The user can switch presets or move individual weight sliders; weights always add up to 100%.
- [ ] Changing weights re-ranks the current dashboard without calling the AI again.
- [ ] The dashboard shows which preset is active.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-009: Fast, reliable demo questions
**Description:** As a presenter, I want the rehearsed demo questions to load instantly so the live demo never stalls on AI or data latency.

**Acceptance Criteria:**
- [ ] Dashboards for the rehearsed demo questions are generated ahead of time and stored.
- [ ] Asking a rehearsed question serves the stored dashboard in under 2 seconds.
- [ ] Non-rehearsed questions still go through the live AI path.
- [ ] A latency log records, for every live request, the time spent in AI interpretation, data matching, dashboard assembly and design.

### US-010: Onboard a brand and build its style profile
**Description:** As a brand founder, I want to give the product my website and Instagram so it understands my brand's style without me describing it by hand.

**Acceptance Criteria:**
- [ ] An onboarding form accepts a brand name, website URL, Instagram handle, and optional extra source URLs.
- [ ] The system crawls text only: About Us, product titles and descriptions, image alt text, and Instagram bio/captions.
- [ ] The AI produces a brand-style profile: 3–5 style tags, typical price range, core categories, typical colors, and a one-paragraph summary.
- [ ] The user can review and edit the profile before it is saved.
- [ ] No images are downloaded or analyzed for style detection.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-011: Receive a pushed inspiration digest
**Description:** As a brand founder, I want on-trend inspiration matched to my style sent to my email or Slack so I collect design ideas without going looking for them.

**Acceptance Criteria:**
- [ ] The user picks a channel (email or Slack for the hackathon; WhatsApp later **[ASSUMPTION]**) and a frequency (daily or weekly).
- [ ] Each digest names 2–4 trending elements relevant to the brand profile (e.g., "butter yellow", "barrel-leg denim"), each with a one-sentence explanation.
- [ ] Each element includes 3–5 representative *finished-product images* from the dataset, with source links. No AI-generated images.
- [ ] Color trends are named from a fixed color list, so color names stay consistent across digests (FR-20).
- [ ] A "send test digest now" button exists for the demo.
- [ ] Each digest has a one-click "useful / not useful" rating, used to test whether clients actually want this feature.

## 4. Functional Requirements

- FR-1: The system must accept a free-text question of up to 500 characters.
- FR-2: The system must send the question to an AI model API together with a description of available data fields and allowed chart types.
- FR-3: The AI must respond with a dashboard specification in JSON that matches a defined schema; the backend must validate it before anything is shown.
- FR-4: The backend must run each widget's data query against the stored dataset and attach the results to the spec.
- FR-5: The system must generate a short written summary of the findings, grounded only in the queried data.
- FR-6: The front end must render widgets only from a fixed set of chart types: trend line over time, ranked bar chart, image grid ("top examples"), single big-number card, side-by-side comparison, and color swatch palette.
- FR-7: Every widget must display its data source and date range.
- FR-8: If a question is out of scope (not about fashion/apparel trends) or no data matches, the system must say so plainly and suggest a related question it can answer.
- FR-9: The system must support at least one follow-up question that modifies the current dashboard.
- FR-10: The system must let a user save a dashboard and open it later via a link.
- FR-11: The AI API key must stay on the server and never be sent to the browser.
- FR-12: Results must be ranked using per-dimension weights, with an industry-best-practice default, selectable presets, and user-adjustable sliders (US-008).
- FR-13: The system must support more than one AI provider (Gemini, OpenAI, Claude) behind a single internal interface, so the provider can be swapped by configuration.
- FR-14: When the active AI account or key runs out of quota or errors, the system must automatically fail over to the next configured one without the user seeing an error.
- FR-15: Routine steps (interpreting the question, building the spec) must use a fast, low-cost model; the most expensive models are not used by default.
- FR-16: The system must log per-step latency for every live request (US-009).
- FR-17: Demo questions must be served from pre-generated dashboards (US-009).
- FR-18: Brand style must be inferred from crawled text only (About Us, product descriptions, image alt text, Instagram captions), never from image recognition (US-010).
- FR-19: The brand-style profile must be stored and used to filter and rank both dashboards and pushed digests for that brand.
- FR-20: Color trends must be expressed using a fixed, predefined color list passed to the AI in the prompt; the AI picks from the list rather than inventing color names.
- FR-21: Pushed digests must show real finished-product examples chosen by the AI as representative of a trend; the system does not generate new designs or images.
- FR-22: The push system must support email and Slack at launch, built so WhatsApp can be added later.

## 5. Non-Goals (Out of Scope)

- No podcast or audio features.
- No World Chaos Index.
- No live, real-time scraping during a user's request — data is pre-collected.
- No trend *forecasting* model (predicting future demand); v1 shows what the data says now and recently.
- No supplier sourcing, ordering or supply-chain integration.
- No user accounts, billing or team management for the hackathon build **[ASSUMPTION]**.
- No AI-generated product images or designs, and no fully generated design packs. Digests show real examples.
- No image recognition or computer-vision style model. Style comes from text.
- No fabric or pattern trend feeds in v1 unless a free or open third-party source is found (see Open Question 10). Finished-product images and colors come first.

## 6. Design Considerations

- The question box is the hero of the page — think search engine, not admin panel.
- Dashboards should "assemble" visibly (widgets appearing one by one) to reinforce the AI-native feel in the demo.
- Fashion is visual: every dashboard should include at least one image-based widget where data allows.
- Keep styling clean and editorial (fashion-magazine feel) rather than enterprise-grey.

## 7. Technical Considerations

- **Hosting:** Vercel project `june-not-oct-hackathon`, auto-deploys from this repo.
- **Database:** the team's Supabase project (see `CLAUDE.md`).
- **AI model:** the founder already has Gemini, OpenAI and Claude API access, and the demo needs few tokens, so model choice is not the bottleneck — speed is. Default to a fast model such as Gemini 3.8 Flash for interpreting questions and building specs; reserve stronger models for cases that need them. Use structured (JSON) output for the dashboard spec.
- **AI cost and accounts:** AI calls run on the founder's existing AI accounts (a few accounts, roughly a few hundred dollars a month of capacity, which is now ample). The backend holds several accounts and switches automatically when one runs out (FR-14). This follows a setup the founder already runs for an internal company "IT assistant" bot. See Open Question 7 on account terms.
- **Latency is the main technical risk.** Total time = AI interpretation + data matching + dashboard assembly + design step. Measure each step (FR-16), pre-generate demo dashboards (FR-17), and consider streaming widgets onto the page as each one is ready.
- **Safety:** the AI produces a *spec*, never code. The front end only renders known components; this prevents broken or unsafe output and keeps the look consistent.
- **Data queries:** the AI should choose from predefined, parameterized queries (e.g., "top attributes by mention growth in category X over period Y") rather than writing free-form SQL. This keeps queries safe and fast.
- **Performance:** cache AI responses for repeated identical questions so the live demo is fast and cheap.
- **Moat note (from discussion):** pure SaaS is hard to defend long-term. Defensibility more likely comes from a proprietary or well-curated dataset and from workflow lock-in (saved dashboards, team sharing), not from the dashboard UI itself.

## 8. Success Metrics

- Hackathon demo: all rehearsed questions produce a correct dashboard on stage with no errors.
- Median time from submit to full dashboard under 30 seconds **[ASSUMPTION]**.
- At least 3 fashion-brand operators (founder's network) say they would use it weekly, and at least 1 says they would pay **[ASSUMPTION]**.
- In testing, 80%+ of a set of 20 realistic questions produce a dashboard a team member rates "useful."

## 9. Open Questions

1. **Data sources — the #1 next task.** Dashboard coverage depends almost entirely on how rich the database is. If it only supports a dozen or so dashboards and a user asks something very specific or niche, there will be little to show. Finding enough sources to cover many use cases is the team's core next step. Where does the trend data come from? Candidates: Google Trends, TikTok/Instagram/Pinterest hashtags and posts, competitor new-arrival pages (SHEIN, Zara, Cider), marketplace bestseller lists. What is legally and practically collectable before the hackathon?
2. **Target customer:** small founder-led brands (fast to sell, low budgets) or larger enterprise brands (bigger budgets, longer sales cycles)?
3. **Complement or substitute:** do we pitch alongside existing trend consultants, or as a cheaper replacement for part of their work?
4. **Demo questions:** which 5 questions will we rehearse? These decide which data we must collect.
5. **Moat:** what is our long-term defensibility beyond the UI — proprietary data, the founder's industry network, or something else?
6. **Hackathon logistics:** deadline, judging criteria and team roles (who owns data, AI, front end, pitch).
7. **Which AI accounts power the app:** check that the accounts used are allowed to serve an app used by other people. Paid API keys are built for this. Consumer chat subscriptions (e.g., ChatGPT Plus, Claude Pro/Max) generally are not, and company-paid credits may not be allowed for a non-company hackathon project. Confirm before launch.
8. **Weights:** what are the industry-best-practice default weights, and which presets do we ship? Fixed weights are fine for the demo, but setting them for a commercial product is hard.
9. **Pre-built vs. fully generated dashboards:** do we keep a library of dashboard templates that the AI picks from and fills in, or does the AI compose every dashboard from widgets? A template library is faster and more reliable; full generation covers more niche questions.
10. **Fabric, pattern and color sources:** finished-product images are easy to source, but fabric, pattern and color-code trends usually need niche third-party data. Are there free or open sources? Known lead: **Première Vision Paris** (premierevision.com), which publishes fabric trend decoding. Second lead: **F-Trend**, another source for fabric-type trends (website to be confirmed). Add both to the source list.
11. **Client-supplied sources:** what will clients realistically share (website, Instagram, competitor lists, internal sales data)? Do we need their permission in writing to crawl their accounts, and do Instagram's terms allow crawling captions?
12. **Which surface leads the pitch:** the ask-a-question dashboard (more "AI-native", stronger live demo) or the pushed digest (likely more useful day to day for founder-led brands)? We could build both and test which one clients use more.
