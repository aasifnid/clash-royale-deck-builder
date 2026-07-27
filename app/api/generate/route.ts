// POST /api/generate
// Body: { collection: Collection, archetype?: string, ease?: "forgiving"|"any"|"challenge" }
// Runs the deterministic fieldability engine and attaches pro-authored coaching from the
// deck library. Fully free, no API key required. If ANTHROPIC_API_KEY is set, an optional
// AI layer re-ranks/rephrases instead — but the static path is the default experience.

import { NextResponse } from "next/server";
import type { Collection } from "@/lib/types";
import { type DeckCandidate, type EasePreference } from "@/lib/fieldability";
import { rankWithBestCardDecks } from "@/lib/build";
import { coachDecks, CoachError, type CoachPick } from "@/lib/coach";
import { fetchBattleInsights } from "@/lib/battlelog";
import { coachPickFor, enrichCandidate } from "@/lib/present";

const SHORTLIST_SIZE = 6;
const MAX_PICKS = 3;

/** Build coached picks from the deck library — no LLM. Prefers fully-fieldable decks, and
 *  diversifies the picks by win condition so the player never sees the same deck three times. */
function buildStaticPicks(ranked: DeckCandidate[]): CoachPick[] {
  const fieldable = ranked.filter((c) => c.fieldable);
  const pool = fieldable.length > 0 ? fieldable : ranked;

  // Pick best first, then the next-best decks with a DIFFERENT win condition, so the 3 picks
  // are genuinely distinct archetypes (no two Balloon decks, etc.).
  const chosen: DeckCandidate[] = [];
  const seenWc = new Set<string>();
  for (const cand of pool) {
    if (chosen.length >= MAX_PICKS) break;
    if (seenWc.has(cand.deck.winCondition)) continue;
    seenWc.add(cand.deck.winCondition);
    chosen.push(cand);
  }
  // If there weren't enough distinct win conditions, top up with the next best decks.
  for (const cand of pool) {
    if (chosen.length >= MAX_PICKS) break;
    if (!chosen.includes(cand)) chosen.push(cand);
  }

  return chosen.map(coachPickFor);
}

export async function POST(request: Request) {
  let body: { collection?: Collection; archetype?: string; ease?: EasePreference };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { collection, archetype, ease = "any" } = body;
  if (!collection || typeof collection.kingLevel !== "number" || !collection.owned) {
    return NextResponse.json({ error: "Missing or invalid collection." }, { status: 400 });
  }

  // Read the player's recent ladder battles to learn the local meta + what beats them.
  const insights = collection.tag ? await fetchBattleInsights(collection.tag) : null;

  const ranked = rankWithBestCardDecks(collection, { archetype, ease, threats: insights?.threats });
  const shortlist = ranked.slice(0, SHORTLIST_SIZE);

  if (shortlist.length === 0) {
    return NextResponse.json({ aiUsed: false, picks: [], shortlist: [], insights, note: "No proven decks matched your filters." });
  }

  // Map over the full ranked list so diversified picks (which may reach past the shortlist) resolve.
  const byId = new Map(ranked.map((c) => [c.deck.id, c]));

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
    picks = buildStaticPicks(ranked);
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
