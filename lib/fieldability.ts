// Deterministic scoring engine. Given a player's real collection, it ranks the
// proven-deck library by how well the player can actually field each deck:
// ownership, card-level fit for their progression, ease of play, and arena gating.
// This guarantees every suggestion is legal and level-appropriate BEFORE the AI sees it.

import provenDecks from "@/data/proven-decks.json";
import { cardByKey } from "./cards";
import { metaFitScore } from "./archetypes";
import { META_DECKS } from "./meta-decks";
import type { Card, Collection, ProvenDeck } from "./types";

const CURATED = (provenDecks as ProvenDeck[]).map((d) => ({ ...d, source: "curated" as const }));
const sig = (d: ProvenDeck) => d.slots.map((s) => s.cardKey).sort().join(",");
const curatedSigs = new Set(CURATED.map(sig));

// Pool = curated archetype library + this season's top-ladder meta decks (deduped).
export const DECKS: ProvenDeck[] = [
  ...CURATED,
  ...META_DECKS.filter((m) => !curatedSigs.has(sig(m))),
];

export type EasePreference = "forgiving" | "any" | "challenge";

export interface ResolvedSlot {
  role: string;
  canonicalKey: string;
  chosenKey: string | null; // the card the player would actually field, or null if none owned
  isSubstitute: boolean;
  isMissing: boolean;
  level: number; // 0 if missing
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
  scores: { ownership: number; level: number; skill: number; arena: number; edge: number; meta: number; coverage: number; total: number };
}

interface RankOptions {
  archetype?: string; // filter to one archetype; omit/"auto" = all
  ease?: EasePreference; // default "forgiving"
  threats?: Record<string, number>; // archetype -> loss count, from the player's battle log
}

// A card this many levels below the player's competitive level is treated as unusable.
const COMPETITIVE_GAP = 5;

/** The player's realistic competitive level: the 70th percentile of their owned card
 *  levels. Robust to a few maxed outliers (unlike "highest card") and to a pile of low
 *  cards (unlike the mean). Falls back to king level when nothing is owned. */
function targetLevel(collection: Collection): number {
  const levels = Object.values(collection.owned)
    .map((o) => o.level)
    .sort((a, b) => a - b);
  if (levels.length === 0) return collection.kingLevel || 11;
  return levels[Math.floor(0.7 * (levels.length - 1))];
}

// Cards that can hit air — used to check a resolved deck isn't defenceless against air.
const ANTI_AIR = new Set<string>([
  "musketeer", "archers", "mega-minion", "minions", "minion-horde", "baby-dragon",
  "inferno-dragon", "electro-dragon", "electro-wizard", "wizard", "witch", "mother-witch",
  "firecracker", "dart-goblin", "princess", "hunter", "magic-archer", "executioner", "bats",
  "spear-goblins", "zappies", "phoenix", "flying-machine", "electro-spirit", "ice-wizard",
  "tesla", "inferno-tower", "archer-queen", "skeleton-dragons", "super-archers",
  "arrows", "zap", "lightning", "fireball", "rocket", "giant-snowball", "poison",
]);

function ownedLevelOf(collection: Collection, key: string): number | null {
  const card = cardByKey(key);
  if (!card) return null;
  const owned = collection.owned[card.id];
  return owned ? owned.level : null;
}

/** Resolve one slot to the card the player would actually field. Keeps the canonical card
 *  when the player owns it at a competitive level; otherwise picks the highest-level owned
 *  alternate (so a level-9 canonical is swapped for, say, a level-13 substitute you own). */
function resolveSlot(
  slot: ProvenDeck["slots"][number],
  collection: Collection,
  target: number,
): ResolvedSlot {
  const floor = Math.max(1, target - COMPETITIVE_GAP);
  const canonicalLevel = ownedLevelOf(collection, slot.cardKey);

  // Keep the canonical card if it's owned and competitive — preserves deck integrity.
  if (canonicalLevel !== null && canonicalLevel >= floor) {
    return {
      role: slot.role,
      canonicalKey: slot.cardKey,
      chosenKey: slot.cardKey,
      isSubstitute: false,
      isMissing: false,
      level: canonicalLevel,
    };
  }

  // Otherwise pick the best-leveled owned option (canonical or any substitute).
  let best: { key: string; level: number; canonical: boolean } | null =
    canonicalLevel !== null ? { key: slot.cardKey, level: canonicalLevel, canonical: true } : null;
  for (const sub of slot.substitutes) {
    const lvl = ownedLevelOf(collection, sub);
    if (lvl !== null && (!best || lvl > best.level)) {
      best = { key: sub, level: lvl, canonical: false };
    }
  }

  if (best) {
    return {
      role: slot.role,
      canonicalKey: slot.cardKey,
      chosenKey: best.key,
      isSubstitute: !best.canonical,
      isMissing: false,
      level: best.level,
    };
  }

  return {
    role: slot.role,
    canonicalKey: slot.cardKey,
    chosenKey: null,
    isSubstitute: false,
    isMissing: true,
    level: 0,
  };
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
  const slots = deck.slots.map((s) => resolveSlot(s, collection, target));
  const levelFloor = Math.max(1, target - COMPETITIVE_GAP);

  // Ownership: weighted fraction of slots the player can fill.
  let ownedWeight = 0;
  let totalWeight = 0;
  // Level fit (steep): a card at/above target = 1.0, COMPETITIVE_GAP below target = 0.
  // So a level-9 card in a level-15 account scores 0, not 0.6 — under-leveled decks sink.
  let levelWeighted = 0;
  let levelWeightTotal = 0;

  for (const s of slots) {
    const w = slotWeight(s.role);
    totalWeight += w;
    if (!s.isMissing) {
      ownedWeight += w;
      const fit = Math.max(0, Math.min(1, (s.level - levelFloor) / COMPETITIVE_GAP));
      levelWeighted += w * fit;
      levelWeightTotal += w;
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

  // Assign the 2 evolution slots + 1 hero slot (win condition / champion first).
  const isKeyRole = (role: string) => role === "win-condition" || role === "champion";
  const keyFirst = (a: PowerCard, b: PowerCard) => Number(isKeyRole(b.role)) - Number(isKeyRole(a.role));
  const evolvedPCs = [...powerCards.filter((p) => p.evolved)].sort(keyFirst);
  const evoTop = evolvedPCs.slice(0, 2);
  const evoKeySet = new Set(evoTop.map((p) => p.key));
  const heroPCs = powerCards.filter((p) => p.hero && !evoKeySet.has(p.key)).sort(keyFirst);
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

  // Card level dominates, but using your evolution/hero slots matters a lot at this level —
  // a deck that leaves both evolution slots empty is a real disadvantage. Past-loss meta is
  // only a minor nudge (the user asked not to drive suggestions off recent failures).
  let total =
    (0.26 * ownership + 0.4 * level + 0.05 * skill + 0.04 * arena + 0.17 * edge + 0.08 * meta) * 100;
  total *= coverage;
  // A deck you can't field a full 8 for is a poor recommendation — discount hard.
  if (!fieldable) total *= 0.5;

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
    scores: {
      ownership: Math.round(ownership * 100),
      level: Math.round(level * 100),
      skill: Math.round(skill * 100),
      arena: Math.round(arena * 100),
      edge: Math.round(edge * 100),
      meta: Math.round(meta * 100),
      coverage: Math.round(coverage * 100),
      total: Math.round(total),
    },
  };
}

/** Rank the proven-deck library for this player's collection. Best first. */
export function rankDecks(collection: Collection, opts: RankOptions = {}): DeckCandidate[] {
  const ease = opts.ease ?? "forgiving";
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
