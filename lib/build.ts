// Focal-card deck builder. Given a card the player wants to build around, it assembles a
// coherent deck — a strong proven skeleton for that card, with the focal card LOCKED in place
// and every other slot rebuilt from the player's owned cards by the shared engine.
//
// This is the one path that starts from a card the player chose rather than from a whole proven
// deck: it always centers the pick, even if the player's copy is under-leveled or the card is
// off-meta. The skeleton and substitute ordering are biased toward the pairings top players
// actually run with the focal card (meta co-occurrence), so what fills the other slots reflects
// how the card is really played. A win-condition focal anchors the deck itself; a support focal
// is built onto a win condition the player owns.
// Server-side only.

import { DECKS, scoreBuiltDeck, type DeckCandidate, type EasePreference } from "./fieldability";
import { cardByKey, cardById } from "./cards";
import { winConditionKeyOf, archetypeForWinCondition } from "./archetypes";
import type { Collection, ProvenDeck } from "./types";

// Meta decks carry real usage; curated decks don't, so give them a small baseline so a real
// meta skeleton is preferred but a curated one still wins when it's all we have.
const strengthOf = (d: ProvenDeck) => d.usage ?? 0.12;
const strongest = (decks: ProvenDeck[]): ProvenDeck | null =>
  decks.length ? [...decks].sort((a, b) => strengthOf(b) - strengthOf(a))[0] : null;
const winConOf = (d: ProvenDeck) => winConditionKeyOf(d.slots.map((s) => s.cardKey));

/** Cards that co-occur with the focal card across the library, usage-weighted. Higher = more
 *  often paired with it by real decks, so a better fit for the slots around it. */
function coOccurrence(focalKey: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const d of DECKS) {
    const keys = d.slots.map((s) => s.cardKey);
    if (!keys.includes(focalKey)) continue;
    const w = strengthOf(d);
    for (const k of keys) if (k !== focalKey) m.set(k, (m.get(k) ?? 0) + w);
  }
  return m;
}

function owns(collection: Collection, key: string | null): boolean {
  const c = key ? cardByKey(key) : null;
  return c ? Boolean(collection.owned[c.id]) : false;
}

/** The player's strongest owned win condition, preferring one that matches `preferArch`. Null if
 *  the player owns no win condition at all. */
function bestOwnedWinCondition(collection: Collection, preferArch: string | null): string | null {
  let best: { key: string; level: number; match: boolean } | null = null;
  for (const [idStr, o] of Object.entries(collection.owned)) {
    const c = cardById(Number(idStr));
    if (!c) continue;
    const arch = archetypeForWinCondition(c.key);
    if (!arch) continue; // not a win condition
    const match = preferArch != null && arch === preferArch;
    if (!best || (match && !best.match) || (match === best.match && o.level > best.level)) {
      best = { key: c.key, level: o.level, match };
    }
  }
  return best?.key ?? null;
}

/** Inject the focal card into a copy of `base`, taking over the least-defining support slot if
 *  it isn't already in the deck. */
function injectFocal(base: ProvenDeck, focalKey: string): ProvenDeck {
  const slots = base.slots.map((s) => ({ ...s }));
  if (!slots.some((s) => s.cardKey === focalKey)) {
    const idx = slots.findIndex((s) => s.role !== "win-condition" && s.role !== "champion");
    if (idx >= 0) slots[idx] = { cardKey: focalKey, role: slots[idx].role, substitutes: [] };
  }
  return { ...base, slots };
}

/** Skeleton when the focal card IS a win condition: the strongest deck built around it, or a
 *  synthesized archetype skeleton if the library doesn't use it yet. */
function winConditionSkeleton(focalKey: string): ProvenDeck {
  const asWinCon = strongest(DECKS.filter((d) => winConOf(d) === focalKey));
  if (asWinCon) return asWinCon;

  const arch = archetypeForWinCondition(focalKey);
  const base = strongest(arch ? DECKS.filter((d) => d.archetype === arch) : DECKS) ?? DECKS[0];
  const slots = base.slots.map((s) => ({ ...s }));
  const wcIdx = slots.findIndex((s) => s.role === "win-condition");
  slots[wcIdx >= 0 ? wcIdx : 0] = { cardKey: focalKey, role: "win-condition", substitutes: [] };
  return { ...base, slots };
}

/** Skeleton when the focal card is a SUPPORT card: anchor on a win condition the player owns so
 *  the deck's centerpiece is fieldable, then drop the focal card into a support slot. */
function supportSkeleton(focalKey: string, collection: Collection): ProvenDeck {
  const containing = DECKS.filter((d) => d.slots.some((s) => s.cardKey === focalKey));

  // 1. A proven deck that already pairs the focal card with a win condition the player owns.
  const ownable = strongest(containing.filter((d) => owns(collection, winConOf(d))));
  if (ownable) return ownable;

  // 2. Anchor on the player's best owned win condition and inject the focal card.
  const ownedWc = bestOwnedWinCondition(collection, null);
  if (ownedWc) {
    const arch = archetypeForWinCondition(ownedWc);
    const base =
      strongest(DECKS.filter((d) => winConOf(d) === ownedWc)) ??
      strongest(arch ? DECKS.filter((d) => d.archetype === arch) : []) ??
      DECKS[0];
    return injectFocal(base, focalKey);
  }

  // 3. Player owns no win condition at all: best available deck featuring the focal card.
  return strongest(containing) ?? injectFocal(DECKS[0], focalKey);
}

export interface BuildOptions {
  ease?: EasePreference;
  threats?: Record<string, number>;
}

/** Build a deck around the focal card and score it through the shared engine. Returns a
 *  DeckCandidate identical in shape to a library recommendation, so it flows through the same
 *  enrichment and coaching. Throws if the focal card key is unknown. */
export function buildAroundCard(collection: Collection, focalKey: string, opts: BuildOptions = {}): DeckCandidate {
  const focal = cardByKey(focalKey);
  if (!focal) throw new Error(`Unknown card: ${focalKey}`);

  const co = coOccurrence(focalKey);
  const focalIsWinCon = archetypeForWinCondition(focalKey) !== null;
  const skeleton = focalIsWinCon ? winConditionSkeleton(focalKey) : supportSkeleton(focalKey, collection);

  // Order each slot's substitutes by how often the card is paired with the focal card, so the
  // suggested alternates reflect real pairings rather than the library's arbitrary order.
  const slots = skeleton.slots.map((s) => ({
    ...s,
    substitutes: [...s.substitutes].sort((a, b) => (co.get(b) ?? 0) - (co.get(a) ?? 0)),
  }));

  const wcName = cardByKey(winConditionKeyOf(slots.map((s) => s.cardKey)) ?? focalKey)?.name ?? focal.name;
  const built: ProvenDeck = {
    id: `build-${focalKey}`,
    name: `${focal.name} — built around your cards`,
    archetype: skeleton.archetype,
    winCondition: wcName,
    skillFloor: skeleton.skillFloor,
    minArena: 0,
    slots,
    notes: skeleton.notes,
    source: "curated",
  };

  return scoreBuiltDeck(built, collection, { ease: opts.ease, threats: opts.threats, locked: new Set([focalKey]) });
}
