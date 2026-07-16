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

/** Lowercase, strip punctuation, and drop a trailing "arena" word so every spelling variant of
 *  a themed name collapses to one key: straight vs curly apostrophe ("Little Prince's Tavern"),
 *  dotted acronyms ("P.E.K.K.A's Playhouse"), and optional "Arena" suffix ("Royal Arena" /
 *  "Royal", "Bone Pit" / "Bone Pit Arena"). */
function normalizeArenaName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s*arena$/, "")
    .trim();
}

// The player API reports the arena by its THEMED name ("Miner's Mind"), not "Arena N", so this
// table is the authoritative name->number map for the whole trophy road. It also future-proofs
// against the bundled id table lagging behind a season update (new arenas appear here before
// their internal id is known). Add new arenas as they release (current top: Spirit Square = 32).
const NAMED_ARENA_NUMBER: Record<string, number> = Object.fromEntries(
  Object.entries({
    "Goblin Stadium": 1,
    "Bone Pit": 2,
    "Barbarian Bowl": 3,
    "Spell Valley": 4,
    "Builder's Workshop": 5,
    "P.E.K.K.A's Playhouse": 6,
    "Royal Arena": 7,
    "Frozen Peak": 8,
    "Jungle Arena": 9,
    "Hog Mountain": 10,
    "Electro Valley": 11,
    "Spooky Town": 12,
    "Rascal's Hideout": 13,
    "Serenity Peak": 14,
    "Miner's Mind": 15,
    "Executioner's Kitchen": 16,
    "Royal Crypt": 17,
    "Silent Sanctuary": 18,
    "Dragon Spa": 19,
    "Boot Camp": 20,
    "Clash Fest": 21,
    "Pancakes": 22,
    "Wildcalla": 23,
    "Legendary Arena": 24,
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
