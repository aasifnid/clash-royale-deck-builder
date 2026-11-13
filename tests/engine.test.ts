// Engine tests against a real account snapshot (tests/fixtures/account-2026-11.json: King 16, owns
// all cards, levels 10-16, name and tag removed). They pin the rules from the Nov 2026 audit, so a
// later change can't quietly bring back 7-swap "meta" decks, look-alike picks, or a support slot
// holding a second win condition. Run: npm test
//
// These read the bundled meta data, so a refresh changes which decks win, but not the rules below.

import { test } from "node:test";
import assert from "node:assert/strict";
import fixture from "./fixtures/account-2026-11.json";
import type { Collection } from "@/lib/types";
import { rankWithBestCardDecks } from "@/lib/build";
import { MAX_OPTIONAL_SWAPS } from "@/lib/fieldability";
import { diversePicks, MAX_SHARED_CARDS } from "@/lib/picks";
import { personalizedSummary, listKind } from "@/lib/present";
import { checkDeck } from "@/lib/deckcheck";
import { WIN_CONDITION_KEYS, winConditionKeyOf } from "@/lib/archetypes";
import { parseDeckLink } from "@/lib/deck";
import { upgradePlan } from "@/lib/upgrades";
import { deckSignature } from "@/lib/battlelog";
import { cardByKey, cardById } from "@/lib/cards";

const collection = fixture as unknown as Collection;
const ranked = rankWithBestCardDecks(collection, { ease: "any" });
const picks = diversePicks(ranked);
const keysOf = (c: (typeof ranked)[number]) => c.slots.map((s) => s.chosenKey).filter((k): k is string => Boolean(k));

test("three picks are shown", () => {
  assert.equal(picks.length, 3);
});

test("no deck uses more than the allowed optional swaps", () => {
  for (const c of ranked) {
    const upgrades = c.substitutions.filter((s) => s.reason === "upgrade").length;
    assert.ok(upgrades <= MAX_OPTIONAL_SWAPS, `${c.deck.name}: ${upgrades} optional swaps`);
  }
});

test("every swap keeps the card type (a spell stays a spell)", () => {
  for (const c of ranked) {
    for (const s of c.substitutions) {
      assert.equal(cardByKey(s.to)?.type, cardByKey(s.from)?.type, `${c.deck.name}: ${s.from} -> ${s.to}`);
    }
  }
});

test("a swap never adds a second win condition", () => {
  for (const c of ranked) {
    for (const s of c.substitutions) {
      assert.ok(!WIN_CONDITION_KEYS.has(s.to), `${c.deck.name}: swapped in win condition ${s.to}`);
    }
  }
});

test("picks are genuinely different decks", () => {
  for (let i = 0; i < picks.length; i++) {
    for (let j = i + 1; j < picks.length; j++) {
      const a = new Set(keysOf(picks[i]));
      const shared = keysOf(picks[j]).filter((k) => a.has(k)).length;
      assert.ok(shared <= MAX_SHARED_CARDS, `picks ${i} and ${j} share ${shared} cards`);
    }
  }
});

test("an account at 12+ gets at least one real (or one-card-off) top-player list", () => {
  assert.ok(picks.some((p) => listKind(p) === "real" || listKind(p) === "close"));
});

test("only real or one-card-off lists are labelled as top-player lists", () => {
  for (const c of ranked) {
    const kind = listKind(c);
    if (kind === "real") assert.equal(c.evidence.kind, "exact");
    if (kind === "close") assert.equal(c.evidence.kind, "close");
  }
});

test("summary never claims a card isn't owned when the player owns every card", () => {
  for (const c of ranked.slice(0, 10)) {
    assert.ok(!/don't own/.test(personalizedSummary(c)), personalizedSummary(c));
  }
});

test("Skeleton Barrel counts as a win condition", () => {
  assert.equal(winConditionKeyOf(["skeleton-barrel", "knight", "zap", "arrows"]), "skeleton-barrel");
});

test("Deck Check keeps a real list the player can field", () => {
  const real = picks.find((p) => listKind(p) === "real");
  assert.ok(real, "fixture should have a real list among the picks");
  const result = checkDeck(collection, keysOf(real));
  assert.equal(result.current.evidence.kind, "exact");
  assert.notEqual(result.verdict, "switch");
});

test("Deck Check flags under-leveled cards in plain words", () => {
  // The fixture's 8 lowest-level cards: a deck built from them must be called out.
  const keys = Object.values(collection.owned)
    .sort((a, b) => a.level - b.level)
    .slice(0, 8)
    .map((o) => cardById(o.id)!.key);
  const result = checkDeck(collection, keys);
  assert.ok(result.notes.some((n) => /under-leveled/.test(n)), result.notes.join(" | "));
});

test("deck links from the game parse to 8 cards", () => {
  const link = "https://link.clashroyale.com/deck/en?deck=26000000;26000001;26000002;26000003;26000004;26000005;26000006;26000007";
  assert.equal(parseDeckLink(link)?.length, 8);
  assert.equal(parseDeckLink("deck=1;2;3"), null);
  assert.equal(parseDeckLink("hello"), null);
});


// The deck the fixture account had selected in-game on 2026-11-12: strong cards, but no spell.
const NO_SPELL_DECK = ["skeleton-barrel", "golden-knight", "inferno-dragon", "wizard", "goblin-gang", "hog-rider", "bomber", "baby-dragon"];

test("a deck with no spell is never a 'keep'", () => {
  const result = checkDeck(collection, NO_SPELL_DECK);
  assert.notEqual(result.verdict, "keep");
  assert.ok(result.notes.some((n) => /No spell/.test(n)));
});

test("the shape fix adds a spell and never removes a win condition", () => {
  const fix = checkDeck(collection, NO_SPELL_DECK).shapeFix;
  assert.ok(fix, "expected a fix for the missing spell");
  assert.equal(fix.need, "spell");
  assert.equal(cardByKey(fix.add)?.type, "Spell");
  assert.ok(!WIN_CONDITION_KEYS.has(fix.remove), `removed win condition ${fix.remove}`);
});

test("the upgrade plan names owned cards below the target level", () => {
  const plan = upgradePlan(collection);
  assert.ok(plan.targets.length > 0);
  for (const t of plan.targets) {
    assert.ok(t.level < t.targetLevel, `${t.name} is already at ${t.level}`);
    assert.ok(t.lists.length > 0);
    assert.ok(t.lists.every((l) => l.cards.includes(t.key)));
  }
});

test("deck signatures ignore card order", () => {
  assert.equal(deckSignature(["zap", "hog-rider"]), deckSignature(["hog-rider", "zap"]));
});
