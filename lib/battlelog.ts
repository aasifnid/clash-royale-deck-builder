// Reads the player's recent battle log to derive the LOCAL meta (the decks they actually
// face at their trophy level) and their THREATS (what beats them most). Server-side only.

import { normalizeTag } from "./cr";
import { classifyDeck } from "./archetypes";
import { cardById } from "./cards";

const PROXY_BASE = "https://proxy.royaleapi.dev/v1";

export interface BattleInsights {
  games: number; // classified PvP ladder games analyzed
  wins: number;
  losses: number;
  meta: Record<string, number>; // archetype -> times faced
  threats: Record<string, number>; // archetype -> times it beat you
}

interface ApiBattle {
  type: string;
  team: { crowns: number }[];
  opponent: { crowns: number; cards: { id: number }[] }[];
}

/** Fetch + analyze the battle log. Returns null on any failure (it's an enhancement, not core). */
export async function fetchBattleInsights(rawTag: string): Promise<BattleInsights | null> {
  const token = process.env.CR_API_TOKEN;
  if (!token) return null;
  const tag = normalizeTag(rawTag);
  if (!tag) return null;

  try {
    const res = await fetch(`${PROXY_BASE}/players/%23${tag}/battlelog`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const log = (await res.json()) as ApiBattle[];

    const meta: Record<string, number> = {};
    const threats: Record<string, number> = {};
    let games = 0;
    let wins = 0;
    let losses = 0;

    for (const b of log) {
      if (b.type !== "PvP") continue; // ladder 1v1 only — that's the meta they face
      const me = b.team?.[0];
      const opp = b.opponent?.[0];
      if (!me || !opp?.cards) continue;
      const arch = classifyDeck(opp.cards.map((c) => c.id));
      if (!arch) continue;

      games++;
      meta[arch] = (meta[arch] ?? 0) + 1;
      if (me.crowns > opp.crowns) {
        wins++;
      } else if (opp.crowns > me.crowns) {
        losses++;
        threats[arch] = (threats[arch] ?? 0) + 1;
      }
    }

    return { games, wins, losses, meta, threats };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// The player's OWN record per exact deck, from their recent battle log (the API keeps roughly the
// last 25-30 battles). Closes the loop on recommendations: did the deck they saved or checked
// actually win for them, and how does that compare with the record we predicted?

const OWN_COMPETITIVE = /pvp|pathoflegend|ranked|ladder/i; // 1v1 competitive only

export interface OwnRecords {
  games: number; // competitive 1v1 games read
  decks: Record<string, { games: number; wins: number }>; // sorted card-key signature -> record
}

interface ApiOwnBattle {
  type?: string;
  team?: { crowns?: number; cards?: { id: number }[] }[];
  opponent?: { crowns?: number }[];
}

/** Sorted 8-card key signature, the same shape the engine uses for exact-list matching. */
export function deckSignature(keys: string[]): string {
  return [...keys].sort().join(",");
}

/** The player's recent results grouped by the exact 8 cards they played. Null on any failure. */
export async function fetchOwnRecords(rawTag: string): Promise<OwnRecords | null> {
  const token = process.env.CR_API_TOKEN;
  const tag = normalizeTag(rawTag);
  if (!token || !tag) return null;
  try {
    const res = await fetch(`${PROXY_BASE}/players/%23${tag}/battlelog`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const log = (await res.json()) as ApiOwnBattle[];
    const out: OwnRecords = { games: 0, decks: {} };
    for (const b of log) {
      if (!OWN_COMPETITIVE.test(b.type ?? "")) continue;
      const me = b.team?.[0];
      const opp = b.opponent?.[0];
      if (!me?.cards || me.cards.length !== 8 || !opp) continue;
      const mc = me.crowns ?? 0;
      const oc = opp.crowns ?? 0;
      if (mc === oc) continue; // draws carry no result
      const keys = me.cards.map((c) => cardById(c.id)?.key);
      if (keys.some((k) => !k)) continue;
      const rec = (out.decks[deckSignature(keys as string[])] ??= { games: 0, wins: 0 });
      rec.games++;
      if (mc > oc) rec.wins++;
      out.games++;
    }
    return out;
  } catch {
    return null;
  }
}
