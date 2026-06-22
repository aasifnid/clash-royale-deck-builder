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
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <header className="mb-8">
        <div
          className="mb-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--muted)" }}
        >
          🏆 An experiment by{" "}
          <a href="https://aasifanwar.vercel.app" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-2)" }}>
            Aasif Anwar
          </a>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Clash Royale <span style={{ color: "var(--accent-2)" }}>Deck Builder</span>
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed" style={{ color: "var(--muted)" }}>
          It reads your real card collection, levels and evolutions included, then gives you the strongest current
          top-ladder decks you can actually field. No more generic lists that assume maxed cards you do not have.
        </p>
      </header>

      {ready && (
        <div className="flex flex-col gap-6">
          <SyncBar collection={collection} onSynced={handleSynced} />
          {/* Primary action first */}
          <Generator collection={collection} onSave={handleSave} />
          <SavedDecks decks={decks} onDelete={handleDelete} />
          {/* Your account: cards + tower troops in one panel */}
          <section className="rounded-xl p-6" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <CollectionDashboard
              collection={collection}
              onCardChange={handleCardChange}
              onMetaChange={handleMetaChange}
            />
            <div className="mt-6 border-t pt-5" style={{ borderColor: "var(--border)" }}>
              <TowerTroops
                collection={collection}
                onTroopChange={handleTroopChange}
                onSetActive={handleSetActive}
              />
            </div>
          </section>
        </div>
      )}

      <footer className="mt-8 text-center text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
        Decks from the current top-ladder meta (official Clash Royale API) and proven archetypes. Card data and art via
        RoyaleAPI. Not affiliated with Supercell.
      </footer>
    </main>
  );
}
