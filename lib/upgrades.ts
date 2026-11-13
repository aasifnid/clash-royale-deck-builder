// Upgrade planner: which cards to level next. The in-game Deck Wizard builds from the levels you
// already have; this looks one step ahead. It finds strong real top-player lists (proven win rate,
// enough games) that the player is only a few levels short of fielding at full strength, and ranks
// the cards whose upgrade opens up the most - and the best - of them. Server-side only.

import { META_DECKS } from "./meta-decks";
import { evidenceFor, targetLevel } from "./fieldability";
import { winConditionKeyOf } from "./archetypes";
import { cardByKey } from "./cards";
import { MAX_LEVEL, type Collection } from "./types";

// A list must have this many games and this shrunk win rate to be worth leveling toward.
const MIN_LIST_GAMES = 30;
const MIN_LIST_WIN_RATE = 52;
// "Within reach" = at most this many cards below the player's level, totalling at most this many
// levels. Wide on purpose: a collection whose best cards sit well above the rest (levels 12-16) is
// 7+ levels short of every strong list, and dividing each list's worth by its shortfall below
// still ranks the nearest ones first.
const MAX_SHORT_CARDS = 5;
const MAX_SHORT_LEVELS = 10;

export interface UpgradeList {
  winCondition: string; // display name
  cards: string[]; // card keys of the list
  winRate: number;
  games: number;
  levelsShort: number; // total levels the player is short on this list
  worth: number; // win-rate edge x log(games) / levels short: how much this list is worth chasing
}

export interface UpgradeTarget {
  key: string;
  name: string;
  level: number; // the player's level now
  targetLevel: number; // the level that stops it holding these lists back
  lists: UpgradeList[]; // the best real lists this upgrade helps unlock (one per win condition)
}

export interface UpgradePlan {
  competitiveLevel: number;
  targets: UpgradeTarget[];
}

export function upgradePlan(collection: Collection, limit = 3): UpgradePlan {
  const target = Math.min(MAX_LEVEL, targetLevel(collection));
  const levelOf = (key: string) => {
    const c = cardByKey(key);
    return c ? (collection.owned[c.id]?.level ?? null) : null;
  };

  const value = new Map<string, number>();
  const listsFor = new Map<string, Map<string, UpgradeList>>(); // card -> win condition -> best list
  for (const d of META_DECKS) {
    for (const v of d.variants ?? []) {
      if (v.games < MIN_LIST_GAMES) continue;
      // The engine's own win rate for this exact list, so the planner shows the same number as the
      // recommendations and Deck Check.
      const winRate = evidenceFor(d, v.cards).winRate;
      if (winRate == null || winRate < MIN_LIST_WIN_RATE) continue;
      const levels = v.cards.map(levelOf);
      if (levels.some((l) => l === null)) continue; // can't level a card you don't own
      const short = v.cards.filter((_, i) => (levels[i] as number) < target);
      const levelsShort = v.cards.reduce((sum, _, i) => sum + Math.max(0, target - (levels[i] as number)), 0);
      if (short.length === 0 || short.length > MAX_SHORT_CARDS || levelsShort > MAX_SHORT_LEVELS) continue;

      // Better lists, more-played lists and lists closer to done count for more.
      const worth = ((winRate - 50) * Math.log1p(v.games)) / levelsShort;
      const wcKey = winConditionKeyOf(v.cards);
      const list: UpgradeList = {
        winCondition: (wcKey && cardByKey(wcKey)?.name) || d.winCondition,
        cards: v.cards,
        winRate,
        games: v.games,
        levelsShort,
        worth,
      };
      for (const key of short) {
        value.set(key, (value.get(key) ?? 0) + worth);
        const byWc = listsFor.get(key) ?? new Map<string, UpgradeList>();
        const prev = byWc.get(list.winCondition);
        // One list per win condition: the most worth chasing, so a well-proven list beats a 33-game
        // cousin with a slightly higher rate.
        if (!prev || list.worth > prev.worth) byWc.set(list.winCondition, list);
        listsFor.set(key, byWc);
      }
    }
  }

  const targets = [...value.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => ({
      key,
      name: cardByKey(key)?.name ?? key,
      level: levelOf(key) ?? 0,
      targetLevel: target,
      lists: [...(listsFor.get(key)?.values() ?? [])].sort((a, b) => b.worth - a.worth).slice(0, 3),
    }));
  return { competitiveLevel: target, targets };
}
