// Coaching text per deck. Curated decks have hand-authored entries for the core fields;
// every deck (curated or pulled-meta) also gets a detailed, multi-part game plan generated
// from its archetype, win condition, and its actual cards — in plain language, naming real
// cards instead of vague "support".

import data from "@/data/deck-coaching.json";
import type { ProvenDeck } from "./types";

export interface Coaching {
  gameplan: string; // plan + defense + second half, in a few sentences
  counters: string;
  playTips: string;
}

/** A resolved card in the deck, used to make coaching specific. */
export interface DeckCardRef {
  name: string;
  type: "Troop" | "Building" | "Spell";
  role: string;
  elixir?: number;
}

// Hand-authored entries only carry the three core fields; the rest is generated.
const MAP = data as Record<string, Partial<Coaching>>;

function context(cards: DeckCardRef[]) {
  const nonWin = cards.filter((c) => c.role !== "win-condition" && c.role !== "champion");
  const troops = nonWin.filter((c) => c.type === "Troop");
  const spells = cards.filter((c) => c.type === "Spell");
  const byElixirAsc = <T extends DeckCardRef>(a: T, b: T) => (a.elixir ?? 9) - (b.elixir ?? 9);

  const spellsCheapFirst = [...spells].sort(byElixirAsc);
  const cheapest = [...nonWin].sort(byElixirAsc)[0];

  return {
    support: troops.slice(0, 2).map((c) => c.name).join(" and ") || "your other troops",
    support1: troops[0]?.name || "your support troop",
    support2: troops[1]?.name || "your second troop",
    spell: spellsCheapFirst[0]?.name || "your spell",
    bigSpell: [...spells].sort((a, b) => (b.elixir ?? 0) - (a.elixir ?? 0))[0]?.name || "your spell",
    building: cards.find((c) => c.type === "Building")?.name || "your building",
    hasBuilding: cards.some((c) => c.type === "Building"),
    cheapest: cheapest?.name || "your cheapest card",
  };
}

type C = ReturnType<typeof context>;
type Builder = (wc: string, c: C) => Coaching;

const PLAYBOOK: Record<string, Builder> = {
  Beatdown: (wc, c) => ({
    gameplan: `Build one big push the opponent can't fully answer: drop ${wc} at the back and stack ${c.support} behind it so they hit the tower together. Defend in the centre and keep those defenders alive to seed the next push. In double elixir, commit the full push near max elixir with ${c.spell} ready for their swarm.`,
    counters: `Buildings and high single-target damage (Inferno Tower, Mini PEKKA, PEKKA) melt ${wc}, and fast decks rush the other lane while you build — so don't over-invest early.`,
    playTips: `Never send ${wc} on low elixir. Defend first, then push with it and ${c.support} as one wave.`,
  }),
  Cycle: (wc, c) => ({
    gameplan: `Chip with ${wc} again and again and out-cycle their answer to it — ${wc} is cheap, so spin back with ${c.cheapest} and send another the moment their counter is used. Defend cheaply with ${c.support} for small even trades. In double elixir, send it more often and add ${c.spell} when it lines up with their tower.`,
    counters: `Buildings that pull ${wc} and swarms that block it cheaply. Heavy beatdown out-values you if you overspend defending, so trade tight.`,
    playTips: `Don't overcommit. You win on chip and small even trades, not one big attack — patience is the deck.`,
  }),
  Control: (wc, c) => ({
    gameplan: `Win the long game: trade efficiently on defense with ${c.support} and ${c.building}, build an elixir lead, then counter-push ${wc} with the survivors so your attack costs almost nothing. Hold ${c.spell} for their swarm and ${c.bigSpell} to finish a low tower. You're grinding them down, not racing.`,
    counters: `Heavy beatdown that out-trades you over time, and pressure in the lane you're not defending — don't get split-pushed.`,
    playTips: `Use ${wc} and ${c.spell} for value, not blind damage. Only go for the tower when it's safe.`,
  }),
  "Bridge Spam": (wc, c) => ({
    gameplan: `Keep constant pressure at the bridge and punish them when they're low: defend with ${c.support}, then instantly send ${wc} across before they rebuild. Split the second threat to the opposite lane. In double elixir, keep striking the moment their best answer is out of rotation.`,
    counters: `Strong single-target defenders and big spells that wipe your support. Don't over-extend into beatdown that punishes the lane you ignore.`,
    playTips: `Send ${wc} when their best defender for it is unavailable, and always keep ${c.spell} for the counter-swarm.`,
  }),
  Siege: (wc, c) => ({
    gameplan: `Lock ${wc} onto their tower from your side of the river and defend it until it lands — placement is everything. ${wc} and ${c.building} defend and chip at once; clean up leaks with ${c.support} and cycle fast so a new one is always ready. Save ${c.bigSpell} for their counter-push.`,
    counters: `Big spells (Rocket, Lightning) on ${wc}, and fast decks that rush you before it does enough. Protect your setup so it can't get sniped.`,
    playTips: `Placement wins the game — drill exactly where you drop ${wc} so it hits the tower and helps you defend.`,
  }),
  Bait: (wc, c) => ({
    gameplan: `Bait their small spell with ${c.support}, and once it's gone drop ${wc} or your other bait card for free value. Defend with ${c.building}, keeping swarm cards spread so one spell can't hit several. In double elixir, flood faster than they can answer each one.`,
    counters: `Decks with two small spells, or splash that clears your cheap bait before you capitalise.`,
    playTips: `Track their small spell at all times. Only commit ${wc} after you've seen it used, so the punish is free.`,
  }),
};

/** Detailed coaching for a deck. The core fields (gameplan, counters, playTips) use the
 *  hand-authored entry when one exists; the extra detail (opening, defense, combos, double
 *  elixir) is always generated from the archetype and the deck's actual cards. */
export function coachingForDeck(
  deck: Pick<ProvenDeck, "id" | "archetype" | "winCondition">,
  cards: DeckCardRef[] = [],
): Coaching {
  const generated = (PLAYBOOK[deck.archetype] ?? PLAYBOOK.Beatdown)(deck.winCondition, context(cards));
  const exact = MAP[deck.id];
  // Keep any hand-authored fields, fill everything else from the generated plan.
  return exact ? { ...generated, ...exact } : generated;
}
