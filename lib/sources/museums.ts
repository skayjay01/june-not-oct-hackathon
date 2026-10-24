import { loadTaggerVocab } from "./curation";
import { politeFetch } from "./crawler";
import type { TrendRow } from "./store-products";
import { makeTagger } from "./tagger";

// Connectors for open museum collections: historic garments and textiles as fabric and pattern
// references, each with an image and a link back to the object page. All are free, official APIs
// whose records are open data (CC0 for the Met, Art Institute, Cleveland and Smithsonian; the V&A's
// API terms allow reuse with credit; Europeana is limited to openly reusable records).
//
// Rows are typed "pattern" when the tagger finds a pattern, otherwise "fabric", so they never mix
// with store products in the matcher's product rankings.

/** Fashion searches run against every museum; a few hits each keeps the library balanced. */
export const MUSEUM_QUERIES = ["dress", "coat", "skirt", "shoes", "handbag", "embroidered silk", "printed cotton", "lace", "knitted", "velvet"];
const PER_QUERY = 8;

type Found = { id: string; title: string; text: string; date: string | null; image: string | null; link: string };
type Museum = { key: string; credit: string; search: (q: string) => Promise<Found[]> };

async function json<T>(url: string): Promise<T> {
  const res = await politeFetch(url);
  if (!res.ok) throw new Error(res.reason);
  return JSON.parse(res.body) as T;
}

const qs = (o: Record<string, string | number>) => new URLSearchParams(Object.entries(o).map(([k, v]) => [k, String(v)])).toString();

export const MUSEUMS: Museum[] = [
  {
    key: "met_museum",
    credit: "The Met",
    // v1.1 search returns ids only (Costume Institute = department 8); each object is one more request.
    search: async (q) => {
      const { objectIDs } = await json<{ objectIDs: number[] | null }>(
        `https://collectionapi.metmuseum.org/public/collection/v1.1/search?${qs({ q, hasImages: "true", departmentId: 8, limit: PER_QUERY * 2, offset: 0 })}`,
      );
      const out: Found[] = [];
      for (const id of objectIDs ?? []) {
        if (out.length >= PER_QUERY) break;
        const o = await json<{ title: string; objectName: string; medium: string; objectDate: string; isPublicDomain: boolean; primaryImageSmall: string; objectURL: string }>(
          `https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`,
        ).catch(() => null);
        if (!o?.isPublicDomain || !o.primaryImageSmall) continue;
        out.push({ id: String(id), title: o.title || o.objectName, text: `${o.objectName} ${o.medium}`, date: o.objectDate || null, image: o.primaryImageSmall, link: o.objectURL });
      }
      return out;
    },
  },
  {
    key: "vam_museum",
    credit: "V&A",
    search: async (q) => {
      const { records } = await json<{
        records: { systemNumber: string; objectType: string; _primaryTitle: string; _primaryDate: string; _images?: { _iiif_image_base_url?: string } }[];
      }>(`https://api.vam.ac.uk/v2/objects/search?${qs({ q, images_exist: 1, page_size: PER_QUERY })}`);
      return records.map((r) => ({
        id: r.systemNumber,
        title: r._primaryTitle || r.objectType,
        text: r.objectType,
        date: r._primaryDate || null,
        image: r._images?._iiif_image_base_url ? `${r._images._iiif_image_base_url}full/!600,600/0/default.jpg` : null,
        link: `https://collections.vam.ac.uk/item/${r.systemNumber}/`,
      }));
    },
  },
  {
    key: "art_institute_chicago",
    credit: "Art Institute of Chicago",
    search: async (q) => {
      const { data } = await json<{ data: { id: number; title: string; image_id: string | null; medium_display: string | null; date_display: string | null }[] }>(
        `https://api.artic.edu/api/v1/artworks/search?${qs({
          q,
          limit: PER_QUERY,
          fields: "id,title,image_id,medium_display,date_display",
          "query[bool][must][][term][is_public_domain]": "true",
          "query[bool][must][][term][department_title.keyword]": "Textiles",
        })}`,
      );
      return data.map((a) => ({
        id: String(a.id),
        title: a.title,
        text: a.medium_display ?? "",
        date: a.date_display,
        image: a.image_id ? `https://www.artic.edu/iiif/2/${a.image_id}/full/600,/0/default.jpg` : null,
        link: `https://www.artic.edu/artworks/${a.id}`,
      }));
    },
  },
  {
    key: "cleveland_museum",
    credit: "Cleveland Museum of Art",
    search: async (q) => {
      const { data } = await json<{ data: { id: number; title: string; technique: string | null; type: string | null; creation_date: string | null; url: string; images?: { web?: { url: string } } }[] }>(
        `https://openaccess-api.clevelandart.org/api/artworks/?${qs({ q, limit: PER_QUERY, has_image: 1, cc0: 1, department: "Textiles" })}`,
      );
      return data.map((a) => ({
        id: String(a.id),
        title: a.title,
        text: `${a.type ?? ""} ${a.technique ?? ""}`,
        date: a.creation_date,
        image: a.images?.web?.url ?? null,
        link: a.url,
      }));
    },
  },
  {
    key: "europeana",
    credit: "Europeana",
    // api2demo is Europeana's public demo key, meant for exactly this kind of light use.
    search: async (q) => {
      const { items } = await json<{ items?: { id: string; title?: string[]; dcDescription?: string[]; year?: string[]; edmPreview?: string[]; guid: string; dataProvider?: string[] }[] }>(
        `https://api.europeana.eu/record/v2/search.json?${qs({ wskey: "api2demo", query: q, rows: PER_QUERY, qf: "TYPE:IMAGE", reusability: "open", media: "true", theme: "fashion" })}`,
      );
      return (items ?? []).map((i) => ({
        id: i.id,
        title: i.title?.[0] ?? q,
        text: i.dcDescription?.[0]?.slice(0, 300) ?? "",
        date: i.year?.[0] ?? null,
        image: i.edmPreview?.[0] ?? null,
        link: i.guid.split("?")[0],
      }));
    },
  },
  {
    key: "smithsonian",
    credit: "Smithsonian",
    // DEMO_KEY is api.data.gov's shared no-signup key (low hourly limit, enough for one run).
    search: async (q) => {
      type Row = {
        id: string;
        title: string;
        content?: {
          descriptiveNonRepeating?: { record_link?: string; online_media?: { media?: { thumbnail?: string; content?: string }[] } };
          indexedStructured?: { date?: string[]; object_type?: string[] };
          freetext?: { physicalDescription?: { content: string }[] };
        };
      };
      const { response } = await json<{ response: { rows: Row[] } }>(
        `https://api.si.edu/openaccess/api/v1.0/search?${qs({ q: `${q} AND online_media_type:"Images" AND unit_code:(NMAH OR CHNDM)`, rows: PER_QUERY, api_key: "DEMO_KEY" })}`,
      );
      return response.rows
        .filter((r) => r.content?.descriptiveNonRepeating?.record_link)
        .map((r) => {
          const c = r.content!;
          const media = c.descriptiveNonRepeating?.online_media?.media?.[0];
          return {
            id: r.id,
            title: r.title,
            text: [...(c.indexedStructured?.object_type ?? []), ...(c.freetext?.physicalDescription ?? []).map((p) => p.content)].join(" "),
            date: c.indexedStructured?.date?.[0] ?? null,
            image: media?.thumbnail ?? media?.content ?? null,
            link: c.descriptiveNonRepeating!.record_link!,
          };
        });
    },
  },
];

/** One museum's objects for every query, tagged with Blair's vocabulary; failed queries are reported, not fatal. */
export async function collectMuseum(m: Museum, now = new Date()): Promise<{ rows: TrendRow[]; failed: string[] }> {
  const tag = makeTagger(await loadTaggerVocab());
  const rows = new Map<string, TrendRow>();
  const failed: string[] = [];
  for (const q of MUSEUM_QUERIES) {
    let found: Found[];
    try {
      found = await m.search(q);
    } catch (e) {
      failed.push(`${q} (${e instanceof Error ? e.message : String(e)})`);
      continue;
    }
    for (const f of found) {
      if (!f.image || rows.has(f.id)) continue;
      const t = tag({ title: f.title, description: `${f.text} ${q}` });
      rows.set(f.id, {
        source: m.key,
        source_item_id: f.id,
        brand_id: null,
        type: t.pattern ? "pattern" : "fabric",
        title: `${f.title}${f.date ? `, ${f.date}` : ""} (${m.credit})`,
        category: t.category,
        attributes: {
          ...(t.colors.length ? { colors: t.colors } : {}),
          ...(t.material ? { material: t.material } : {}),
          ...(t.pattern ? { pattern: t.pattern } : {}),
          ...(t.silhouette ? { silhouette: t.silhouette } : {}),
        },
        price: null,
        currency: null,
        image_url: f.image,
        link: f.link,
        metrics: {},
        published_at: null,
        collected_at: now.toISOString(),
      });
    }
  }
  return { rows: [...rows.values()], failed };
}
