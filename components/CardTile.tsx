"use client";

import { MAX_LEVEL, type Card, type OwnedCard } from "@/lib/types";
import { RARITY_COLOR } from "@/lib/ui";

interface Props {
  card: Card;
  owned?: OwnedCard;
  onChange: (patch: Partial<OwnedCard> | null) => void;
}

/** Pink elixir droplet, like the in-game cost icon. */
function ElixirDrop({ cost }: { cost: number }) {
  return (
    <span
      className="absolute -left-2 -top-2 flex h-6 w-6 items-center justify-center"
      style={{
        background: "linear-gradient(160deg, #e94fd0, #a01f8f)",
        borderRadius: "0 50% 50% 50%",
        transform: "rotate(45deg)",
        boxShadow: "0 1px 2px rgba(0,0,0,0.4)",
      }}
    >
      <span className="text-[11px] font-extrabold text-white" style={{ transform: "rotate(-45deg)" }}>
        {cost}
      </span>
    </span>
  );
}

export default function CardTile({ card, owned, onChange }: Props) {
  const color = RARITY_COLOR[card.rarity];
  const isOwned = Boolean(owned);
  const isEvolved = Boolean(owned?.evolved);
  const isHero = Boolean(owned?.hero);

  return (
    <div
      className="relative flex flex-col items-center rounded-xl p-3 text-center transition"
      style={{
        background: isOwned ? "var(--surface-2)" : "var(--surface)",
        border: `1px solid ${isOwned ? color : "var(--border)"}`,
        opacity: isOwned ? 1 : 0.5,
        minHeight: 188,
      }}
    >
      <ElixirDrop cost={card.elixir} />

      {card.iconUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={card.iconUrl}
          alt={card.name}
          loading="lazy"
          className="mx-auto h-16 w-auto"
          style={{ filter: isOwned ? "none" : "grayscale(0.6)" }}
        />
      )}

      <div className="mt-1 truncate text-[13px] font-semibold" style={{ color }} title={card.name}>
        {card.name}
      </div>


      {isOwned ? (
        <div className="mt-auto flex flex-col items-center gap-1.5 pt-2">
          <div className="flex items-center gap-1">
            <label className="text-[10px]" style={{ color: "var(--muted)" }}>
              lvl
            </label>
            <select
              value={owned!.level}
              onChange={(e) => onChange({ level: Number(e.target.value) })}
              className="rounded bg-[var(--background)] px-1.5 py-0.5 text-[12px] outline-none"
              style={{ border: "1px solid var(--border)" }}
            >
              {Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          {(card.hasEvolution || card.hasHero) && (
            <div className="flex flex-wrap justify-center gap-1.5">
              {card.hasEvolution && (
                <button
                  onClick={() => onChange({ evolved: !isEvolved })}
                  className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                  style={{
                    background: isEvolved ? "#ec4899" : "transparent",
                    color: isEvolved ? "#fff" : "var(--muted)",
                    border: `1px solid ${isEvolved ? "#ec4899" : "var(--border)"}`,
                  }}
                  title={isEvolved ? "Evolution unlocked" : "Has an Evolution (not unlocked)"}
                >
                  Evo
                </button>
              )}
              {card.hasHero && (
                <button
                  onClick={() => onChange({ hero: !isHero })}
                  className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                  style={{
                    background: isHero ? "#facc15" : "transparent",
                    color: isHero ? "#3a2e00" : "var(--muted)",
                    border: `1px solid ${isHero ? "#facc15" : "var(--border)"}`,
                  }}
                  title={isHero ? "Hero unlocked" : "Has a Hero form (not unlocked)"}
                >
                  Hero
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={() => onChange({})}
          className="mt-auto rounded px-3 py-0.5 text-[12px] font-semibold"
          style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}
        >
          + Own
        </button>
      )}
    </div>
  );
}
