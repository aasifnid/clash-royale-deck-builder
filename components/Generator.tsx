"use client";

import { useState } from "react";
import type { Collection } from "@/lib/types";
import { archetypes, type EasePreference } from "@/lib/fieldability";
import { cardByKey } from "@/lib/cards";
import { deckLink } from "@/lib/deck";
import { difficultyColor, RARITY_COLOR } from "@/lib/ui";
import type { SavedDeck } from "@/lib/store";

interface PickCard {
  role: string;
  key: string | null;
  name: string | null;
  level: number;
  isSubstitute: boolean;
  isMissing: boolean;
}
interface EnrichedPick {
  coach: {
    deckId: string;
    summary: string;
    gameplan: string;
    winCondition: string;
    counters: string;
    playTips: string;
    difficulty: "Easy" | "Medium" | "Hard";
  };
  deckId: string;
  name: string;
  archetype: string;
  winCondition: string;
  avgElixir: number;
  fieldable: boolean;
  substitutions: { role: string; from: string; to: string }[];
  cards: PickCard[];
}
interface GenerateResponse {
  coachUsed: boolean;
  picks: EnrichedPick[];
  shortlist: EnrichedPick[];
}

const ARCHETYPES = ["auto", ...archetypes()];
const EASES: { value: EasePreference; label: string }[] = [
  { value: "forgiving", label: "Easy to play" },
  { value: "any", label: "Any" },
  { value: "challenge", label: "High skill" },
];

function DeckCards({ cards }: { cards: PickCard[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {cards.map((c, i) => {
        const card = c.key ? cardByKey(c.key) : undefined;
        const color = card ? RARITY_COLOR[card.rarity] : "var(--border)";
        return (
          <div
            key={i}
            className="rounded px-2 py-1 text-center"
            style={{ background: "var(--surface-2)", border: `1px solid ${color}`, minWidth: 72 }}
            title={c.role}
          >
            <div className="truncate text-[11px] font-semibold" style={{ color }}>
              {c.name ?? "—"}
            </div>
            <div className="text-[10px]" style={{ color: "var(--muted)" }}>
              {card ? `${card.elixir}⚡ · lvl ${c.level}` : c.role}
              {c.isSubstitute ? " · sub" : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface Props {
  collection: Collection;
  onSave: (deck: SavedDeck) => void;
}

export default function Generator({ collection, onSave }: Props) {
  const [archetype, setArchetype] = useState("auto");
  const [ease, setEase] = useState<EasePreference>("forgiving");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const ownedCount = Object.keys(collection.owned).length;

  async function generate() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection, archetype, ease }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed.");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setLoading(false);
    }
  }

  function copyLink(pick: EnrichedPick) {
    const cards = pick.cards.map((c) => (c.key ? cardByKey(c.key) : undefined)).filter(Boolean);
    if (cards.length < 8) return;
    navigator.clipboard.writeText(deckLink(cards as NonNullable<(typeof cards)[number]>[]));
    setCopied(pick.deckId);
    setTimeout(() => setCopied((c) => (c === pick.deckId ? null : c)), 1500);
  }

  function save(pick: EnrichedPick) {
    onSave({
      id: `${pick.deckId}-${pick.cards.map((c) => c.key).join("")}`.slice(0, 80),
      name: pick.name,
      archetype: pick.archetype,
      cardKeys: pick.cards.map((c) => c.key).filter(Boolean) as string[],
      avgElixir: pick.avgElixir,
      savedAt: new Date().toISOString(),
      summary: pick.coach.summary,
    });
  }

  return (
    <section className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <h2 className="mb-3 text-lg font-bold">Generate a Deck</h2>

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block" style={{ color: "var(--muted)" }}>
            Archetype
          </span>
          <select
            value={archetype}
            onChange={(e) => setArchetype(e.target.value)}
            className="rounded-lg bg-[var(--background)] px-3 py-1.5 text-sm outline-none"
            style={{ border: "1px solid var(--border)" }}
          >
            {ARCHETYPES.map((a) => (
              <option key={a} value={a}>
                {a === "auto" ? "Best for me" : a}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block" style={{ color: "var(--muted)" }}>
            Style
          </span>
          <select
            value={ease}
            onChange={(e) => setEase(e.target.value as EasePreference)}
            className="rounded-lg bg-[var(--background)] px-3 py-1.5 text-sm outline-none"
            style={{ border: "1px solid var(--border)" }}
          >
            {EASES.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={generate}
          disabled={loading || ownedCount === 0}
          className="rounded-lg px-4 py-2 text-sm font-bold transition disabled:opacity-50"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          {loading ? "Coaching…" : "Generate"}
        </button>
        {ownedCount === 0 && (
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            Add some owned cards first.
          </span>
        )}
      </div>

      {error && (
        <p className="rounded-lg p-2 text-sm" style={{ background: "#3a1820", color: "#f87171" }}>
          {error}
        </p>
      )}

      {result && (
        <div className="flex flex-col gap-4">
          {!result.coachUsed && (
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              AI coaching was unavailable, showing the best deck the engine found for your collection.
            </p>
          )}
          {result.picks.length === 0 && (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              No fieldable decks found. Try a different archetype or add more cards.
            </p>
          )}
          {result.picks.map((pick) => (
            <div
              key={pick.deckId}
              className="rounded-lg p-3"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold">{pick.name}</h3>
                  <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--background)", color: "var(--muted)" }}>
                    {pick.archetype}
                  </span>
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                    style={{ background: "var(--background)", color: difficultyColor(pick.coach.difficulty) }}
                  >
                    {pick.coach.difficulty}
                  </span>
                  <span className="text-[11px]" style={{ color: "var(--muted)" }}>
                    {pick.avgElixir} avg elixir
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => copyLink(pick)}
                    className="rounded px-2.5 py-1 text-xs font-semibold"
                    style={{ background: "var(--background)", border: "1px solid var(--border)" }}
                  >
                    {copied === pick.deckId ? "Copied!" : "Copy deck link"}
                  </button>
                  <button
                    onClick={() => save(pick)}
                    className="rounded px-2.5 py-1 text-xs font-semibold"
                    style={{ background: "var(--accent-2)", color: "#1a1300" }}
                  >
                    Save
                  </button>
                </div>
              </div>

              {pick.coach.summary && (
                <p className="mb-2 text-sm" style={{ color: "var(--foreground)" }}>
                  {pick.coach.summary}
                </p>
              )}

              <div className="mb-3">
                <DeckCards cards={pick.cards} />
              </div>

              <div className="grid gap-2 text-sm sm:grid-cols-2">
                {pick.coach.gameplan && <Field label="Gameplan" value={pick.coach.gameplan} />}
                {pick.coach.winCondition && <Field label="Win condition" value={pick.coach.winCondition} />}
                {pick.coach.counters && <Field label="Watch out for" value={pick.coach.counters} />}
                {pick.coach.playTips && <Field label="Play tips" value={pick.coach.playTips} />}
              </div>

              {pick.substitutions.length > 0 && (
                <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
                  Substitutions:{" "}
                  {pick.substitutions
                    .map((s) => `${cardByKey(s.from)?.name ?? s.from} → ${cardByKey(s.to)?.name ?? s.to}`)
                    .join(", ")}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
        {label}
      </div>
      <div>{value}</div>
    </div>
  );
}
