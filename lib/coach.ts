// The "pro coach" layer. Claude ranks the deterministically-pre-validated candidate
// decks and writes the coaching. It chooses among candidate deck IDs (never emits raw
// cards), so it cannot hallucinate or suggest a card the player doesn't own.
// Server-side only.

import Anthropic from "@anthropic-ai/sdk";
import type { Collection } from "./types";
import type { DeckCandidate } from "./fieldability";
import { cardByKey } from "./cards";

// Grounded reasoning over a constrained candidate set — Sonnet 4.6 is the cost/quality
// sweet spot here. Override with COACH_MODEL if you want Opus-tier picks.
const MODEL = process.env.COACH_MODEL || "claude-sonnet-4-6";

export interface CoachPick {
  deckId: string;
  summary: string; // one line: why this deck suits this player
  gameplan: string; // how to win with it — plan, defense, and second half in one
  winCondition: string;
  counters: string; // what beats it and how to play around that
  playTips: string; // the one or two habits that matter most
  difficulty: "Easy" | "Medium" | "Hard";
}

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    picks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          deckId: { type: "string" },
          summary: { type: "string" },
          gameplan: { type: "string" },
          winCondition: { type: "string" },
          counters: { type: "string" },
          playTips: { type: "string" },
          difficulty: { type: "string", enum: ["Easy", "Medium", "Hard"] },
        },
        required: [
          "deckId",
          "summary",
          "gameplan",
          "winCondition",
          "counters",
          "playTips",
          "difficulty",
        ],
      },
    },
  },
  required: ["picks"],
} as const;

const SYSTEM = `You are the best Clash Royale coach in the world — a top-ladder, tournament-winning player advising one specific player.

You are given that player's account state and a SHORTLIST of proven, fieldable decks already filtered to cards they own at their level. Your job: rank the best 2-3 for THIS player and coach them on each.

For each deck you pick, coach them tightly — three fields, no filler:
- gameplan: how to win with it in 2-3 sentences — the core plan, how to defend, and how the second half changes, naming the deck's actual cards.
- counters: what beats this deck and how to play around it, in one or two sentences.
- playTips: the one or two habits that matter most.

Hard rules:
- ONLY choose decks from the provided shortlist, by their exact "id". Never invent decks or cards.
- Name the player's ACTUAL cards in the advice. Never use vague words like "support" or "your spell" without naming the real card.
- Favor decks that are non-failing: proven to win, fully owned at a competitive level, and easy to pilot — unless the player's ease preference says otherwise.
- Keep advice concrete and specific to this player's arena and card levels. No filler.
- Plain, simple language. No em-dashes. Short sentences.`;

/** Describe the player's collection compactly for the prompt. */
function playerSummary(c: Collection): string {
  const lines = [
    `King tower level: ${c.kingLevel}`,
    c.arena != null ? `Arena: ${c.arena}` : null,
    c.trophies != null ? `Trophies: ${c.trophies}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

/** Render one candidate deck with the player's actual card levels. */
function describeCandidate(cand: DeckCandidate): string {
  const cards = cand.slots
    .map((s) => {
      if (!s.chosenKey) return `  - [${s.role}] MISSING (${s.canonicalKey})`;
      const name = cardByKey(s.chosenKey)?.name ?? s.chosenKey;
      const sub = s.isSubstitute ? ` (sub for ${cardByKey(s.canonicalKey)?.name ?? s.canonicalKey})` : "";
      return `  - [${s.role}] ${name} lvl ${s.level}${sub}`;
    })
    .join("\n");
  const power =
    cand.powerCards.length > 0
      ? cand.powerCards.map((p) => `${p.name} (${[p.evolved && "Evo", p.hero && "Hero"].filter(Boolean).join("+")})`).join(", ")
      : "none";
  return [
    `id: ${cand.deck.id}`,
    `name: ${cand.deck.name} | archetype: ${cand.deck.archetype} | win condition: ${cand.deck.winCondition}`,
    `skill floor: ${cand.deck.skillFloor}/5 | avg elixir: ${cand.avgElixir} | fieldable: ${cand.fieldable}`,
    `power cards this player owns (Evolution/Hero forms — strong advantage): ${power}`,
    `gameplan hint: ${cand.deck.notes ?? ""}`,
    `cards (with this player's levels):\n${cards}`,
  ].join("\n");
}

export class CoachError extends Error {}

/** Ask Claude to rank and coach the shortlist. Returns validated picks. */
export async function coachDecks(
  collection: Collection,
  candidates: DeckCandidate[],
  ease: string,
): Promise<CoachPick[]> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new CoachError("Server is missing ANTHROPIC_API_KEY.");
  }
  if (candidates.length === 0) return [];

  const client = new Anthropic();

  const prompt = `PLAYER:
${playerSummary(collection)}
Ease-of-play preference: ${ease}

SHORTLIST (already filtered to decks this player can field):
${candidates.map(describeCandidate).join("\n\n")}

Rank the best 2-3 decks for this player and coach them. Return JSON only.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: "medium", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new CoachError("No text response from the model.");
  }

  let parsed: { picks: CoachPick[] };
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new CoachError("Model returned unparseable output.");
  }

  // Validation layer: drop any pick whose deckId is not in the shortlist.
  const validIds = new Set(candidates.map((c) => c.deck.id));
  return (parsed.picks ?? []).filter((p) => validIds.has(p.deckId));
}
