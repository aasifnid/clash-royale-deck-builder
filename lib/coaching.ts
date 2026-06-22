// Coaching text per deck. Curated decks have hand-authored entries for the core fields;
// every deck (curated or pulled-meta) also gets a detailed, multi-part game plan generated
// from its archetype, win condition, and its actual cards — in plain language, naming real
// cards instead of vague "support".

import data from "@/data/deck-coaching.json";
import type { ProvenDeck } from "./types";

export interface Coaching {
  gameplan: string;
  opening: string;
  defense: string;
  combos: string;
  doubleElixir: string;
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
    gameplan: `Your goal is one big push that the opponent cannot fully answer. Drop ${wc} at the very back behind your King Tower so it walks up slowly. While it crosses the field, stack ${c.support} behind it so they all arrive at the tower together. The push should feel like a wave, not a single card.`,
    opening: `In the first minute, do not rush. If you draw ${wc} early, place it at the back and start building. If you draw cheap cards first, play a small defense or wait near the bridge and learn what they have. Never throw ${wc} out alone with no elixir behind it.`,
    defense: `Defend in the center so your troops can cover both lanes. Use ${c.support} and ${c.building} to soak hits and kill what they send. Let the defenders survive, because they become the start of your next ${wc} push.`,
    combos: `${wc} in front as the shield, ${c.support} behind it for damage, and ${c.spell} saved for the swarm or building they drop to stop you. Add a card to the push every few seconds rather than all at once.`,
    doubleElixir: `Double elixir is your time. You can afford a full ${wc} push and still hold elixir to defend. Commit your big push when you are at or near full elixir, and keep ${c.spell} ready for their defending troops.`,
    counters: `Buildings and high single-target damage (Inferno Tower, Mini PEKKA, PEKKA) melt ${wc}. Fast decks can also rush the other lane while you slowly build, so do not over-invest early.`,
    playTips: `Never send ${wc} when you are low on elixir. Defend first, keep your defenders alive, then push with ${wc} and them together as one wave.`,
  }),
  Cycle: (wc, c) => ({
    gameplan: `You win by chipping the tower with ${wc} over and over, and out-cycling their counter to it. ${wc} is cheap, so play ${c.cheapest} and your other cards to spin back to ${wc} quickly. Each time their main answer to ${wc} is used, send another one.`,
    opening: `Open by cycling cheap cards and watching what they use to defend ${wc}. The first ${wc} is for information, not big damage. Once you know their counter, you can time the next ones to slip through.`,
    defense: `Defend cheaply so you never fall behind on elixir. Use ${c.support} and ${c.building} to kill their win condition for less elixir than it cost them. Small even trades are wins for you.`,
    combos: `${wc} plus ${c.spell} to clear the swarm that blocks it, and ${c.support} to defend while you keep cycling. Pair ${wc} with a quick follow-up so their tower never gets a break.`,
    doubleElixir: `In double elixir, send ${wc} more often and add ${c.spell} when it lines up with their tower. Do not panic and overspend. Keep cycling and let the chip damage add up to the win.`,
    counters: `Buildings that pull ${wc} away, and swarms that block it cheaply. Heavy beatdown decks out-value you if you spend too much defending, so trade efficiently.`,
    playTips: `Do not overcommit elixir. You win slowly through chip damage and small even trades, not one big attack. Patience is the whole deck.`,
  }),
  Control: (wc, c) => ({
    gameplan: `You win the long game by defending well and chipping with ${wc}. Trade efficiently on defense, build an elixir lead, then push ${wc} with ${c.support} when they are low and cannot answer. You are not racing, you are grinding them down.`,
    opening: `Start passive. Let them commit first and react with the cheapest defense that works. Use the opening to read their deck so you know what to save ${c.spell} and ${c.building} for.`,
    defense: `This is where you win. Use ${c.support} and ${c.building} to kill their pushes for less elixir than they spent. Place defenders so they survive and can turn into a counter-push with ${wc}.`,
    combos: `Defend with ${c.support}, then send the survivors up with ${wc} so your attack costs almost nothing. Hold ${c.spell} for their swarm and ${c.bigSpell} for a finishing blow on a low tower.`,
    doubleElixir: `With more elixir, your defenses become counter-attacks. After you hold their push, push back immediately with ${wc} while they are spent. Save ${c.spell} for the troops they drop to defend.`,
    counters: `Heavy beatdown decks that out-trade you over time, and quick pressure in the lane you are not defending. Do not get split-pushed.`,
    playTips: `Use ${wc} and ${c.spell} for value, not blind damage. Good trades and patience win control mirrors. Only go for the tower when it is safe.`,
  }),
  "Bridge Spam": (wc, c) => ({
    gameplan: `You apply constant pressure at the bridge and punish them when they are low on elixir. Defend their push, then immediately send ${wc} with ${c.support} across the bridge before they can rebuild. The pressure should never stop.`,
    opening: `Open by testing the bridge with a cheap threat and seeing how they respond. Do not dump everything early. Learn which defender answers ${wc}, then strike when that card is out of rotation.`,
    defense: `Defend efficiently with ${c.support} and ${c.building} so you keep an elixir lead to attack with. Turn every defense into an instant counter-push over the bridge.`,
    combos: `${wc} and ${c.support} together at the bridge, with ${c.spell} ready to clear their defending swarm. Send the second threat to the opposite lane to split their defense.`,
    doubleElixir: `Double elixir lets you pressure both lanes. Keep sending ${wc} and ${c.support} the moment their best answer is used. Apply pressure constantly so they never get to set up their own push.`,
    counters: `Strong single-target defenders and big spells that wipe your support. Do not over-extend into a heavy beatdown deck that punishes the lane you ignore.`,
    playTips: `Keep relentless pressure at the bridge. Send ${wc} when their best defender for it is unavailable, and always have ${c.spell} for the counter-swarm.`,
  }),
  Siege: (wc, c) => ({
    gameplan: `You win by locking ${wc} onto their tower from your side of the river and defending it until it does the damage. Placement is everything. Protect it with ${c.support} and ${c.building}, and cycle fast so a new ${wc} is always ready.`,
    opening: `Open by learning their win condition and what they use to rush ${wc}. Place your first ${wc} mainly to defend and chip, not to commit. Save the big setup for when you have an elixir lead.`,
    defense: `${wc} and ${c.building} do double duty: they defend and chip at the same time. Use ${c.support} to clean up what gets past, and keep ${c.spell} for swarms that would overwhelm your setup.`,
    combos: `${wc} just over the river, ${c.building} to pull their attackers, and ${c.support} behind to defend the ${wc}. Hold ${c.spell} for the swarm they send to kill it.`,
    doubleElixir: `In double elixir you can defend ${wc} more heavily and still cycle to the next one. Keep one always locked on the tower. Save ${c.bigSpell} for their counter-push or to finish a low tower.`,
    counters: `Big spells like Rocket or Lightning on ${wc}, and fast decks that rush you down before it does enough damage. Protect your setup and do not let it get sniped.`,
    playTips: `Placement wins or loses the game. Practice exactly where you drop ${wc} so it hits the tower and helps you defend at the same time.`,
  }),
  Bait: (wc, c) => ({
    gameplan: `You bait out their spell with cheap cards, then punish the gap. Force their small spell with ${c.support}, and once it is gone, drop ${wc} or your other bait card for free value. Defend with ${c.building} while you set the trap.`,
    opening: `Open by playing one bait card at a time so they are tempted to spell it. Do not show all your cheap cards at once. Track which spell they carry and when they use it.`,
    defense: `Defend with ${c.support} and ${c.building}, keeping your swarm cards spread so one spell cannot hit several. Make them choose between a good defense and saving their spell.`,
    combos: `Lead with ${c.support} to draw the spell, then follow with ${wc} for free damage. Pair two bait threats so they cannot answer both with one card.`,
    doubleElixir: `With more elixir, flood the lane with bait cards faster than they can spell each one. Once their small spell is used, push ${wc} hard for the free damage.`,
    counters: `Decks carrying two small spells, or splash damage that clears your cheap bait cards before you can capitalize.`,
    playTips: `Keep track of their small spell at all times. Only commit ${wc} after you have seen them use it, so the punish is free.`,
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
