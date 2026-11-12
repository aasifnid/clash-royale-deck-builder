// POST /api/check
// Body: { collection: Collection, cardKeys?: string[], ease?: "forgiving"|"any"|"challenge" }
// Deck Check: grades a deck the player already has against real battle evidence. With no cardKeys,
// it checks the deck the player had selected in-game when they last synced (collection.currentDeck).
// No API key required.

import { NextResponse } from "next/server";
import type { Collection } from "@/lib/types";
import type { EasePreference } from "@/lib/fieldability";
import { checkDeck } from "@/lib/deckcheck";
import { fetchBattleInsights, type BattleInsights } from "@/lib/battlelog";
import { fetchLocalMeta, type LocalMeta } from "@/lib/localmeta";
import { coachPickFor, enrichCandidate } from "@/lib/present";
import { cardByKey } from "@/lib/cards";

// Same rule as /api/generate: score matchups against the decks sampled near the player's trophies
// when there are enough of them, else against what has been beating them recently.
const LOCAL_THREAT_MIN_BATTLES = 50;
function threatsFor(local: LocalMeta | null, insights: BattleInsights | null): Record<string, number> | undefined {
  return local && local.battles >= LOCAL_THREAT_MIN_BATTLES ? local.faced : insights?.threats;
}

export async function POST(request: Request) {
  let body: { collection?: Collection; cardKeys?: string[]; ease?: EasePreference };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { collection, ease = "any" } = body;
  if (!collection || typeof collection.kingLevel !== "number" || !collection.owned) {
    return NextResponse.json({ error: "Missing or invalid collection." }, { status: 400 });
  }
  const keys = body.cardKeys ?? collection.currentDeck ?? [];
  if (keys.length !== 8 || new Set(keys).size !== 8 || keys.some((k) => !cardByKey(k))) {
    return NextResponse.json(
      { error: body.cardKeys ? "That deck needs 8 different, known cards." : "No current deck found. Sync your account first." },
      { status: 400 },
    );
  }

  const [insights, local] = collection.tag
    ? await Promise.all([fetchBattleInsights(collection.tag), fetchLocalMeta(collection.tag, collection.trophies)])
    : [null, null];

  const result = checkDeck(collection, keys, { ease, threats: threatsFor(local, insights), local });
  const pick = (c: typeof result.current) => ({ coach: coachPickFor(c), ...enrichCandidate(c) });

  return NextResponse.json({
    verdict: result.verdict,
    current: pick(result.current),
    tuned: result.tuned ? pick(result.tuned) : null,
    provenSwap: result.provenSwap,
    alternative: result.alternative ? pick(result.alternative) : null,
    matchups: result.matchups,
    notes: result.notes,
    local: local ? { trophies: local.trophies, battles: local.battles } : null,
  });
}
