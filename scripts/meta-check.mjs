// Meta ALGORITHM gap check. Reads the current meta + card master and flags things the code (not
// just the data) may need to adapt to as the game evolves — the checks a human would otherwise do
// by hand each pass:
//   1. Meta cards missing from card master  → a brand-new card released; needs refresh-cards.
//   2. Decks that fall back to the "Control" default with NO recognized win condition → a new win
//      condition the classifier doesn't know (like Elite Barbarians / Rune Giant did in Aug 2026).
//      For each, the highest-elixir non-spell card is surfaced as the likely card to add.
//   3. Forms real accounts use (availableForms) that the bundled card catalog still lacks — FYI,
//      already handled live per-player, but worth noting when the catalog is lagging.
// Prints a markdown report; when run in CI, writes it to $GITHUB_STEP_SUMMARY, a report file, and a
// `gaps=<count>` step output so the workflow can open an issue for review. Exit code is always 0 —
// this reports, it doesn't fail the build.
//
// Run: node scripts/meta-check.mjs

import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { WIN_CONDITIONS } from "./meta-cluster.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const cards = JSON.parse(readFileSync(join(ROOT, "data", "cards.json"), "utf8"));
const meta = JSON.parse(readFileSync(join(ROOT, "data", "meta-decks.json"), "utf8"));

const byKey = new Map(cards.map((c) => [c.key, c]));
const nameOf = (k) => byKey.get(k)?.name ?? k;
const elixirOf = (k) => byKey.get(k)?.elixir ?? 0;
const typeOf = (k) => byKey.get(k)?.type ?? "Troop";
const wcKeys = new Set(WIN_CONDITIONS.map(([k]) => k));

const sections = [];
let gaps = 0;

// 1. Meta cards missing from the bundled card master (a card released since the last refresh-cards).
const unknown = new Set();
for (const d of meta.decks) for (const k of d.cards) if (!byKey.has(k)) unknown.add(k);
if (unknown.size) {
  gaps++;
  sections.push(
    `### ⚠️ ${unknown.size} meta card(s) missing from card master`,
    ...[...unknown].map((k) => `- \`${k}\``),
    `\n**Action:** run \`node scripts/refresh-cards.mjs\`.`,
  );
}

// 2. Decks classified as the "Control" fallback with no recognized win condition → a win condition
//    the classifier doesn't know. Surface the likely card (highest-elixir non-spell) to add.
const fallback = meta.decks.filter((d) => d.archetype === "Control" && !d.cards.some((k) => wcKeys.has(k)));
if (fallback.length) {
  gaps++;
  const candidates = new Map();
  const rows = [];
  for (const d of fallback) {
    const cand = [...d.cards].filter((k) => typeOf(k) !== "Spell").sort((a, b) => elixirOf(b) - elixirOf(a))[0];
    if (cand) candidates.set(cand, (candidates.get(cand) ?? 0) + (d.usage ?? 1));
    rows.push(`- [${d.usage ?? "?"}g] ${d.cards.map(nameOf).join(", ")}`);
  }
  const ranked = [...candidates.entries()].sort((a, b) => b[1] - a[1]);
  sections.push(
    `### ⚠️ ${fallback.length} deck(s) fall back to the "Control" default (no recognized win condition)`,
    ...rows,
    `\n**Likely missing win condition(s):** ${ranked.map(([k, u]) => `${nameOf(k)} (\`${k}\`, ${u}g)`).join(", ")}`,
    `**Action:** add to \`WIN_CONDITIONS\` in BOTH \`lib/archetypes.ts\` and \`scripts/meta-cluster.mjs\` (keep in sync), placed at lowest priority, then re-run \`refresh-meta\`.`,
  );
}

// 3. FYI: forms real accounts use that the bundled catalog doesn't flag (handled live already).
const catalogEvo = new Set(cards.filter((c) => c.hasEvolution).map((c) => c.key));
const catalogHero = new Set(cards.filter((c) => c.hasHero).map((c) => c.key));
const usedEvo = (meta.availableForms?.evolutions ?? []).filter((k) => byKey.has(k) && !catalogEvo.has(k));
const usedHero = (meta.availableForms?.heroes ?? []).filter((k) => byKey.has(k) && !catalogHero.has(k));
if (usedEvo.length || usedHero.length) {
  sections.push(
    `### ℹ️ Forms in play but not yet in the card catalog (surfaced live already — FYI only)`,
    ...usedEvo.map((k) => `- Evolution: ${nameOf(k)} (\`${k}\`)`),
    ...usedHero.map((k) => `- Hero: ${nameOf(k)} (\`${k}\`)`),
  );
}

const header = gaps
  ? `## 🔧 Meta algorithm check — ${gaps} gap(s) to review`
  : `## ✅ Meta algorithm check — no gaps`;
const body = gaps
  ? [header, "", `Sample: ${meta.sampledBattles ?? "?"} battles, ${meta.decks.length} meta decks.`, "", ...sections].join("\n")
  : [header, "", `Every meta deck classifies by a recognized win condition and all ${meta.decks.length} decks' cards are known. Sample: ${meta.sampledBattles ?? "?"} battles.`, ...(sections.length ? ["", ...sections] : [])].join("\n");

console.log(body);

writeFileSync(join(ROOT, "meta-check-report.md"), body + "\n");
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, body + "\n");
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `gaps=${gaps}\n`);
