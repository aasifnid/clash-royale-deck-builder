// Card role taxonomy. Roles are learned from the real decks (curated + their substitutes);
// any card that never appears gets a type-based fallback role. This lets the engine fill a
// deck slot from ANY owned card that can play that role — building a deck from what you own,
// not just matching fixed lists.

import provenDecks from "@/data/proven-decks.json";
import { CARDS } from "./cards";
import type { ProvenDeck } from "./types";

// Cards that can hit air — also used by the coverage check.
export const ANTI_AIR = new Set<string>([
  "musketeer", "archers", "mega-minion", "minions", "minion-horde", "baby-dragon",
  "inferno-dragon", "electro-dragon", "electro-wizard", "wizard", "witch", "mother-witch",
  "firecracker", "dart-goblin", "princess", "hunter", "magic-archer", "executioner", "bats",
  "spear-goblins", "zappies", "phoenix", "flying-machine", "electro-spirit", "ice-wizard",
  "tesla", "inferno-tower", "archer-queen", "skeleton-dragons", "super-archers",
  "arrows", "zap", "lightning", "fireball", "rocket", "giant-snowball", "poison",
]);

const ROLE_OF = new Map<string, Set<string>>();
const add = (key: string, role: string) => {
  if (!ROLE_OF.has(key)) ROLE_OF.set(key, new Set());
  ROLE_OF.get(key)!.add(role);
};

// 1) Learned roles from curated deck slots (canonical + substitutes share the slot's role).
for (const d of provenDecks as ProvenDeck[]) {
  for (const s of d.slots) {
    add(s.cardKey, s.role);
    for (const sub of s.substitutes) add(sub, s.role);
  }
}

// 2) Type-based fallback for everything else, plus air-defense tagging.
for (const c of CARDS) {
  if (!ROLE_OF.has(c.key)) {
    if (c.type === "Spell") add(c.key, c.elixir <= 3 ? "spell-small" : "spell-big");
    else if (c.type === "Building") add(c.key, "building");
    else add(c.key, "support");
  }
  if (ANTI_AIR.has(c.key)) add(c.key, "air-defense");
}

const ROLE_TO_CARDS = new Map<string, string[]>();
for (const [key, set] of ROLE_OF) {
  for (const role of set) {
    if (!ROLE_TO_CARDS.has(role)) ROLE_TO_CARDS.set(role, []);
    ROLE_TO_CARDS.get(role)!.push(key);
  }
}

/** Card keys that can fill a given role. */
export function cardsWithRole(role: string): string[] {
  return ROLE_TO_CARDS.get(role) ?? [];
}
