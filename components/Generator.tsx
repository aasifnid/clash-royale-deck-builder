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
  evolved: boolean;
  hero: boolean;
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
  source: "curated" | "meta";
  usage: number;
  substitutions: { role: string; from: string; to: string }[];
  powerCards: { key: string; name: string; evolved: boolean; hero: boolean }[];
  evolutionSlots: string[];
  evolutionExtras: string[];
  heroSlots: string[];
  cards: PickCard[];
}
interface BattleInsights {
  games: number;
  wins: number;
  losses: number;
  meta: Record<string, number>;
  threats: Record<string, number>;
}
interface GenerateResponse {
  aiUsed: boolean;
  insights?: BattleInsights | null;
  picks: EnrichedPick[];
  shortlist: EnrichedPick[];
}

function topEntries(rec: Record<string, number>, n = 3): string {
  return Object.entries(rec)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => `${k} (${v})`)
    .join(", ");
}

const ARCHETYPES = ["auto", ...archetypes()];
const EASES: { value: EasePreference; label: string }[] = [
  { value: "forgiving", label: "Easy to play" },
  { value: "any", label: "Any" },
  { value: "challenge", label: "High skill" },
];

function DeckCards({ cards }: { cards: PickCard[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {cards.map((c, i) => {
        const card = c.key ? cardByKey(c.key) : undefined;
        const color = card ? RARITY_COLOR[card.rarity] : "var(--border)";
        return (
          <div
            key={i}
            className="text-center"
            style={{ width: 68 }}
            title={`${c.name ?? c.role}${card ? ` · ${card.elixir} elixir` : ""}${c.isSubstitute ? " · substitute" : ""}`}
          >
            <div
              className="relative overflow-hidden rounded-lg"
              style={{ border: `2px solid ${c.evolved ? "#ec4899" : c.hero ? "#facc15" : color}` }}
            >
              {card && (
                <span
                  className="absolute left-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-extrabold text-white"
                  style={{ backgroundColor: "#b5179e" }}
                >
                  {card.elixir}
                </span>
              )}
              {(c.evolved || c.hero) && (
                <span
                  className="absolute right-0 top-0 px-1 text-[8px] font-bold"
                  style={{
                    background: c.evolved ? "#ec4899" : "#facc15",
                    color: c.evolved ? "#fff" : "#3a2e00",
                    borderBottomLeftRadius: 4,
                  }}
                >
                  {c.evolved ? "EVO" : "HERO"}
                </span>
              )}
              {card?.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={card.iconUrl} alt={c.name ?? ""} loading="lazy" className="w-full" />
              ) : (
                <div className="flex h-16 items-center justify-center text-[10px]" style={{ color: "var(--muted)" }}>
                  {c.name ?? c.role}
                </div>
              )}
            </div>
            <div className="mt-1 text-[10px] font-medium leading-tight" style={{ color }}>
              {c.name ?? c.role}
              {c.isSubstitute ? " (sub)" : ""}
            </div>
            <div className="text-[9px]" style={{ color: "var(--muted)" }}>
              lvl {c.level}
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
          {result.insights && result.insights.games > 0 && (
            <div
              className="rounded-lg p-3 text-sm"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
            >
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                Your ladder meta · last {result.insights.games} games ({result.insights.wins}W / {result.insights.losses}L)
              </div>
              <div>
                <span style={{ color: "var(--muted)" }}>Facing most:</span> {topEntries(result.insights.meta)}
              </div>
              {Object.keys(result.insights.threats).length > 0 && (
                <div>
                  <span style={{ color: "#f87171" }}>Losing most to:</span> {topEntries(result.insights.threats)}
                </div>
              )}
              <div className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                Decks below are scored to counter what beats you.
              </div>
            </div>
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
                  {pick.source === "meta" && (
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                      style={{ background: "var(--accent)", color: "#fff" }}
                      title={`Run by ${pick.usage} sampled top-ladder players this season`}
                    >
                      META{pick.usage > 1 ? ` ×${pick.usage}` : ""}
                    </span>
                  )}
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

              {(pick.evolutionSlots.length > 0 || pick.heroSlots.length > 0) && (
                <div className="mt-2 flex flex-col gap-1 rounded p-2 text-xs" style={{ background: "var(--background)" }}>
                  <div>
                    <span className="font-bold" style={{ color: "#ec4899" }}>Evolution slots (2):</span>{" "}
                    {pick.evolutionSlots.length > 0 ? (
                      <>
                        {pick.evolutionSlots.join(" + ")}
                        {pick.evolutionSlots.length < 2 && <span style={{ color: "var(--muted)" }}> (1 slot open — no other evolved card in this deck)</span>}
                      </>
                    ) : (
                      <span style={{ color: "var(--muted)" }}>none of this deck&apos;s cards are evolved in your account</span>
                    )}
                    {pick.evolutionExtras.length > 0 && (
                      <span style={{ color: "var(--muted)" }}> · also have: {pick.evolutionExtras.join(", ")}</span>
                    )}
                  </div>
                  {pick.heroSlots.length > 0 && (
                    <div>
                      <span className="font-bold" style={{ color: "#ca8a04" }}>Hero:</span> {pick.heroSlots.join(", ")}
                    </div>
                  )}
                </div>
              )}
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
