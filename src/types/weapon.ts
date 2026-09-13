export interface WeaponAnimation {
  windupFrames: number;
  activeFrames: number;
  recoveryFrames: number;
}

export interface KnockbackConfig {
  speedMultiplier: number;
  durationMs: number;
}

export type Knockback = boolean | KnockbackConfig;

export interface ProjectileConfig {
  radius: number;
  speed: number;
  damage: number;
  knockback?: Knockback;
  lifetimeMs: number;
  rotationSpeed?: number;
  image: string;
}

interface BaseWeaponConfig {
  cooldownMs: number;
  animation?: WeaponAnimation;
}

export interface ProjectileWeapon extends BaseWeaponConfig {
  type: "projectile";
  projectile: ProjectileConfig;
}

export interface ProximityMeleeWeapon extends BaseWeaponConfig {
  type: "proximity-melee";
  damage?: number;
  rangePadding?: number;
  knockback?: Knockback;
}

export type WeaponConfig = ProjectileWeapon | ProximityMeleeWeapon;
