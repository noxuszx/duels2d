import { babyMan } from "./fighters/babyman/definition";
import { granny } from "./fighters/granny/definition";
import type { FighterBlueprint } from "../gameplay/fighter-factory";

/** Explicit content registration. Unmigrated identities use the ordinary passive preset. */
export const fighterBlueprints: ReadonlyMap<string, FighterBlueprint> = new Map([
      [babyMan.id, babyMan], [granny.id, granny],
]);
export const isFighterBehaviorEnabled = (id: string): boolean => fighterBlueprints.has(id);
