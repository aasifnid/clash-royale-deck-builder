// POST /api/build
// Body: { collection: Collection, focalKey: string, ease?: "forgiving"|"any"|"challenge" }
// Builds a deck AROUND a specific card the player chose (the focal card is locked in place) and
// rebuilds the rest from their owned cards, then attaches the same free coaching as /api/generate.
// No API key required.

import { NextResponse } from "next/server";
import type { Collection } from "@/lib/types";
import type { EasePreference } from "@/lib/fieldability";
import { buildAroundCard } from "@/lib/build";
import { fetchBattleInsights, type BattleInsights } from "@/lib/battlelog";
import { fetchLocalMeta, type LocalMeta } from "@/lib/localmeta";
import { coachPickFor, enrichCandidate } from "@/lib/present";
import { cardByKey } from "@/lib/cards";

// With enough games sampled near the player's trophies, score matchups against what they'll actually
// face there; otherwise fall back to what has been beating them in their own last ~30 games.
const LOCAL_THREAT_MIN_BATTLES = 50;
function threatsFor(local: LocalMeta | null, insights: BattleInsights | null): Record<string, number> | undefined {
  return local && local.battles >= LOCAL_THREAT_MIN_BATTLES ? local.faced : insights?.threats;
}

export async function POST(request: Request) {
  let body: { collection?: Collection; focalKey?: string; ease?: EasePreference };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { collection, focalKey, ease = "any" } = body;
  if (!collection || typeof collection.kingLevel !== "number" || !collection.owned) {
    return NextResponse.json({ error: "Missing or invalid collection." }, { status: 400 });
  }
  if (!focalKey || !cardByKey(focalKey)) {
    return NextResponse.json({ error: "Unknown or missing focal card." }, { status: 400 });
  }

  // Read the player's recent ladder battles to bias the build against what beats them.
  const [insights, local] = collection.tag
    ? await Promise.all([fetchBattleInsights(collection.tag), fetchLocalMeta(collection.tag, collection.trophies)])
    : [null, null];

  const cand = buildAroundCard(collection, focalKey, { ease, threats: threatsFor(local, insights), local });
  const pick = { coach: coachPickFor(cand), ...enrichCandidate(cand) };

  return NextResponse.json({ insights, pick });
}
