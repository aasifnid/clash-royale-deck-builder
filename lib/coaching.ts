// Coaching text per deck. Curated decks have hand-authored entries; any deck without one
// (e.g. pulled meta decks) gets coaching generated from its archetype + win condition, so
// every suggestion reads distinctly instead of sharing a generic blurb.

import data from "@/data/deck-coaching.json";
import type { ProvenDeck } from "./types";

export interface Coaching {
  gameplan: string;
  counters: string;
  playTips: string;
}

const MAP = data as Record<string, Coaching>;

// Archetype playbooks — gameplan + play tip interpolate the deck's actual win condition.
const PLAYBOOK: Record<
  string,
  { gameplan: (wc: string) => string; counters: string; playTips: (wc: string) => string }
> = {
  Beatdown: {
    gameplan: (wc) =>
      `Build ${wc} from the back when you are ahead on elixir, stack support behind it, and save your spells for their defensive swarm.`,
    counters: "High single-target DPS (Inferno Tower, Inferno Dragon, Mini PEKKA) melts the tank, and fast cycle decks punish a slow start.",
    playTips: (wc) => `Do not start ${wc} when low on elixir. Defend first, then build the counter-push behind it.`,
  },
  Cycle: {
    gameplan: (wc) =>
      `Defend cheaply, then send ${wc} the moment their main counter is out of rotation, and out-cycle them to send it again before they answer.`,
    counters: "Buildings and swarms slow the win condition, and beatdown decks out-value you if you over-defend.",
    playTips: (wc) => `Never overcommit. Win on chip and small tower trades with ${wc}, not one big push.`,
  },
  Control: {
    gameplan: (wc) =>
      `Win on defense and steady chip with ${wc}. Make efficient trades, then punish when they are low on elixir.`,
    counters: "Beatdown that out-values your chip, and fast pressure in the lane you are not defending.",
    playTips: (wc) => `Use ${wc} for value, not just the tower. Patience and positive elixir trades win the long game.`,
  },
  "Bridge Spam": {
    gameplan: (wc) =>
      `Defend, then immediately counter-push across the bridge with ${wc} and fast support while they are tapped out.`,
    counters: "Strong single-target defense and big spells on your support, plus heavy beatdown if you over-extend.",
    playTips: (wc) => `Apply constant bridge pressure. Send ${wc} when their key defender is out of cycle.`,
  },
  Siege: {
    gameplan: (wc) =>
      `Place ${wc} defensively to lock onto the tower while your cheap cards defend, and cycle fast to keep one ready.`,
    counters: "Rocket or Earthquake on the siege building, and fast bridge pressure that rushes you down.",
    playTips: (wc) => `Placement is everything with ${wc}. Drill it before laddering, and protect it on defense.`,
  },
  Bait: {
    gameplan: (wc) =>
      `Bait out their small spell with your swarms, then land ${wc} for free damage. Defend with your building and mini-tank.`,
    counters: "Decks with two small spells, or heavy splash that clears your bait cards.",
    playTips: (wc) => `Track their spell. Only commit ${wc} once you know their answer is out of rotation.`,
  },
};

/** Coaching for a deck — the hand-authored entry if it exists, else generated from the
 *  deck's archetype and win condition so meta decks read distinctly. */
export function coachingForDeck(deck: Pick<ProvenDeck, "id" | "archetype" | "winCondition">): Coaching {
  const exact = MAP[deck.id];
  if (exact) return exact;
  const pb = PLAYBOOK[deck.archetype] ?? PLAYBOOK.Beatdown;
  return {
    gameplan: pb.gameplan(deck.winCondition),
    counters: pb.counters,
    playTips: pb.playTips(deck.winCondition),
  };
}
