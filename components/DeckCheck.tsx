"use client";

import { useState } from "react";
import type { Collection } from "@/lib/types";
import { cardByKey, cardById } from "@/lib/cards";
import { deckLink, parseDeckLink } from "@/lib/deck";
import type { SavedDeck } from "@/lib/store";
import { DeckResult, type EnrichedPick } from "./Generator";

interface CheckResponse {
  verdict: "keep" | "tweak" | "switch";
  current: EnrichedPick;
  tuned: EnrichedPick | null;
  provenSwap: { remove: string[]; add: string[]; games: number; winRate: number } | null;
  shapeFix: { need: "spell" | "air"; remove: string; add: string; scoreGain: number } | null;
  yourRecord: { games: number; wins: number } | null;
  recentGames: number | null;
  alternative: EnrichedPick | null;
  matchups: {
    vsField: number | null;
    best: { archetype: string; rate: number } | null;
    worst: { archetype: string; rate: number } | null;
  };
  notes: string[];
  local: { trophies: number | null; battles: number } | null;
}

const VERDICT: Record<CheckResponse["verdict"], { title: string; color: string }> = {
  keep: { title: "Keep it. This deck holds up for your cards.", color: "#4ade80" },
  tweak: { title: "Good base. A small change makes it stronger.", color: "#facc15" },
  switch: { title: "There's a clearly stronger deck for your cards.", color: "#f87171" },
};

const names = (keys: string[]) => keys.map((k) => cardByKey(k)?.name ?? k).join(" + ");

interface Props {
  collection: Collection;
  onSave: (deck: SavedDeck) => void;
}

/** Deck Check: grade the deck you already play (or one pasted from a link, e.g. built with the
 *  in-game Deck Wizard) against real battle results, instead of generating a new one. */
export default function DeckCheck({ collection, onSave }: Props) {
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const hasCurrent = (collection.currentDeck?.length ?? 0) === 8;
  const ownedCount = Object.keys(collection.owned).length;

  async function check(cardKeys?: string[]) {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection, cardKeys }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Check failed.");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check failed.");
    } finally {
      setLoading(false);
    }
  }

  function checkLink() {
    const ids = parseDeckLink(link);
    const keys = ids?.map((id) => cardById(id)?.key).filter((k): k is string => Boolean(k));
    if (!keys || keys.length !== 8) {
      setError("That doesn't look like a deck link. In the game, open the deck and tap Copy deck, then paste it here.");
      return;
    }
    check(keys);
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
      predictedWinRate: pick.listKind === "real" || pick.listKind === "close" ? (pick.evidence?.winRate ?? null) : null,
    });
  }

  const deckProps = { copied, onCopy: copyLink, onSave: save };

  return (
    <section className="rounded-xl p-6" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <h2 className="text-lg font-bold">
        <span style={{ color: "var(--accent-2)" }}>Step 2</span> · Check your deck
      </h2>
      <p className="mb-3 mt-1 text-sm" style={{ color: "var(--muted)" }}>
        A second opinion on the deck you play, or one the game&apos;s Deck Wizard built: its real win rate, how it does
        against the decks near your trophies, and the one or two swaps worth making.
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button
          onClick={() => check()}
          disabled={loading || !hasCurrent}
          className="rounded-lg px-4 py-2 text-sm font-bold transition disabled:opacity-50"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          {loading ? "Checking…" : "Check my current deck"}
        </button>
        {!hasCurrent && ownedCount > 0 && (
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            Sync again in Step 1 to read the deck you have selected in-game.
          </span>
        )}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="Or paste a deck link (Copy deck in the game, or a Deck Wizard deck)"
          aria-label="Deck link"
          className="min-w-0 flex-1 rounded-lg bg-[var(--background)] px-3 py-2 text-sm outline-none"
          style={{ border: "1px solid var(--border)" }}
        />
        <button
          onClick={checkLink}
          disabled={loading || !link.trim() || ownedCount === 0}
          className="rounded-lg px-4 py-2 text-sm font-bold transition disabled:opacity-50"
          style={{ background: "var(--background)", border: "1px solid var(--border)" }}
        >
          Check this deck
        </button>
      </div>

      {error && (
        <p className="rounded-lg p-2 text-sm" style={{ background: "#3a1820", color: "#f87171" }}>
          {error}
        </p>
      )}

      {result && (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg p-3" style={{ background: "var(--surface-2)", borderLeft: `4px solid ${VERDICT[result.verdict].color}` }}>
            <div className="text-base font-bold" style={{ color: VERDICT[result.verdict].color }}>
              {VERDICT[result.verdict].title}
            </div>
            {result.matchups.vsField != null && (
              <p className="mt-1 text-sm">
                <span style={{ color: "var(--muted)" }}>
                  Against the decks {result.local ? "near your trophies" : "beating you lately"}:
                </span>{" "}
                about {result.matchups.vsField}% expected
                {result.matchups.best && result.matchups.worst && (
                  <>
                    {" "}
                    (best vs {result.matchups.best.archetype} {result.matchups.best.rate}%, worst vs{" "}
                    {result.matchups.worst.archetype} {result.matchups.worst.rate}%)
                  </>
                )}
                .
              </p>
            )}
            {result.notes.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-sm" style={{ color: "var(--foreground)" }}>
                {result.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
            {result.recentGames != null && (
              <p className="mt-1 text-sm">
                <span style={{ color: "var(--muted)" }}>Your record with these exact 8:</span>{" "}
                {result.yourRecord && result.yourRecord.games > 0 ? (
                  <>
                    {result.yourRecord.wins}W {result.yourRecord.games - result.yourRecord.wins}L in your last{" "}
                    {result.recentGames} ranked games ({Math.round((result.yourRecord.wins / result.yourRecord.games) * 100)}%)
                    {result.yourRecord.games < 10 && <span style={{ color: "var(--muted)" }}> · small sample</span>}
                  </>
                ) : (
                  <span style={{ color: "var(--muted)" }}>not played in your last {result.recentGames} ranked games</span>
                )}
                .
              </p>
            )}
            {result.shapeFix && (
              <p className="mt-2 text-sm">
                <span className="font-bold">{result.shapeFix.need === "spell" ? "Add a spell" : "Add air defense"}:</span>{" "}
                {names([result.shapeFix.remove])} → {names([result.shapeFix.add])}
                {result.shapeFix.scoreGain > 0
                  ? `. It's the best ${result.shapeFix.need === "spell" ? "spell" : "anti-air"} swap from your cards (+${result.shapeFix.scoreGain} on our score).`
                  : ". It's the least costly fix from your cards."}
              </p>
            )}
            {result.provenSwap && (
              <p className="mt-2 text-sm">
                <span className="font-bold">Proven swap:</span> {names(result.provenSwap.remove)} →{" "}
                {names(result.provenSwap.add)}. That exact list won {result.provenSwap.winRate}% across{" "}
                {result.provenSwap.games} top-ladder games, and you can field it.
              </p>
            )}
          </div>

          <DeckResult pick={result.current} {...deckProps} />

          {result.tuned && (
            <div>
              <div className="mb-1.5 text-sm font-bold">With your higher-level cards</div>
              <DeckResult pick={result.tuned} {...deckProps} />
            </div>
          )}
          {result.alternative && (
            <div>
              <div className="mb-1.5 text-sm font-bold">Stronger option for your cards</div>
              <DeckResult pick={result.alternative} {...deckProps} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
