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

export interface DamageAction {
      type: "damage";
      amount: number;
}

export interface KnockbackAction {
      type: "knockback";
      forceMagnitude: number;
}

export interface DashAction {
      type: "dash";
      speedMultiplier: number;
      accelerationForce: number;
      endOn: Array<"fighter-collision" | "wall-collision">;
}

export interface SwingAction {
      type: "swing";
      startDegrees: number;
      endDegrees: number;
}

export interface SpawnProjectileAction {
      type: "spawn-projectile";
      projectile: ProjectileConfig;
}

export type AbilityAction =
      | DamageAction
      | KnockbackAction
      | DashAction
      | SwingAction
      | SpawnProjectileAction;

export interface AbilityConfig {
      id: string;
      trigger: AbilityTrigger;
      timing: AbilityTiming;
      actions: AbilityAction[];
}

export type AbilityState = "idle" | "windup" | "active" | "recovery";
