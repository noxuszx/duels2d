import { babyMan } from "./fighters/babyman/definition";
import type { FighterBlueprint } from "../gameplay/fighter-factory";

/** Explicit content registration. Unmigrated identities use the ordinary passive preset. */
export const fighterBlueprints: ReadonlyMap<string, FighterBlueprint> = new Map([[babyMan.id, babyMan]]);
export const isFighterBehaviorEnabled = (id: string): boolean => fighterBlueprints.has(id);
