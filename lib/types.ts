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
  hasEvolution: boolean; // an Evolution form exists for this card
  hasHero: boolean; // a Hero form exists for this card (separate, stronger final form)
  iconUrl?: string | null; // default card art
  evolutionUrl?: string | null; // evolution art (if hasEvolution)
  heroUrl?: string | null; // hero art (if hasHero)
}

/** The current cap for card and king-tower levels in Clash Royale. */
export const MAX_LEVEL = 16;

/** A card the player owns, with their progression on it. `evolved`/`hero` are decoded from
 *  the API's evolutionLevel bitmask on sync, and remain editable for manual entry. */
export interface OwnedCard {
  id: number;
  level: number; // 1..MAX_LEVEL
  evolved: boolean; // player has unlocked this card's Evolution
  hero: boolean; // player has unlocked this card's Hero form
}

/** Master data for a tower troop (support card). */
export interface TowerTroop {
  id: number;
  name: string;
  rarity: Rarity;
  iconUrl?: string | null;
}

/** A tower troop the player owns, with its level. */
export interface OwnedTowerTroop {
  id: number;
  level: number; // 1..MAX_LEVEL
}

/** A player's full account state — the source of truth the generator reasons over. */
export interface Collection {
  tag: string | null; // CR player tag if synced, else null
  name: string | null; // player name if synced
  trophies: number | null;
  arena: number | null; // current arena number
  arenaName?: string | null; // arena display name from the API (e.g. "Lumberlove Cabin")
  experienceLevel: number | null; // account XP level (the star-badge number); NOT the king tower level
  wins: number | null; // career ladder wins
  losses: number | null; // career ladder losses
  battleCount: number | null; // total battles played
  kingLevel: number; // king tower level, 1..MAX_LEVEL (API doesn't expose this; derived/editable)
  owned: Record<number, OwnedCard>; // keyed by card id
  towerTroops: Record<number, OwnedTowerTroop>; // owned tower troops, keyed by id
  activeTowerTroop: number | null; // id of the tower troop in the current deck
  syncedAt: string | null; // ISO timestamp of last successful sync
  // Master data for owned cards too new to be in bundled data/cards.json, synthesized from the
  // player API at sync time so a freshly-released card still shows up without a data refresh.
  unknownCards?: Card[];
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
  source?: "curated" | "meta"; // where the deck came from
  usage?: number; // for meta decks: how many sampled top players ran it
  momentum?: number; // for meta decks: 0..1 rising-card momentum vs the previous snapshot
  metaEvolutions?: string[]; // for meta decks: the evolutions top players run in this deck
  metaTowerTroop?: string | null; // for meta decks: the tower troop top players run
}
