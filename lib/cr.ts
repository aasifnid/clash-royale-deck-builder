// Official Clash Royale API client, routed through the RoyaleAPI proxy so a single
// fixed IP can be allowlisted on the token (Vercel's egress IPs are dynamic).
// Server-side only — never import this into a client component.

import { MAX_LEVEL, type Collection, type OwnedCard } from "./types";
import { cardById } from "./cards";

const PROXY_BASE = "https://proxy.royaleapi.dev/v1";

/** Normalize a user-entered tag: strip '#', uppercase, fix the common O->0 typo. */
export function normalizeTag(input: string): string {
  return input
    .trim()
    .replace(/^#/, "")
    .toUpperCase()
    .replace(/O/g, "0"); // CR tags never contain the letter O
}

/** Shape of the official /players/{tag} card entries we rely on. */
interface ApiCard {
  id: number;
  name: string;
  level: number; // rarity-relative, 1..maxLevel
  maxLevel: number; // rarity-relative max (Common 15 ... Champion 5)
  starLevel?: number;
  evolutionLevel?: number; // present (>=1) when the player has the evolution
  count: number;
}

interface ApiPlayer {
  tag: string;
  name: string;
  trophies: number;
  expLevel: number; // king tower level
  arena?: { id: number; name: string };
  cards: ApiCard[];
}

/** Convert the API's rarity-relative level to the in-game displayed level. */
export function displayedLevel(apiLevel: number, apiMaxLevel: number): number {
  return apiLevel + (MAX_LEVEL - apiMaxLevel);
}

export class CrApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CrApiError";
  }
}

/** Fetch a player by tag and map it into our Collection shape. */
export async function fetchCollection(rawTag: string): Promise<Collection> {
  const token = process.env.CR_API_TOKEN;
  if (!token) {
    throw new CrApiError("Server is missing CR_API_TOKEN.", 500);
  }

  const tag = normalizeTag(rawTag);
  if (!tag) throw new CrApiError("Empty player tag.", 400);

  const res = await fetch(`${PROXY_BASE}/players/%23${tag}`, {
    headers: { Authorization: `Bearer ${token}` },
    // Player progression changes constantly — never cache.
    cache: "no-store",
  });

  if (!res.ok) {
    if (res.status === 404) throw new CrApiError(`No player found for tag #${tag}.`, 404);
    if (res.status === 403)
      throw new CrApiError("API rejected the token (check it and the allowlisted proxy IP).", 403);
    throw new CrApiError(`Clash Royale API error (${res.status}).`, res.status);
  }

  const data = (await res.json()) as ApiPlayer;

  const owned: Record<number, OwnedCard> = {};
  for (const c of data.cards) {
    // Skip cards not in our master data (e.g. brand-new cards before a data refresh).
    if (!cardById(c.id)) continue;
    owned[c.id] = {
      id: c.id,
      level: displayedLevel(c.level, c.maxLevel),
      evolved: (c.evolutionLevel ?? 0) >= 1,
      starLevel: c.starLevel ?? 0,
    };
  }

  return {
    tag: data.tag,
    name: data.name,
    trophies: data.trophies,
    arena: data.arena?.id ?? null,
    kingLevel: data.expLevel,
    owned,
    syncedAt: new Date().toISOString(),
  };
}
