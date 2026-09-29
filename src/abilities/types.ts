import type { StatusEffectId } from "../status-effects";

export interface AbilityTiming {
      cooldownMs: number;
      windupMs: number;
      activeMs: number;
      recoveryMs: number;
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

export interface ApplyStatusAction {
      type: "apply-status";
      effect: StatusEffectId;
      durationMs: number;
}

/** A facing-relative rectangular attack volume active for the ability's active phase. */
export interface AttackHitboxAction {
      type: "attack-hitbox";
      width: number;
      height: number;
      offset: {
            /** Forward distance. Positive values are mirrored with fighter facing. */
            x: number;
            y: number;
      };
}

/** Pushes the source opposite its locked firing direction on active entry. */
export interface RecoilAction {
      type: "recoil";
      forceMagnitude: number;
}

export type AbilityAudioEvent = "windup" | "active" | "hit";
export type AbilityAudioConfig = Partial<Record<AbilityAudioEvent, string>>;

export type AbilityAction =
      | DamageAction
      | KnockbackAction
      | DashAction
      | WallCrawlAction
      | SwingAction
      | SpawnProjectileAction
      | ApplyStatusAction
      | AttackHitboxAction
      | RecoilAction;

export interface AbilityConfig {
      id: string;
      trigger: AbilityTrigger;
      timing: AbilityTiming;
      actions: AbilityAction[];
      audio?: AbilityAudioConfig;
}

export type AbilityState = "idle" | "windup" | "active" | "recovery";
