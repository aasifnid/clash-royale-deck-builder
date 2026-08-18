// Archetype classification + a coarse matchup model. Used to read the meta from a
// player's battle log and to score how well a candidate deck answers what beats them.

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

// Coarse attacker-vs-defender advantage (0.5 = even, >0.5 favors the attacker/row).
// Heuristic generalizations of common Clash Royale archetype dynamics — used as a nudge,
// not gospel.
const MATCHUP: Record<Archetype, Record<Archetype, number>> = {
  Beatdown:      { Beatdown: 0.5, Cycle: 0.45, Control: 0.45, "Bridge Spam": 0.55, Siege: 0.6, Bait: 0.5 },
  Cycle:         { Beatdown: 0.55, Cycle: 0.5, Control: 0.5, "Bridge Spam": 0.45, Siege: 0.5, Bait: 0.45 },
  Control:       { Beatdown: 0.55, Cycle: 0.5, Control: 0.5, "Bridge Spam": 0.45, Siege: 0.5, Bait: 0.45 },
  "Bridge Spam": { Beatdown: 0.45, Cycle: 0.55, Control: 0.55, "Bridge Spam": 0.5, Siege: 0.6, Bait: 0.5 },
  Siege:         { Beatdown: 0.55, Cycle: 0.5, Control: 0.5, "Bridge Spam": 0.4, Siege: 0.5, Bait: 0.5 },
  Bait:          { Beatdown: 0.45, Cycle: 0.55, Control: 0.55, "Bridge Spam": 0.5, Siege: 0.5, Bait: 0.5 },
};

/** How well a deck's archetype answers a distribution of threats (archetype -> weight).
 *  Returns 0.5 (neutral) when there's no threat data. */
export function metaFitScore(deckArchetype: string, threats: Record<string, number>): number {
  const entries = Object.entries(threats);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  const row = MATCHUP[deckArchetype as Archetype];
  if (total === 0 || !row) return 0.5;
  let acc = 0;
  for (const [arch, w] of entries) acc += (row[arch as Archetype] ?? 0.5) * w;
  return acc / total;
}
