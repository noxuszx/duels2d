export interface AbilityTiming {
      cooldownMs: number;
      windupFrames: number;
      activeFrames: number;
      recoveryFrames: number;
}

export type AbilityTrigger =
      | { type: "nearest-enemy" }
      | { type: "enemy-in-range"; rangePadding: number };

export interface ForceKnockbackConfig {
      forceMagnitude: number;
}

export interface ProjectileConfig {
      radius: number;
      speed: number;
      damage: number;
      knockback?: boolean | ForceKnockbackConfig;
      lifetimeMs: number;
      rotationSpeed?: number;
      image: string | string[];
      imageScales?: Record<string, number>;
}

export type AbilityAction =
      | { type: "damage"; amount: number }
      | { type: "knockback"; forceMagnitude: number }
      | {
              type: "dash";
              speedMultiplier: number;
              accelerationForce: number;
              endOn: Array<"fighter-collision" | "wall-collision">;
        }
      | { type: "swing"; startDegrees: number; endDegrees: number }
      | { type: "spawn-projectile"; projectile: ProjectileConfig };

export interface AbilityConfig {
      id: string;
      trigger: AbilityTrigger;
      timing: AbilityTiming;
      actions: AbilityAction[];
}

export type AbilityState = "idle" | "windup" | "active" | "recovery";
