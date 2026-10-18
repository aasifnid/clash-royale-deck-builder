// Pure, testable helpers for turning raw top-ladder deck samples into the meta-decks.json
// library. No file or network IO here so the logic can be unit-tested (see meta-cluster.test.mjs).
//
// Two ideas live here:
//  1. clusterDecks — an EMERGING card fragments across many 8-card lists, each too rare to pass
//     the usage threshold on its own. We group variants by their CORE (win condition + the couple
//     of highest-elixir non-spell cards that define the build) so those fragments aggregate into
//     one entry whose summed usage clears the bar. The most popular full variant represents it.
//  2. computeMomentum — a card the ladder is newly piling into (e.g. a just-released legendary)
//     at least doubles its usage share vs a baseline snapshot 2+ weeks old. We surface that as a
//     per-deck momentum score so a rising deck ranks up before its raw usage alone would justify it.

// Win-condition card -> archetype, priority order (most defining first). KEEP IN SYNC with the
// copy in lib/archetypes.ts.
export const WIN_CONDITIONS = [
  ["x-bow", "Siege"], ["mortar", "Siege"],
  ["golem", "Beatdown"], ["lava-hound", "Beatdown"], ["electro-giant", "Beatdown"],
  ["goblin-giant", "Beatdown"], ["elixir-golem", "Beatdown"], ["three-musketeers", "Beatdown"],
  ["sparky", "Beatdown"],
  ["graveyard", "Control"], ["goblin-drill", "Control"], ["miner", "Control"], ["wall-breakers", "Control"],
  ["goblin-barrel", "Bait"], ["mega-knight", "Bait"],
  // Ronin bridge-spam win condition (added Jul 2026).
  ["ronin", "Bridge Spam"],
  ["ram-rider", "Bridge Spam"], ["battle-ram", "Bridge Spam"],
  ["royal-giant", "Beatdown"], ["giant", "Beatdown"], ["balloon", "Beatdown"],
  ["hog-rider", "Cycle"], ["royal-hogs", "Cycle"],
  // Aggressive bridge win conditions the Aug 2026 pass pushed into the meta. Kept LAST = lowest
  // priority: only chosen when no stronger win condition is present.
  ["elite-barbarians", "Bridge Spam"], ["rune-giant", "Bridge Spam"],
  // Sep 2026 pass gap (meta-check): ranged DPS/swarm chip-damage anchors, previously
  // misclassified as the Control fallback. KEEP IN SYNC with lib/archetypes.ts.
  ["musketeer", "Control"], ["rascals", "Bait"],
  // Goblinstein (new Champion, Sep 2026 pass): grind-and-counter-push Control shape when it's the
  // only anchor. KEEP IN SYNC with lib/archetypes.ts.
  ["goblinstein", "Control"],
  // Minion Giant (Oct 2026 meta-check): the shared anchor of 3 decks that fell back to Control
  // (cheap defensive cores + Tesla/Hut + Lightning). Lowest priority so Rune Giant decks that run
  // it stay Bridge Spam. KEEP IN SYNC with lib/archetypes.ts.
  ["minion-giant", "Control"],
];

/** Archetype of a deck (by card keys). Falls back to Control when no known win condition. */
export function classify(keys) {
  const set = new Set(keys);
  for (const [k, a] of WIN_CONDITIONS) if (set.has(k)) return a;
  return "Control";
}

/** The win-condition card key in a deck, or null. */
export function winConditionKey(keys) {
  const set = new Set(keys);
  for (const [k] of WIN_CONDITIONS) if (set.has(k)) return k;
  return null;
}

// How many defining cards (beyond the win condition) form a deck's core. Lower = more
// aggressive merging of variants. Two keeps established decks distinct while still collapsing
// the "same win condition + same heavies, different cycle/spell" brews people try around a card.
export const CORE_SIGNATURE_CARDS = 2;

/** A deck's core signature: win condition + its highest-elixir non-spell cards. Cheap cycle
 *  cards and spells (the interchangeable slots) are ignored, so variants that share an identity
 *  collapse to the same core. */
export function coreSignature(keys, { elixirByKey, typeByKey }) {
  const wc = winConditionKey(keys);
  const signature = keys
    .filter((k) => k !== wc && (typeByKey.get(k) ?? "Troop") !== "Spell")
    .sort((a, b) => (elixirByKey.get(b) ?? 0) - (elixirByKey.get(a) ?? 0))
    .slice(0, CORE_SIGNATURE_CARDS)
    .sort();
  return [wc ?? "nowc", ...signature].join("|");
}

/** Aggregate variants keyed by a signature function into { keys(best), count, wins, evo, tower,
 *  members }. `wins` is summed alongside `count` so a battle-log sample's win rate (wins/count)
 *  survives clustering. `members` keeps every exact 8-card variant (with its own games + wins) so
 *  the engine can tell a list top players actually ran from an untested recombination of the core.
 *  Variants without `wins` (e.g. current-deck samples) contribute 0. */
function aggregateBy(variants, keyOf) {
  const groups = new Map();
  for (const v of variants) {
    const sig = keyOf(v.keys);
    if (sig == null) continue;
    const g = groups.get(sig) ?? { count: 0, wins: 0, best: null, evo: new Map(), tower: new Map(), members: [] };
    g.count += v.count;
    g.wins += v.wins ?? 0;
    if (!g.best || v.count > g.best.count) g.best = { keys: v.keys, count: v.count };
    for (const [k, n] of v.evo ?? []) g.evo.set(k, (g.evo.get(k) ?? 0) + n);
    for (const [k, n] of v.tower ?? []) g.tower.set(k, (g.tower.get(k) ?? 0) + n);
    if (v.members) g.members.push(...v.members);
    else g.members.push({ keys: v.keys, count: v.count, wins: v.wins ?? 0 });
    groups.set(sig, g);
  }
  return [...groups.values()].map((g) => ({
    keys: g.best.keys, count: g.count, wins: g.wins, evo: g.evo, tower: g.tower, members: g.members,
  }));
}

/** Cluster exact 8-card variants into cores. Input: [{ keys, count, evo:Map, tower:Map }].
 *  Output: one entry per core, represented by its most popular full variant, with summed usage
 *  and merged evolution / tower-troop tallies.
 *
 *  Two-tier when `minUsage` is given. An EMERGING win condition (e.g. a just-released card the
 *  ladder is experimenting with) fragments across so many builds that no fine CORE clears the
 *  usage bar, so it would silently show nothing. So after fine clustering, any win condition with
 *  no qualifying core but whose builds COLLECTIVELY clear the bar gets one coarse win-condition
 *  level cluster, represented by its single most popular build. Win conditions already carried by
 *  a qualifying core are untouched, so this only rescues the fragmented newcomers. */
export function clusterDecks(variants, ctx, minUsage = 0) {
  const fine = aggregateBy(variants, (keys) => coreSignature(keys, ctx));
  if (!minUsage) return fine;

  const survivors = fine.filter((c) => c.count >= minUsage);
  const representedWc = new Set(survivors.map((c) => winConditionKey(c.keys)).filter(Boolean));

  // Coarse pass: aggregate by win condition, but only for win conditions not already represented.
  const emergingVariants = variants.filter((v) => {
    const wc = winConditionKey(v.keys);
    return wc && !representedWc.has(wc);
  });
  const coarse = aggregateBy(emergingVariants, (keys) => winConditionKey(keys)).filter((c) => c.count >= minUsage);

  return [...survivors, ...coarse];
}

/** Usage-weighted share of ladder decks each card appears in. Input: [{ cards, usage }]. */
export function cardUsageShares(decks) {
  const usage = new Map();
  let total = 0;
  for (const d of decks) {
    for (const k of d.cards) usage.set(k, (usage.get(k) ?? 0) + (d.usage ?? 0));
    total += (d.usage ?? 0) * (d.cards?.length ?? 0);
  }
  const shares = new Map();
  if (total > 0) for (const [k, n] of usage) shares.set(k, n / total);
  return shares;
}

// Rising-card momentum is measured against a BASELINE snapshot at least this many days old. Diffing
// against "whatever ran last" made momentum useless: refreshes days (or minutes) apart show no rise,
// and a missing previous file made every card look brand new, so it fired on all 40 decks at once.
export const MOMENTUM_BASELINE_MIN_DAYS = 14;
// Ignore baselines older than this — comparing across several seasons measures history, not a rise.
export const MOMENTUM_BASELINE_MAX_DAYS = 60;
// A card counts as rising only if it at least DOUBLED its usage share and now holds a meaningful
// share. Calibrated on real snapshots (Sep 22 -> Oct 18 2026): Minion Giant 0.6% -> 1.9%, Bats
// 0.5% -> 1.6%, Little Prince 0.2% -> 1.1% qualify; Fireball 2.9% -> 3.7% (ordinary drift) does not.
const MOMENTUM_MIN_RATIO = 2;
const MOMENTUM_MIN_SHARE = 0.0075;

/** The newest snapshot in `history` ([{ at: ISO date, shares: {card: share} }]) that is between
 *  MOMENTUM_BASELINE_MIN_DAYS and MOMENTUM_BASELINE_MAX_DAYS older than `now`, or null. */
export function pickBaseline(history, now = new Date()) {
  const DAY = 86_400_000;
  const eligible = (history ?? [])
    .map((h) => ({ ...h, age: (now - new Date(h.at)) / DAY }))
    .filter((h) => h.age >= MOMENTUM_BASELINE_MIN_DAYS && h.age <= MOMENTUM_BASELINE_MAX_DAYS)
    .sort((a, b) => a.age - b.age);
  return eligible[0] ?? null;
}

/** Annotate each current deck with a momentum score in [0,1]: how fast its fastest-rising card is
 *  gaining usage share vs the BASELINE shares (a Map or plain object, from pickBaseline), normalized
 *  to the hottest card this refresh. No baseline -> 0 for everything (never a blanket boost). */
export function computeMomentum(currentDecks, baselineShares) {
  const none = () => currentDecks.map((d) => ({ ...d, momentum: 0 }));
  if (!baselineShares) return none();
  const prev = baselineShares instanceof Map ? baselineShares : new Map(Object.entries(baselineShares));
  if (prev.size === 0) return none();
  const cur = cardUsageShares(currentDecks);
  const riseOf = (k) => {
    const now = cur.get(k) ?? 0;
    const was = prev.get(k) ?? 0;
    if (now < MOMENTUM_MIN_SHARE || now < was * MOMENTUM_MIN_RATIO) return 0;
    return now - was;
  };
  const raws = currentDecks.map((d) => Math.max(0, ...d.cards.map(riseOf)));
  const maxRaw = Math.max(0, ...raws);
  if (maxRaw === 0) return none();
  return currentDecks.map((d, i) => ({ ...d, momentum: Math.round((raws[i] / maxRaw) * 1000) / 1000 }));
}

/** Card shares rounded for storage in the momentum history file (drops zero/negligible cards). */
export function compactShares(shares) {
  const out = {};
  for (const [k, v] of [...shares].sort((a, b) => b[1] - a[1])) if (v >= 0.0001) out[k] = Math.round(v * 1e5) / 1e5;
  return out;
}

/** Record one battle into an archetype-vs-archetype tally: matchups[a][b] = { games, wins } from
 *  a's side. Both perspectives are recorded, so a mirror match adds 2 games / 1 win (= 50%). */
export function addMatchup(matchups, a, b, aWon) {
  const row = (matchups[a] ??= {});
  const cell = (row[b] ??= { games: 0, wins: 0 });
  cell.games++;
  if (aWon) cell.wins++;
  const back = ((matchups[b] ??= {})[a] ??= { games: 0, wins: 0 });
  back.games++;
  if (!aWon) back.wins++;
}
