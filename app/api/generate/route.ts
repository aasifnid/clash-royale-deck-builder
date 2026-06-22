// POST /api/generate
// Body: { collection: Collection, archetype?: string, ease?: "forgiving"|"any"|"challenge" }
// Runs the deterministic fieldability engine and attaches pro-authored coaching from the
// deck library. Fully free, no API key required. If ANTHROPIC_API_KEY is set, an optional
// AI layer re-ranks/rephrases instead — but the static path is the default experience.

import { NextResponse } from "next/server";
import type { Collection } from "@/lib/types";
import { rankDecks, type DeckCandidate, type EasePreference } from "@/lib/fieldability";
import { coachDecks, CoachError, type CoachPick } from "@/lib/coach";
import { coachingForDeck } from "@/lib/coaching";
import { fetchBattleInsights } from "@/lib/battlelog";
import { cardByKey } from "@/lib/cards";

const SHORTLIST_SIZE = 6;
const MAX_PICKS = 3;

function difficultyFor(skillFloor: number): CoachPick["difficulty"] {
  if (skillFloor <= 2) return "Easy";
  if (skillFloor >= 4) return "Hard";
  return "Medium";
}

/** A one-line, personalized "why this deck for you" using the player's real state. */
function personalizedSummary(cand: DeckCandidate): string {
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

/** Build coached picks from the deck library — no LLM. Prefers fully-fieldable decks. */
function buildStaticPicks(shortlist: DeckCandidate[]): CoachPick[] {
  const fieldable = shortlist.filter((c) => c.fieldable);
  const chosen = (fieldable.length > 0 ? fieldable : shortlist).slice(0, MAX_PICKS);

  return chosen.map((cand) => {
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
      opening: c.opening,
      defense: c.defense,
      combos: c.combos,
      doubleElixir: c.doubleElixir,
      winCondition: cand.deck.winCondition,
      counters: c.counters,
      playTips: c.playTips,
      difficulty: difficultyFor(cand.deck.skillFloor),
    };
  });
}

/** Flatten a candidate into the resolved 8-card list (with levels) for the client,
 *  plus explicit Evolution-slot (2) and Hero/Champion-slot recommendations. */
function enrichCandidate(cand: DeckCandidate) {
  // Slot recommendations (2 evolutions + 1 hero) are computed in the engine.
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

export async function POST(request: Request) {
  let body: { collection?: Collection; archetype?: string; ease?: EasePreference };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { collection, archetype, ease = "forgiving" } = body;
  if (!collection || typeof collection.kingLevel !== "number" || !collection.owned) {
    return NextResponse.json({ error: "Missing or invalid collection." }, { status: 400 });
  }

  // Read the player's recent ladder battles to learn the local meta + what beats them.
  const insights = collection.tag ? await fetchBattleInsights(collection.tag) : null;

  const ranked = rankDecks(collection, { archetype, ease, threats: insights?.threats });
  const shortlist = ranked.slice(0, SHORTLIST_SIZE);

  if (shortlist.length === 0) {
    return NextResponse.json({ aiUsed: false, picks: [], shortlist: [], insights, note: "No proven decks matched your filters." });
  }

  const byId = new Map(shortlist.map((c) => [c.deck.id, c]));

  // Optional AI enhancement — only if a key is configured. The free static path is the default.
  let picks: CoachPick[] = [];
  let aiUsed = false;
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      picks = await coachDecks(collection, shortlist, ease);
      aiUsed = picks.length > 0;
    } catch (err) {
      if (!(err instanceof CoachError)) console.error("Coach error:", err);
    }
  }

  if (picks.length === 0) {
    picks = buildStaticPicks(shortlist);
  }

  const enrichedPicks = picks
    .map((p) => {
      const cand = byId.get(p.deckId);
      return cand ? { coach: p, ...enrichCandidate(cand) } : null;
    })
    .filter(Boolean);

  return NextResponse.json({
    aiUsed,
    insights,
    picks: enrichedPicks,
    shortlist: shortlist.map(enrichCandidate),
    // Debug-only: full ranked list with sub-scores, for the weight-sensitivity audit.
    debugRanked: (body as { debug?: boolean }).debug
      ? ranked.map((c) => ({ name: c.deck.name, source: c.deck.source ?? "curated", fieldable: c.fieldable, scores: c.scores }))
      : undefined,
  });
}
