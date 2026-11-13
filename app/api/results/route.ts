// POST /api/results
// Body: { tag: string, decks: { id: string, cardKeys: string[] }[] }
// The player's own recent record with each saved deck, read from their battle log (the API keeps
// roughly the last 25-30 battles), so a saved recommendation can be compared with how it really did.

import { NextResponse } from "next/server";
import { deckSignature, fetchOwnRecords } from "@/lib/battlelog";

export async function POST(request: Request) {
  let body: { tag?: string; decks?: { id: string; cardKeys: string[] }[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.tag || !Array.isArray(body.decks)) {
    return NextResponse.json({ error: "Missing tag or decks." }, { status: 400 });
  }
  const own = await fetchOwnRecords(body.tag);
  if (!own) return NextResponse.json({ error: "Couldn't read your battle log right now." }, { status: 502 });

  const records: Record<string, { games: number; wins: number }> = {};
  for (const d of body.decks) records[d.id] = own.decks[deckSignature(d.cardKeys)] ?? { games: 0, wins: 0 };
  return NextResponse.json({ games: own.games, records });
}
