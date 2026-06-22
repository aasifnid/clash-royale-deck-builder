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
  return byId.get(id)?.number ?? null;
}

export function arenaNameFor(id: number | null | undefined): string | null {
  if (id == null) return null;
  return byId.get(id)?.name ?? null;
}
