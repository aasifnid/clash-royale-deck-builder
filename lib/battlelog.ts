// Reads the player's recent battle log to derive the LOCAL meta (the decks they actually
// face at their trophy level) and their THREATS (what beats them most). Server-side only.

import { normalizeTag } from "./cr";
import { classifyDeck } from "./archetypes";

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
