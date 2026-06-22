// GET /api/filters -> the deck-filter options available in the current pool: broad styles
// (Beatdown, Cycle, ...) and specific win conditions (Hog Rider, X-Bow, Graveyard, ...).
// Served from the server so the client doesn't have to bundle the whole deck library.

import { NextResponse } from "next/server";
import { DECKS } from "@/lib/fieldability";

export function GET() {
  const archetypes = [...new Set(DECKS.map((d) => d.archetype))].sort();
  const winConditions = [...new Set(DECKS.map((d) => d.winCondition))].sort();
  return NextResponse.json({ archetypes, winConditions });
}
