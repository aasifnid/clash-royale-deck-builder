"use client";

import { cardByKey } from "@/lib/cards";
import { deckLink } from "@/lib/deck";
import { RARITY_COLOR } from "@/lib/ui";
import type { SavedDeck } from "@/lib/store";
import { useState } from "react";

interface Props {
  decks: SavedDeck[];
  onDelete: (id: string) => void;
}

export default function SavedDecks({ decks, onDelete }: Props) {
  const [copied, setCopied] = useState<string | null>(null);

  if (decks.length === 0) {
    return (
      <section className="rounded-xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <h2 className="mb-1 text-lg font-bold">Saved Decks</h2>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Decks you save will appear here.
        </p>
      </section>
    );
  }

  function copy(deck: SavedDeck) {
    const cards = deck.cardKeys.map(cardByKey).filter(Boolean);
    if (cards.length < 8) return;
    navigator.clipboard.writeText(deckLink(cards as NonNullable<(typeof cards)[number]>[]));
    setCopied(deck.id);
    setTimeout(() => setCopied((c) => (c === deck.id ? null : c)), 1500);
  }

  return (
    <section className="rounded-xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <h2 className="mb-3 text-lg font-bold">Saved Decks</h2>
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
