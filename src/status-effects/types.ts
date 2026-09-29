export const STATUS_EFFECT_IDS = ["stun", "ability-lock"] as const;

export type StatusEffectId = (typeof STATUS_EFFECT_IDS)[number];

export interface StatusCapabilities {
      readonly canStartAbilities: boolean;
      readonly canContinueAbility: boolean;
      readonly canUseMovement: boolean;
}

export interface StatusEffectDefinition {
      readonly id: StatusEffectId;
      readonly capabilities: StatusCapabilities;
}

export interface StatusEffectApplication {
      readonly effect: StatusEffectId;
      readonly durationMs: number;
      readonly sourceId?: string | null;
}

export interface ActiveStatusEffect {
      readonly effect: StatusEffectId;
      readonly sourceId: string | null;
      readonly durationMs: number;
      readonly remainingMs: number;
}

export type StatusApplicationResult =
      | { readonly applied: true; readonly refreshed: boolean }
      | {
              readonly applied: false;
              readonly reason: "unknown-effect" | "invalid-duration";
        };
