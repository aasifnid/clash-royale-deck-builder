// Pulls the CURRENT top-ladder meta: the decks the best Path of Legends players are running
// right now. Samples a LARGE set of top players (so usage counts are meaningful, not noise),
// aggregates decks by their 8-card set, and for each popular deck records the evolutions and
// tower troop those top players actually run. Output -> data/meta-decks.json.
//
// Run: node scripts/refresh-meta.mjs   (needs CR_API_TOKEN; proxy IP allowlisted)

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "data", "meta-decks.json");
const BASE = "https://proxy.royaleapi.dev/v1";
const TOP_PLAYERS = 1000; // sample size — the whole top-ladder leaderboard
const CONCURRENCY = 12;
const MIN_USAGE = 4; // keep only decks run by at least this many top players (drop noise/brews)
const KEEP_DECKS = 40;

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
console.log("Top players on leaderboard:", tags.length);

const players = await mapLimit(tags, CONCURRENCY, (tag) => get(`/players/%23${tag}`));
const ok = players.filter(Boolean).length;
console.log(`Fetched ${ok}/${tags.length} player profiles`);

// Aggregate current decks by their 8-card set. For each deck also tally which cards players
// run as evolutions (evolutionLevel > 0) and which tower troop they bring.
const decks = new Map(); // sig -> { keys, count, evo: Map<key,count>, tower: Map<key,count> }
for (const p of players) {
  if (!p?.currentDeck || p.currentDeck.length !== 8) continue;
  const keys = p.currentDeck.map((c) => keyById.get(c.id)).filter(Boolean);
  if (keys.length !== 8) continue;
  const sig = [...keys].sort().join(",");
  const entry = decks.get(sig) ?? { keys, count: 0, evo: new Map(), tower: new Map() };
  entry.count++;
  for (const c of p.currentDeck) {
    if ((c.evolutionLevel ?? 0) > 0) {
      const k = keyById.get(c.id);
      if (k) entry.evo.set(k, (entry.evo.get(k) ?? 0) + 1);
    }
  }
  const support = p.currentDeckSupportCards?.[0];
  if (support) {
    const k = keyById.get(support.id);
    if (k) entry.tower.set(k, (entry.tower.get(k) ?? 0) + 1);
  }
  decks.set(sig, entry);
}

const topByCount = (m, n) =>
  [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([key, count]) => ({ key, count }));

const ranked = [...decks.values()]
  .filter((d) => d.count >= MIN_USAGE)
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
      // The 2 evolutions top players most commonly run in this deck, and the popular tower troop.
      evolutions: topByCount(d.evo, 2).map((e) => e.key),
      towerTroop: topByCount(d.tower, 1)[0]?.key ?? null,
    };
  });

writeFileSync(
  OUT,
  JSON.stringify({ season, sampledPlayers: ok, minUsage: MIN_USAGE, decks: ranked }, null, 2) + "\n",
);
console.log(`Wrote ${ranked.length} meta decks (usage >= ${MIN_USAGE}) to ${OUT}`);
console.log("Top 8:", ranked.slice(0, 8).map((d) => `${d.archetype} x${d.usage}`).join(", "));
