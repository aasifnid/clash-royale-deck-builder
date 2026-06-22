// GET /api/player?tag=ABC123  -> fetches a player's collection via the CR API proxy.
// The tag is passed as a query param so the '#' never needs path-encoding.

import { NextResponse } from "next/server";
import { fetchCollection, CrApiError } from "@/lib/cr";

export async function GET(request: Request) {
  const tag = new URL(request.url).searchParams.get("tag");
  if (!tag) {
    return NextResponse.json({ error: "Missing 'tag' query parameter." }, { status: 400 });
  }

  try {
    const collection = await fetchCollection(tag);
    return NextResponse.json(collection);
  } catch (err) {
    if (err instanceof CrApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Unexpected error fetching player:", err);
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
