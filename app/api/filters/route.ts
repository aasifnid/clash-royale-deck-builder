// GET /api/filters -> deck-type options for the generator: the broad play styles, plus the
// top ~12 most popular named archetypes. Popularity = how much top-ladder usage each archetype's
// win condition has; we keep one representative archetype per win condition (so the list stays
// diverse instead of four Miner variants), then take the top 12. Served from the server so the
// client doesn't bundle the deck library.

import { NextResponse } from "next/server";
import { DECKS } from "@/lib/fieldability";

// Canonical archetype name to show for a win condition when several curated decks share it.
const PREFERRED: Record<string, string> = {
  "Hog Rider": "Hog 2.6 Cycle",
  Miner: "Miner Poison Control",
  Graveyard: "Graveyard Poison",
  "Royal Giant": "Royal Giant Fisherman",
  Giant: "Giant Double Prince",
  Balloon: "LavaLoon",
  "Battle Ram": "PEKKA Bridge Spam",
};

const TOP_N = 12;

export function GET() {
  const styles = [...new Set(DECKS.map((d) => d.archetype))].sort();

  // Top-ladder usage summed per win condition.
  const usageByWc: Record<string, number> = {};
  for (const d of DECKS) {
    if (d.source === "meta") usageByWc[d.winCondition] = (usageByWc[d.winCondition] ?? 0) + (d.usage ?? 0);
  }

  // One curated archetype per win condition (preferred canonical name, else alphabetical).
  const namesByWc: Record<string, string[]> = {};
  for (const d of DECKS) {
    if (d.source !== "meta") (namesByWc[d.winCondition] ??= []).push(d.name);
  }

  const archetypes = Object.entries(namesByWc)
    .filter(([wc]) => (usageByWc[wc] ?? 0) > 0) // meta-relevant only
    .map(([wc, names]) => ({
      name: PREFERRED[wc] && names.includes(PREFERRED[wc]) ? PREFERRED[wc] : [...names].sort()[0],
      pop: usageByWc[wc] ?? 0,
    }))
    .sort((a, b) => b.pop - a.pop)
    .slice(0, TOP_N)
    .map((a) => a.name)
    .sort();

  return NextResponse.json({ styles, archetypes });
}
