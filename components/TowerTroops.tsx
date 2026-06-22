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
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
        {TOWER_TROOPS.map((troop) => {
          const owned = collection.towerTroops[troop.id];
          const isActive = collection.activeTowerTroop === troop.id;
          const color = RARITY_COLOR[troop.rarity];
          return (
            <div
              key={troop.id}
              className="relative flex flex-col items-center rounded-xl p-3 text-center transition"
              style={{
                background: owned ? "var(--surface-2)" : "var(--surface)",
                border: `1px solid ${isActive ? "var(--accent-2)" : owned ? color : "var(--border)"}`,
                opacity: owned ? 1 : 0.5,
              }}
            >
              {troop.iconUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={troop.iconUrl}
                  alt={troop.name}
                  loading="lazy"
                  className="mx-auto h-14 w-auto"
                  style={{ filter: owned ? "none" : "grayscale(0.6)" }}
                />
              )}

              <div className="mt-1 truncate text-[13px] font-semibold" style={{ color }} title={troop.name}>
                {troop.name}
              </div>
              <div className="text-[10px]" style={{ color: "var(--muted)" }}>
                {troop.rarity}
              </div>

              {owned ? (
                <div className="mt-2 flex w-full flex-col items-center gap-1.5">
                  <div className="flex items-center gap-1">
                    <label className="text-[10px]" style={{ color: "var(--muted)" }}>
                      lvl
                    </label>
                    <select
                      value={owned.level}
                      onChange={(e) => onTroopChange(troop.id, { level: Number(e.target.value) })}
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
                </div>
              ) : (
                <button
                  onClick={() => onTroopChange(troop.id, {})}
                  className="mt-2 rounded px-3 py-0.5 text-[12px] font-semibold"
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
