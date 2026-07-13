// POST /api/build
// Body: { collection: Collection, focalKey: string, ease?: "forgiving"|"any"|"challenge" }
// Builds a deck AROUND a specific card the player chose (the focal card is locked in place) and
// rebuilds the rest from their owned cards, then attaches the same free coaching as /api/generate.
// No API key required.

import { NextResponse } from "next/server";
import type { Collection } from "@/lib/types";
import type { EasePreference } from "@/lib/fieldability";
import { buildAroundCard } from "@/lib/build";
import { fetchBattleInsights } from "@/lib/battlelog";
import { coachPickFor, enrichCandidate } from "@/lib/present";
import { cardByKey } from "@/lib/cards";

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
  const insights = collection.tag ? await fetchBattleInsights(collection.tag) : null;

  const cand = buildAroundCard(collection, focalKey, { ease, threats: insights?.threats });
  const pick = { coach: coachPickFor(cand), ...enrichCandidate(cand) };

  return NextResponse.json({ insights, pick });
}
