export interface AbilityTiming {
      cooldownMs: number;
      windupFrames: number;
      activeFrames: number;
      recoveryFrames: number;
}

export type AbilityTrigger =
      | { type: "nearest-enemy" }
      | { type: "enemy-in-range"; rangePadding: number }
      | { type: "wall-contact" };

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

export interface WallCrawlAction {
      type: "wall-crawl";
      durationMs: number;
      speedMultiplier: number;
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

export type AbilityAudioEvent = "windup" | "active" | "hit";
export type AbilityAudioConfig = Partial<Record<AbilityAudioEvent, string>>;

export type AbilityAction =
      | DamageAction
      | KnockbackAction
      | DashAction
      | WallCrawlAction
      | SwingAction
      | SpawnProjectileAction;

export interface AbilityConfig {
      id: string;
      trigger: AbilityTrigger;
      timing: AbilityTiming;
      actions: AbilityAction[];
      audio?: AbilityAudioConfig;
}

export type AbilityState = "idle" | "windup" | "active" | "recovery";
