import type { StatusEffectDefinition, StatusEffectId } from "./types";

const definitions = {
      stun: {
            id: "stun",
            capabilities: {
                  canStartAbilities: false,
                  canContinueAbility: false,
                  canUseMovement: false,
            },
      },
      "ability-lock": {
            id: "ability-lock",
            capabilities: {
                  canStartAbilities: false,
                  canContinueAbility: true,
                  canUseMovement: true,
            },
      },
} as const satisfies Record<StatusEffectId, StatusEffectDefinition>;

export const STATUS_EFFECT_DEFINITIONS: Readonly<Record<StatusEffectId, StatusEffectDefinition>> =
      Object.freeze(
            Object.fromEntries(
                  Object.entries(definitions).map(([id, definition]) => [
                        id,
                        Object.freeze({
                              ...definition,
                              capabilities: Object.freeze({ ...definition.capabilities }),
                        }),
                  ]),
            ) as Record<StatusEffectId, StatusEffectDefinition>,
      );

export function getStatusEffectDefinition(
      effect: StatusEffectId,
): StatusEffectDefinition {
      return STATUS_EFFECT_DEFINITIONS[effect];
}
