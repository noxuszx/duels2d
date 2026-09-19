import type { GameConfig, IndicatorConfig, SoundManifest } from "../types/game";

export interface RuntimeConfig {
      game: GameConfig;
      indicators: IndicatorConfig;
      sounds: SoundManifest;
}

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
      typeof value === "object" && value !== null && !Array.isArray(value);

async function loadJson(path: string): Promise<unknown> {
      const response = await fetch(path);
      if (!response.ok)
            throw new Error(
                  `Could not load ${path}: ${response.status} ${response.statusText}`,
            );
      return response.json() as Promise<unknown>;
}

function requireRecord(value: unknown, location: string): JsonRecord {
      if (!isRecord(value)) throw new Error(`${location} must be an object.`);
      return value;
}

function requireNumber(
      value: unknown,
      location: string,
      minimum = -Infinity,
): void {
      if (
            typeof value !== "number" ||
            !Number.isFinite(value) ||
            value < minimum
      ) {
            throw new Error(
                  `${location} must be a finite number${minimum > 0 ? ` greater than or equal to ${minimum}` : ""}.`,
            );
      }
}

function requireString(value: unknown, location: string): void {
      if (typeof value !== "string" || value.length === 0)
            throw new Error(`${location} must be a non-empty string.`);
}

function validateGameConfig(value: unknown): GameConfig {
      const game = requireRecord(value, "game settings");
      const rendering = requireRecord(
            game.rendering,
            "game settings.rendering",
      );
      requireNumber(
            rendering.scale,
            "game settings.rendering.scale",
            Number.EPSILON,
      );
      if ((rendering.scale as number) > 4)
            throw new Error("game settings.rendering.scale must not exceed 4.");
      const physics = requireRecord(game.physics, "game settings.physics");
      requireNumber(
            physics.globalSpeedMultiplier,
            "game settings.physics.globalSpeedMultiplier",
            Number.EPSILON,
      );
      requireNumber(
            physics.collisionCooldownMs,
            "game settings.physics.collisionCooldownMs",
      );
      const impactDamage = requireRecord(
            physics.impactDamage,
            "game settings.physics.impactDamage",
      );
      requireNumber(
            impactDamage.minSpeedMultiplier,
            "game settings.physics.impactDamage.minSpeedMultiplier",
            Number.EPSILON,
      );
      requireNumber(
            impactDamage.damage,
            "game settings.physics.impactDamage.damage",
      );
      const effects = requireRecord(game.effects, "game settings.effects");
      if (typeof effects.hitSpark !== "boolean")
            throw new Error(
                  "game settings.effects.hitSpark must be a boolean.",
            );
      const audio = requireRecord(game.audio, "game settings.audio");
      requireNumber(
            audio.defaultCooldownMs,
            "game settings.audio.defaultCooldownMs",
      );
      requireNumber(audio.idleIntervalMs, "game settings.audio.idleIntervalMs");
      for (const [name, volume] of Object.entries(
            requireRecord(audio.volumes, "game settings.audio.volumes"),
      )) {
            requireNumber(volume, `game settings.audio.volumes.${name}`, 0);
            if ((volume as number) > 1)
                  throw new Error(
                        `game settings.audio.volumes.${name} must not exceed 1.`,
                  );
      }
      const arena = requireRecord(game.arena, "game settings.arena");
      requireNumber(arena.borderWidth, "game settings.arena.borderWidth");
      requireNumber(arena.visualOverflow, "game settings.arena.visualOverflow");
      requireString(arena.borderColor, "game settings.arena.borderColor");
      requireString(
            arena.backgroundColor,
            "game settings.arena.backgroundColor",
      );
      const text = requireRecord(game.text, "game settings.text");
      if (
            typeof text.statusFight !== "string" ||
            typeof text.footer !== "string"
      ) {
            throw new Error(
                  "game settings.text statusFight and footer must be strings.",
            );
      }
      return game as unknown as GameConfig;
}

function validateIndicatorConfig(value: unknown): IndicatorConfig {
      const indicators = requireRecord(value, "indicator settings");
      const text = requireRecord(indicators.text, "indicator settings.text");
      for (const key of ["family", "weight", "align", "baseline"])
            requireString(text[key], `indicator settings.text.${key}`);
      for (const key of ["damage", "dialogue", "health"]) {
            const style = requireRecord(
                  indicators[key],
                  `indicator settings.${key}`,
            );
            for (const field of ["fillColor", "strokeColor"])
                  requireString(
                        style[field],
                        `indicator settings.${key}.${field}`,
                  );
            for (const field of [
                  "strokeWidth",
                  "minFontSize",
                  "sizeMultiplier",
            ])
                  requireNumber(
                        style[field],
                        `indicator settings.${key}.${field}`,
                        0,
                  );
      }
      for (const key of ["damage", "dialogue"]) {
            const style = requireRecord(
                  indicators[key],
                  `indicator settings.${key}`,
            );
            for (const field of ["driftY", "velocityDamping", "fadeRate"])
                  requireNumber(
                        style[field],
                        `indicator settings.${key}.${field}`,
                  );
      }
      requireNumber(
            requireRecord(indicators.dialogue, "indicator settings.dialogue")
                  .offsetYMultiplier,
            "indicator settings.dialogue.offsetYMultiplier",
      );
      return indicators as unknown as IndicatorConfig;
}

function validateSoundManifest(value: unknown): SoundManifest {
      const manifest = requireRecord(value, "sound manifest");
      for (const section of ["shared", "characters"]) {
            const groups = requireRecord(
                  manifest[section],
                  `sound manifest.${section}`,
            );
            const collections =
                  section === "characters"
                        ? Object.values(groups).flatMap((character) =>
                                Object.values(
                                      requireRecord(
                                            character,
                                            "sound manifest character",
                                      ),
                                ),
                          )
                        : Object.values(groups);
            for (const entries of collections) {
                  if (!Array.isArray(entries))
                        throw new Error(
                              "sound manifest groups must be arrays.",
                        );
                  for (const entry of entries) {
                        if (typeof entry === "string") continue;
                        const file = requireRecord(
                              entry,
                              "sound manifest entry",
                        );
                        requireString(file.id, "sound manifest entry.id");
                        requireString(file.path, "sound manifest entry.path");
                  }
            }
      }
      return manifest as unknown as SoundManifest;
}

/** Loads and validates all editable runtime configuration files. */
export async function loadRuntimeConfig(
      configDirectory = "config",
): Promise<RuntimeConfig> {
      const base = configDirectory.replace(/\/$/, "");
      const [game, indicators, sounds] = await Promise.all([
            loadJson(`${base}/game-settings.json`),
            loadJson(`${base}/indicator-settings.json`),
            loadJson(`${base}/sound-manifest.json`),
      ]);
      return {
            game: validateGameConfig(game),
            indicators: validateIndicatorConfig(indicators),
            sounds: validateSoundManifest(sounds),
      };
}
