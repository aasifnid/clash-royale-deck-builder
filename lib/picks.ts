// Which ranked decks to show as the top picks. Shared by /api/generate and the engine tests.

import type { DeckCandidate } from "./fieldability";

export const MAX_PICKS = 3;
// Picks must be genuinely different decks: each shares at most this many cards with every other
// pick. Distinct win conditions alone weren't enough - three picks once shared the same five
// high-level support cards and differed only in the win condition.
export const MAX_SHARED_CARDS = 4;

const keysOf = (c: DeckCandidate) => c.slots.map((s) => s.chosenKey).filter((k): k is string => Boolean(k));
const shared = (a: DeckCandidate, b: DeckCandidate) => {
  const set = new Set(keysOf(a));
  return keysOf(b).filter((k) => set.has(k)).length;
};

/** The decks to show. Prefers fully-fieldable decks, then takes the
 *  best decks that differ from every earlier pick by win condition AND by at least four cards. */
export function diversePicks(ranked: DeckCandidate[]): DeckCandidate[] {
  const fieldable = ranked.filter((c) => c.fieldable);
  const pool = fieldable.length > 0 ? fieldable : ranked;

  const chosen: DeckCandidate[] = [];
  // Strict pass first, then relax step by step only if the pool can't supply three distinct decks.
  const passes: ((c: DeckCandidate) => boolean)[] = [
    (c) => chosen.every((p) => p.deck.winCondition !== c.deck.winCondition && shared(p, c) <= MAX_SHARED_CARDS),
    (c) => chosen.every((p) => shared(p, c) <= MAX_SHARED_CARDS),
    (c) => chosen.every((p) => shared(p, c) < 8),
  ];
  for (const ok of passes) {
    for (const cand of pool) {
      if (chosen.length >= MAX_PICKS) break;
      if (!chosen.includes(cand) && ok(cand)) chosen.push(cand);
    }
  }

  return chosen;
}
