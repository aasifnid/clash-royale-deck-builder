// Static, pro-authored coaching per deck — keyed by deck id. This is what makes the
// tool fully free: the "pro knowledge" is written into the data once, so no LLM call
// is needed at runtime. (An optional AI layer can still enhance it if a key is present.)

import data from "@/data/deck-coaching.json";

export interface Coaching {
  gameplan: string;
  counters: string;
  playTips: string;
}

const MAP = data as Record<string, Coaching>;

export function coachingFor(deckId: string): Coaching | undefined {
  return MAP[deckId];
}
