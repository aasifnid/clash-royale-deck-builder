// Deterministic scoring engine. Given a player's real collection, it ranks the
// proven-deck library by how well the player can actually field each deck:
// ownership, card-level fit for their progression, ease of play, and arena gating.
// This guarantees every suggestion is legal and level-appropriate BEFORE the AI sees it.

import provenDecks from "@/data/proven-decks.json";
import { cardByKey } from "./cards";
import { metaFitScore } from "./archetypes";
import { META_DECKS } from "./meta-decks";
import { cardsWithRole, ANTI_AIR } from "./roles";
import type { Card, Collection, ProvenDeck } from "./types";

const sig = (d: ProvenDeck) => d.slots.map((s) => s.cardKey).sort().join(",");

// Pool = the CURRENT top-ladder meta decks (primary — these are what is actually winning right
// now, aggregated from ~1000 top players with real usage counts and the evolutions they run),
// plus the curated archetype library as a fallback so low-level accounts that can't field a meta
// deck still get sensible options. Curated decks that duplicate a meta deck are dropped.
const META = META_DECKS;
const metaSigs = new Set(META.map(sig));
const CURATED = (provenDecks as ProvenDeck[])
  .map((d) => ({ ...d, source: "curated" as const }))
  .filter((d) => !metaSigs.has(sig(d)));
export const DECKS: ProvenDeck[] = [...META, ...CURATED];

// Strongest = run by the most top players. Normalize usage to [0,1] against the most popular
// meta deck so it can drive ranking; curated decks (no usage) get a modest baseline so they
// surface only when the player can't field a real meta deck.
const MAX_USAGE = Math.max(1, ...META.map((d) => d.usage ?? 0));
// Curated decks are a fallback only: give them a low baseline so a real meta deck the player can
// field always beats them, but they still surface for accounts that can't field any meta deck.
const CURATED_STRENGTH = 0.12;
function strengthOf(deck: ProvenDeck): number {
  return deck.usage != null ? Math.min(1, deck.usage / MAX_USAGE) : CURATED_STRENGTH;
}

export type EasePreference = "forgiving" | "any" | "challenge";

export interface ResolvedSlot {
  role: string;
  canonicalKey: string;
  chosenKey: string | null; // the card the player would actually field, or null if none owned
  isSubstitute: boolean;
  isMissing: boolean;
  level: number; // 0 if missing
  weak: boolean; // owned but more than COMPETITIVE_GAP below the player's fielding level
}

export interface PowerCard {
  key: string;
  name: string;
  role: string;
  evolved: boolean; // player has this card's Evolution
  hero: boolean; // player has this card's Hero form
}

export interface DeckCandidate {
  deck: ProvenDeck;
  slots: ResolvedSlot[];
  cards: Card[]; // the resolved 8 (or fewer, if slots are missing)
  missingRoles: string[]; // roles with no owned card
  substitutions: { role: string; from: string; to: string }[];
  powerCards: PowerCard[]; // deck cards the player has in Evolution/Hero form
  evolutionSlots: string[]; // up to 2 card names to run evolved
  heroSlots: string[]; // up to 1 card name to run as hero
  evolutionSlotKeys: string[];
  heroSlotKeys: string[];
  extras: string[]; // owned Evo/Hero forms with no slot free
  avgElixir: number;
  fieldable: boolean; // all 8 slots filled from owned cards
  competitiveLevel: number; // the player's fielding level this deck was judged against
  weakCards: number; // count of owned-but-under-leveled cards in the resolved deck
  scores: { ownership: number; level: number; skill: number; arena: number; edge: number; meta: number; strength: number; coverage: number; total: number };
}

interface RankOptions {
  archetype?: string; // filter to one archetype; omit/"auto" = all
  ease?: EasePreference; // default "forgiving"
  threats?: Record<string, number>; // archetype -> loss count, from the player's battle log
}

// A card this many levels below the player's competitive level is treated as unusable.
// Kept tight (3): at high ladder a card even 3 levels under your fielding level loses its
// duels, so the engine should reject a proven deck that relies on an under-leveled card
// rather than field it (e.g. a level-10 Earthquake in a level-14 account).
const COMPETITIVE_GAP = 3;
// Swap the canonical card for an owned substitute only if the sub is more than this many
// levels higher — keeps deck integrity for close calls, fixes egregious under-leveling.
const LEVEL_UPGRADE_TOLERANCE = 2;

/** The player's realistic competitive level: the 80th percentile of their owned card levels.
 *  Higher than the median so the long tail of never-leveled junk cards doesn't drag it down,
 *  but not so high it treats the few maxed outliers as the baseline. Falls back to king level
 *  when nothing is owned. */
function targetLevel(collection: Collection): number {
  const levels = Object.values(collection.owned)
    .map((o) => o.level)
    .sort((a, b) => a - b);
  if (levels.length === 0) return collection.kingLevel || 11;
  return levels[Math.floor(0.8 * (levels.length - 1))];
}


function ownedLevelOf(collection: Collection, key: string): number | null {
  const card = cardByKey(key);
  if (!card) return null;
  const owned = collection.owned[card.id];
  return owned ? owned.level : null;
}

/** Pass 1: the deck's INTENDED card for a slot — the canonical, upgraded to an owned
 *  substitute only if it's meaningfully higher level. Returns null if neither the canonical
 *  nor a listed substitute is owned (and unused). No role-pool fallback here. */
function resolveIntended(
  slot: ProvenDeck["slots"][number],
  collection: Collection,
  used: Set<string>,
): { chosenKey: string; isSubstitute: boolean; level: number } | null {
  const lvlOf = (k: string) => (used.has(k) ? null : ownedLevelOf(collection, k));
  const canonicalLevel = lvlOf(slot.cardKey);

  let alt: { key: string; level: number } | null = null;
  for (const sub of slot.substitutes) {
    const lvl = lvlOf(sub);
    if (lvl !== null && (!alt || lvl > alt.level)) alt = { key: sub, level: lvl };
  }

  if (canonicalLevel !== null) {
    return alt && alt.level > canonicalLevel + LEVEL_UPGRADE_TOLERANCE
      ? { chosenKey: alt.key, isSubstitute: true, level: alt.level }
      : { chosenKey: slot.cardKey, isSubstitute: false, level: canonicalLevel };
  }
  if (alt) return { chosenKey: alt.key, isSubstitute: true, level: alt.level };
  return null;
}

/** Pass 2: fill a still-empty slot from ANY owned card that plays its role (best-leveled). */
function roleFill(
  slot: ProvenDeck["slots"][number],
  collection: Collection,
  used: Set<string>,
): { chosenKey: string; level: number } | null {
  let best: { key: string; level: number } | null = null;
  for (const key of cardsWithRole(slot.role)) {
    if (used.has(key)) continue;
    const lvl = ownedLevelOf(collection, key);
    if (lvl !== null && (!best || lvl > best.level)) best = { key, level: lvl };
  }
  return best ? { chosenKey: best.key, level: best.level } : null;
}

/** Higher weight for the cards that define the deck. */
function slotWeight(role: string): number {
  return role === "win-condition" || role === "champion" ? 2 : 1;
}

function scoreDeck(
  deck: ProvenDeck,
  collection: Collection,
  ease: EasePreference,
  threats: Record<string, number>,
): DeckCandidate {
  const target = targetLevel(collection);
  // Two-pass resolution. Pass 1 places the deck's intended cards (important slots first), so
  // a card always claims ITS slot before being borrowed to fill another — never starving a
  // canonical slot into a false "missing". Pass 2 fills any still-empty non-win-condition
  // slots from owned role-mates. Guarantees 8 distinct cards.
  const used = new Set<string>();
  const slots: ResolvedSlot[] = new Array(deck.slots.length);
  const order = deck.slots.map((_, i) => i).sort((a, b) => slotWeight(deck.slots[b].role) - slotWeight(deck.slots[a].role));
  const pending: number[] = [];
  for (const i of order) {
    const r = resolveIntended(deck.slots[i], collection, used);
    if (r) {
      used.add(r.chosenKey);
      slots[i] = { role: deck.slots[i].role, canonicalKey: deck.slots[i].cardKey, chosenKey: r.chosenKey, isSubstitute: r.isSubstitute, isMissing: false, level: r.level, weak: false };
    } else {
      pending.push(i);
    }
  }
  for (const i of pending) {
    const slot = deck.slots[i];
    const r = slot.role !== "win-condition" && slot.role !== "champion" ? roleFill(slot, collection, used) : null;
    if (r) {
      used.add(r.chosenKey);
      slots[i] = { role: slot.role, canonicalKey: slot.cardKey, chosenKey: r.chosenKey, isSubstitute: true, isMissing: false, level: r.level, weak: false };
    } else {
      slots[i] = { role: slot.role, canonicalKey: slot.cardKey, chosenKey: null, isSubstitute: false, isMissing: true, level: 0, weak: false };
    }
  }
  const levelFloor = Math.max(1, target - COMPETITIVE_GAP);

  // Ownership: weighted fraction of slots the player can fill.
  let ownedWeight = 0;
  let totalWeight = 0;
  // Level fit (steep): a card at/above target = 1.0, COMPETITIVE_GAP below target = 0.
  // So a level-9 card in a level-15 account scores 0, not 0.6 — under-leveled decks sink.
  let levelWeighted = 0;
  let levelWeightTotal = 0;
  // Cards more than COMPETITIVE_GAP below the player's fielding level are dead weight: they
  // lose their duels and quietly lose games. We count them to penalize the deck below.
  let weakCards = 0;

  for (const s of slots) {
    const w = slotWeight(s.role);
    totalWeight += w;
    if (!s.isMissing) {
      ownedWeight += w;
      const fit = Math.max(0, Math.min(1, (s.level - levelFloor) / COMPETITIVE_GAP));
      levelWeighted += w * fit;
      levelWeightTotal += w;
      if (s.level <= levelFloor) {
        s.weak = true;
        weakCards += 1;
      }
    }
  }

  const ownership = ownedWeight / totalWeight;
  const level = levelWeightTotal > 0 ? levelWeighted / levelWeightTotal : 0;

  // Which of this deck's cards the player owns in Evolution / Hero form.
  const powerCards: PowerCard[] = [];
  for (const s of slots) {
    if (s.isMissing || !s.chosenKey) continue;
    const card = cardByKey(s.chosenKey);
    const o = card ? collection.owned[card.id] : undefined;
    if (card && o && (o.evolved || o.hero)) {
      powerCards.push({ key: s.chosenKey, name: card.name, role: s.role, evolved: o.evolved, hero: o.hero });
    }
  }

  // Assign the 2 evolution slots + 1 hero slot. Prefer the evolutions TOP PLAYERS actually run
  // in this deck (from real meta usage), then win-condition / champion, so the recommendation
  // matches the meta instead of "any evolved card you happen to own".
  const metaEvoSet = new Set(deck.metaEvolutions ?? []);
  const isKeyRole = (role: string) => role === "win-condition" || role === "champion";
  const metaFirst = (a: PowerCard, b: PowerCard) =>
    Number(metaEvoSet.has(b.key)) - Number(metaEvoSet.has(a.key)) ||
    Number(isKeyRole(b.role)) - Number(isKeyRole(a.role));
  const evolvedPCs = [...powerCards.filter((p) => p.evolved)].sort(metaFirst);
  const evoTop = evolvedPCs.slice(0, 2);
  const evoKeySet = new Set(evoTop.map((p) => p.key));
  const heroPCs = powerCards.filter((p) => p.hero && !evoKeySet.has(p.key)).sort(metaFirst);
  const heroTop = heroPCs.slice(0, 1);

  const evolutionSlots = evoTop.map((p) => p.name);
  const heroSlots = heroTop.map((p) => p.name);
  const evolutionSlotKeys = evoTop.map((p) => p.key);
  const heroSlotKeys = heroTop.map((p) => p.key);
  const extras = [
    ...evolvedPCs.slice(2).map((p) => `${p.name} (Evo)`),
    ...heroPCs.slice(1).map((p) => `${p.name} (Hero)`),
  ];

  // Edge = how well the deck fills your special slots. Evolutions weigh more (2 slots,
  // bigger power swing) than the single hero slot. Empty evolution slots score low.
  const edge = 0.7 * (evoTop.length / 2) + 0.3 * heroTop.length;

  // Skill fit vs the player's stated ease preference (skillFloor 1 = easy .. 5 = hard).
  let skill: number;
  if (ease === "forgiving") skill = (6 - deck.skillFloor) / 5;
  else if (ease === "challenge") skill = deck.skillFloor / 5;
  else skill = 0.75; // "any" — mild neutral

  // Arena gating: decks have a viability floor (champions unlock late, etc.).
  const arena =
    collection.arena == null ? 0.8 : collection.arena >= deck.minArena ? 1 : 0.5;

  const fieldable = slots.every((s) => !s.isMissing);

  // Meta fit: how well this deck's archetype answers what's beating the player on ladder.
  // Neutral (0.5) when there's no battle-log threat data.
  const meta = metaFitScore(deck.archetype, threats);

  // Coverage: after substitutions, does the resolved deck still answer air and carry a spell?
  // An incoherent resolution (e.g. no anti-air) gets discounted, not silently surfaced.
  const chosenKeys = slots.map((s) => s.chosenKey).filter((k): k is string => Boolean(k));
  const hasAntiAir = chosenKeys.some((k) => ANTI_AIR.has(k));
  const hasSpell = chosenKeys.some((k) => cardByKey(k)?.type === "Spell");
  let coverage = 1;
  if (!hasAntiAir) coverage *= 0.82;
  if (!hasSpell) coverage *= 0.9;

  // Meta strength (how many top players run this deck) and card-level fit are the two big
  // drivers: we want the STRONGEST decks the player can actually field at level. Ownership and
  // evolution-slot fit matter, ease-of-play is a small factor by default (handled below for the
  // "forgiving" mode), and recent-loss meta is only a minor nudge.
  const strength = strengthOf(deck);
  // Meta strength leads: the player asked for the STRONGEST decks they can field. Level fit and
  // ownership keep it fieldable, edge (using your evolutions) is a smaller nudge so it can't
  // float a niche brew over a popular deck.
  let total =
    (0.18 * ownership + 0.26 * level + 0.36 * strength + 0.08 * edge + 0.04 * skill + 0.03 * arena + 0.05 * meta) * 100;
  total *= coverage;
  // A deck you can't field a full 8 for is a poor recommendation — discount hard.
  if (!fieldable) total *= 0.5;
  // Under-leveled cards are a liability, but for a strong meta deck one slightly-low card should
  // not bury it beneath a niche deck. Soft per-card discount, harsher as more pile up.
  if (weakCards > 0) total *= Math.pow(0.9, weakCards);
  // "Forgiving" must mean it: a high-execution deck (Balloon beatdown, X-Bow, Graveyard) should
  // never be the top "easy" pick just because it fields well. This multiplicative penalty by
  // skill floor decisively sinks demanding decks for forgiving players, while leaving "any" and
  // "challenge" untouched. The weights above keep skill a factor in every mode; this gates it.
  if (ease === "forgiving") {
    if (deck.skillFloor >= 5) total *= 0.78;
    else if (deck.skillFloor === 4) total *= 0.88;
    else if (deck.skillFloor === 3) total *= 0.96;
  }

  const cards = slots.filter((s) => s.chosenKey).map((s) => cardByKey(s.chosenKey!)!);
  const avgElixir =
    cards.length > 0
      ? Math.round((cards.reduce((sum, c) => sum + c.elixir, 0) / cards.length) * 10) / 10
      : 0;

  return {
    deck,
    slots,
    cards,
    missingRoles: slots.filter((s) => s.isMissing).map((s) => s.canonicalKey),
    substitutions: slots
      .filter((s) => s.isSubstitute && s.chosenKey)
      .map((s) => ({ role: s.role, from: s.canonicalKey, to: s.chosenKey! })),
    powerCards,
    evolutionSlots,
    heroSlots,
    evolutionSlotKeys,
    heroSlotKeys,
    extras,
    avgElixir,
    fieldable,
    competitiveLevel: target,
    weakCards,
    scores: {
      ownership: Math.round(ownership * 100),
      level: Math.round(level * 100),
      skill: Math.round(skill * 100),
      arena: Math.round(arena * 100),
      edge: Math.round(edge * 100),
      meta: Math.round(meta * 100),
      strength: Math.round(strength * 100),
      coverage: Math.round(coverage * 100),
      total: Math.round(total),
    },
  };
}

/** Rank the proven-deck library for this player's collection. Best first. */
export function rankDecks(collection: Collection, opts: RankOptions = {}): DeckCandidate[] {
  // Default to "any": surface the STRONGEST decks the player can field, not the easiest. Players
  // who want low-misplay decks can still pick "forgiving" (which applies a skill-floor penalty).
  const ease = opts.ease ?? "any";
  const pool =
    opts.archetype && opts.archetype !== "auto"
      ? DECKS.filter((d) => d.archetype === opts.archetype)
      : DECKS;

  const threats = opts.threats ?? {};
  return pool
    .map((d) => scoreDeck(d, collection, ease, threats))
    .sort((a, b) => b.scores.total - a.scores.total);
}

/** Distinct archetypes present in the library, for UI filter controls. */
export function archetypes(): string[] {
  return [...new Set(DECKS.map((d) => d.archetype))].sort();
}
