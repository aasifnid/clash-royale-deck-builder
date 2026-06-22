// Official Clash Royale API client, routed through the RoyaleAPI proxy so a single
// fixed IP can be allowlisted on the token (Vercel's egress IPs are dynamic).
// Server-side only — never import this into a client component.

import { MAX_LEVEL, type Collection, type OwnedCard, type OwnedTowerTroop } from "./types";
import { cardById } from "./cards";
import { arenaNumberFor } from "./arenas";

const PROXY_BASE = "https://proxy.royaleapi.dev/v1";

// The official API reports a rarity-relative `maxLevel` (common 16, rare 14, epic 11,
// legendary 8, champion 6). A card's in-game displayed level is the API level shifted by
// the gap to the common baseline. Verified against a real account: a level-15 common has
// apiLevel 15 / apiMaxLevel 16, and a level-15 champion has apiLevel 5 / apiMaxLevel 6.
const API_BASE_MAX_LEVEL = 16;

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
  level: number; // rarity-relative
  maxLevel: number; // rarity-relative base (Common 16, Rare 14, Epic 11, Legendary 8, Champion 6)
  evolutionLevel?: number; // 1..maxEvolutionLevel when the player has the evolution
  count: number;
}

interface ApiSupportCard {
  id: number;
  name: string;
  level: number;
  maxLevel: number;
}

interface ApiPlayer {
  tag: string;
  name: string;
  trophies: number;
  expLevel: number; // king tower level
  wins?: number;
  losses?: number;
  battleCount?: number;
  arena?: { id: number; name: string };
  cards: ApiCard[];
  supportCards?: ApiSupportCard[]; // owned tower troops
  currentDeckSupportCards?: ApiSupportCard[]; // active tower troop(s)
}

/** Convert the API's rarity-relative level to the in-game displayed level (max 15). */
export function displayedLevel(apiLevel: number, apiMaxLevel: number): number {
  return apiLevel + (API_BASE_MAX_LEVEL - apiMaxLevel);
}

// King Tower full hit points by level (fixed per level in standard 1v1). The player API has no
// King Tower level field, but the battle log reports the King Tower's HP, so we map it back.
const KING_TOWER_HP: Record<number, number> = {
  1: 2400, 2: 2568, 3: 2736, 4: 2904, 5: 3096, 6: 3312, 7: 3528, 8: 3768,
  9: 4008, 10: 4392, 11: 4824, 12: 5304, 13: 5832, 14: 6408, 15: 7032,
};

/** King level from the observed full King Tower HP: exact match if possible, else the highest
 *  level whose HP doesn't exceed it. Null if there's nothing usable. */
function kingLevelFromHp(maxHp: number): number | null {
  if (!maxHp || maxHp <= 0) return null;
  let best: number | null = null;
  for (const lvl of Object.keys(KING_TOWER_HP).map(Number)) {
    const hp = KING_TOWER_HP[lvl];
    if (hp === maxHp) return lvl;
    if (hp <= maxHp) best = lvl;
  }
  return best;
}

interface BattleLogEntry {
  team?: { tag?: string; kingTowerHitPoints?: number | null }[];
}

/** Read the King Tower level from the player's battle log. The tower's HP (reported per battle)
 *  is fixed per level, so the max across recent 1v1 battles (where it took no damage) is the
 *  full HP for the player's level. Returns null if unavailable. */
async function kingLevelFromBattleLog(tag: string, token: string): Promise<number | null> {
  // Retry transient failures (e.g. a cold-start timeout on this second proxy call) so we don't
  // silently fall back to the wrong card-level estimate.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${PROXY_BASE}/players/%23${tag}/battlelog`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) continue;
      const log = (await res.json()) as BattleLogEntry[];
      let maxHp = 0;
      for (const b of log) {
        const team = b.team ?? [];
        if (team.length !== 1) continue; // 1v1 only — 2v2/event towers have different HP
        const me = team[0];
        if (me?.tag && normalizeTag(me.tag) === tag && typeof me.kingTowerHitPoints === "number") {
          maxHp = Math.max(maxHp, me.kingTowerHitPoints);
        }
      }
      return kingLevelFromHp(maxHp);
    } catch {
      // fall through to retry
    }
  }
  return null;
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
    // evolutionLevel is a bitmask: bit 1 (value 1) = Evolution unlocked, bit 2 (value 2)
    // = Hero unlocked. Verified against a real account (e.g. Knight=3 → both, Giant=2 → hero,
    // Musketeer=1 → evolution).
    const evoMask = c.evolutionLevel ?? 0;
    owned[c.id] = {
      id: c.id,
      level: displayedLevel(c.level, c.maxLevel),
      evolved: (evoMask & 1) === 1,
      hero: (evoMask & 2) === 2,
    };
  }

  const towerTroops: Record<number, OwnedTowerTroop> = {};
  for (const t of data.supportCards ?? []) {
    towerTroops[t.id] = { id: t.id, level: displayedLevel(t.level, t.maxLevel) };
  }

  // The player API has no King Tower level field, so read it from the battle log's tower HP.
  // Fall back to the highest card level only if the battle log can't be read.
  const cardLevels = Object.values(owned).map((o) => o.level);
  const kingFromLog = await kingLevelFromBattleLog(tag, token);
  const kingLevel =
    kingFromLog ?? (cardLevels.length ? Math.min(MAX_LEVEL, Math.max(...cardLevels)) : 11);

  return {
    tag: data.tag,
    name: data.name,
    trophies: data.trophies,
    arena: arenaNumberFor(data.arena?.id),
    experienceLevel: data.expLevel,
    wins: data.wins ?? null,
    losses: data.losses ?? null,
    battleCount: data.battleCount ?? null,
    kingLevel,
    owned,
    towerTroops,
    activeTowerTroop: data.currentDeckSupportCards?.[0]?.id ?? null,
    syncedAt: new Date().toISOString(),
  };
}
