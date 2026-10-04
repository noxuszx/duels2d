import { abilityLock } from "./ability-lock";
import { burn } from "./burn";
import { stun } from "./stun";

/** New effect modules register here; ID types derive from this manifest. */
export const statusDefinitions = { stun, "ability-lock": abilityLock, burn } as const;
export type StatusId = keyof typeof statusDefinitions;
