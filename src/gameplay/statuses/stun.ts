import type { StatusDefinition } from "./types";

export const stun = {
      id: "stun",
      restrictions: { canStartCast: false, canContinueCast: false, canMove: false },
} as const satisfies StatusDefinition;
