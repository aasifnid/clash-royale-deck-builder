// Deck-level helpers: stats and the in-game "copy deck" share link.

import type { Card } from "./types";

/** Build a Clash Royale deck link that opens the 8 cards in-game. */
export function deckLink(cards: Card[]): string {
  const ids = cards.map((c) => c.id).join(";");
  return `https://link.clashroyale.com/deck/en?deck=${ids}`;
}

/** Read the 8 cards out of a Clash Royale "copy deck" link (the format the game shares, including
 *  decks built with the in-game Deck Wizard). Returns card ids, or null if there's no valid deck. */
export function parseDeckLink(text: string): number[] | null {
  const m = text.match(/deck=([0-9;%3Bb]+)/i);
  if (!m) return null;
  const ids = decodeURIComponent(m[1])
    .split(";")
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n > 0);
  return ids.length === 8 && new Set(ids).size === 8 ? ids : null;
}

/** Elixir cost distribution (count of cards at each elixir value 1..10). */
export function elixirCurve(cards: Card[]): { elixir: number; count: number }[] {
  const counts = new Map<number, number>();
  for (const c of cards) counts.set(c.elixir, (counts.get(c.elixir) ?? 0) + 1);
  return [...counts.entries()]
    .map(([elixir, count]) => ({ elixir, count }))
    .sort((a, b) => a.elixir - b.elixir);
}

/** Card-type breakdown of a deck, for at-a-glance balance checks. */
export function typeBreakdown(cards: Card[]): { troops: number; spells: number; buildings: number } {
  return {
    troops: cards.filter((c) => c.type === "Troop").length,
    spells: cards.filter((c) => c.type === "Spell").length,
    buildings: cards.filter((c) => c.type === "Building").length,
  };
}

export function avgElixir(cards: Card[]): number {
  if (cards.length === 0) return 0;
  return Math.round((cards.reduce((s, c) => s + c.elixir, 0) / cards.length) * 10) / 10;
}
