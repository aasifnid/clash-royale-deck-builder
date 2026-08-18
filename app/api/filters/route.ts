// GET /api/filters -> deck-type options for the generator dropdown: the broad play styles, plus
// the TOP 10 most popular archetypes of the current meta. "Most popular" = each win condition's
// total top-ladder battle usage from the latest meta snapshot (data/meta-decks.json), which is
// refreshed twice a month — so this list re-ranks itself every meta update, no code change needed.
// Served from the server so the client doesn't bundle the deck library.

import { NextResponse } from "next/server";
import { DECKS } from "@/lib/fieldability";

const TOP_N = 10; // most popular archetypes to show

export function GET() {
  const styles = [...new Set(DECKS.map((d) => d.archetype))].sort();

  // Sum current-meta usage per win condition. Using the win condition (e.g. "Balloon", "Hog Rider")
  // as the option — not a specific curated deck name — means selecting it filters to EVERY deck of
  // that archetype (meta + curated), and a newly-popular win condition surfaces even before the
  // curated library has a named build for it.
  const usageByWc: Record<string, number> = {};
  for (const d of DECKS) {
    if (d.source === "meta" && d.winCondition) {
      usageByWc[d.winCondition] = (usageByWc[d.winCondition] ?? 0) + (d.usage ?? 0);
    }
  }

  // Ranked by popularity, most-popular first, capped at the top 10.
  const archetypes = Object.entries(usageByWc)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N)
    .map(([wc]) => wc);

  return NextResponse.json({ styles, archetypes });
}
