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
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
        {TOWER_TROOPS.map((troop) => {
          const owned = collection.towerTroops[troop.id];
          const isActive = collection.activeTowerTroop === troop.id;
          const color = RARITY_COLOR[troop.rarity];
          return (
            <div
              key={troop.id}
              className="flex items-center gap-2 rounded-lg p-2"
              style={{
                background: owned ? "var(--surface-2)" : "var(--surface)",
                border: `1px solid ${isActive ? "var(--accent-2)" : owned ? color : "var(--border)"}`,
                opacity: owned ? 1 : 0.55,
              }}
            >
              {troop.iconUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={troop.iconUrl} alt={troop.name} loading="lazy" className="h-10 w-auto" style={{ filter: owned ? "none" : "grayscale(0.6)" }} />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold" style={{ color }}>
                  {troop.name}
                </div>
                {owned ? (
                  <div className="mt-0.5 flex items-center gap-2">
                    <select
                      value={owned.level}
                      onChange={(e) => onTroopChange(troop.id, { level: Number(e.target.value) })}
                      className="rounded bg-[var(--background)] px-1 py-0.5 text-[11px] outline-none"
                      style={{ border: "1px solid var(--border)" }}
                    >
                      {Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).map((l) => (
                        <option key={l} value={l}>
                          lvl {l}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => onSetActive(isActive ? null : troop.id)}
                      className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                      style={{
                        background: isActive ? "var(--accent-2)" : "transparent",
                        color: isActive ? "#1a1300" : "var(--muted)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      {isActive ? "Active" : "Set active"}
                    </button>
                    <button
                      onClick={() => onTroopChange(troop.id, null)}
                      className="text-[10px]"
                      style={{ color: "var(--muted)" }}
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => onTroopChange(troop.id, {})}
                    className="mt-0.5 rounded px-2 py-0.5 text-[11px] font-semibold"
                    style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}
                  >
                    + Own
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
