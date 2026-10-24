// Turns product text into Blair's vocabulary ids (data/curation): category, colors, material,
// pattern, silhouette. Plain phrase matching on words, no AI and no images (FR-1, FR-4).

export type VocabEntry = { id: string; label?: string; name?: string; family?: string; cues?: string[] };
export type TaggerVocab = {
  categories: VocabEntry[];
  colors: VocabEntry[];
  silhouettes: VocabEntry[];
  materials: VocabEntry[];
  patterns: VocabEntry[];
};

export type Tags = {
  category: string | null;
  colors: string[];
  silhouette?: string;
  material?: string;
  pattern?: string;
};

// Everyday shop words for each category id. Longest phrase wins, so "t-shirt" beats "shirt".
const CATEGORY_WORDS: Record<string, string[]> = {
  dresses: ["dress", "dresses", "gown", "sundress", "slip dress", "shirtdress", "shirt dress"],
  tops: ["top", "tops", "blouse", "cami", "camisole", "tank", "bodysuit", "corset", "bustier", "halter"],
  tees: ["t-shirt", "t shirt", "tee", "tees", "long sleeve tee"],
  shirts: ["shirt", "shirts", "button-down", "button down", "oxford", "overshirt", "polo"],
  knitwear: ["sweater", "jumper", "cardigan", "knit", "pullover", "crewneck sweater", "sweater vest", "turtleneck"],
  sweatshirts: ["sweatshirt", "hoodie", "hooded sweatshirt", "crewneck", "zip hoodie", "quarter zip"],
  jeans: ["jeans", "jean", "denim pant", "denim trouser"],
  trousers: ["trousers", "trouser", "pants", "pant", "slacks", "chinos", "chino", "culottes", "sweatpants", "joggers"],
  skirts: ["skirt", "skirts", "skort", "miniskirt", "midi skirt", "maxi skirt"],
  shorts: ["shorts", "bermuda"],
  jumpsuits: ["jumpsuit", "romper", "playsuit", "overalls", "boilersuit"],
  blazers: ["blazer", "blazers", "suit jacket", "sport coat"],
  jackets: ["jacket", "jackets", "bomber", "windbreaker", "anorak", "shacket", "gilet", "parka jacket"],
  coats: ["coat", "coats", "trench", "overcoat", "parka", "peacoat"],
  activewear: ["legging", "leggings", "sports bra", "track jacket", "track pant", "tennis skirt"],
  swimwear: ["swimsuit", "bikini", "swim", "one-piece", "swim trunk", "swim short"],
  lingerie: ["bra", "bralette", "brief", "briefs", "underwear", "thong", "lingerie", "boxer", "boxers"],
  sneakers: ["sneaker", "sneakers", "trainer", "trainers"],
  flats: ["ballet flat", "ballet flats", "flat", "flats", "loafer", "loafers", "mule", "mules", "mary jane", "slipper"],
  heels: ["heel", "heels", "pump", "pumps", "slingback", "stiletto"],
  boots: ["boot", "boots", "bootie", "booties"],
  sandals: ["sandal", "sandals", "slide", "slides", "flip flop", "espadrille"],
  bags: ["bag", "bags", "tote", "clutch", "handbag", "backpack", "crossbody", "purse", "pouch", "wallet"],
  jewelry: ["necklace", "earring", "earrings", "ring", "bracelet", "pendant", "jewelry", "jewellery", "anklet", "brooch"],
  eyewear: ["sunglasses", "glasses", "eyewear"],
  hats: ["hat", "hats", "cap", "beanie", "bucket hat", "beret"],
  "belts-scarves": ["belt", "belts", "scarf", "scarves", "bandana", "shawl"],
  "hair-accessories": ["hair clip", "claw clip", "scrunchie", "headband", "hair bow", "barrette", "hair tie"],
};

// Plain color words map only to an equally plain color in the list. Generic words like "red"
// or "blue" stay untagged rather than being credited to a named trend shade such as Cherry red.
const PLAIN_COLORS: Record<string, string> = {
  white: "optic-white",
  "off white": "ivory",
  black: "black",
  grey: "heather-grey",
  oat: "oatmeal",
};

const norm = (s: string) =>
  ` ${s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bgray\b/g, "grey")
    .trim()} `;

type Phrase = { phrase: string; id: string };

function phrasesFor(entries: VocabEntry[], extra: Record<string, string[]> = {}): Phrase[] {
  const out: Phrase[] = [];
  for (const e of entries) {
    const words = new Set([e.label, e.name, e.id.replace(/-/g, " "), ...(extra[e.id] ?? [])].filter(Boolean) as string[]);
    for (const w of words) {
      const phrase = norm(w);
      if (phrase.trim().length >= 3) out.push({ phrase, id: e.id });
    }
  }
  // longest first, so specific phrases claim the text before generic ones
  return out.sort((a, b) => b.phrase.length - a.phrase.length);
}

/** All ids whose phrase appears in the text; matched spans are blanked so shorter phrases can't re-match them. */
function findAll(text: string, phrases: Phrase[]): string[] {
  let t = text;
  const found: string[] = [];
  for (const { phrase, id } of phrases) {
    if (!t.includes(phrase)) continue;
    t = t.split(phrase).join(" | ");
    if (!found.includes(id)) found.push(id);
  }
  return found;
}

/**
 * The garment a product name is about: in English the noun comes last ("Knit Dress",
 * "Short Sleeve Tee"), so take the match that ends latest; ties go to the longer phrase.
 */
function headNoun(text: string, phrases: Phrase[]): string | null {
  let best: { end: number; len: number; id: string } | null = null;
  for (const { phrase, id } of phrases) {
    const at = text.lastIndexOf(phrase);
    if (at < 0) continue;
    const end = at + phrase.length;
    if (!best || end > best.end || (end === best.end && phrase.length > best.len)) best = { end, len: phrase.length, id };
  }
  return best?.id ?? null;
}

export function makeTagger(vocab: TaggerVocab) {
  const categoryPhrases = phrasesFor(vocab.categories, CATEGORY_WORDS);
  const colorPhrases = phrasesFor(vocab.colors);
  const colorIds = new Set(vocab.colors.map((c) => c.id));
  const plainPhrases = Object.entries(PLAIN_COLORS)
    .filter(([, id]) => colorIds.has(id))
    .map(([word, id]) => ({ phrase: norm(word), id }))
    .sort((a, b) => b.phrase.length - a.phrase.length);
  const silhouettePhrases = phrasesFor(vocab.silhouettes);
  const materialPhrases = phrasesFor(vocab.materials);
  const patternPhrases = phrasesFor(vocab.patterns);

  return function tag(p: { title: string; productType?: string; colorValues?: string[]; description?: string }): Tags {
    const title = norm(p.title);
    const type = norm(p.productType ?? "");
    const body = norm(`${p.title} ${p.description ?? ""}`);

    // Category: the product type field is the most reliable, then the title.
    const category = headNoun(type, categoryPhrases) ?? headNoun(title, categoryPhrases);

    // Colors: the variant color option first, then the title. Named colors before plain words.
    const colorText = norm([...(p.colorValues ?? []), p.title].join(" , "));
    const named = findAll(colorText, colorPhrases);
    const colors = named.length ? named : findAll(colorText, plainPhrases);

    return {
      category,
      colors: colors.slice(0, 3),
      silhouette: findAll(body, silhouettePhrases)[0],
      material: findAll(body, materialPhrases)[0],
      pattern: findAll(body, patternPhrases)[0],
    };
  };
}
