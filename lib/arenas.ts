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

// End-game / themed arenas the API reports by name rather than as "Arena N". The player endpoint
// returns the themed name (e.g. "Lumberlove Cabin"), and new arenas ship faster than the bundled
// id table updates, so we map the known themed names to their in-game number here. Add new
// arenas to this table as they release. Kept at/above the top numbered arena so the viability
// gate treats these players as having everything unlocked.
const NAMED_ARENA_NUMBER: Record<string, number> = {
  "legendary arena": 23,
  "ultimate champion": 24,
  "lumberlove cabin": 25,
};

/** In-game arena number parsed from the arena NAME the player API returns. Numbered arenas come
 *  through as "Arena 15", so the number is read straight from the name — this resolves arenas
 *  whose internal id isn't in our bundled table (e.g. a new arena added in a season update).
 *  Named end-game tiers ("Legendary Arena", "Ultimate Champion") map via a small table. */
export function arenaNumberByName(name: string | null | undefined): number | null {
  if (!name) return null;
  const m = name.match(/arena\s+(\d+)/i);
  if (m) return Number(m[1]);
  return NAMED_ARENA_NUMBER[name.trim().toLowerCase()] ?? null;
}
