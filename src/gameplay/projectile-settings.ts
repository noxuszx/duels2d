import type { ForceKnockbackConfig, ProjectileConfig } from "../abilities/types";

/** Independent, serializable policies for one projectile's flight. */
export interface ProjectileFlightSettings {
      collision: {
            /** Physics response is independent of whether an enemy contact consumes the shot. */
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
      /** Optional shared combat effect, independent of piercing and physical response. */
      knockback?: ForceKnockbackConfig;
}

/** Only the legacy adapter interprets the old knockback flag as physical response. */
export function projectileFlightSettings(config: ProjectileConfig): ProjectileFlightSettings {
      if (config.flight) {
            assertProjectileFlightSettings(config.flight);
            return structuredClone(config.flight);
      }
      const legacy: ProjectileFlightSettings = {
            collision: {
                  response: config.knockback === false ? "sensor" : "physical",
                  enemyContact: "consume", ownerContact: "ignore", walls: "ignore",
            },
            lifetime: { type: "duration", durationMs: config.lifetimeMs },
            ownership: { onOwnerDeath: "persist", onOwnerRemoval: "persist", onMatchEnd: "persist" },
      };
      assertProjectileFlightSettings(legacy);
      return legacy;
}

/** Validate at the component boundary, even when an authored document bypasses the CLI validator. */
export function assertProjectileFlightSettings(settings: ProjectileFlightSettings): void {
      if (!settings || !["physical", "sensor"].includes(settings.collision?.response) ||
            !["consume", "pierce"].includes(settings.collision?.enemyContact) ||
            !["ignore", "catch"].includes(settings.collision?.ownerContact) ||
            !["ignore", "bounce"].includes(settings.collision?.walls) ||
            !["persist", "remove"].includes(settings.ownership?.onOwnerDeath) ||
            !["persist", "remove"].includes(settings.ownership?.onOwnerRemoval) ||
            !["persist", "remove"].includes(settings.ownership?.onMatchEnd) ||
            !["duration", "persistent"].includes(settings.lifetime?.type) ||
            (settings.lifetime.type === "duration" &&
                  (!Number.isFinite(settings.lifetime.durationMs) || settings.lifetime.durationMs <= 0)) ||
            (settings.knockback !== undefined &&
                  (!Number.isFinite(settings.knockback?.forceMagnitude) || settings.knockback.forceMagnitude <= 0)))
            throw new Error("Invalid projectile flight settings");
}
