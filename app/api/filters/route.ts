// GET /api/filters -> the deck-filter options: broad play styles (Beatdown, Cycle, ...) and
// the named archetypes from the curated library (LavaLoon, Hog 2.6 Cycle, X-Bow 2.9, ...).
// Served from the server so the client doesn't have to bundle the whole deck library.

import { NextResponse } from "next/server";
import { DECKS } from "@/lib/fieldability";

export function GET() {
  const styles = [...new Set(DECKS.map((d) => d.archetype))].sort();
  // Recognizable archetype names — the curated decks carry these (meta decks have generic
  // "X (meta)" names, so we leave those to the "Best for me" auto pick).
  const archetypes = [...new Set(DECKS.filter((d) => d.source !== "meta").map((d) => d.name))].sort();
  return NextResponse.json({ styles, archetypes });
}
