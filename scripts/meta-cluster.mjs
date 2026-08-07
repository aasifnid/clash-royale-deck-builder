// Pure, testable helpers for turning raw top-ladder deck samples into the meta-decks.json
// library. No file or network IO here so the logic can be unit-tested (see meta-cluster.test.mjs).
//
// Two ideas live here:
//  1. clusterDecks — an EMERGING card fragments across many 8-card lists, each too rare to pass
//     the usage threshold on its own. We group variants by their CORE (win condition + the couple
//     of highest-elixir non-spell cards that define the build) so those fragments aggregate into
//     one entry whose summed usage clears the bar. The most popular full variant represents it.
//  2. computeMomentum — a card the ladder is newly piling into (e.g. a just-released legendary)
//     shows a positive usage-share delta vs the previous snapshot. We surface that as a per-deck
//     momentum score so a rising deck ranks up before its raw usage alone would justify it.

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

/** Aggregate variants keyed by a signature function into { keys(best), count, wins, evo, tower }.
 *  `wins` is summed alongside `count` so a battle-log sample's win rate (wins/count) survives
 *  clustering. Variants without `wins` (e.g. current-deck samples) contribute 0. */
function aggregateBy(variants, keyOf) {
  const groups = new Map();
  for (const v of variants) {
    const sig = keyOf(v.keys);
    if (sig == null) continue;
    const g = groups.get(sig) ?? { count: 0, wins: 0, best: null, evo: new Map(), tower: new Map() };
    g.count += v.count;
    g.wins += v.wins ?? 0;
    if (!g.best || v.count > g.best.count) g.best = { keys: v.keys, count: v.count };
    for (const [k, n] of v.evo ?? []) g.evo.set(k, (g.evo.get(k) ?? 0) + n);
    for (const [k, n] of v.tower ?? []) g.tower.set(k, (g.tower.get(k) ?? 0) + n);
    groups.set(sig, g);
  }
  return [...groups.values()].map((g) => ({ keys: g.best.keys, count: g.count, wins: g.wins, evo: g.evo, tower: g.tower }));
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

// A rising card must gain at least this much usage share vs last snapshot before momentum counts.
// Below it, movement is treated as noise and momentum is 0 (so a quiet month doesn't amplify jitter).
const MOMENTUM_MIN_DELTA = 0.01;

/** Annotate each current deck with a momentum score in [0,1]: how fast its fastest-rising card
 *  is gaining usage share vs the previous snapshot, normalized to the hottest card this refresh.
 *  A brand-new card (absent last snapshot) rises from 0, so decks built around it score high. */
export function computeMomentum(currentDecks, previousDecks) {
  const cur = cardUsageShares(currentDecks);
  const prev = cardUsageShares(previousDecks ?? []);
  const rawOf = (d) => {
    let m = 0;
    for (const k of d.cards) {
      const delta = (cur.get(k) ?? 0) - (prev.get(k) ?? 0);
      if (delta > m) m = delta;
    }
    return m;
  };
  const raws = currentDecks.map(rawOf);
  const maxRaw = Math.max(0, ...raws);
  const meaningful = maxRaw >= MOMENTUM_MIN_DELTA;
  return currentDecks.map((d, i) => ({
    ...d,
    momentum: meaningful ? Math.round((raws[i] / maxRaw) * 1000) / 1000 : 0,
  }));
}
