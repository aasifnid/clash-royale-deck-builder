// Card master-data access. The bundled JSON is the single source of card metadata.

import cardsData from "@/data/cards.json";
import type { Card } from "./types";

export const CARDS: Card[] = cardsData as Card[];

const byId = new Map<number, Card>(CARDS.map((c) => [c.id, c]));
const byKey = new Map<string, Card>(CARDS.map((c) => [c.key, c]));
const byName = new Map<string, Card>(CARDS.map((c) => [c.name.toLowerCase(), c]));

export function cardById(id: number): Card | undefined {
  return byId.get(id);
}

export function cardByKey(key: string): Card | undefined {
  return byKey.get(key);
}

export function cardByName(name: string): Card | undefined {
  return byName.get(name.toLowerCase());
}

/** Average elixir of a set of cards, rounded to one decimal (CR convention). */
export function avgElixir(cards: Card[]): number {
  if (cards.length === 0) return 0;
  const total = cards.reduce((sum, c) => sum + c.elixir, 0);
  return Math.round((total / cards.length) * 10) / 10;
}
