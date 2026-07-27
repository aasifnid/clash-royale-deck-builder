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

import { DECKS, rankDecks, scoreBuiltDeck, type DeckCandidate, type EasePreference } from "./fieldability";
import { META_DECKS } from "./meta-decks";
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

// The 8-card signature of a deck, order-independent, for de-duping builds against the library.
const deckSig = (d: ProvenDeck) => d.slots.map((s) => s.cardKey).sort().join(",");

// Every card the CURRENT top-ladder meta actually runs, derived fresh from data/meta-decks.json
// on each load. This is the gate for "is there meta for this card?" — nothing card-specific is
// hard-coded; it moves entirely with whatever the latest meta refresh pulled.
const META_CARD_KEYS = new Set<string>(META_DECKS.flatMap((d) => d.slots.map((s) => s.cardKey)));

/** The player's owned deck-defining cards (win conditions + champions) that the CURRENT meta
 *  still runs, ordered by the card they've levelled HIGHEST first. Selection is fully dynamic:
 *  it starts at the player's highest such card and steps down — a high card the meta doesn't run
 *  (e.g. an off-meta champion) is skipped in favour of the next-highest that IS in the meta. So
 *  recommendations are always both "your best card" and "a real current-meta deck". Evolution /
 *  hero only break ties between equal card levels. */
export function metaBackedAnchors(collection: Collection, limit = 6): string[] {
  const anchors: { key: string; level: number; evolved: boolean; hero: boolean }[] = [];
  for (const [idStr, o] of Object.entries(collection.owned)) {
    const card = cardById(Number(idStr));
    if (!card) continue;
    const definesADeck = card.rarity === "Champion" || archetypeForWinCondition(card.key) !== null;
    if (!definesADeck) continue; // a deck is built around a win condition/champion, not a support
    if (!META_CARD_KEYS.has(card.key)) continue; // no current meta for this card → try the next one
    anchors.push({ key: card.key, level: o.level, evolved: o.evolved, hero: o.hero });
  }
  anchors.sort(
    (a, b) => b.level - a.level || Number(b.evolved) - Number(a.evolved) || Number(b.hero) - Number(a.hero),
  );
  return anchors.slice(0, limit).map((a) => a.key);
}

interface RankOptions {
  archetype?: string;
  ease?: EasePreference;
  threats?: Record<string, number>;
}

/** Rank the deck library for this collection AND guarantee the player's best cards are on the
 *  board — but only the ones the CURRENT meta actually backs. It walks the player's highest owned
 *  win conditions/champions downward, builds a real meta deck around each (adapted to their
 *  collection), skips any the meta doesn't run, drops duplicates of a library deck, and ranks
 *  everything through the same engine. Nothing is hard-coded: change the player tag or refresh the
 *  meta and the anchors change with it. */
export function rankWithBestCardDecks(collection: Collection, opts: RankOptions = {}): DeckCandidate[] {
  const ranked = rankDecks(collection, opts);
  const seen = new Set(ranked.map((c) => deckSig(c.deck)));
  const arch = opts.archetype && opts.archetype !== "auto" ? opts.archetype : null;

  const builds: DeckCandidate[] = [];
  for (const key of metaBackedAnchors(collection)) {
    let cand: DeckCandidate | null = null;
    try {
      cand = buildAroundCard(collection, key, { ease: opts.ease, threats: opts.threats });
    } catch {
      cand = null;
    }
    if (!cand) continue;
    const s = deckSig(cand.deck);
    if (seen.has(s)) continue; // the library already covers this exact 8
    if (arch && cand.deck.archetype !== arch) continue; // respect an archetype filter
    seen.add(s);
    builds.push(cand);
  }

  return [...ranked, ...builds].sort((a, b) => b.scores.total - a.scores.total);
}
