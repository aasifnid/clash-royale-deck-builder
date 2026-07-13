// Unit test for the clustering + momentum logic. No token/network needed.
// Run: node scripts/meta-cluster.test.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { clusterDecks, computeMomentum, coreSignature, classify } from "./meta-cluster.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const cards = JSON.parse(readFileSync(join(ROOT, "data", "cards.json"), "utf8"));
const elixirByKey = new Map(cards.map((c) => [c.key, c.elixir]));
const typeByKey = new Map(cards.map((c) => [c.key, c.type]));
const ctx = { elixirByKey, typeByKey };

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};
const V = (keys, count) => ({ keys, count, evo: new Map(), tower: new Map() });

// Five fragmented Ronin brews, each run by only 2 players (below MIN_USAGE=4), all sharing the
// same anchors (ronin + pekka + magic-archer) but varying the cheap/spell slots — the exact
// "people trying lots of cards around it" pattern.
const roninBrews = [
  V(["ronin", "pekka", "magic-archer", "bandit", "royal-ghost", "electro-spirit", "the-log", "poison"], 2),
  V(["ronin", "pekka", "magic-archer", "bandit", "royal-ghost", "ice-spirit", "zap", "fireball"], 2),
  V(["ronin", "pekka", "magic-archer", "lumberjack", "royal-ghost", "skeletons", "the-log", "fireball"], 2),
  V(["ronin", "pekka", "magic-archer", "bandit", "phoenix", "electro-spirit", "zap", "poison"], 2),
  V(["ronin", "pekka", "magic-archer", "bandit", "royal-ghost", "bats", "the-log", "fireball"], 2),
];
// Two established, individually-popular decks that must NOT merge with each other or with Ronin.
const hog = V(["hog-rider", "musketeer", "ice-golem", "cannon", "skeletons", "ice-spirit", "the-log", "fireball"], 20);
const golem = V(["golem", "night-witch", "baby-dragon", "mega-minion", "lightning", "tornado", "elixir-collector", "lumberjack"], 15);

const clusters = clusterDecks([...roninBrews, hog, golem], ctx);

// 1) All five Ronin brews collapse into ONE core whose summed usage clears MIN_USAGE (4).
const roninCores = clusters.filter((c) => c.keys.includes("ronin"));
check("Ronin brews cluster into a single core", roninCores.length === 1, `${roninCores.length} core(s)`);
check("Clustered Ronin usage clears MIN_USAGE", (roninCores[0]?.count ?? 0) >= 4, `usage=${roninCores[0]?.count}`);
check("Clustered Ronin usage = sum of variants (10)", roninCores[0]?.count === 10, `usage=${roninCores[0]?.count}`);
check("Ronin core represented by a real 8-card variant", roninCores[0]?.keys.length === 8);
check("Ronin core classifies as Bridge Spam", classify(roninCores[0]?.keys ?? []) === "Bridge Spam");

// 2) Established decks stay separate (no over-merging).
check("Hog and Golem remain distinct cores",
  clusters.some((c) => c.keys.includes("hog-rider")) && clusters.some((c) => c.keys.includes("golem")));
check("Hog/Golem did not merge with Ronin", clusters.length === 3, `${clusters.length} clusters`);

// 3) Momentum: with a previous snapshot that had NO Ronin, the Ronin core should be the top riser.
const previousDecks = [
  { cards: hog.keys, usage: 22 },
  { cards: golem.keys, usage: 18 },
  { cards: ["x-bow", "tesla", "ice-golem", "archers", "skeletons", "ice-spirit", "the-log", "fireball"], usage: 12 },
];
const currentDecks = clusters.map((c) => ({ cards: c.keys, usage: c.count }));
const withMomentum = computeMomentum(currentDecks, previousDecks);
const roninOut = withMomentum.find((d) => d.cards.includes("ronin"));
const hogOut = withMomentum.find((d) => d.cards.includes("hog-rider"));
check("Ronin deck gets positive momentum", (roninOut?.momentum ?? 0) > 0, `m=${roninOut?.momentum}`);
check("Ronin is the hottest riser (momentum = 1)", roninOut?.momentum === 1, `m=${roninOut?.momentum}`);
check("An already-present deck has less momentum than Ronin", (hogOut?.momentum ?? 0) < (roninOut?.momentum ?? 0),
  `hog=${hogOut?.momentum} ronin=${roninOut?.momentum}`);

// 4) A quiet month (same decks as before) should produce no momentum (noise guard).
const quiet = computeMomentum(previousDecks.map((d) => ({ ...d })), previousDecks);
check("No momentum when nothing rose", quiet.every((d) => d.momentum === 0));

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}`);
process.exit(failures === 0 ? 0 : 1);
