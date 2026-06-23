"use client";

import { MAX_LEVEL, type Collection, type OwnedTowerTroop } from "@/lib/types";
import { TOWER_TROOPS } from "@/lib/support";
import { RARITY_COLOR } from "@/lib/ui";
import { retryImageOnError } from "@/lib/img";

interface Props {
  collection: Collection;
  onTroopChange: (troopId: number, patch: Partial<OwnedTowerTroop> | null) => void;
  onSetActive: (troopId: number | null) => void;
}

export default function TowerTroops({ collection, onTroopChange, onSetActive }: Props) {
  return (
    <div>
      <h2 className="mb-3 text-lg font-bold">Tower troops</h2>
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(132px, 1fr))" }}>
        {TOWER_TROOPS.map((troop) => {
          const owned = collection.towerTroops[troop.id];
          const isActive = collection.activeTowerTroop === troop.id;
          const color = RARITY_COLOR[troop.rarity];
          const glow = isActive
            ? "0 0 0 1px var(--accent-2), 0 0 12px rgba(255,194,61,0.55)"
            : owned
              ? "0 3px 8px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.12)"
              : "none";
          return (
            <div key={troop.id} className="relative text-center transition" style={{ opacity: owned ? 1 : 0.55 }}>
              <div
                className="overflow-hidden rounded-xl"
                style={{
                  border: `2px solid ${isActive ? "var(--accent-2)" : owned ? color : "var(--border)"}`,
                  boxShadow: glow,
                  background: owned ? "linear-gradient(180deg, #33446c, #1a2342)" : "linear-gradient(180deg, #222c4d, #151c33)",
                }}
              >
                <div className="relative">
                  {troop.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={troop.iconUrl}
                      alt={troop.name}
                      loading="lazy"
                      decoding="async"
                      onError={retryImageOnError}
                      className="block w-full"
                      style={{ marginTop: "-14%", filter: owned ? "none" : "grayscale(0.7) brightness(0.85)" }}
                    />
                  ) : (
                    <div className="h-24 w-full" />
                  )}
                  {/* Nameplate inside the frame: name + editable level. */}
                  <div
                    className="absolute inset-x-0 bottom-0 px-1 pb-0.5 pt-3 text-center"
                    style={{ background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.85) 55%)" }}
                  >
                    <div className="truncate text-[13px] font-bold leading-tight text-white" style={{ textShadow: "0 1px 2px rgba(0,0,0,1)" }} title={troop.name}>
                      {troop.name}
                    </div>
                    {owned && (
                      <select
                        value={owned.level}
                        onChange={(e) => onTroopChange(troop.id, { level: Number(e.target.value) })}
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

                {/* Action sits on the card's footer, inside the frame. */}
                <div className="px-1.5 py-1.5">
                  {owned ? (
                    <button
                      onClick={() => onSetActive(isActive ? null : troop.id)}
                      className="w-full rounded px-2 py-1 text-[11px] font-semibold"
                      style={{
                        background: isActive ? "var(--accent-2)" : "transparent",
                        color: isActive ? "#1a1300" : "var(--muted)",
                        border: `1px solid ${isActive ? "var(--accent-2)" : "var(--border)"}`,
                      }}
                    >
                      {isActive ? "Active" : "Set active"}
                    </button>
                  ) : (
                    <button
                      onClick={() => onTroopChange(troop.id, {})}
                      className="w-full rounded px-3 py-0.5 text-[12px] font-semibold"
                      style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}
                    >
                      + Own
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
