// POST /api/generate
// Body: { collection: Collection, archetype?: string, ease?: "forgiving"|"any"|"challenge" }
// Runs the deterministic fieldability engine, then has the coach rank + explain the shortlist.

import { NextResponse } from "next/server";
import type { Collection } from "@/lib/types";
import { rankDecks, type DeckCandidate, type EasePreference } from "@/lib/fieldability";
import { coachDecks, CoachError, type CoachPick } from "@/lib/coach";
import { cardByKey } from "@/lib/cards";

const SHORTLIST_SIZE = 6;

/** Flatten a candidate into the resolved 8-card list (with levels) for the client. */
function enrichCandidate(cand: DeckCandidate) {
  return {
    deckId: cand.deck.id,
    name: cand.deck.name,
    archetype: cand.deck.archetype,
    winCondition: cand.deck.winCondition,
    skillFloor: cand.deck.skillFloor,
    avgElixir: cand.avgElixir,
    fieldable: cand.fieldable,
    scores: cand.scores,
    substitutions: cand.substitutions,
    missingRoles: cand.missingRoles,
    cards: cand.slots.map((s) => ({
      role: s.role,
      key: s.chosenKey,
      name: s.chosenKey ? (cardByKey(s.chosenKey)?.name ?? s.chosenKey) : null,
      level: s.level,
      isSubstitute: s.isSubstitute,
      isMissing: s.isMissing,
    })),
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

  const ranked = rankDecks(collection, { archetype, ease });
  const shortlist = ranked.slice(0, SHORTLIST_SIZE);

  if (shortlist.length === 0) {
    return NextResponse.json({ picks: [], shortlist: [], note: "No proven decks matched your filters." });
  }

  const byId = new Map(shortlist.map((c) => [c.deck.id, c]));

  let picks: CoachPick[] = [];
  let coachUsed = true;
  try {
    picks = await coachDecks(collection, shortlist, ease);
  } catch (err) {
    coachUsed = false;
    if (!(err instanceof CoachError)) console.error("Coach error:", err);
  }

  // Fallback: if the coach is unavailable or returned nothing usable, surface the
  // deterministic top pick so the tool still works without the AI layer.
  if (picks.length === 0) {
    const top = shortlist[0];
    picks = [
      {
        deckId: top.deck.id,
        summary: `Your best fieldable ${top.deck.archetype} deck right now.`,
        gameplan: top.deck.notes ?? "",
        winCondition: top.deck.winCondition,
        counters: "",
        playTips: "",
        difficulty: top.deck.skillFloor <= 2 ? "Easy" : top.deck.skillFloor >= 4 ? "Hard" : "Medium",
      },
    ];
    coachUsed = false;
  }

  const enrichedPicks = picks
    .map((p) => {
      const cand = byId.get(p.deckId);
      return cand ? { coach: p, ...enrichCandidate(cand) } : null;
    })
    .filter(Boolean);

  return NextResponse.json({
    coachUsed,
    picks: enrichedPicks,
    shortlist: shortlist.map(enrichCandidate),
  });
}
