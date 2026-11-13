"use client";

import { useState } from "react";
import type { Collection } from "@/lib/types";

interface UpgradeList {
  winCondition: string;
  winRate: number;
  games: number;
  levelsShort: number;
}
interface Plan {
  competitiveLevel: number;
  targets: { key: string; name: string; level: number; targetLevel: number; lists: UpgradeList[] }[];
}

/** Which cards to level next: the upgrades that open up the most strong top-player lists. */
export default function UpgradePlan({ collection }: { collection: Collection }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ownedCount = Object.keys(collection.owned).length;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/upgrades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't build an upgrade plan.");
      setPlan(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't build an upgrade plan.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl p-6" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <h2 className="text-lg font-bold">
        <span style={{ color: "var(--accent-2)" }}>Step 4</span> · What to upgrade next
      </h2>
      <p className="mb-3 mt-1 text-sm" style={{ color: "var(--muted)" }}>
        The cards whose next levels open up the most strong top-player decks for you, so your gold goes where it wins
        games.
      </p>
      <button
        onClick={load}
        disabled={loading || ownedCount === 0}
        className="rounded-lg px-4 py-2 text-sm font-bold transition disabled:opacity-50"
        style={{ background: "var(--accent)", color: "#fff" }}
      >
        {loading ? "Planning…" : "Show my upgrade plan"}
      </button>

      {error && (
        <p className="mt-3 rounded-lg p-2 text-sm" style={{ background: "#3a1820", color: "#f87171" }}>
          {error}
        </p>
      )}

      {plan && (
        <div className="mt-4 flex flex-col gap-3">
          {plan.targets.length === 0 && (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Nothing to chase right now: every strong top-player deck is either fully leveled for you or too far away.
            </p>
          )}
          {plan.targets.map((t, i) => (
            <div key={t.key} className="rounded-lg p-3" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
              <div className="font-bold">
                {i + 1}. {t.name}{" "}
                <span className="font-semibold" style={{ color: "var(--accent-2)" }}>
                  Lv {t.level} → {t.targetLevel}
                </span>
              </div>
              <ul className="mt-1 list-disc pl-5 text-sm" style={{ color: "var(--muted)" }}>
                {t.lists.map((l) => (
                  <li key={l.winCondition}>
                    <span style={{ color: "var(--foreground)" }}>{l.winCondition}</span> list: {l.winRate}% over {l.games} top-ladder
                    games, {l.levelsShort} level{l.levelsShort === 1 ? "" : "s"} short for you in total
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {plan.targets.length > 0 && (
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Target level {plan.competitiveLevel} is the level most of your strong cards already sit at.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
