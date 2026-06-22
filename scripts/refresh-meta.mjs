// Pulls the CURRENT top-ladder meta: the decks the best Path of Legends players are
// running right now. Aggregates them into data/meta-decks.json so the suggestion engine
// can draw from this season's real meta, not just the curated archetype library.
//
// Run: node scripts/refresh-meta.mjs   (needs CR_API_TOKEN; proxy IP allowlisted)

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "data", "meta-decks.json");
const BASE = "https://proxy.royaleapi.dev/v1";
const TOP_PLAYERS = 80; // how many top players to sample
const KEEP_DECKS = 24; // how many of the most popular decks to keep

const token =
  process.env.CR_API_TOKEN ||
  (readFileSync(join(ROOT, ".env.local"), "utf8").match(/CR_API_TOKEN=(.+)/) || [])[1]?.trim();
if (!token) {
  console.error("Missing CR_API_TOKEN");
  process.exit(1);
}
const H = { headers: { Authorization: `Bearer ${token}` } };
const get = async (p) => {
  const r = await fetch(BASE + p, H);
  if (!r.ok) throw new Error(`${p} -> ${r.status}`);
  return r.json();
};

const cards = JSON.parse(readFileSync(join(ROOT, "data", "cards.json"), "utf8"));
const keyById = new Map(cards.map((c) => [c.id, c.key]));
const elixirByKey = new Map(cards.map((c) => [c.key, c.elixir]));

// Win-condition -> archetype (priority order), mirrors lib/archetypes.ts.
const WIN_CONDITIONS = [
  ["x-bow", "Siege"], ["mortar", "Siege"],
  ["golem", "Beatdown"], ["lava-hound", "Beatdown"], ["electro-giant", "Beatdown"],
  ["goblin-giant", "Beatdown"], ["elixir-golem", "Beatdown"], ["three-musketeers", "Beatdown"],
  ["sparky", "Beatdown"],
  ["graveyard", "Control"], ["goblin-drill", "Control"], ["miner", "Control"], ["wall-breakers", "Control"],
  ["goblin-barrel", "Bait"], ["mega-knight", "Bait"],
  ["ram-rider", "Bridge Spam"], ["battle-ram", "Bridge Spam"],
  ["royal-giant", "Beatdown"], ["giant", "Beatdown"], ["balloon", "Beatdown"],
  ["hog-rider", "Cycle"], ["royal-hogs", "Cycle"],
];
function classify(keys) {
  const set = new Set(keys);
  for (const [k, a] of WIN_CONDITIONS) if (set.has(k)) return a;
  return "Control";
}

// Find the latest season that actually has rankings.
async function latestSeason() {
  const seasons = (await get("/locations/global/seasons")).items
    .map((s) => s.id)
    .filter((id) => /^\d{4}-\d{2}$/.test(id))
    .sort()
    .reverse();
  for (const id of seasons.slice(0, 4)) {
    try {
      const r = await get(`/locations/global/pathoflegend/${id}/rankings/players?limit=1`);
      if (r.items?.length) return id;
    } catch {}
  }
  throw new Error("No season with rankings found");
}

// Map a concurrency-limited fetch over items.
async function mapLimit(items, limit, fn) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (i < items.length) {
        const idx = i++;
        try {
          out[idx] = await fn(items[idx]);
        } catch {
          out[idx] = null;
        }
      }
    }),
  );
  return out;
}

const season = await latestSeason();
console.log("Using season:", season);
const ranking = await get(`/locations/global/pathoflegend/${season}/rankings/players?limit=${TOP_PLAYERS}`);
const tags = ranking.items.map((p) => p.tag.replace("#", ""));
console.log("Top players:", tags.length);

const players = await mapLimit(tags, 8, (tag) => get(`/players/%23${tag}`));

// Aggregate current decks by their card-set.
const decks = new Map(); // signature -> { keys, count }
for (const p of players) {
  if (!p?.currentDeck || p.currentDeck.length !== 8) continue;
  const keys = p.currentDeck.map((c) => keyById.get(c.id)).filter(Boolean);
  if (keys.length !== 8) continue;
  const sig = [...keys].sort().join(",");
  const entry = decks.get(sig) ?? { keys, count: 0 };
  entry.count++;
  decks.set(sig, entry);
}

const ranked = [...decks.values()]
  .sort((a, b) => b.count - a.count)
  .slice(0, KEEP_DECKS)
  .map((d, i) => {
    const ordered = [...d.keys].sort((a, b) => (elixirByKey.get(a) ?? 0) - (elixirByKey.get(b) ?? 0));
    const avg = ordered.reduce((s, k) => s + (elixirByKey.get(k) ?? 0), 0) / 8;
    return {
      id: `meta-${i + 1}`,
      archetype: classify(ordered),
      usage: d.count,
      avgElixir: Math.round(avg * 10) / 10,
      cards: ordered,
    };
  });

writeFileSync(OUT, JSON.stringify({ season, refreshedFromTop: tags.length, decks: ranked }, null, 2) + "\n");
console.log(`Wrote ${ranked.length} meta decks (from ${tags.length} top players) to ${OUT}`);
console.log("Top 5:", ranked.slice(0, 5).map((d) => `${d.archetype} x${d.usage}`).join(", "));
