import type { AimSkillOptions, ImageCrop, Vector2 } from "../types/fighter";

export interface MoveConfig {
      cooldownMs: number;
      windupMs?: number;
      windupSound?: string;
      attackDurationMs?: number;
      recoveryMs?: number;
      rangePadding?: number;
}
export interface HitSettings { damage?: number; knockback?: number; }
export interface CrawlSettings {
      durationMs: number;
      speedMultiplier: number;
      poses: [string, string];
      poseIntervalMs: number;
      sound?: string;
}
export interface DashSettings {
      speedMultiplier: number;
      accelerationForce: number;
      endOn: Array<"fighter-collision" | "wall-collision">;
      maxDurationMs: number;
      pose?: string;
      sound?: string;
      hitSound?: string;
      hit: HitSettings;
}
export interface MeleeSettings extends HitSettings {
      hitbox?: { width: number; height: number; offset: Vector2 };
      swing?: { startDegrees: number; endDegrees: number };
      pose?: string;
      sound?: string;
      hitSound?: string;
}
export interface ProjectileFlightSettings {
      collision: {
            response: "physical" | "sensor";
            enemyContact: "consume" | "pierce";
            ownerContact: "ignore" | "catch";
            walls: "ignore" | "bounce";
      };
      lifetime: { type: "duration"; durationMs: number } | { type: "persistent" };
      ownership: {
            onOwnerDeath: "persist" | "remove";
            onOwnerRemoval: "persist" | "remove";
            onMatchEnd: "persist" | "remove";
      };
      knockback?: { forceMagnitude: number };
}
export interface ProjectileSettings {
      radius: number;
      speed: number;
      damage: number;
      flight: ProjectileFlightSettings;
      rotationSpeed?: number;
      image: string | string[];
      imageScales?: Record<string, number>;
}
export interface ProjectileEmitterSettings {
      projectile: ProjectileSettings;
      recoil?: number;
      sound?: string;
      hitSound?: string;
}
export interface DamageRampSettings {
      amountPerIncrease: number;
      maxDamage: number;
      hurtThrowThreshold?: number;
      ratesPerSecond: number[];
      increasePoseMs: number;
}
export interface LaserSettings {
      damage: number; intervalMs: number; width: number; range: number; flashMs: number; color: string;
}
export interface SaucerSettings {
      image: string | null;
      imageCrop?: ImageCrop | null;
      width: number; height: number; altitude: number; speed: number;
      beamWidth: number; beamDamage: number; beamDamageIntervalMs: number;
      beamDurationMs: number; beamIntervalMs: number; beamColor: string;
      summonConfigId: string; firstSpawnDelayMs: number; spawnIntervalMs: number; maxSpawns: number;
}

/** Extend this interface from a component module to add typed authored settings. */
export interface FighterComponents {
      wallCrawl?: CrawlSettings;
      dash?: DashSettings;
      melee?: MeleeSettings;
      projectile?: ProjectileEmitterSettings;
      aim?: AimSkillOptions;
      weaponAim?: AimSkillOptions;
      damageRamp?: DamageRampSettings;
      instantLaser?: LaserSettings;
      saucer?: SaucerSettings;
}
