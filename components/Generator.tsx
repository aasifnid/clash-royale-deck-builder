"use client";

import { useEffect, useState } from "react";
import type { Collection } from "@/lib/types";
import type { EasePreference } from "@/lib/fieldability";
import { cardByKey } from "@/lib/cards";
import { deckLink } from "@/lib/deck";
import { difficultyColor, RARITY_COLOR } from "@/lib/ui";
import { retryImageOnError } from "@/lib/img";
import type { SavedDeck } from "@/lib/store";

interface PickCard {
  role: string;
  key: string | null;
  name: string | null;
  level: number;
  isSubstitute: boolean;
  isMissing: boolean;
  underLeveled: boolean;
  evolved: boolean;
  hero: boolean;
}
interface EnrichedPick {
  coach: {
    deckId: string;
    summary: string;
    gameplan: string;
    opening?: string;
    defense?: string;
    combos?: string;
    doubleElixir?: string;
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
  competitiveLevel: number;
  weakCards: number;
  source: "curated" | "meta";
  usage: number;
  substitutions: { role: string; from: string; to: string }[];
  powerCards: { key: string; name: string; evolved: boolean; hero: boolean }[];
  evolutionSlots: string[];
  heroSlots: string[];
  extras: string[];
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

interface Filters {
  styles: string[];
  archetypes: string[];
}
const EASES: { value: EasePreference; label: string }[] = [
  { value: "any", label: "Strongest (meta)" },
  { value: "forgiving", label: "Easy to play" },
  { value: "challenge", label: "High skill" },
];

function DeckCards({ cards }: { cards: PickCard[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {cards.map((c, i) => {
        const card = c.key ? cardByKey(c.key) : undefined;
        const rarity = card ? RARITY_COLOR[card.rarity] : "var(--border)";
        const low = c.underLeveled && !c.isMissing;
        const frame = c.isMissing ? "#6b7280" : low ? "#f59e0b" : c.evolved ? "#ec4899" : c.hero ? "#facc15" : rarity;
        const glow = low ? "0 0 8px rgba(245,158,11,0.6)" : c.evolved ? "0 0 8px rgba(236,72,153,0.55)" : c.hero ? "0 0 8px rgba(250,204,21,0.5)" : "none";
        return (
          <div
            key={i}
            className="text-center"
            style={{ width: 92 }}
            title={`${c.name ?? c.role}${card ? ` · ${card.elixir} elixir` : ""}${c.isSubstitute ? " · substitute" : ""}`}
          >
            <div className="relative" style={{ opacity: c.isMissing ? 0.55 : 1 }}>
              {card && !c.isMissing && (
                <span
                  className="absolute -left-1.5 -top-1.5 z-20 flex h-5 w-5 items-center justify-center"
                  style={{ background: "radial-gradient(circle at 35% 30%, #f06ee0, #a01f8f)", borderRadius: "0 50% 50% 50%", transform: "rotate(45deg)", border: "1.5px solid rgba(255,255,255,0.5)" }}
                >
                  <span className="text-[12px] font-extrabold text-white" style={{ transform: "rotate(-45deg)" }}>{card.elixir}</span>
                </span>
              )}
              <div
                className="relative overflow-hidden rounded-lg"
                style={{ border: `2px solid ${frame}`, boxShadow: glow, background: "#1a2342" }}
              >
                {c.isMissing ? (
                  <span className="absolute right-0 top-0 z-10 bg-[#6b7280] px-1.5 py-0.5 text-[11px] font-bold text-white" style={{ borderBottomLeftRadius: 4 }}>NEED</span>
                ) : (
                  (c.evolved || c.hero) && (
                    <span className="absolute right-0 top-0 z-10 px-1.5 py-0.5 text-[11px] font-bold" style={{ background: c.evolved ? "#ec4899" : "#facc15", color: c.evolved ? "#fff" : "#3a2e00", borderBottomLeftRadius: 4 }}>
                      {c.evolved ? "EVO" : "HERO"}
                    </span>
                  )
                )}
                {card?.iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={card.iconUrl} alt={c.name ?? ""} width={285} height={420} loading="lazy" decoding="async" onError={retryImageOnError} className="block w-full" style={{ height: "auto", marginTop: "-14%", filter: c.isMissing ? "grayscale(1)" : "none" }} />
                ) : (
                  <div className="flex h-24 items-center justify-center text-[11px]" style={{ color: "var(--muted)" }}>{c.name ?? c.role}</div>
                )}
                {/* Nameplate inside the frame: name + level (or "don't have"), never floating. */}
                <div
                  className="absolute inset-x-0 bottom-0 px-1 pb-0.5 pt-3 text-center"
                  style={{ background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.85) 55%)" }}
                >
                  <div className="truncate text-[12px] font-bold leading-tight text-white" style={{ textShadow: "0 1px 2px rgba(0,0,0,1)" }} title={c.name ?? c.role}>
                    {c.name ?? c.role}
                    {c.isSubstitute ? " (sub)" : ""}
                  </div>
                  <div className="text-[12px] font-extrabold" style={{ color: c.isMissing ? "#f3a0a0" : low ? "#fbbf24" : "#fff", textShadow: "0 1px 1px rgba(0,0,0,1)" }}>
                    {c.isMissing ? "don't have" : low ? `Lv ${c.level} · low` : `Lv ${c.level}`}
                  </div>
                </div>
              </div>
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
  const [ease, setEase] = useState<EasePreference>("any");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({ styles: [], archetypes: [] });

  // Load the deck-type options (play styles + top archetypes) from the server.
  useEffect(() => {
    fetch("/api/filters")
      .then((r) => r.json())
      .then((f: Filters) => setFilters({ styles: f.styles ?? [], archetypes: f.archetypes ?? [] }))
      .catch(() => {});
  }, []);

  const ownedCount = Object.keys(collection.owned).length;

  // Once you've generated once, changing the deck type or style re-generates automatically so
  // the shown decks always reflect the current selection.
  useEffect(() => {
    if (!result) return;
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archetype, ease]);

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
    <section className="rounded-xl p-6" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <h2 className="text-lg font-bold">
        <span style={{ color: "var(--accent-2)" }}>Step 2</span> · Get your decks
      </h2>
      <p className="mb-3 mt-1 text-sm" style={{ color: "var(--muted)" }}>
        Three real top-ladder decks, ranked by how well your cards fit, each with recommended evolutions and a game plan.
      </p>

      <div className="mb-3 flex flex-wrap items-end gap-4">
        <label className="text-sm">
          <span className="mb-1.5 block" style={{ color: "var(--muted)" }}>
            Deck type
          </span>
          <div className="relative inline-block">
            <select
              value={archetype}
              onChange={(e) => setArchetype(e.target.value)}
              className="cursor-pointer appearance-none rounded-lg bg-[var(--background)] py-2 pl-3 pr-8 text-sm outline-none"
              style={{ border: "1px solid var(--border)" }}
            >
              <option value="auto">Best for me</option>
              {filters.styles.length > 0 && (
                <optgroup label="Play style">
                  {filters.styles.map((s) => (
                    <option key={`s-${s}`} value={s}>
                      {s}
                    </option>
                  ))}
                </optgroup>
              )}
              {filters.archetypes.length > 0 && (
                <optgroup label="Archetype">
                  {filters.archetypes.map((a) => (
                    <option key={`a-${a}`} value={a}>
                      {a}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center" style={{ color: "var(--muted)" }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </div>
        </label>
        <label className="text-sm">
          <span className="mb-1.5 block" style={{ color: "var(--muted)" }}>
            Style
          </span>
          <div className="relative inline-block">
            <select
              value={ease}
              onChange={(e) => setEase(e.target.value as EasePreference)}
              className="cursor-pointer appearance-none rounded-lg bg-[var(--background)] py-2 pl-3 pr-8 text-sm outline-none"
              style={{ border: "1px solid var(--border)" }}
            >
              {EASES.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center" style={{ color: "var(--muted)" }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </div>
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
            Sync your account in Step 1 first (or add cards by hand below).
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
                  <span className="text-[11px]" style={{ color: "var(--muted)" }} title="The card level this deck was judged against, from the cards you actually field.">
                    built for level {pick.competitiveLevel}
                  </span>
                  {pick.weakCards > 0 && (
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ background: "rgba(245,158,11,0.18)", color: "#f59e0b" }} title="This deck includes a card below your level. Highlighted in amber below.">
                      {pick.weakCards} card{pick.weakCards > 1 ? "s" : ""} under your level
                    </span>
                  )}
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

              {pick.coach.gameplan && (
                <div className="mb-2 rounded-lg p-3" style={{ background: "var(--background)", borderLeft: "3px solid var(--accent-2)" }}>
                  <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--accent-2)" }}>
                    Game plan
                  </div>
                  <div className="mt-1 text-sm" style={{ color: "var(--foreground)" }}>{pick.coach.gameplan}</div>
                </div>
              )}

              <div className="grid gap-2 text-sm sm:grid-cols-2">
                {pick.coach.winCondition && <Field label="Win condition" value={pick.coach.winCondition} />}
                {pick.coach.opening && <Field label="First minute" value={pick.coach.opening} />}
                {pick.coach.defense && <Field label="On defense" value={pick.coach.defense} />}
                {pick.coach.combos && <Field label="Best combos" value={pick.coach.combos} />}
                {pick.coach.doubleElixir && <Field label="Double elixir" value={pick.coach.doubleElixir} />}
                {pick.coach.counters && <Field label="Watch out for" value={pick.coach.counters} />}
                {pick.coach.playTips && <Field label="Play tips" value={pick.coach.playTips} />}
              </div>

              {(pick.evolutionSlots.length > 0 || pick.heroSlots.length > 0 || pick.extras.length > 0) && (
                <div className="mt-2 flex flex-col gap-1 rounded p-2 text-xs" style={{ background: "var(--background)" }}>
                  <div>
                    <span className="font-bold" style={{ color: "#ec4899" }}>Evolution slots (2):</span>{" "}
                    {pick.evolutionSlots.length > 0 ? (
                      <>
                        {pick.evolutionSlots.join(" + ")}
                        {pick.evolutionSlots.length < 2 && (
                          <span style={{ color: "var(--muted)" }}> ({2 - pick.evolutionSlots.length} open — no other evolved card here)</span>
                        )}
                      </>
                    ) : (
                      <span style={{ color: "var(--muted)" }}>no evolved card in this deck</span>
                    )}
                  </div>
                  <div>
                    <span className="font-bold" style={{ color: "#ca8a04" }}>Hero slot (1):</span>{" "}
                    {pick.heroSlots.length > 0 ? pick.heroSlots[0] : <span style={{ color: "var(--muted)" }}>no hero card in this deck</span>}
                  </div>
                  {pick.extras.length > 0 && (
                    <div style={{ color: "var(--muted)" }}>Also unlocked (no slot free): {pick.extras.join(", ")}</div>
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
