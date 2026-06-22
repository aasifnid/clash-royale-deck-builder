// GET /api/filters -> a single list of named archetypes for the deck-type dropdown
// (LavaLoon, Hog 2.6 Cycle, X-Bow 2.9, Graveyard Poison, ...). We keep only archetypes whose
// win condition is actually showing up in the current top-ladder pool, so off-meta decks drop
// out and the list stays current as the meta refreshes. Served from the server so the client
// doesn't bundle the deck library.

import { NextResponse } from "next/server";
import { DECKS } from "@/lib/fieldability";

export function GET() {
  const metaWinConditions = new Set(DECKS.filter((d) => d.source === "meta").map((d) => d.winCondition));
  const archetypes = [
    ...new Set(
      DECKS.filter((d) => d.source !== "meta" && metaWinConditions.has(d.winCondition)).map((d) => d.name),
    ),
  ].sort();
  return NextResponse.json({ archetypes });
}
