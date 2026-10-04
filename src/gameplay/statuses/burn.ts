import type { StatusDefinition } from "./types";

/** Demonstrates a reusable simulation-time effect module with no fighter branch. */
export const burn = {
      id: "burn",
      refresh: "max",
      maxStacks: 3,
      onTick(context, state, deltaMs) {
            state.pulseMs += deltaMs;
            const tolerance = Number.EPSILON * Math.max(500, state.pulseMs) * 8;
            while (state.pulseMs + tolerance >= 500) {
                  state.pulseMs = Math.max(0, state.pulseMs - 500);
                  context.damage(2 * context.stacks, context.sourceId);
            }
      },
} satisfies StatusDefinition;
