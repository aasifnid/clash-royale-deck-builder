"use client";

import { MAX_LEVEL, type Card, type OwnedCard } from "@/lib/types";
import { RARITY_COLOR } from "@/lib/ui";

interface Props {
  card: Card;
  owned?: OwnedCard;
  onChange: (patch: Partial<OwnedCard> | null) => void;
}

export default function CardTile({ card, owned, onChange }: Props) {
  const color = RARITY_COLOR[card.rarity];
  const isOwned = Boolean(owned);

  return (
    <div
      className="relative rounded-lg p-2 text-center transition"
      style={{
        background: isOwned ? "var(--surface-2)" : "var(--surface)",
        border: `1px solid ${isOwned ? color : "var(--border)"}`,
        opacity: isOwned ? 1 : 0.55,
      }}
    >
      {/* elixir cost */}
      <span
        className="absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-white"
        style={{ backgroundColor: "#b5179e" }}
      >
        {card.elixir}
      </span>

      {/* champion / evo markers */}
      {card.rarity === "Champion" && (
        <span className="absolute -right-1.5 -top-1.5 text-[10px]" title="Champion">👑</span>
      )}

      <div className="mt-1 truncate text-xs font-semibold" style={{ color }} title={card.name}>
        {card.name}
      </div>
      <div className="text-[10px]" style={{ color: "var(--muted)" }}>
        {card.rarity}
      </div>

      {isOwned ? (
        <div className="mt-1.5 flex flex-col items-center gap-1">
          <div className="flex items-center gap-1">
            <label className="text-[10px]" style={{ color: "var(--muted)" }}>
              lvl
            </label>
            <select
              value={owned!.level}
              onChange={(e) => onChange({ level: Number(e.target.value) })}
              className="rounded bg-[var(--background)] px-1 py-0.5 text-[11px] outline-none"
              style={{ border: "1px solid var(--border)" }}
            >
              {Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            {card.hasEvolution && (
              <button
                onClick={() => onChange({ evolved: !owned!.evolved })}
                className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                style={{
                  background: owned!.evolved ? "var(--accent-2)" : "transparent",
                  color: owned!.evolved ? "#1a1300" : "var(--muted)",
                  border: "1px solid var(--border)",
                }}
                title="Evolution unlocked"
              >
                EVO
              </button>
            )}
            <button
              onClick={() => onChange(null)}
              className="rounded px-1.5 py-0.5 text-[10px]"
              style={{ color: "var(--muted)", border: "1px solid var(--border)" }}
              title="Remove from collection"
            >
              ✕
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => onChange({})}
          className="mt-1.5 rounded px-2 py-0.5 text-[11px] font-semibold"
          style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}
        >
          + Own
        </button>
      )}
    </div>
  );
}
