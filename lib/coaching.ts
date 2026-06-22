// Static, pro-authored coaching per deck — keyed by deck id. This is what makes the
// tool fully free: the "pro knowledge" is written into the data once, so no LLM call
// is needed at runtime. (An optional AI layer can still enhance it if a key is present.)

import data from "@/data/deck-coaching.json";
import provenDecks from "@/data/proven-decks.json";
import type { ProvenDeck } from "./types";

export interface Coaching {
  gameplan: string;
  counters: string;
  playTips: string;
}

const MAP = data as Record<string, Coaching>;

// A representative curated deck id per archetype, so meta decks (no exact coaching entry)
// can fall back to archetype-appropriate advice.
const ARCHETYPE_REP: Record<string, string> = {};
for (const d of provenDecks as ProvenDeck[]) {
  if (!ARCHETYPE_REP[d.archetype] && MAP[d.id]) ARCHETYPE_REP[d.archetype] = d.id;
}

/** Coaching for a deck — exact entry if curated, else archetype-appropriate fallback. */
export function coachingForDeck(deckId: string, archetype: string): Coaching | undefined {
  return MAP[deckId] ?? MAP[ARCHETYPE_REP[archetype]];
}
