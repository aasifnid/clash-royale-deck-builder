// Which cards have an Evolution / Hero form available, harvested by the meta refresh from what
// real top-ladder accounts actually have unlocked (see scripts/refresh-meta.mjs). This is a
// third availability source alongside the live catalog and the player's own account, and it does
// NOT depend on Supercell publishing the form's catalog icon — so a freshly-released form shows
// its "available" pill as soon as any sampled player has unlocked it. Empty until the next
// meta refresh runs, then updates weekly with the cron. No hardcoded card lists.

import metaData from "@/data/meta-decks.json";

const forms = (metaData as { availableForms?: { evolutions?: string[]; heroes?: string[] } }).availableForms;

export const AVAILABLE_EVOLUTIONS = new Set<string>(forms?.evolutions ?? []);
export const AVAILABLE_HEROES = new Set<string>(forms?.heroes ?? []);
