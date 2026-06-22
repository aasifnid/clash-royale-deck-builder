// Shared domain types for the deck builder.

export type CardType = "Troop" | "Building" | "Spell";
export type Rarity = "Common" | "Rare" | "Epic" | "Legendary" | "Champion";

/** Static master data for a card (bundled in data/cards.json). */
export interface Card {
  id: number; // matches the official /players/{tag} card id
  key: string; // slug, e.g. "hog-rider"
  name: string; // display name, e.g. "Hog Rider"
  elixir: number;
  type: CardType;
  rarity: Rarity;
  arena: number; // arena the card unlocks in
  hasEvolution: boolean; // evolution exists for this card (hint; data source may lag)
}

/** The current cap for card and king-tower levels in Clash Royale. */
export const MAX_LEVEL = 15;

/** A card the player owns, with their progression on it. */
export interface OwnedCard {
  id: number;
  level: number; // 1..MAX_LEVEL
  evolved: boolean; // player has unlocked the evolution
  starLevel: number; // 0 = none, 1..3 = star level
}

/** A player's full account state — the source of truth the generator reasons over. */
export interface Collection {
  tag: string | null; // CR player tag if synced, else null
  name: string | null; // player name if synced
  trophies: number | null;
  arena: number | null; // current arena number
  kingLevel: number; // 1..MAX_LEVEL
  owned: Record<number, OwnedCard>; // keyed by card id
  syncedAt: string | null; // ISO timestamp of last successful sync
}

/** One slot in a proven deck, naming the canonical card plus pro-known substitutes. */
export interface DeckSlot {
  cardKey: string; // canonical card for this slot
  role: string; // e.g. "win-condition", "spell", "air-defense", "cycle"
  substitutes: string[]; // pro-known alternatives, best-first
}

/** A proven, battle-tested deck the generator is grounded in. */
export interface ProvenDeck {
  id: string;
  name: string;
  archetype: string; // Beatdown | Cycle | Bridge Spam | Siege | Bait | Control | ...
  winCondition: string;
  skillFloor: number; // 1 (very forgiving) .. 5 (hard to pilot)
  minArena: number; // arena where this deck becomes viable
  slots: DeckSlot[]; // 8 slots
  notes?: string; // short gameplan hint
}
