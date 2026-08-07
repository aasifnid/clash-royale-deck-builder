// Pulls the CURRENT top-ladder meta from BATTLE LOGS, the way RoyaleAPI does it: sample the top
// Path of Legends players, read each one's recent competitive battles, and aggregate EVERY deck
// played (the player's and their opponent's) with its win/loss. This gives (a) a far larger sample
// than "one current deck per player" — ~30 battles x 2 decks each — and (b) a real WIN RATE per
// deck, not just popularity. For each deck it also records the evolutions + tower troop actually
// run, and harvests which evo/hero forms exist from what real accounts play. Output -> data/meta-decks.json.
//
// Run: node scripts/refresh-meta.mjs   (needs CR_API_TOKEN; proxy IP allowlisted)

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { clusterDecks, classify, computeMomentum } from "./meta-cluster.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "data", "meta-decks.json");
const BASE = "https://proxy.royaleapi.dev/v1";
const TOP_PLAYERS = 1000; // top-ladder leaderboard sample
const CONCURRENCY = 10;
const MIN_GAMES = 15; // a clustered deck needs at least this many battle instances to count (drop noise)
const KEEP_DECKS = 40;
const WINRATE_PRIOR = 30; // Bayesian shrink: pulls small-sample win rates toward 50% so a lightly-played deck can't fake a high rate
const COMPETITIVE = /pvp|pathoflegend|ranked|ladder/i; // 1v1 competitive battle types only (skip boat/2v2/challenge)

const token =
  process.env.CR_API_TOKEN ||
  (readFileSync(join(ROOT, ".env.local"), "utf8").match(/CR_API_TOKEN=(.+)/) || [])[1]?.trim();
if (!token) {
  console.error("Missing CR_API_TOKEN");
  process.exit(1);
}
const H = { headers: { Authorization: `Bearer ${token}` } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (p, tries = 3) => {
  for (let a = 0; a < tries; a++) {
    const r = await fetch(BASE + p, H);
    if (r.ok) return r.json();
    if ((r.status === 429 || r.status === 503) && a < tries - 1) { await sleep(1000 * (a + 1)); continue; }
    throw new Error(`${p} -> ${r.status}`);
  }
};

const cards = JSON.parse(readFileSync(join(ROOT, "data", "cards.json"), "utf8"));
const keyById = new Map(cards.map((c) => [c.id, c.key]));
const elixirByKey = new Map(cards.map((c) => [c.key, c.elixir]));
const typeByKey = new Map(cards.map((c) => [c.key, c.type]));

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

const logs = await mapLimit(tags, CONCURRENCY, (tag) => get(`/players/%23${tag}/battlelog`));
const ok = logs.filter(Boolean).length;
console.log(`Fetched ${ok}/${tags.length} battle logs`);

// Aggregate every deck played across the sampled competitive battles — both the player's and the
// opponent's — keyed by 8-card set, tallying games (count), wins, evolutions run, and tower troop.
const decks = new Map(); // sig -> { keys, count, wins, evo: Map, tower: Map }
// Which Evolution / Hero forms actually exist, harvested from what real accounts USE in battle
// (evolutionLevel bit 1 = evo, bit 2 = hero). Independent of Supercell's catalog icons — a form
// shows as "available" the moment any real player is seen using it. No hardcoding.
const evoForms = new Set();
const heroForms = new Set();

function record(side, won) {
  const cards = side?.cards;
  if (!Array.isArray(cards) || cards.length !== 8) return;
  const keys = cards.map((c) => keyById.get(c.id)).filter(Boolean);
  if (keys.length !== 8) return;
  const sig = [...keys].sort().join(",");
  const entry = decks.get(sig) ?? { keys, count: 0, wins: 0, evo: new Map(), tower: new Map() };
  entry.count++;
  if (won) entry.wins++;
  for (const c of cards) {
    const k = keyById.get(c.id);
    if (!k) continue;
    const m = c.evolutionLevel ?? 0;
    if (m & 1) { entry.evo.set(k, (entry.evo.get(k) ?? 0) + 1); evoForms.add(k); }
    if (m & 2) heroForms.add(k);
  }
  const support = side.supportCards?.[0];
  if (support) {
    const k = keyById.get(support.id);
    if (k) entry.tower.set(k, (entry.tower.get(k) ?? 0) + 1);
  }
  decks.set(sig, entry);
}

let battlesUsed = 0;
for (const log of logs) {
  if (!Array.isArray(log)) continue;
  for (const b of log) {
    if (!COMPETITIVE.test(b.type ?? "")) continue;
    const me = b.team?.[0];
    const opp = b.opponent?.[0];
    if (!me || !opp || me.cards?.length !== 8 || opp.cards?.length !== 8) continue;
    const mc = me.crowns ?? 0;
    const oc = opp.crowns ?? 0;
    if (mc === oc) continue; // skip draws so win rate stays clean
    battlesUsed++;
    record(me, mc > oc);
    record(opp, oc > mc);
  }
}
console.log(`Aggregated ${battlesUsed} competitive battles into ${decks.size} distinct decks`);

const topByCount = (m, n) =>
  [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([key, count]) => ({ key, count }));

// Cluster exact variants into cores BEFORE the games filter, so an emerging card whose builds
// are each individually rare still clears MIN_GAMES as an aggregated core.
const clustered = clusterDecks([...decks.values()], { elixirByKey, typeByKey }, MIN_GAMES);
const ranked = clustered
  .filter((d) => d.count >= MIN_GAMES)
  .sort((a, b) => b.count - a.count)
  .slice(0, KEEP_DECKS)
  .map((d, i) => {
    const ordered = [...d.keys].sort((a, b) => (elixirByKey.get(a) ?? 0) - (elixirByKey.get(b) ?? 0));
    const avg = ordered.reduce((s, k) => s + (elixirByKey.get(k) ?? 0), 0) / 8;
    // Bayesian-shrunk win rate (percent): pulls small samples toward 50% so popularity, not luck,
    // drives a high rate. e.g. a 3-1 deck won't read 75%.
    const winRate = Math.round(((d.wins + WINRATE_PRIOR * 0.5) / (d.count + WINRATE_PRIOR)) * 1000) / 10;
    return {
      id: `meta-${i + 1}`,
      archetype: classify(ordered),
      usage: d.count, // battle instances (games) this deck was seen in
      wins: d.wins,
      winRate, // percent, Bayesian-shrunk
      avgElixir: Math.round(avg * 10) / 10,
      cards: ordered,
      // The 2 evolutions most commonly run in this deck, and the popular tower troop.
      evolutions: topByCount(d.evo, 2).map((e) => e.key),
      towerTroop: topByCount(d.tower, 1)[0]?.key ?? null,
    };
  });

// Rising-card momentum: diff each card's usage share against the previous snapshot (read BEFORE
// we overwrite it) so a card the ladder is newly piling into surfaces before raw usage alone would.
let previousDecks = [];
try {
  previousDecks = JSON.parse(readFileSync(OUT, "utf8")).decks ?? [];
} catch {
  // no prior snapshot (first run) — momentum falls back to 0 for everything.
}
const withMomentum = computeMomentum(ranked, previousDecks);

writeFileSync(
  OUT,
  JSON.stringify(
    {
      season,
      sampledPlayers: ok,
      sampledBattles: battlesUsed,
      minGames: MIN_GAMES,
      // Forms real accounts USE → "this card has an evo/hero available", catalog or not.
      availableForms: { evolutions: [...evoForms].sort(), heroes: [...heroForms].sort() },
      decks: withMomentum,
    },
    null,
    2,
  ) + "\n",
);
console.log(`Wrote ${withMomentum.length} meta decks (clustered, games >= ${MIN_GAMES}) to ${OUT}`);
console.log("Top 8 by usage:", withMomentum.slice(0, 8).map((d) => `${d.archetype} ${d.usage}g/${d.winRate}%`).join(", "));
const byWin = [...withMomentum].filter((d) => d.usage >= MIN_GAMES * 2).sort((a, b) => b.winRate - a.winRate).slice(0, 5);
console.log("Highest win rate:", byWin.map((d) => `${d.archetype} ${d.winRate}% (${d.usage}g)`).join(", "));
const rising = withMomentum.filter((d) => d.momentum > 0).sort((a, b) => b.momentum - a.momentum).slice(0, 3);
if (rising.length) console.log("Rising:", rising.map((d) => `${d.archetype} (m=${d.momentum})`).join(", "));
