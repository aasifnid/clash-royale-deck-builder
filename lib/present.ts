// Shared presentation layer: turns a scored DeckCandidate into the client-facing shapes (the
// flattened 8-card list with evolution/hero slots, and the free coaching pick). Used by both
// /api/generate (library recommendations) and /api/build (focal-card builder) so a built deck
// renders and coaches identically to a recommended one.

import type { DeckCandidate } from "./fieldability";
import type { CoachPick } from "./coach";
import { coachingForDeck } from "./coaching";
import { cardByKey } from "./cards";

export function difficultyFor(skillFloor: number): CoachPick["difficulty"] {
  if (skillFloor <= 2) return "Easy";
  if (skillFloor >= 4) return "Hard";
  return "Medium";
}

/** A one-line, personalized "why this deck for you" using the player's real state. */
export function personalizedSummary(cand: DeckCandidate): string {
  const wc = cand.slots.find((s) => s.role === "win-condition" && !s.isMissing) ?? cand.slots.find((s) => !s.isMissing);
  const wcNote = wc ? ` Win condition ${cardByKey(wc.chosenKey!)?.name ?? wc.canonicalKey} is at level ${wc.level}.` : "";

  if (!cand.fieldable) {
    const missing = cand.missingRoles.map((k) => cardByKey(k)?.name ?? k);
    return `Closest ${cand.deck.archetype} deck to what you own — you're missing ${missing.join(", ")}.`;
  }
  if (cand.substitutions.length > 0) {
    return `A ${cand.deck.archetype} deck you can field, using ${cand.substitutions.length} substitute(s) for cards you don't own.${wcNote}`;
  }
  return `You own all 8 cards for this ${cand.deck.archetype} deck.${wcNote}`;
}

/** The free (non-LLM) coaching pick for a single candidate, drawn from the deck library's
 *  hand-authored + generated game plan. */
export function coachPickFor(cand: DeckCandidate): CoachPick {
  const deckCards = cand.slots
    .filter((s) => s.chosenKey)
    .map((s) => {
      const card = cardByKey(s.chosenKey!);
      return { name: card?.name ?? s.chosenKey!, type: card?.type ?? "Troop", role: s.role, elixir: card?.elixir };
    });
  const c = coachingForDeck(cand.deck, deckCards);
  return {
    deckId: cand.deck.id,
    summary: personalizedSummary(cand),
    gameplan: c.gameplan,
    winCondition: cand.deck.winCondition,
    counters: c.counters,
    playTips: c.playTips,
    difficulty: difficultyFor(cand.deck.skillFloor),
  };
}

/** Flatten a candidate into the resolved 8-card list (with levels) for the client, plus explicit
 *  Evolution-slot (2) and Hero/Champion-slot recommendations. */
export function enrichCandidate(cand: DeckCandidate) {
  const evoKeys = new Set(cand.evolutionSlotKeys);
  const heroKeys = new Set(cand.heroSlotKeys);

  return {
    deckId: cand.deck.id,
    name: cand.deck.name,
    archetype: cand.deck.archetype,
    winCondition: cand.deck.winCondition,
    skillFloor: cand.deck.skillFloor,
    avgElixir: cand.avgElixir,
    fieldable: cand.fieldable,
    competitiveLevel: cand.competitiveLevel,
    weakCards: cand.weakCards,
    source: cand.deck.source ?? "curated",
    usage: cand.deck.usage ?? 0,
    winRate: cand.deck.winRate ?? null,
    scores: cand.scores,
    substitutions: cand.substitutions,
    missingRoles: cand.missingRoles,
    powerCards: cand.powerCards,
    evolutionSlots: cand.evolutionSlots,
    heroSlots: cand.heroSlots,
    extras: cand.extras,
    cards: cand.slots.map((s) => {
      const need = s.isMissing ? cardByKey(s.canonicalKey) : null;
      return {
        role: s.role,
        key: s.chosenKey ?? need?.key ?? null,
        name: s.chosenKey ? (cardByKey(s.chosenKey)?.name ?? s.chosenKey) : (need?.name ?? s.canonicalKey),
        level: s.level,
        isSubstitute: s.isSubstitute,
        isMissing: s.isMissing,
        underLeveled: s.weak,
        evolved: s.chosenKey ? evoKeys.has(s.chosenKey) : false,
        hero: s.chosenKey ? heroKeys.has(s.chosenKey) : false,
      };
    }),
  };
}
