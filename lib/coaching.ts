// Coaching text per deck. Curated decks have hand-authored entries; any deck without one
// (e.g. pulled meta decks) gets coaching generated from its archetype, win condition, and
// its actual cards — in plain language, naming real cards instead of vague "support".

import data from "@/data/deck-coaching.json";
import type { ProvenDeck } from "./types";

export interface Coaching {
  gameplan: string;
  counters: string;
  playTips: string;
}

/** A resolved card in the deck, used to make coaching specific. */
export interface DeckCardRef {
  name: string;
  type: "Troop" | "Building" | "Spell";
  role: string;
}

const MAP = data as Record<string, Coaching>;

function context(cards: DeckCardRef[]) {
  const troops = cards
    .filter((c) => c.type === "Troop" && c.role !== "win-condition" && c.role !== "champion")
    .map((c) => c.name);
  const spells = cards.filter((c) => c.type === "Spell").map((c) => c.name);
  const building = cards.find((c) => c.type === "Building")?.name;
  return {
    support: troops.slice(0, 2).join(" and ") || "your other troops",
    spell: spells[0] || "your spell",
    building: building || "your building",
  };
}

type Builder = (wc: string, c: ReturnType<typeof context>) => Coaching;

const PLAYBOOK: Record<string, Builder> = {
  Beatdown: (wc, c) => ({
    gameplan: `Place ${wc} at the back of your side, behind your towers, so it walks up slowly and you have time to line up ${c.support} behind it as one big push. Keep ${c.spell} ready for the troops they drop to defend.`,
    counters: `Buildings and high-damage single-target cards (like Inferno Tower or Mini PEKKA) chew through ${wc}, and fast decks can rush the other lane while you are busy building up.`,
    playTips: `Do not send ${wc} when you are low on elixir. Defend first, let your defenders survive, then push with ${wc} and them together.`,
  }),
  Cycle: (wc, c) => ({
    gameplan: `${wc} is cheap, so play your other cards to get back to it quickly. Send ${wc} at the bridge the moment their main answer to it has just been used, and keep chipping the tower.`,
    counters: `Buildings that pull ${wc} away and swarms that block it. Heavy decks out-value you if you spend too much defending.`,
    playTips: `Do not overcommit elixir. Win slowly through chip damage and small even trades, not one big attack.`,
  }),
  Control: (wc, c) => ({
    gameplan: `Win on defense first. Use ${c.support} to defend cheaply, then chip the tower with ${wc} and ${c.spell} once they are low on elixir.`,
    counters: `Heavy beatdown decks that out-trade you, and quick pressure in the lane you are not defending.`,
    playTips: `Use ${wc} for value (killing their troops or chipping), not just blind damage. Patience and good trades win the long game.`,
  }),
  "Bridge Spam": (wc, c) => ({
    gameplan: `Defend their push, then immediately send ${wc} with ${c.support} across the bridge while they have little elixir left to react.`,
    counters: `Strong single-target defenders and big spells that wipe your support. Do not over-extend into a heavy beatdown deck.`,
    playTips: `Keep constant pressure at the bridge. Send ${wc} when their best defender for it is unavailable.`,
  }),
  Siege: (wc, c) => ({
    gameplan: `Place ${wc} just over the river so it locks onto their tower, and protect it with ${c.support} and ${c.building}. Cycle fast so you always have another ${wc} ready.`,
    counters: `Big spells like Rocket on ${wc}, and fast decks that rush you down before it does enough damage.`,
    playTips: `Placement is everything. Practice exactly where you drop ${wc} so it hits the tower and helps you defend at the same time.`,
  }),
  Bait: (wc, c) => ({
    gameplan: `Force out their small spell with cheap troops like ${c.support}, and once it is used, drop ${wc} for free damage. Defend with ${c.building}.`,
    counters: `Decks carrying two small spells, or splash damage that clears your cheap bait cards.`,
    playTips: `Keep track of their small spell. Only commit ${wc} after you have seen them use it.`,
  }),
};

/** Coaching for a deck — hand-authored entry if curated, else generated in plain language
 *  from the deck's archetype, win condition, and actual cards. */
export function coachingForDeck(
  deck: Pick<ProvenDeck, "id" | "archetype" | "winCondition">,
  cards: DeckCardRef[] = [],
): Coaching {
  const exact = MAP[deck.id];
  if (exact) return exact;
  const build = PLAYBOOK[deck.archetype] ?? PLAYBOOK.Beatdown;
  return build(deck.winCondition, context(cards));
}
