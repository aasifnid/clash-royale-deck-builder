// Client-side persistence (localStorage). Single-user hobby app — no backend DB.

import type { Collection, OwnedCard, OwnedTowerTroop } from "./types";

// v2: evolution unlock is now a manual, persisted flag (the API can't provide it
// reliably). Bumping the key discards stale caches that had API-derived evolved flags.
const COLLECTION_KEY = "crdb:collection:v2";
const DECKS_KEY = "crdb:decks";

export interface SavedDeck {
  id: string;
  name: string;
  archetype: string;
  cardKeys: string[]; // 8 card keys
  avgElixir: number;
  savedAt: string;
  summary?: string;
}

export function emptyCollection(): Collection {
  return {
    tag: null,
    name: null,
    trophies: null,
    arena: null,
    experienceLevel: null,
    wins: null,
    losses: null,
    battleCount: null,
    kingLevel: 11,
    owned: {},
    towerTroops: {},
    activeTowerTroop: null,
    syncedAt: null,
  };
}

export function loadCollection(): Collection {
  if (typeof window === "undefined") return emptyCollection();
  try {
    const raw = localStorage.getItem(COLLECTION_KEY);
    if (!raw) return emptyCollection();
    return { ...emptyCollection(), ...JSON.parse(raw) };
  } catch {
    return emptyCollection();
  }
}

export function saveCollection(c: Collection): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(COLLECTION_KEY, JSON.stringify(c));
}

export function loadDecks(): SavedDeck[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(DECKS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveDecks(decks: SavedDeck[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(DECKS_KEY, JSON.stringify(decks));
}

/** Merge a freshly-synced collection over the existing one, keeping manual king/arena edits
 *  only when the sync didn't provide them. Synced card data replaces owned cards wholesale. */
export function applySync(synced: Collection): Collection {
  return { ...synced };
}

/** Set or clear a single owned card (manual editing). */
export function setOwned(
  collection: Collection,
  cardId: number,
  patch: Partial<OwnedCard> | null,
): Collection {
  const owned = { ...collection.owned };
  if (patch === null) {
    delete owned[cardId];
  } else {
    const existing = owned[cardId] ?? {
      id: cardId,
      level: collection.kingLevel,
      evolved: false,
      hero: false,
    };
    owned[cardId] = { ...existing, ...patch, id: cardId };
  }
  return { ...collection, owned };
}

/** Set or clear an owned tower troop (manual editing). */
export function setTowerTroop(
  collection: Collection,
  troopId: number,
  patch: Partial<OwnedTowerTroop> | null,
): Collection {
  const towerTroops = { ...collection.towerTroops };
  if (patch === null) {
    delete towerTroops[troopId];
  } else {
    const existing = towerTroops[troopId] ?? { id: troopId, level: collection.kingLevel };
    towerTroops[troopId] = { ...existing, ...patch, id: troopId };
  }
  return { ...collection, towerTroops };
}
