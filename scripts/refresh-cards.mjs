// Rebuilds the bundled card master data from the LIVE official Clash Royale API
// (/cards), which is always current with the game. The community cr-api-data set is
// used only to enrich each card with a stable slug `key`, `type`, and `arena` — fields
// the official endpoint doesn't provide. New cards the community set hasn't caught up on
// (e.g. recent champions) still appear, with an auto-generated key.
//
// Run with: node scripts/refresh-cards.mjs
// Needs CR_API_TOKEN (read from .env.local or the environment), with the RoyaleAPI proxy
// IP 45.79.218.79 allowlisted on the token.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "data", "cards.json");
const OUT_SUPPORT = join(ROOT, "data", "support-cards.json");
const OUT_ARENAS = join(ROOT, "data", "arenas.json");
const OFFICIAL = "https://proxy.royaleapi.dev/v1/cards";
const COMMUNITY = "https://royaleapi.github.io/cr-api-data/json/cards.json";
const ARENAS = "https://royaleapi.github.io/cr-api-data/json/arenas.json";

function readToken() {
  if (process.env.CR_API_TOKEN) return process.env.CR_API_TOKEN.trim();
  try {
    const m = readFileSync(join(ROOT, ".env.local"), "utf8").match(/CR_API_TOKEN=(.+)/);
    if (m) return m[1].trim();
  } catch {}
  return null;
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function titleCase(r) {
  return r.charAt(0).toUpperCase() + r.slice(1);
}

const token = readToken();
if (!token) {
  console.error("Missing CR_API_TOKEN (set it in .env.local or the environment).");
  process.exit(1);
}

// Authoritative current card list from the official API.
const officialRes = await fetch(OFFICIAL, { headers: { Authorization: `Bearer ${token}` } });
if (!officialRes.ok) {
  console.error(`Official /cards failed: ${officialRes.status} ${officialRes.statusText}`);
  process.exit(1);
}
const officialData = await officialRes.json();
const official = officialData.items;
const supportItems = officialData.supportItems ?? [];

// Community data, indexed by id — for key/type/arena enrichment only.
let community = {};
try {
  const cRes = await fetch(COMMUNITY);
  if (cRes.ok) {
    for (const c of await cRes.json()) {
      if (!c.is_evolved) community[c.id] = c;
    }
  }
} catch {
  console.warn("Community enrichment data unavailable; falling back to generated keys.");
}

const cards = official
  .map((c) => {
    const enrich = community[c.id];
    return {
      id: c.id,
      key: enrich?.key ?? slugify(c.name),
      name: c.name,
      elixir: c.elixirCost ?? enrich?.elixir ?? 0,
      type: enrich?.type ?? "Troop", // official endpoint doesn't classify type
      rarity: titleCase(c.rarity),
      arena: enrich?.arena ?? 0,
      // The presence of art variants is the reliable signal for which formats a card has.
      hasEvolution: Boolean(c.iconUrls?.evolutionMedium),
      hasHero: Boolean(c.iconUrls?.heroMedium),
      iconUrl: c.iconUrls?.medium ?? null,
      evolutionUrl: c.iconUrls?.evolutionMedium ?? null,
      heroUrl: c.iconUrls?.heroMedium ?? null,
    };
  })
  .sort((a, b) => a.id - b.id);

writeFileSync(OUT, JSON.stringify(cards, null, 2) + "\n");
const champs = cards.filter((c) => c.rarity === "Champion").length;
console.log(`Wrote ${cards.length} cards (${champs} champions) to ${OUT}`);

// Tower troops (support cards) — a separate card type.
const support = supportItems
  .map((s) => ({
    id: s.id,
    name: s.name,
    rarity: titleCase(s.rarity),
    iconUrl: s.iconUrls?.medium ?? null,
  }))
  .sort((a, b) => a.id - b.id);
writeFileSync(OUT_SUPPORT, JSON.stringify(support, null, 2) + "\n");
console.log(`Wrote ${support.length} tower troops to ${OUT_SUPPORT}`);

// Arena lookup: the API stores an internal arena id (e.g. 54000020); the in-game
// arena number ("Arena 23") and id are not the same and don't map linearly.
try {
  const aRes = await fetch(ARENAS);
  if (aRes.ok) {
    const arenas = (await aRes.json())
      .map((a) => ({ id: a.id, number: a.arena ?? 0, name: a.title || a.subtitle || a.name }))
      .sort((x, y) => x.id - y.id);
    writeFileSync(OUT_ARENAS, JSON.stringify(arenas, null, 2) + "\n");
    console.log(`Wrote ${arenas.length} arena mappings to ${OUT_ARENAS}`);
  } else {
    console.warn("Arena data unavailable; arena id->number mapping not refreshed.");
  }
} catch {
  console.warn("Arena data fetch failed; arena id->number mapping not refreshed.");
}
