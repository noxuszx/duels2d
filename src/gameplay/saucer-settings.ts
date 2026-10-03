import type { ImageCrop } from "../types/fighter";

/** Authored support craft tuning. Distances are game pixels, times simulation ms. */
export interface SaucerSettings {
      image: string | null;
      imageCrop?: ImageCrop | null;
      width: number;
      height: number;
      altitude: number;
      speed: number;
      beamWidth: number;
      beamDamage: number;
      beamDamageIntervalMs: number;
      beamDurationMs: number;
      beamIntervalMs: number;
      beamColor: string;
      summonConfigId: string;
      firstSpawnDelayMs: number;
      spawnIntervalMs: number;
      maxSpawns: number;
}

export function assertSaucerSettings(settings: SaucerSettings): void {
      const positive: Array<keyof SaucerSettings> = ["width", "height", "speed", "beamWidth",
            "beamDamageIntervalMs", "beamDurationMs", "beamIntervalMs", "spawnIntervalMs"];
      if (!settings || positive.some(key => {
            const value = settings[key];
            return typeof value !== "number" || !Number.isFinite(value) || value <= 0;
      }) ||
            !Number.isFinite(settings.altitude) || settings.altitude < 0 ||
            !Number.isFinite(settings.beamDamage) || settings.beamDamage < 0 ||
            !Number.isFinite(settings.firstSpawnDelayMs) || settings.firstSpawnDelayMs < 0 ||
            !Number.isInteger(settings.maxSpawns) || settings.maxSpawns < 0 ||
            settings.beamDurationMs > settings.beamIntervalMs ||
            typeof settings.summonConfigId !== "string" || !settings.summonConfigId.length ||
            typeof settings.beamColor !== "string" || !settings.beamColor.length ||
            (settings.image !== null && (typeof settings.image !== "string" || !settings.image.length)) ||
            (settings.imageCrop && (![settings.imageCrop.x, settings.imageCrop.y,
                  settings.imageCrop.width, settings.imageCrop.height].every(Number.isFinite) ||
                  settings.imageCrop.x < 0 || settings.imageCrop.y < 0 ||
                  settings.imageCrop.width <= 0 || settings.imageCrop.height <= 0)))
            throw new Error("Invalid saucer-support settings");
}
