// Arena lookup. The official API returns an internal arena id (e.g. 54000020); this maps
// it to the in-game arena number ("Arena 23") and name.

import arenaData from "@/data/arenas.json";

interface ArenaInfo {
  id: number;
  number: number;
  name: string;
}

const byId = new Map<number, ArenaInfo>((arenaData as ArenaInfo[]).map((a) => [a.id, a]));

/** In-game arena number for an internal arena id, or null if unknown. */
export function arenaNumberFor(id: number | null | undefined): number | null {
  if (id == null) return null;
  const n = byId.get(id)?.number;
  // Only real ladder arenas carry a number; 0 marks event/legacy tiers, treat as unknown.
  return n && n > 0 ? n : null;
}

export function arenaNameFor(id: number | null | undefined): string | null {
  if (id == null) return null;
  return byId.get(id)?.name ?? null;
}

/** Lowercase and strip punctuation/spacing so "Little Prince's Tavern" (straight OR curly
 *  apostrophe) matches its table key. */
function normalizeArenaName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Themed arenas the API reports by name rather than as "Arena N". The player endpoint returns
// the themed name (e.g. "Lumberlove Cabin"), and new arenas ship faster than the bundled id
// table updates, so we map the known themed names to their in-game number here. Kept at/above
// the top numbered arena so the viability gate treats these players as having everything
// unlocked. Add new arenas here as they release (numbered current top: Spirit Square = 32).
const NAMED_ARENA_NUMBER: Record<string, number> = Object.fromEntries(
  Object.entries({
    "Legendary Arena": 23,
    "Ultimate Champion": 24,
    "Lumberlove Cabin": 25,
    "Royal Road": 26,
    "Musketeer Street": 27,
    "Summit of Heroes": 28,
    "Magic Academy": 29,
    "Ultimate Clash Pit": 30,
    "Little Prince's Tavern": 31,
    "Spirit Square": 32,
  }).map(([k, v]) => [normalizeArenaName(k), v]),
);

/** In-game arena number parsed from the arena NAME the player API returns. Numbered arenas come
 *  through as "Arena 15", so the number is read straight from the name — this resolves arenas
 *  whose internal id isn't in our bundled table (e.g. a new arena added in a season update).
 *  Themed tiers ("Lumberlove Cabin", "Spirit Square", ...) map via the table above. */
export function arenaNumberByName(name: string | null | undefined): number | null {
  if (!name) return null;
  const m = name.match(/arena\s+(\d+)/i);
  if (m) return Number(m[1]);
  return NAMED_ARENA_NUMBER[normalizeArenaName(name)] ?? null;
}
