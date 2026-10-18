// Archetype classification + a matchup model measured from top-ladder battle logs. Used to read
// the meta from a player's battle log and to score how well a candidate deck answers what beats them.

import metaData from "@/data/meta-decks.json";
import { cardById } from "./cards";

export type Archetype = "Beatdown" | "Cycle" | "Control" | "Bridge Spam" | "Siege" | "Bait";

// Win-condition card -> archetype, in priority order (most defining first). A deck is
// classified by the first win condition found in it.
const WIN_CONDITIONS: [string, Archetype][] = [
  ["x-bow", "Siege"],
  ["mortar", "Siege"],
  ["golem", "Beatdown"],
  ["lava-hound", "Beatdown"],
  ["electro-giant", "Beatdown"],
  ["goblin-giant", "Beatdown"],
  ["elixir-golem", "Beatdown"],
  ["three-musketeers", "Beatdown"],
  ["sparky", "Beatdown"],
  ["graveyard", "Control"],
  ["goblin-drill", "Control"],
  ["miner", "Control"],
  ["wall-breakers", "Control"],
  ["goblin-barrel", "Bait"],
  ["mega-knight", "Bait"],
  // Ronin (legendary, added Jul 2026) is a dashing bridge-spam win condition. Kept in the
  // Bridge Spam group and BELOW goblin-barrel/mega-knight on purpose: a deck built around
  // Ronin classifies as Bridge Spam, but a Log Bait deck that merely splashes Ronin still
  // classifies by its real win condition. NOTE: keep this list in sync with the copy in
  // scripts/refresh-meta.mjs.
  ["ronin", "Bridge Spam"],
  ["ram-rider", "Bridge Spam"],
  ["battle-ram", "Bridge Spam"],
  ["royal-giant", "Beatdown"],
  ["giant", "Beatdown"],
  ["balloon", "Beatdown"],
  ["hog-rider", "Cycle"],
  ["royal-hogs", "Cycle"],
  // Aggressive bridge win conditions the Aug 2026 pass pushed into the meta. Kept LAST = lowest
  // priority: only chosen when no stronger win condition is present, so a Hog/Miner deck that
  // merely splashes Elite Barbarians still classifies by its real win condition. Recognising them
  // fixes the Control-fallback misclassification and lets them anchor a build.
  ["elite-barbarians", "Bridge Spam"],
  ["rune-giant", "Bridge Spam"],
  // Sep 2026 pass gap (meta-check): decks anchored on ranged DPS/swarm chip damage rather than a
  // tank or building, previously misclassified as the Control fallback. Kept LAST = lowest
  // priority, same as the pair above. NOTE: keep in sync with scripts/meta-cluster.mjs.
  ["musketeer", "Control"],
  ["rascals", "Bait"],
  // Goblinstein (new Champion, Sep 2026 pass): already appears alongside Mortar/Graveyard/Royal
  // Hogs where those anchors classify the deck, but 3 emerging builds pair it only with
  // defensive buildings + a big spell + chip damage (no other recognized win condition) — a
  // grind-and-counter-push Control shape. KEEP IN SYNC with scripts/meta-cluster.mjs.
  ["goblinstein", "Control"],
  // Minion Giant (Oct 2026 meta-check): the shared anchor of 3 top-ladder decks that fell back to
  // Control (cheap defensive cores + Tesla/Goblin Hut + Lightning). The meta-check suggested
  // Tesla/Mighty Miner/Archer Queen only because it picks each deck's highest-elixir card; Minion
  // Giant is the one card all three share. Lowest priority so Rune Giant decks that run it stay
  // Bridge Spam. KEEP IN SYNC with scripts/meta-cluster.mjs.
  ["minion-giant", "Control"],
];

/** Classify a deck (by card ids) into an archetype, or null if no known win condition. */
export function classifyDeck(cardIds: number[]): Archetype | null {
  const keys = new Set(cardIds.map((id) => cardById(id)?.key).filter(Boolean));
  for (const [key, arch] of WIN_CONDITIONS) if (keys.has(key)) return arch;
  return null;
}

/** The win-condition card key in a deck (by card keys), or null. */
export function winConditionKeyOf(cardKeys: string[]): string | null {
  const set = new Set(cardKeys);
  for (const [key] of WIN_CONDITIONS) if (set.has(key)) return key;
  return null;
}

/** The archetype a single card defines when it is the win condition, or null if the card is
 *  not a known win condition. Used by the focal-card builder to pick a coherent skeleton. */
export function archetypeForWinCondition(key: string): Archetype | null {
  for (const [k, arch] of WIN_CONDITIONS) if (k === key) return arch;
  return null;
}

// Real archetype-vs-archetype results from the latest top-ladder battle logs (refresh-meta.mjs),
// replacing the old hand-written guess table. matchups[a][b] = { games, wins } from a's side.
const MATCHUPS = (metaData as { matchups?: Record<string, Record<string, { games: number; wins: number }>> }).matchups ?? {};
// Shrink each rate toward 50% by this many virtual games, so a thin sample stays a gentle nudge.
const MATCHUP_PRIOR = 50;

/** Win probability for archetype `a` against archetype `b` at top ladder (0.5 when unknown). */
export function matchupRate(a: string, b: string): number {
  const cell = MATCHUPS[a]?.[b];
  if (!cell) return 0.5;
  return (cell.wins + MATCHUP_PRIOR * 0.5) / (cell.games + MATCHUP_PRIOR);
}

/** How well a deck's archetype answers a distribution of threats (archetype -> weight).
 *  Returns 0.5 (neutral) when there's no threat data. */
export function metaFitScore(deckArchetype: string, threats: Record<string, number>): number {
  const entries = Object.entries(threats);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  if (total === 0) return 0.5;
  let acc = 0;
  for (const [arch, w] of entries) acc += matchupRate(deckArchetype, arch) * w;
  return acc / total;
}
