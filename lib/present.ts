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

const nameOf = (key: string) => cardByKey(key)?.name ?? key;

/** What the shown 8 cards really are, for the deck title and badge: the exact list top players ran,
 *  one card off it, or the player's own version of a top-player core. Curated decks keep their name. */
export function listKind(cand: DeckCandidate): "real" | "close" | "yours" | "curated" {
  if (cand.deck.source !== "meta") return "curated";
  if (cand.evidence.kind === "exact") return "real";
  if (cand.evidence.kind === "close") return "close";
  return "yours";
}

export function displayName(cand: DeckCandidate): string {
  const kind = listKind(cand);
  if (cand.deck.id === "deck-check") {
    // Deck Check grades the player's own deck: say what it is, not what it was built from.
    if (kind === "real") return "Your deck · a top-player list";
    if (kind === "close") return "Your deck · 1 card off a top-player list";
    return "Your deck";
  }
  const wc = cand.deck.winCondition;
  if (kind === "real") return `${wc} · top-player list`;
  if (kind === "close") return `${wc} · 1 card off a top-player list`;
  if (kind === "yours") return `${wc} · your version of a top-player deck`;
  return cand.deck.name;
}

/** A short, personalized "why this deck for you" from the player's real state. It names every swap
 *  and its reason, and never claims a record the shown 8 cards don't have. */
export function personalizedSummary(cand: DeckCandidate): string {
  if (!cand.fieldable) {
    const missing = cand.missingRoles.map(nameOf);
    return `Closest ${cand.deck.archetype} deck to what you own. You're missing ${missing.join(", ")}.`;
  }
  const parts: string[] = [];
  const ev = cand.evidence;
  if (ev.kind === "exact") parts.push(`Top players ran these exact 8 cards across ${ev.games} sampled games.`);
  else if (ev.kind === "close") parts.push("One card off a list top players ran.");
  else if (cand.deck.source === "meta") parts.push("Top players haven't run these exact 8, so treat its win rate as an estimate.");

  const by = (r: string) => cand.substitutions.filter((s) => s.reason === r);
  const pairs = (list: typeof cand.substitutions) => list.map((s) => `${nameOf(s.from)} → ${nameOf(s.to)}`).join(", ");
  if (by("upgrade").length) parts.push(`Swapped for your higher-level cards: ${pairs(by("upgrade"))}.`);
  if (by("underleveled").length) parts.push(`Replaced under-leveled cards: ${pairs(by("underleveled"))}.`);
  if (by("missing").length) parts.push(`Filled cards you don't own: ${pairs(by("missing"))}.`);

  const levels = cand.slots.filter((s) => !s.isMissing).map((s) => s.level);
  if (levels.length) parts.push(`Your lowest card here is level ${Math.min(...levels)}.`);
  return parts.join(" ");
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
    name: displayName(cand),
    // "real" = these exact 8 are a top-player list; "close" = one card off; "yours" = the player's
    // own version of a top-player core; "curated" = from the hand-written fallback library.
    listKind: listKind(cand),
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
    // What the win rate is really based on for the 8 cards shown (exact list / one card off / an
    // untested mix of the core), so the UI never claims a record these cards don't have.
    evidence: cand.evidence,
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
        swap: s.swap,
        isMissing: s.isMissing,
        underLeveled: s.weak,
        evolved: s.chosenKey ? evoKeys.has(s.chosenKey) : false,
        hero: s.chosenKey ? heroKeys.has(s.chosenKey) : false,
      };
    }),
  };
}
