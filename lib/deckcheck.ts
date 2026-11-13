// Deck Check: grade a deck the player already has - the deck selected in-game at sync, or one pasted
// from a "copy deck" link (including decks built with the in-game Deck Wizard) - against real
// battle evidence. It answers what the game's own builder doesn't show: has this exact list actually
// won, how does it fare against what the player faces near their trophies, which cards are
// under-leveled, and which one or two swaps have a better record. Graded by the same engine that
// ranks recommendations, so a checked deck and a suggested deck are always comparable.
// Server-side only.

import { META_DECKS, slotsFor } from "./meta-decks";
import { evidenceFor, scoreBuiltDeck, type DeckCandidate, type EasePreference, type EvidenceKind } from "./fieldability";
import { rankWithBestCardDecks } from "./build";
import { archetypeForWinCondition, matchupRate, metaFitScore, winConditionKeyOf, WIN_CONDITION_KEYS } from "./archetypes";
import { ANTI_AIR } from "./roles";
import { cardByKey, cardById } from "./cards";
import type { LocalMeta } from "./localmeta";
import { deckSignature, type OwnRecords } from "./battlelog";
import type { Collection, ProvenDeck } from "./types";

// A real list needs this many games before it can back a swap suggestion.
const PROVEN_SWAP_MIN_GAMES = 15;
// A suggested list must beat the current deck's win rate by at least this many points.
const PROVEN_SWAP_MIN_EDGE = 1.5;
// A tuned version must out-score the deck as played by this much to be worth suggesting.
const TUNE_MIN_GAIN = 2;
// The best recommendation must out-score the deck by this much before we suggest switching.
const SWITCH_MIN_GAIN = 8;
// How many candidate cards to try when fixing a missing spell / anti-air.
const SHAPE_FIX_CANDIDATES = 4;

const EVIDENCE_RANK: Record<EvidenceKind, number> = { exact: 3, close: 2, core: 1, none: 0 };
const nameOf = (key: string) => cardByKey(key)?.name ?? key;
const cardKeyOf = (id: number) => cardById(id)?.key ?? "";

export interface ProvenSwap {
  remove: string[]; // card keys to take out
  add: string[]; // card keys to put in
  games: number; // games behind the suggested list
  winRate: number; // its shrunk win rate, percent
}

/** A one-card swap that fixes a structural hole (no spell, nothing that hits air). */
export interface ShapeFix {
  need: "spell" | "air";
  remove: string;
  add: string;
  scoreGain: number; // engine score of the fixed deck minus the deck as played
}

export interface DeckCheckResult {
  current: DeckCandidate; // the deck graded exactly as given
  tuned: DeckCandidate | null; // its best version with under-leveled fixes + up to 2 upgrades
  provenSwap: ProvenSwap | null; // 1-2 swaps that turn it into a better real list
  shapeFix: ShapeFix | null; // the best single swap that fills a missing spell / anti-air
  yourRecord: { games: number; wins: number } | null; // the player's own results with these exact 8
  alternative: DeckCandidate | null; // the best recommendation, when it clearly beats this deck
  verdict: "keep" | "tweak" | "switch";
  matchups: {
    vsField: number | null; // expected win rate (percent) against the decks the player faces
    best: { archetype: string; rate: number } | null;
    worst: { archetype: string; rate: number } | null;
  };
  notes: string[]; // plain-language problems with the deck's shape
}

/** The meta deck whose real lists best vouch for these 8 cards (exact > one off > same core). */
function closestMetaDeck(keys: string[]): ProvenDeck | null {
  let best: { deck: ProvenDeck; rank: number; games: number } | null = null;
  for (const d of META_DECKS) {
    const ev = evidenceFor(d, keys);
    const rank = EVIDENCE_RANK[ev.kind];
    if (rank === 0) continue;
    if (!best || rank > best.rank || (rank === best.rank && ev.games > best.games)) best = { deck: d, rank, games: ev.games };
  }
  return best?.deck ?? null;
}

/** The checked deck as an engine deck, carrying the closest meta deck's battle record. */
function asEngineDeck(keys: string[]): ProvenDeck {
  const wcKey = winConditionKeyOf(keys);
  const wcName = wcKey ? nameOf(wcKey) : "Mixed";
  const meta = closestMetaDeck(keys);
  const base = {
    id: "deck-check",
    name: "Your deck",
    winCondition: wcName,
    minArena: 0,
    slots: slotsFor(keys),
  };
  if (meta) return { ...meta, ...base, archetype: meta.archetype };
  return { ...base, archetype: (wcKey && archetypeForWinCondition(wcKey)) || "Control", skillFloor: 3, source: "curated" };
}

/** The best real list one or two cards away that the player can field at a healthy level. */
function findProvenSwap(keys: string[], current: DeckCandidate, collection: Collection): ProvenSwap | null {
  const have = new Set(keys);
  const floor = current.competitiveLevel - 3;
  const levelOf = (k: string) => {
    const c = cardByKey(k);
    return c ? (collection.owned[c.id]?.level ?? null) : null;
  };
  const baseline = current.evidence.winRate ?? 50;
  let best: ProvenSwap | null = null;
  for (const d of META_DECKS) {
    for (const v of d.variants ?? []) {
      if (v.games < PROVEN_SWAP_MIN_GAMES) continue;
      const add = v.cards.filter((k) => !have.has(k));
      if (add.length === 0 || add.length > 2) continue;
      if (v.cards.some((k) => (levelOf(k) ?? 0) <= floor)) continue; // must be fieldable, nothing weak
      // The engine's own win rate for this exact list, so every screen shows the same number.
      const winRate = evidenceFor(d, v.cards).winRate;
      if (winRate == null || winRate < baseline + PROVEN_SWAP_MIN_EDGE) continue;
      if (!best || winRate > best.winRate) {
        best = { remove: keys.filter((k) => !v.cards.includes(k)), add, games: v.games, winRate };
      }
    }
  }
  return best;
}

/** Plain-language problems with the deck's shape (as played). */
function shapeNotes(cand: DeckCandidate): string[] {
  const notes: string[] = [];
  const keys = cand.slots.map((s) => s.chosenKey).filter((k): k is string => Boolean(k));
  const spells = keys.filter((k) => cardByKey(k)?.type === "Spell").length;
  const winCons = keys.filter((k) => WIN_CONDITION_KEYS.has(k));
  for (const s of cand.slots) {
    if (s.isMissing) notes.push(`You don't own ${nameOf(s.canonicalKey)}.`);
    else if (s.weak) notes.push(`${nameOf(s.chosenKey!)} is level ${s.level}, under-leveled for your account (you field around level ${cand.competitiveLevel}).`);
  }
  if (spells === 0) notes.push("No spell: swarms and low-HP towers will be hard to finish.");
  if (!keys.some((k) => ANTI_AIR.has(k))) notes.push("Nothing that hits air: Balloon and Lava decks will walk through.");
  if (winCons.length === 0) notes.push("No clear win condition: it's hard to deal tower damage on purpose.");
  if (winCons.length >= 3) notes.push(`Three or more win conditions (${winCons.map(nameOf).join(", ")}): consider fewer threats and more defense.`);
  if (cand.avgElixir >= 4.3) notes.push(`Heavy at ${cand.avgElixir} elixir: fast cycle decks can punish you before a push lands.`);
  return notes;
}

const hasSpell = (keys: string[]) => keys.some((k) => cardByKey(k)?.type === "Spell");
const hasAir = (keys: string[]) => keys.some((k) => ANTI_AIR.has(k));

/** Cards that top players pair with this win condition, weighted by games played together. */
function pairingWeights(wcKey: string | null): Map<string, number> {
  const w = new Map<string, number>();
  if (!wcKey) return w;
  for (const d of META_DECKS) {
    for (const v of d.variants ?? []) {
      if (!v.cards.includes(wcKey)) continue;
      for (const k of v.cards) w.set(k, (w.get(k) ?? 0) + v.games);
    }
  }
  return w;
}

/** The best single swap that gives the deck a spell (or something that hits air), judged by the
 *  same engine: every removable card x the few best-fitting owned candidates, scored as played. */
function findShapeFix(
  keys: string[],
  current: DeckCandidate,
  collection: Collection,
  score: (keys: string[]) => DeckCandidate,
): ShapeFix | null {
  const need: ShapeFix["need"] | null = !hasSpell(keys) ? "spell" : !hasAir(keys) ? "air" : null;
  if (!need) return null;
  const pairs = pairingWeights(winConditionKeyOf(keys));
  const fits = (k: string) => (need === "spell" ? cardByKey(k)?.type === "Spell" : ANTI_AIR.has(k));
  const candidates = Object.values(collection.owned)
    .map((o) => ({ key: cardByKey(cardKeyOf(o.id))?.key, level: o.level }))
    .filter((c): c is { key: string; level: number } => Boolean(c.key) && !keys.includes(c.key!) && fits(c.key!))
    .filter((c) => c.level >= current.competitiveLevel - 1)
    .sort((a, b) => (pairs.get(b.key) ?? 0) - (pairs.get(a.key) ?? 0) || b.level - a.level)
    .slice(0, SHAPE_FIX_CANDIDATES);
  // Only support cards are swapped out: a fix for a missing spell shouldn't cost the deck one of
  // its win conditions or its champion.
  const removable = keys.filter((k) => !WIN_CONDITION_KEYS.has(k) && cardByKey(k)?.rarity !== "Champion");
  let best: ShapeFix | null = null;
  for (const add of candidates) {
    for (const remove of removable) {
      const next = keys.map((k) => (k === remove ? add.key : k));
      // A fix must not open the other hole (e.g. swapping out the only air defender for a spell).
      if (!hasSpell(next) && need === "spell") continue;
      if (hasAir(keys) && !hasAir(next)) continue;
      const gain = score(next).scores.total - current.scores.total;
      if (!best || gain > best.scoreGain) best = { need, remove, add: add.key, scoreGain: gain };
    }
  }
  return best;
}

export function checkDeck(
  collection: Collection,
  keys: string[],
  opts: { ease?: EasePreference; threats?: Record<string, number>; local?: LocalMeta | null; own?: OwnRecords | null } = {},
): DeckCheckResult {
  const deck = asEngineDeck(keys);
  const shared = { ease: opts.ease ?? "any", threats: opts.threats, local: opts.local };
  const current = scoreBuiltDeck(deck, collection, { ...shared, mode: "as-played" });
  const tunedCand = scoreBuiltDeck(deck, collection, { ...shared, mode: "best-cards" });
  const tuned = tunedCand.substitutions.length > 0 && tunedCand.scores.total >= current.scores.total + TUNE_MIN_GAIN ? tunedCand : null;
  const provenSwap = findProvenSwap(keys, current, collection);
  const shapeFix = findShapeFix(keys, current, collection, (k) =>
    scoreBuiltDeck(asEngineDeck(k), collection, { ...shared, mode: "as-played" }),
  );
  const notes = shapeNotes(current);
  // Holes that lose games no matter how strong the cards are. A deck with one can't be a "keep".
  const structural = !hasSpell(keys) || !hasAir(keys) || winConditionKeyOf(keys) === null || !current.fieldable;

  const sig = [...keys].sort().join(",");
  const top = rankWithBestCardDecks(collection, shared).find(
    (c) => c.slots.map((s) => s.chosenKey).sort().join(",") !== sig,
  );
  const alternative = top && top.scores.total >= current.scores.total + SWITCH_MIN_GAIN ? top : null;
  const verdict = alternative ? "switch" : tuned || provenSwap || shapeFix || structural ? "tweak" : "keep";

  const field = Object.entries(opts.threats ?? {}).filter(([, n]) => n > 0);
  const rates = field.map(([arch]) => ({ archetype: arch, rate: Math.round(matchupRate(deck.archetype, arch) * 1000) / 10 }));
  rates.sort((a, b) => b.rate - a.rate);

  return {
    current,
    tuned,
    provenSwap,
    shapeFix,
    yourRecord: opts.own?.decks[deckSignature(keys)] ?? null,
    alternative,
    verdict,
    matchups: {
      vsField: field.length ? Math.round(metaFitScore(deck.archetype, opts.threats ?? {}) * 1000) / 10 : null,
      best: rates[0] ?? null,
      worst: rates.length > 1 ? rates[rates.length - 1] : null,
    },
    notes,
  };
}
