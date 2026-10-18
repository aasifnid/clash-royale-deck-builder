// Unit test for the clustering + momentum logic. No token/network needed.
// Run: node scripts/meta-cluster.test.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { clusterDecks, computeMomentum, classify, cardUsageShares, pickBaseline, addMatchup, SHARE_BASIS } from "./meta-cluster.mjs";

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

// 2b) COARSE FALLBACK — an emerging win condition fragmented across builds that DON'T share
//     anchors (so every fine core stays below MIN_USAGE) still surfaces as one coarse cluster.
const fragmentedRonin = [
  V(["ronin", "pekka", "electro-wizard", "skeletons", "the-log", "zap", "tesla", "bats"], 1),
  V(["ronin", "mega-minion", "magic-archer", "ice-spirit", "fireball", "barbarian-barrel", "cannon", "skeletons"], 1),
  V(["ronin", "valkyrie", "musketeer", "phoenix", "goblin-cage", "electro-spirit", "the-log", "poison"], 1),
  V(["ronin", "bandit", "royal-ghost", "dart-goblin", "arrows", "giant-snowball", "tesla", "fire-spirit"], 1),
  V(["ronin", "hunter", "fisherman", "skeleton-dragons", "fireball", "electro-spirit", "barbarian-barrel", "zap"], 1),
];
const twoTier = clusterDecks([...fragmentedRonin, hog, golem], ctx, 4);
const roninFallback = twoTier.filter((c) => c.keys.includes("ronin"));
check("Fragmented emerging Ronin surfaces via coarse fallback", roninFallback.length === 1, `${roninFallback.length}`);
check("Coarse Ronin aggregates all fragmented usage (5)", roninFallback[0]?.count === 5, `usage=${roninFallback[0]?.count}`);
check("Coarse Ronin represented by a real 8-card build", roninFallback[0]?.keys.length === 8 && roninFallback[0].keys.includes("ronin"));
check("Established Hog fine core still present under two-tier", twoTier.some((c) => c.keys.includes("hog-rider") && c.count === 20));

// 2c) A win condition already carried by a QUALIFYING fine core is not also coarse-aggregated.
const dominant = [
  V(["ronin", "pekka", "magic-archer", "bandit", "royal-ghost", "electro-spirit", "the-log", "poison"], 6),
  V(["ronin", "valkyrie", "musketeer", "phoenix", "goblin-cage", "electro-spirit", "the-log", "poison"], 1),
];
const roninMixed = clusterDecks(dominant, ctx, 4).filter((c) => c.keys.includes("ronin"));
check("Represented win condition not double-listed by coarse pass", roninMixed.length === 1, `${roninMixed.length} clusters`);

// 3) Momentum: with a previous snapshot that had NO Ronin, the Ronin core should be the top riser.
const previousDecks = [
  { cards: hog.keys, usage: 22 },
  { cards: golem.keys, usage: 18 },
  { cards: ["x-bow", "tesla", "ice-golem", "archers", "skeletons", "ice-spirit", "the-log", "fireball"], usage: 12 },
];
const currentDecks = clusters.map((c) => ({ cards: c.keys, usage: c.count }));
const withMomentum = computeMomentum(currentDecks, cardUsageShares(previousDecks));
const roninOut = withMomentum.find((d) => d.cards.includes("ronin"));
const hogOut = withMomentum.find((d) => d.cards.includes("hog-rider"));
check("Ronin deck gets positive momentum", (roninOut?.momentum ?? 0) > 0, `m=${roninOut?.momentum}`);
check("Ronin is the hottest riser (momentum = 1)", roninOut?.momentum === 1, `m=${roninOut?.momentum}`);
check("An already-present deck has less momentum than Ronin", (hogOut?.momentum ?? 0) < (roninOut?.momentum ?? 0),
  `hog=${hogOut?.momentum} ronin=${roninOut?.momentum}`);

// 4) A quiet month (same decks as before) should produce no momentum (noise guard).
const quiet = computeMomentum(previousDecks.map((d) => ({ ...d })), cardUsageShares(previousDecks));
check("No momentum when nothing rose", quiet.every((d) => d.momentum === 0));

// 5) No baseline (first run / missing history) must NOT fire on every deck — the old blanket bug.
const noBase = computeMomentum(currentDecks, null);
check("No baseline -> momentum 0 everywhere", noBase.every((d) => d.momentum === 0));

// 6) Slow drift of an established card (well under 2x its share) is not "rising".
const drift = computeMomentum(
  [{ cards: hog.keys, usage: 30 }, { cards: golem.keys, usage: 18 }],
  cardUsageShares([{ cards: hog.keys, usage: 22 }, { cards: golem.keys, usage: 18 }]),
);
check("Ordinary drift produces no momentum", drift.every((d) => d.momentum === 0));

// 7) Baseline is the newest snapshot 14-60 days old; too-recent and too-old ones are skipped.
const now = new Date("2026-10-22T07:00:00Z");
const hist = [
  { at: "2026-07-01T07:00:00Z", basis: SHARE_BASIS, shares: {} },
  { at: "2026-09-22T07:00:00Z", basis: SHARE_BASIS, shares: {} },
  { at: "2026-10-08T07:00:00Z", basis: SHARE_BASIS, shares: {} },
  { at: "2026-10-18T07:00:00Z", basis: SHARE_BASIS, shares: {} },
];
check("Baseline = newest snapshot 14+ days old", pickBaseline(hist, now)?.at === "2026-10-08T07:00:00Z", pickBaseline(hist, now)?.at);
check("No baseline when every snapshot is too recent", pickBaseline(hist.slice(3), now) === null);
check("Snapshots on a different counting basis are ignored",
  pickBaseline([{ at: "2026-10-01T07:00:00Z", shares: {} }], now) === null);

// 8) Clustering keeps every exact variant with its own record.
const withWins = [
  { ...V(roninBrews[0].keys, 6), wins: 4 },
  { ...V(roninBrews[1].keys, 4), wins: 1 },
];
const kept = clusterDecks(withWins, ctx).find((c) => c.keys.includes("ronin"));
check("Core keeps both variants", kept?.members?.length === 2, `${kept?.members?.length}`);
check("Variant records survive clustering", kept?.members?.find((m) => m.count === 6)?.wins === 4);

// 9) Matchup tally records both sides; a mirror match stays 50%.
const mu = {};
addMatchup(mu, "Cycle", "Beatdown", true);
addMatchup(mu, "Cycle", "Beatdown", true);
addMatchup(mu, "Cycle", "Cycle", false);
check("Matchup winner side counted", mu.Cycle.Beatdown.games === 2 && mu.Cycle.Beatdown.wins === 2);
check("Matchup loser side counted", mu.Beatdown.Cycle.games === 2 && mu.Beatdown.Cycle.wins === 0);
check("Mirror match is 50%", mu.Cycle.Cycle.games === 2 && mu.Cycle.Cycle.wins === 1);

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}`);
process.exit(failures === 0 ? 0 : 1);
