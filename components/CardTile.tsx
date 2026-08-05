"use client";

import { MAX_LEVEL, type Card, type OwnedCard } from "@/lib/types";
import { RARITY_COLOR } from "@/lib/ui";
import { fallbackCardArt, retryImageOnError } from "@/lib/img";

interface Props {
  card: Card;
  owned?: OwnedCard;
  onChange: (patch: Partial<OwnedCard> | null) => void;
}

/** Pink elixir droplet, like the in-game cost icon. */
function ElixirDrop({ cost }: { cost: number }) {
  return (
    <span
      className="absolute -left-2 -top-2 z-10 flex h-6 w-6 items-center justify-center"
      style={{
        background: "radial-gradient(circle at 35% 30%, #f06ee0, #a01f8f)",
        borderRadius: "0 50% 50% 50%",
        transform: "rotate(45deg)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.5)",
        border: "1.5px solid rgba(255,255,255,0.5)",
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
  // Form availability. Owning the form is itself proof it exists — a player who has UNLOCKED an
  // Evolution/Hero (owned.evolved / owned.hero, read live from the account's evolutionLevel
  // bitmask) must always see its pill, even when Supercell's card CATALOG hasn't yet published
  // that form's icon (a real lag for freshly-released evolutions). Otherwise fall back to what the
  // last sync saw available in the catalog, then the bundled flag for hand-added cards.
  const canEvolve = Boolean(owned?.evolved) || (owned?.evoAvailable ?? card.hasEvolution);
  const canHero = Boolean(owned?.hero) || (owned?.heroAvailable ?? card.hasHero);

  const glow = isEvolved
    ? "0 0 0 1px #ec4899, 0 0 12px rgba(236,72,153,0.55)"
    : isHero
      ? "0 0 0 1px #facc15, 0 0 12px rgba(250,204,21,0.5)"
      : isOwned
        ? "0 3px 8px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.12)"
        : "none";

  return (
    <div className="relative text-center transition" style={{ opacity: isOwned ? 1 : 0.55 }}>
      <ElixirDrop cost={card.elixir} />

      {/* One cohesive card: art, the name+level nameplate, and the controls all live inside
          the same frame, so nothing reads as a floating label outside the card. */}
      <div
        className="overflow-hidden rounded-xl"
        style={{
          border: `2px solid ${isOwned ? color : "var(--border)"}`,
          boxShadow: glow,
          background: isOwned ? "linear-gradient(180deg, #33446c, #1a2342)" : "linear-gradient(180deg, #222c4d, #151c33)",
        }}
      >
        {/* Fixed-aspect art frame + object-cover: fills identically no matter the source image's
            dimensions. Card art comes from two CDNs with different aspect ratios (Supercell 285x420,
            the RoyaleAPI fallback ~302x363), so a fixed box is what keeps every tile consistent. */}
        <div className="relative overflow-hidden" style={{ aspectRatio: "285 / 420" }}>
          {card.iconUrl || card.key ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.iconUrl ?? fallbackCardArt(card.key)}
              data-fallback={fallbackCardArt(card.key)}
              alt={card.name}
              width={285}
              height={420}
              loading="lazy"
              decoding="async"
              onError={retryImageOnError}
              className="absolute inset-0 h-full w-full object-cover object-top"
              style={{ filter: isOwned ? "none" : "grayscale(0.7) brightness(0.85)" }}
            />
          ) : (
            <div className="h-full w-full" />
          )}
          {/* Nameplate band fades up from the art bottom, holding the name + editable level. */}
          <div
            className="absolute inset-x-0 bottom-0 px-1 pb-0.5 pt-3 text-center"
            style={{ background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.85) 55%)" }}
          >
            <div
              className="truncate text-[13px] font-bold leading-tight text-white"
              style={{ textShadow: "0 1px 2px rgba(0,0,0,1)" }}
              title={card.name}
            >
              {card.name}
            </div>
            {isOwned && (
              <select
                value={owned!.level}
                onChange={(e) => onChange({ level: Number(e.target.value) })}
                className="cursor-pointer appearance-none bg-transparent text-center text-[13px] font-extrabold text-white outline-none"
                style={{ textShadow: "0 1px 1px rgba(0,0,0,1)" }}
                title="Edit level"
              >
                {Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).map((l) => (
                  <option key={l} value={l} style={{ color: "#000" }}>
                    Level {l}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Footer is reserved on EVERY card (fixed min-height) so all cards are the same height
            whether or not they have Evolution/Hero controls. Owned cards with neither just leave
            this space empty. */}
        <div className="flex min-h-[2.5rem] items-center justify-center gap-1.5 px-2 py-2">
          {!isOwned ? (
            <button
              onClick={() => onChange({})}
              className="w-full rounded px-3 py-1 text-[13px] font-semibold"
              style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}
            >
              + Own
            </button>
          ) : (
            <>
              {canEvolve && (
                <button
                  onClick={() => onChange({ evolved: !isEvolved })}
                  className="min-w-0 shrink-0 grow-0 basis-[calc(50%-0.1875rem)] whitespace-nowrap rounded px-1.5 py-1 text-[11px] font-semibold"
                  style={{
                    background: isEvolved ? "#ec4899" : "rgba(236,72,153,0.14)",
                    color: isEvolved ? "#fff" : "#f472b6",
                    border: `1px solid ${isEvolved ? "#ec4899" : "rgba(236,72,153,0.5)"}`,
                  }}
                  title={isEvolved ? "Evolution unlocked" : "Has an Evolution (not unlocked)"}
                >
                  Evo
                </button>
              )}
              {canHero && (
                <button
                  onClick={() => onChange({ hero: !isHero })}
                  className="min-w-0 shrink-0 grow-0 basis-[calc(50%-0.1875rem)] whitespace-nowrap rounded px-1.5 py-1 text-[11px] font-semibold"
                  style={{
                    background: isHero ? "#facc15" : "rgba(250,204,21,0.14)",
                    color: isHero ? "#3a2e00" : "#eab308",
                    border: `1px solid ${isHero ? "#facc15" : "rgba(250,204,21,0.5)"}`,
                  }}
                  title={isHero ? "Hero unlocked" : "Has a Hero form (not unlocked)"}
                >
                  Hero
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
