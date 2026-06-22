"use client";

import { useEffect, useState } from "react";
import type { Collection, OwnedCard, OwnedTowerTroop } from "@/lib/types";
import {
  emptyCollection,
  loadCollection,
  saveCollection,
  loadDecks,
  saveDecks,
  setOwned,
  setTowerTroop,
  type SavedDeck,
} from "@/lib/store";
import SyncBar from "@/components/SyncBar";
import CollectionDashboard from "@/components/CollectionDashboard";
import TowerTroops from "@/components/TowerTroops";
import Generator from "@/components/Generator";
import SavedDecks from "@/components/SavedDecks";

export default function Home() {
  const [collection, setCollection] = useState<Collection>(emptyCollection());
  const [decks, setDecks] = useState<SavedDeck[]>([]);
  const [ready, setReady] = useState(false);

  // Hydrate from localStorage on mount.
  useEffect(() => {
    setCollection(loadCollection());
    setDecks(loadDecks());
    setReady(true);
  }, []);

  function updateCollection(next: Collection) {
    setCollection(next);
    saveCollection(next);
  }

  function handleCardChange(cardId: number, patch: Partial<OwnedCard> | null) {
    updateCollection(setOwned(collection, cardId, patch));
  }

  function handleMetaChange(patch: Partial<Pick<Collection, "kingLevel" | "arena">>) {
    updateCollection({ ...collection, ...patch });
  }

  function handleTroopChange(troopId: number, patch: Partial<OwnedTowerTroop> | null) {
    let next = setTowerTroop(collection, troopId, patch);
    // Clearing the active troop also clears the active selection.
    if (patch === null && next.activeTowerTroop === troopId) {
      next = { ...next, activeTowerTroop: null };
    }
    updateCollection(next);
  }

  function handleSetActive(troopId: number | null) {
    updateCollection({ ...collection, activeTowerTroop: troopId });
  }

  function handleSynced(synced: Collection) {
    // Evolution/Hero unlocks are decoded accurately from the API on sync, so it's authoritative.
    updateCollection(synced);
  }

  function handleSave(deck: SavedDeck) {
    if (decks.some((d) => d.id === deck.id)) return;
    const next = [deck, ...decks];
    setDecks(next);
    saveDecks(next);
  }

  function handleDelete(id: string) {
    const next = decks.filter((d) => d.id !== id);
    setDecks(next);
    saveDecks(next);
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
      <header className="mb-5">
        <h1 className="text-2xl font-extrabold tracking-tight">
          Clash Royale <span style={{ color: "var(--accent-2)" }}>Deck Builder</span>
        </h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Proven decks, filtered to the cards you actually own — coached like a pro.
        </p>
      </header>

      {ready && (
        <div className="flex flex-col gap-5">
          <SyncBar collection={collection} onSynced={handleSynced} />
          {/* Primary action first */}
          <Generator collection={collection} onSave={handleSave} />
          <SavedDecks decks={decks} onDelete={handleDelete} />
          {/* Your collection */}
          <CollectionDashboard
            collection={collection}
            onCardChange={handleCardChange}
            onMetaChange={handleMetaChange}
          />
          <TowerTroops
            collection={collection}
            onTroopChange={handleTroopChange}
            onSetActive={handleSetActive}
          />
        </div>
      )}

      <footer className="mt-8 text-center text-xs" style={{ color: "var(--muted)" }}>
        Card data via RoyaleAPI. Not affiliated with Supercell.
      </footer>
    </main>
  );
}
