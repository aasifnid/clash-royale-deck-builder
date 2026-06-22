"use client";

import { MAX_LEVEL, type Collection, type OwnedTowerTroop } from "@/lib/types";
import { TOWER_TROOPS } from "@/lib/support";
import { RARITY_COLOR } from "@/lib/ui";

interface Props {
  collection: Collection;
  onTroopChange: (troopId: number, patch: Partial<OwnedTowerTroop> | null) => void;
  onSetActive: (troopId: number | null) => void;
}

export default function TowerTroops({ collection, onTroopChange, onSetActive }: Props) {
  return (
    <section className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <h2 className="mb-3 text-lg font-bold">Tower Troops</h2>
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
            <div
              key={troop.id}
              className="relative rounded-xl p-1.5 text-center transition"
              style={{
                background: owned ? "linear-gradient(180deg, #33446c, #1a2342)" : "linear-gradient(180deg, #222c4d, #151c33)",
                border: `2px solid ${isActive ? "var(--accent-2)" : owned ? color : "var(--border)"}`,
                boxShadow: glow,
                opacity: owned ? 1 : 0.55,
              }}
            >
              <div className="relative overflow-hidden rounded-lg" style={{ boxShadow: "inset 0 2px 6px rgba(0,0,0,0.45)" }}>
                {troop.iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={troop.iconUrl}
                    alt={troop.name}
                    loading="lazy"
                    className="block w-full"
                    style={{ marginTop: "-16%", filter: owned ? "none" : "grayscale(0.7) brightness(0.85)" }}
                  />
                ) : (
                  <div className="h-24 w-full" />
                )}
                {owned && (
                  <div className="absolute inset-x-0 bottom-0 flex justify-center py-0.5" style={{ background: "rgba(0,0,0,0.74)" }}>
                    <select
                      value={owned.level}
                      onChange={(e) => onTroopChange(troop.id, { level: Number(e.target.value) })}
                      className="cursor-pointer appearance-none bg-transparent text-center text-[12px] font-extrabold text-white outline-none"
                      style={{ textShadow: "0 1px 1px rgba(0,0,0,1)" }}
                      title="Edit level"
                    >
                      {Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).map((l) => (
                        <option key={l} value={l} style={{ color: "#000" }}>
                          Level {l}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="mt-1 truncate text-[12px] font-semibold" style={{ color }} title={troop.name}>
                {troop.name}
              </div>

              {owned ? (
                <button
                  onClick={() => onSetActive(isActive ? null : troop.id)}
                  className="mt-1.5 w-full rounded px-2 py-1 text-[11px] font-semibold"
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
                  className="mt-1.5 rounded px-3 py-0.5 text-[12px] font-semibold"
                  style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}
                >
                  + Own
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
