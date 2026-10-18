// LOCAL meta: what is played and what wins NEAR THE PLAYER'S TROPHIES, not just at the top of the
// ladder. The official API has no mid-ladder leaderboard (trophy-road rankings come back empty and
// per-location rankings list Path of Legends players only), so we sample by snowball: the player's
// recent ladder opponents are matched to their trophy range, and THEIR recent battles are too. We
// keep only competitive 1v1 games started within TROPHY_WINDOW of the player's trophies, and record
// every deck seen (both sides) with its result. Server-side only.

import { normalizeTag } from "./cr";
import { cardById } from "./cards";
import { classifyDeck } from "./archetypes";

const PROXY_BASE = "https://proxy.royaleapi.dev/v1";
const COMPETITIVE = /pvp|pathoflegend|ranked|ladder/i; // 1v1 competitive only (skip boat/2v2/challenge)
const MAX_OPPONENTS = 30; // opponents whose battle logs we read
const CONCURRENCY = 10;
const TROPHY_WINDOW = 400; // games started within this many trophies of the player count as local
const CACHE_MS = 30 * 60_000; // the local meta moves slowly; don't re-sample on every click

export interface LocalDeckRecord {
  games: number;
  wins: number;
}

export interface LocalMeta {
  trophies: number | null; // the player's trophies the sample was centered on
  battles: number; // local competitive battles analyzed
  faced: Record<string, number>; // archetype -> decks seen in local games (what you'll face)
  archetypes: Record<string, LocalDeckRecord>; // archetype -> local record
  decks: Record<string, LocalDeckRecord>; // sorted 8-card key signature -> local record
}

interface ApiCard { id: number }
interface ApiSide { tag?: string; crowns?: number; startingTrophies?: number; cards?: ApiCard[] }
interface ApiBattle { type?: string; battleTime?: string; team?: ApiSide[]; opponent?: ApiSide[] }

const cache = new Map<string, { at: number; data: LocalMeta | null }>();

async function getJson<T>(path: string, token: string): Promise<T | null> {
  try {
    const res = await fetch(PROXY_BASE + path, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

/** Sorted 8-card key signature, or null if any card is unknown. */
function sigOf(cards: ApiCard[] | undefined): string | null {
  if (!cards || cards.length !== 8) return null;
  const keys = cards.map((c) => cardById(c.id)?.key);
  if (keys.some((k) => !k)) return null;
  return (keys as string[]).sort().join(",");
}

/** Sample the local meta around this player. Returns null on failure or when there's no token. */
export async function fetchLocalMeta(rawTag: string, trophies: number | null): Promise<LocalMeta | null> {
  const token = process.env.CR_API_TOKEN;
  const tag = normalizeTag(rawTag);
  if (!token || !tag) return null;
  const hit = cache.get(tag);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  const own = await getJson<ApiBattle[]>(`/players/%23${tag}/battlelog`, token);
  if (!own) return null;
  const competitive = own.filter((b) => COMPETITIVE.test(b.type ?? ""));
  // Center on the player's live trophies; fall back to where their recent games started.
  const center = trophies ?? competitive.find((b) => b.team?.[0]?.startingTrophies != null)?.team?.[0]?.startingTrophies ?? null;

  const oppTags = [...new Set(competitive.map((b) => b.opponent?.[0]?.tag).filter((t): t is string => Boolean(t)))].slice(0, MAX_OPPONENTS);
  const logs = await mapLimit(oppTags, CONCURRENCY, (t) => getJson<ApiBattle[]>(`/players/${encodeURIComponent(t)}/battlelog`, token));

  const data: LocalMeta = { trophies: center, battles: 0, faced: {}, archetypes: {}, decks: {} };
  const seen = new Set<string>(); // a battle appears in both players' logs; count it once
  const record = (side: ApiSide, won: boolean) => {
    const sig = sigOf(side.cards);
    if (!sig) return;
    const d = (data.decks[sig] ??= { games: 0, wins: 0 });
    d.games++;
    if (won) d.wins++;
    const arch = classifyDeck(side.cards!.map((c) => c.id));
    if (!arch) return;
    data.faced[arch] = (data.faced[arch] ?? 0) + 1;
    const a = (data.archetypes[arch] ??= { games: 0, wins: 0 });
    a.games++;
    if (won) a.wins++;
  };

  for (const log of [own, ...logs]) {
    for (const b of log ?? []) {
      if (!COMPETITIVE.test(b.type ?? "")) continue;
      const me = b.team?.[0];
      const opp = b.opponent?.[0];
      if (!me?.cards || !opp?.cards) continue;
      const start = me.startingTrophies;
      // Path of Legends games carry no trophy count; keep them only when we have no center at all.
      if (center != null && (start == null || Math.abs(start - center) > TROPHY_WINDOW)) continue;
      const mc = me.crowns ?? 0;
      const oc = opp.crowns ?? 0;
      if (mc === oc) continue; // skip draws so win rates stay clean
      // Same battle from either player's log: identical pair of tags + timestamp, sides swapped.
      const key = [me.tag, opp.tag].sort().join("|") + `|${b.battleTime}`;
      if (seen.has(key)) continue;
      seen.add(key);
      data.battles++;
      record(me, mc > oc);
      record(opp, oc > mc);
    }
  }

  const result = data.battles > 0 ? data : null;
  cache.set(tag, { at: Date.now(), data: result });
  return result;
}
