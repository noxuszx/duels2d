import type { StatusDefinition } from "./types";

export const abilityLock = {
      id: "ability-lock",
      restrictions: { canStartCast: false },
} as const satisfies StatusDefinition;
