// Small client-side UI helpers (colors, formatting).

import type { Rarity } from "./types";

export const RARITY_COLOR: Record<Rarity, string> = {
  Common: "var(--r-common)",
  Rare: "var(--r-rare)",
  Epic: "var(--r-epic)",
  Legendary: "var(--r-legendary)",
  Champion: "var(--r-champion)",
};

export function difficultyColor(d: string): string {
  if (d === "Easy") return "#4ade80";
  if (d === "Hard") return "#f87171";
  return "var(--accent-2)";
}
