// Tower-troop (support card) master data.

import supportData from "@/data/support-cards.json";
import type { TowerTroop } from "./types";

export const TOWER_TROOPS: TowerTroop[] = supportData as TowerTroop[];

const byId = new Map<number, TowerTroop>(TOWER_TROOPS.map((t) => [t.id, t]));

export function towerTroopById(id: number): TowerTroop | undefined {
  return byId.get(id);
}
