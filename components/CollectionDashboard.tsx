"use client";

import { useMemo, useState } from "react";
import { CARDS } from "@/lib/cards";
import { MAX_LEVEL, type Collection, type OwnedCard, type Rarity } from "@/lib/types";
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
  onMetaChange: (patch: Partial<Pick<Collection, "kingLevel" | "arena">>) => void;
}

export default function CollectionDashboard({ collection, onCardChange, onMetaChange }: Props) {
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
    <section className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">
          Your Collection{" "}
          <span className="text-sm font-normal" style={{ color: "var(--muted)" }}>
            {ownedCount}/{CARDS.length} cards
          </span>
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          {collection.experienceLevel != null && (
            <span className="text-sm" style={{ color: "var(--muted)" }} title="Account experience level (star badge)">
              Exp lvl {collection.experienceLevel}
            </span>
          )}
          <label className="flex items-center gap-1.5 text-sm">
            <span style={{ color: "var(--muted)" }} title="King Tower level (the API doesn't provide this; estimated from your cards, edit if needed)">
              King Tower
            </span>
            <select
              value={collection.kingLevel}
              onChange={(e) => onMetaChange({ kingLevel: Number(e.target.value) })}
              className="rounded bg-[var(--background)] px-2 py-1 text-sm outline-none"
              style={{ border: "1px solid var(--border)" }}
            >
              {Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <span style={{ color: "var(--muted)" }}>Arena</span>
            <input
              type="number"
              min={0}
              max={30}
              value={collection.arena ?? ""}
              placeholder="—"
              onChange={(e) => onMetaChange({ arena: e.target.value === "" ? null : Number(e.target.value) })}
              className="w-16 rounded bg-[var(--background)] px-2 py-1 text-sm outline-none"
              style={{ border: "1px solid var(--border)" }}
            />
          </label>
        </div>
      </div>

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
    </section>
  );
}
