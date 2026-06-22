// Refreshes the bundled card master data from the RoyaleAPI community dataset.
// Run with: node scripts/refresh-cards.mjs
// The CR card roster changes ~monthly; re-run after balance/season updates.

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SOURCE = "https://royaleapi.github.io/cr-api-data/json/cards.json";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "cards.json");

const res = await fetch(SOURCE);
if (!res.ok) {
  console.error(`Failed to fetch card data: ${res.status} ${res.statusText}`);
  process.exit(1);
}
const raw = await res.json();

// Keep only the fields the app needs, normalized into a stable shape.
const cards = raw
  .filter((c) => !c.is_evolved) // base entries only; evolution is a flag, not a separate card
  .map((c) => ({
    id: c.id, // matches the official /players/{tag} card id
    key: c.key,
    name: c.name,
    elixir: c.elixir,
    type: c.type, // Troop | Building | Spell
    rarity: c.rarity, // Common | Rare | Epic | Legendary | Champion
    arena: c.arena, // arena number the card unlocks in
    hasEvolution: Boolean(c.evolved_spells_sc_key),
  }))
  .sort((a, b) => a.id - b.id);

await writeFile(OUT, JSON.stringify(cards, null, 2) + "\n");
console.log(`Wrote ${cards.length} cards to ${OUT}`);
