// Deterministic scoring engine. Given a player's real collection, it ranks the
// proven-deck library by how well the player can actually field each deck:
// ownership, card-level fit for their progression, ease of play, and arena gating.
// This guarantees every suggestion is legal and level-appropriate BEFORE the AI sees it.

import provenDecks from "@/data/proven-decks.json";
import { cardByKey } from "./cards";
import type { Card, Collection, ProvenDeck } from "./types";

export const DECKS = provenDecks as ProvenDeck[];

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
  avgElixir: number;
  fieldable: boolean; // all 8 slots filled from owned cards
  scores: { ownership: number; level: number; skill: number; arena: number; edge: number; total: number };
}

interface RankOptions {
  archetype?: string; // filter to one archetype; omit/"auto" = all
  ease?: EasePreference; // default "forgiving"
}

/** Target card level for this player — their king tower level is the best proxy. */
function targetLevel(collection: Collection): number {
  return collection.kingLevel || 11;
}

/** Resolve one deck slot to the card the player would field (canonical, else best owned sub). */
function resolveSlot(slot: ProvenDeck["slots"][number], collection: Collection): ResolvedSlot {
  const ownedLevel = (key: string): number | null => {
    const card = cardByKey(key);
    if (!card) return null;
    const owned = collection.owned[card.id];
    return owned ? owned.level : null;
  };

  const canonicalLevel = ownedLevel(slot.cardKey);
  if (canonicalLevel !== null) {
    return {
      role: slot.role,
      canonicalKey: slot.cardKey,
      chosenKey: slot.cardKey,
      isSubstitute: false,
      isMissing: false,
      level: canonicalLevel,
    };
  }

  for (const sub of slot.substitutes) {
    const subLevel = ownedLevel(sub);
    if (subLevel !== null) {
      return {
        role: slot.role,
        canonicalKey: slot.cardKey,
        chosenKey: sub,
        isSubstitute: true,
        isMissing: false,
        level: subLevel,
      };
    }
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

function scoreDeck(deck: ProvenDeck, collection: Collection, ease: EasePreference): DeckCandidate {
  const slots = deck.slots.map((s) => resolveSlot(s, collection));
  const target = targetLevel(collection);

  // Ownership: weighted fraction of slots the player can fill.
  let ownedWeight = 0;
  let totalWeight = 0;
  // Level fit: weighted average of (cardLevel / target), only over filled slots.
  let levelWeighted = 0;
  let levelWeightTotal = 0;

  for (const s of slots) {
    const w = slotWeight(s.role);
    totalWeight += w;
    if (!s.isMissing) {
      ownedWeight += w;
      levelWeighted += w * Math.min(1, s.level / target);
      levelWeightTotal += w;
    }
  }

  const ownership = ownedWeight / totalWeight;
  const level = levelWeightTotal > 0 ? levelWeighted / levelWeightTotal : 0;

  // Edge: does the player own Evolution/Hero ("power") forms of this deck's cards?
  // Weighted toward the win condition. Surfaces decks that leverage the player's strengths.
  let edgeWeighted = 0;
  let edgeWeightTotal = 0;
  const powerCards: PowerCard[] = [];
  for (const s of slots) {
    if (s.isMissing || !s.chosenKey) continue;
    const card = cardByKey(s.chosenKey);
    const o = card ? collection.owned[card.id] : undefined;
    const w = slotWeight(s.role);
    edgeWeightTotal += w;
    if (card && o && (o.evolved || o.hero)) {
      edgeWeighted += w;
      powerCards.push({ key: s.chosenKey, name: card.name, evolved: o.evolved, hero: o.hero });
    }
  }
  const edge = edgeWeightTotal > 0 ? edgeWeighted / edgeWeightTotal : 0;

  // Skill fit vs the player's stated ease preference (skillFloor 1 = easy .. 5 = hard).
  let skill: number;
  if (ease === "forgiving") skill = (6 - deck.skillFloor) / 5;
  else if (ease === "challenge") skill = deck.skillFloor / 5;
  else skill = 0.75; // "any" — mild neutral

  // Arena gating: decks have a viability floor (champions unlock late, etc.).
  const arena =
    collection.arena == null ? 0.8 : collection.arena >= deck.minArena ? 1 : 0.5;

  const fieldable = slots.every((s) => !s.isMissing);

  let total =
    (0.42 * ownership + 0.27 * level + 0.13 * skill + 0.1 * arena + 0.08 * edge) * 100;
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
    avgElixir,
    fieldable,
    scores: {
      ownership: Math.round(ownership * 100),
      level: Math.round(level * 100),
      skill: Math.round(skill * 100),
      arena: Math.round(arena * 100),
      edge: Math.round(edge * 100),
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

  return pool
    .map((d) => scoreDeck(d, collection, ease))
    .sort((a, b) => b.scores.total - a.scores.total);
}

/** Distinct archetypes present in the library, for UI filter controls. */
export function archetypes(): string[] {
  return [...new Set(DECKS.map((d) => d.archetype))].sort();
}
