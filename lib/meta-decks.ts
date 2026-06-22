// Converts the pulled top-ladder meta decks (data/meta-decks.json) into the engine's
// ProvenDeck shape, borrowing role + substitute knowledge from the curated library so
// they're adaptable to the player's collection just like curated decks.

import metaData from "@/data/meta-decks.json";
import provenDecks from "@/data/proven-decks.json";
import { cardByKey } from "./cards";
import { winConditionKeyOf } from "./archetypes";
import type { ProvenDeck } from "./types";

interface RawMetaDeck {
  id: string;
  archetype: string;
  usage: number;
  avgElixir: number;
  cards: string[];
}

// cardKey -> {role, substitutes} learned from the curated decks (first occurrence wins),
// and role -> pool of cards that play it, so meta-deck slots get same-role alternates even
// for cards that never appear in the curated library.
const ROLE_MAP = new Map<string, { role: string; substitutes: string[] }>();
const ROLE_POOL = new Map<string, Set<string>>();
for (const d of provenDecks as ProvenDeck[]) {
  for (const s of d.slots) {
    if (!ROLE_MAP.has(s.cardKey)) ROLE_MAP.set(s.cardKey, { role: s.role, substitutes: s.substitutes });
    if (!ROLE_POOL.has(s.role)) ROLE_POOL.set(s.role, new Set());
    const pool = ROLE_POOL.get(s.role)!;
    pool.add(s.cardKey);
    for (const sub of s.substitutes) pool.add(sub);
  }
}

/** Same-role substitutes for a card, from curated knowledge + the role pool (capped). */
function deriveSubstitutes(key: string, role: string, deckCards: string[]): string[] {
  const out = new Set<string>(ROLE_MAP.get(key)?.substitutes ?? []);
  // Win conditions define the deck — don't swap them out for a different one.
  if (role !== "win-condition" && role !== "support") {
    for (const c of ROLE_POOL.get(role) ?? []) out.add(c);
  }
  return [...out].filter((s) => s !== key && !deckCards.includes(s)).slice(0, 4);
}

const ARCHETYPE_SKILL: Record<string, number> = {
  Cycle: 4,
  Siege: 5,
  Beatdown: 3,
  "Bridge Spam": 4,
  Control: 4,
  Bait: 3,
};

export const META_DECKS: ProvenDeck[] = ((metaData as { decks: RawMetaDeck[] }).decks ?? []).map(
  (d) => {
    const wcKey = winConditionKeyOf(d.cards);
    const slots = d.cards.map((key) => {
      const info = ROLE_MAP.get(key);
      const isWC = key === wcKey;
      const role = isWC ? "win-condition" : info && info.role !== "win-condition" ? info.role : "support";
      return {
        cardKey: key,
        role,
        substitutes: deriveSubstitutes(key, role, d.cards),
      };
    });
    const wcName = wcKey ? (cardByKey(wcKey)?.name ?? wcKey) : d.archetype;
    return {
      id: d.id,
      name: `${wcName} (meta)`,
      archetype: d.archetype,
      winCondition: wcName,
      skillFloor: ARCHETYPE_SKILL[d.archetype] ?? 3,
      minArena: 0, // top-ladder decks; viability handled by ownership/level
      slots,
      notes: `Run by ${d.usage} of the sampled top-ladder players this season.`,
      source: "meta",
      usage: d.usage,
    } satisfies ProvenDeck;
  },
);
