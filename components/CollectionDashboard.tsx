"use client";

import { useMemo, useState } from "react";
import { CARDS } from "@/lib/cards";
import { type Collection, type OwnedCard, type Rarity } from "@/lib/types";
import CardTile from "./CardTile";

const RARITIES: (Rarity | "All")[] = ["All", "Common", "Rare", "Epic", "Legendary", "Champion"];
const RARITY_ORDER: Record<Rarity, number> = {
  Common: 0,
  Rare: 1,
  Epic: 2,
  Legendary: 3,
  Champion: 4,
};

interface Props {
  collection: Collection;
  onCardChange: (cardId: number, patch: Partial<OwnedCard> | null) => void;
}

export default function CollectionDashboard({ collection, onCardChange }: Props) {
  const [search, setSearch] = useState("");
  const [rarity, setRarity] = useState<Rarity | "All">("All");
  const [ownedOnly, setOwnedOnly] = useState(false);

  const ownedCount = Object.keys(collection.owned).length;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return CARDS.filter((c) => {
      if (rarity !== "All" && c.rarity !== rarity) return false;
      if (ownedOnly && !collection.owned[c.id]) return false;
      if (q && !c.name.toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity] || a.elixir - b.elixir || a.name.localeCompare(b.name));
  }, [search, rarity, ownedOnly, collection.owned]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">
          Your collection{" "}
          <span className="text-sm font-normal" style={{ color: "var(--muted)" }}>
            {ownedCount}/{CARDS.length} cards
          </span>
        </h2>
        {/* Arena comes straight from the synced account (read-only). The official API does not
            expose King Tower level, so we don't show it rather than show a guess. */}
        <div className="flex items-center gap-1.5 text-sm" title="From your synced account">
          <span style={{ color: "var(--muted)" }}>Arena</span>
          <span
            className="cursor-not-allowed rounded px-3 py-1.5 font-semibold"
            style={{ background: "var(--background)", border: "1px solid var(--border)", color: "var(--foreground)", opacity: 0.7 }}
          >
            {collection.arena ?? "—"}
          </span>
        </div>
      </div>

      <p className="mb-3 text-sm" style={{ color: "var(--muted)" }}>
        Auto-filled when you sync. Tap any card to edit its level or mark its Evolution or Hero form. These edits drive
        the suggestions above.
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search cards…"
          className="flex-1 rounded-lg bg-[var(--background)] px-3 py-1.5 text-sm outline-none"
          style={{ border: "1px solid var(--border)", minWidth: 160 }}
        />
        <div className="flex flex-wrap gap-1">
          {RARITIES.map((r) => (
            <button
              key={r}
              onClick={() => setRarity(r)}
              className="rounded-lg px-2.5 py-1 text-xs font-semibold transition"
              style={{
                background: rarity === r ? "var(--accent)" : "var(--surface-2)",
                color: rarity === r ? "#fff" : "var(--muted)",
                border: "1px solid var(--border)",
              }}
            >
              {r}
            </button>
          ))}
        </div>
        <button
          onClick={() => setOwnedOnly((v) => !v)}
          className="rounded-lg px-2.5 py-1 text-xs font-semibold"
          style={{
            background: ownedOnly ? "var(--accent)" : "var(--surface-2)",
            color: ownedOnly ? "#fff" : "var(--muted)",
            border: "1px solid var(--border)",
          }}
        >
          Owned only
        </button>
      </div>

      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(128px, 1fr))" }}
      >
        {visible.map((card) => (
          <CardTile
            key={card.id}
            card={card}
            owned={collection.owned[card.id]}
            onChange={(patch) => onCardChange(card.id, patch)}
          />
        ))}
      </div>
      {visible.length === 0 && (
        <p className="py-6 text-center text-sm" style={{ color: "var(--muted)" }}>
          No cards match your filters.
        </p>
      )}
    </div>
  );
}
