// POST /api/upgrades
// Body: { collection: Collection }
// Upgrade planner: the cards whose next levels open up the most strong top-player lists for this
// player. Uses only bundled meta data, so no API token is needed.

import { NextResponse } from "next/server";
import type { Collection } from "@/lib/types";
import { upgradePlan } from "@/lib/upgrades";

export async function POST(request: Request) {
  let body: { collection?: Collection };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { collection } = body;
  if (!collection || typeof collection.kingLevel !== "number" || !collection.owned) {
    return NextResponse.json({ error: "Missing or invalid collection." }, { status: 400 });
  }
  return NextResponse.json(upgradePlan(collection));
}
