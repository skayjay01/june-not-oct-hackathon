// What the demo pre-generator builds (US-006). Mirrors Blair's data/curation/demo-set.md (C4);
// change both together. Style tags are ids from style-tags.json; presets are ids from presets.json.

export interface DemoBrand {
  name: string;
  /** crawlable brands get their profile from their own site; reference brands from `seed` */
  website_url: string;
  crawlable: boolean;
  preset: "price-sensitive" | "niche-streetwear" | "fashion-house";
  /** the profile entered by hand for reference brands (PRD US-002 allows pasted profiles) */
  seed: { style_tags: string[]; price_min: number; price_max: number; summary: string };
}

export interface DemoQuestion {
  question: string;
  /** DemoBrand.name the question is rehearsed for */
  brand: string;
}

/** Rough USD ranges for the demo-set price tiers. */
const TIER = {
  contemporary: { price_min: 60, price_max: 200 },
  "mid-premium": { price_min: 60, price_max: 300 },
  premium: { price_min: 150, price_max: 600 },
  luxury: { price_min: 800, price_max: 5000 },
} as const;

export const DEMO_BRANDS: DemoBrand[] = [
  {
    name: "Aimé Leon Dore", website_url: "https://www.aimeleondore.com", crawlable: true, preset: "niche-streetwear",
    seed: { style_tags: ["preppy", "streetwear", "old-money"], ...TIER.premium, summary: "New York label mixing prep, sportswear and old-money references." },
  },
  {
    name: "Damson Madder", website_url: "https://www.damsonmadder.com", crawlable: true, preset: "price-sensitive",
    seed: { style_tags: ["romantic", "dopamine", "maximalist"], ...TIER.contemporary, summary: "London brand known for playful prints, bright color and romantic shapes." },
  },
  {
    name: "Paloma Wool", website_url: "https://palomawool.com", crawlable: true, preset: "fashion-house",
    seed: { style_tags: ["avant-garde", "sustainable", "minimalist"], ...TIER.contemporary, summary: "Barcelona label with an art-led, minimalist and sustainable approach." },
  },
  {
    name: "Miu Miu", website_url: "https://www.miumiu.com", crawlable: false, preset: "fashion-house",
    seed: { style_tags: ["ugly-chic", "preppy", "ballet-core"], ...TIER.luxury, summary: "Prada's sister house: playful, subversive takes on preppy and ballet references." },
  },
  {
    name: "Prada", website_url: "https://www.prada.com", crawlable: false, preset: "fashion-house",
    seed: { style_tags: ["minimalist", "avant-garde", "tailored"], ...TIER.luxury, summary: "Milan house known for intellectual minimalism, sharp tailoring and runway direction." },
  },
  {
    name: "Massimo Dutti", website_url: "https://www.massimodutti.com", crawlable: false, preset: "price-sensitive",
    seed: { style_tags: ["quiet-luxury", "tailored", "minimalist"], ...TIER["mid-premium"], summary: "Inditex's premium line: polished, understated tailoring and quiet-luxury basics." },
  },
];

export const DEMO_QUESTIONS: DemoQuestion[] = [
  { question: "Should our spring 2027 dresses lean green or orange?", brand: "Damson Madder" },
  { question: "Is butter yellow still rising, or has it peaked?", brand: "Massimo Dutti" },
  { question: "Which prints should we add for fall?", brand: "Massimo Dutti" },
  { question: "Is preppy tailoring coming back for spring 2027?", brand: "Aimé Leon Dore" },
  { question: "How big is the sports-merch moment, and should we do a team collab?", brand: "Aimé Leon Dore" },
];
