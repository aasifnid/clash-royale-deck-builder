"use client";

import { cardByKey } from "@/lib/cards";
import { deckLink } from "@/lib/deck";
import { RARITY_COLOR } from "@/lib/ui";
import type { SavedDeck } from "@/lib/store";
import { useState } from "react";

interface Props {
  decks: SavedDeck[];
  onDelete: (id: string) => void;
  tag: string | null; // synced player tag, needed to read their battle log
}

interface Results {
  games: number;
  records: Record<string, { games: number; wins: number }>;
}

export default function SavedDecks({ decks, onDelete, tag }: Props) {
  const [copied, setCopied] = useState<string | null>(null);
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only render this section once the player has actually saved a deck.
  if (decks.length === 0) return null;

  function copy(deck: SavedDeck) {
    const cards = deck.cardKeys.map(cardByKey).filter(Boolean);
    if (cards.length < 8) return;
    navigator.clipboard.writeText(deckLink(cards as NonNullable<(typeof cards)[number]>[]));
    setCopied(deck.id);
    setTimeout(() => setCopied((c) => (c === deck.id ? null : c)), 1500);
  }

  // Read the player's recent battle log and match each saved deck's exact 8 cards.
  async function checkResults() {
    if (!tag) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag, decks: decks.map((d) => ({ id: d.id, cardKeys: d.cardKeys })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't read your results.");
      setResults(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read your results.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl p-6" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Saved Decks</h2>
        {tag && (
          <button
            onClick={checkResults}
            disabled={loading}
            className="rounded px-2.5 py-1 text-xs font-semibold disabled:opacity-50"
            style={{ background: "var(--background)", border: "1px solid var(--border)" }}
            title="Reads your recent ranked battles and matches the exact 8 cards of each saved deck."
          >
            {loading ? "Reading battles…" : "Check my results"}
          </button>
        )}
      </div>
      {error && (
        <p className="mb-2 text-sm" style={{ color: "#f87171" }}>
          {error}
        </p>
      )}
      <div className="flex flex-col gap-3">
        {decks.map((deck) => (
          <div
            key={deck.id}
            className="rounded-lg p-3"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="font-bold">{deck.name}</h3>
                <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--background)", color: "var(--muted)" }}>
                  {deck.archetype}
                </span>
                <span className="text-[11px]" style={{ color: "var(--muted)" }}>
                  {deck.avgElixir} avg elixir
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => copy(deck)}
                  className="rounded px-2.5 py-1 text-xs font-semibold"
                  style={{ background: "var(--background)", border: "1px solid var(--border)" }}
                >
                  {copied === deck.id ? "Copied!" : "Copy link"}
                </button>
                <button
                  onClick={() => onDelete(deck.id)}
                  className="rounded px-2.5 py-1 text-xs"
                  style={{ color: "var(--muted)", border: "1px solid var(--border)" }}
                >
                  Delete
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {deck.cardKeys.map((key, i) => {
                const card = cardByKey(key);
                const color = card ? RARITY_COLOR[card.rarity] : "var(--border)";
                return (
                  <span
                    key={i}
                    className="rounded px-1.5 py-0.5 text-[11px]"
                    style={{ background: "var(--background)", border: `1px solid ${color}`, color }}
                  >
                    {card?.name ?? key}
                  </span>
                );
              })}
            </div>
            {results && <ResultLine record={results.records[deck.id]} recent={results.games} predicted={deck.predictedWinRate} />}
            {deck.summary && (
              <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
                {deck.summary}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/** "Played 7 of your last 28 ranked games: 4W 3L (57%) · we predicted 56%". */
function ResultLine({
  record,
  recent,
  predicted,
}: {
  record?: { games: number; wins: number };
  recent: number;
  predicted?: number | null;
}) {
  if (!record || record.games === 0) {
    return (
      <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
        Not played in your last {recent} ranked games. Play it a few times, then check again.
      </p>
    );
  }
  const rate = Math.round((record.wins / record.games) * 100);
  return (
    <p className="mt-2 text-xs">
      <span className="font-semibold" style={{ color: rate >= 50 ? "#4ade80" : "#f87171" }}>
        {record.wins}W {record.games - record.wins}L ({rate}%)
      </span>{" "}
      <span style={{ color: "var(--muted)" }}>
        in {record.games} of your last {recent} ranked games
        {predicted != null ? ` · we predicted ${predicted}%` : ""}
        {record.games < 10 ? " · small sample, keep playing" : ""}
      </span>
    </p>
  );
}
