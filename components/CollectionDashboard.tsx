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

  // Cards released after the last data refresh arrive on sync as `unknownCards`; fold them into
  // the grid so a just-unlocked card is visible even before its metadata is bundled.
  const allCards = useMemo(() => {
    const extra = collection.unknownCards ?? [];
    if (extra.length === 0) return CARDS;
    const known = new Set(CARDS.map((c) => c.id));
    return [...CARDS, ...extra.filter((c) => !known.has(c.id))];
  }, [collection.unknownCards]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allCards.filter((c) => {
      if (rarity !== "All" && c.rarity !== rarity) return false;
      if (ownedOnly && !collection.owned[c.id]) return false;
      if (q && !c.name.toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity] || a.elixir - b.elixir || a.name.localeCompare(b.name));
  }, [allCards, search, rarity, ownedOnly, collection.owned]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">
          Your collection{" "}
          <span className="text-sm font-normal" style={{ color: "var(--muted)" }}>
            {ownedCount}/{allCards.length} cards
          </span>
        </h2>
        {/* Read-only, from the synced account. King Tower is read from the battle log's tower
            HP (fixed per level); Arena comes straight from the API. */}
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <div className="flex items-center gap-1.5" title="Your King Tower level (read from your battle log)">
            <span style={{ color: "var(--muted)" }}>King Tower</span>
            <span
              className="cursor-not-allowed rounded px-3 py-1.5 font-semibold"
              style={{ background: "var(--background)", border: "1px solid var(--border)", color: "var(--foreground)", opacity: 0.7 }}
            >
              {collection.kingLevel}
            </span>
          </div>
          <div className="flex items-center gap-1.5" title="From your synced account">
            <span style={{ color: "var(--muted)" }}>Arena</span>
            <span
              className="cursor-not-allowed rounded px-3 py-1.5 font-semibold"
              style={{ background: "var(--background)", border: "1px solid var(--border)", color: "var(--foreground)", opacity: 0.7 }}
            >
              {collection.arena != null ? collection.arena : (collection.arenaName || "—")}
            </span>
          </div>
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
