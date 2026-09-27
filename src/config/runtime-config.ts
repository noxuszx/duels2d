import type { GameConfig, IndicatorConfig, SoundManifest } from "../types/game";
import type { FighterConfig } from "../types/fighter";

export interface RuntimeConfig {
      game: GameConfig;
      indicators: IndicatorConfig;
      sounds: SoundManifest;
}

export function validateFighterSoundCues(
      fighters: readonly FighterConfig[],
      sounds: SoundManifest,
): void {
      for (const fighter of fighters) {
            const characterCues = sounds.characters[fighter.id]?.cues ?? {};
            for (const ability of fighter.abilities) {
                  for (const [event, cueName] of Object.entries(
                        ability.audio ?? {},
                  )) {
                        if (
                              cueName &&
                              !characterCues[cueName] &&
                              !sounds.shared[cueName]
                        )
                              throw new Error(
                                    `Fighter "${fighter.id}" ability "${ability.id}" audio.${event} references unknown cue "${cueName}".`,
                              );
                  }
            }
      }
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

function requireVolume(value: unknown, location: string, max = 1): void {
      requireNumber(value, location, 0);
      if ((value as number) > max)
            throw new Error(`${location} must not exceed ${max}.`);
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
      requireVolume(
            audio.masterVolume,
            "game settings.audio.masterVolume",
      );
      requireNumber(
            audio.defaultCooldownMs,
            "game settings.audio.defaultCooldownMs",
      );
      requireNumber(audio.idleIntervalMs, "game settings.audio.idleIntervalMs");
      for (const [name, volume] of Object.entries(
            requireRecord(audio.categories, "game settings.audio.categories"),
      )) {
            requireVolume(volume, `game settings.audio.categories.${name}`);
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
      const validateCue = (value: unknown, location: string): void => {
            const cue = requireRecord(value, location);
            requireString(cue.category, `${location}.category`);
            if (cue.volume !== undefined)
                  requireVolume(cue.volume, `${location}.volume`, 5);
            if (cue.cooldownMs !== undefined)
                  requireNumber(cue.cooldownMs, `${location}.cooldownMs`, 0);
            if (cue.intervalMs !== undefined)
                  requireNumber(cue.intervalMs, `${location}.intervalMs`, 0);
            if (
                  cue.pitchVariation !== undefined &&
                  typeof cue.pitchVariation !== "boolean"
            )
                  throw new Error(`${location}.pitchVariation must be boolean.`);
            if (cue.rate !== undefined)
                  requireNumber(cue.rate, `${location}.rate`, 0);
            for (const field of ["loop", "stopOnPhaseEnd"]) {
                  if (cue[field] !== undefined && typeof cue[field] !== "boolean")
                        throw new Error(`${location}.${field} must be boolean.`);
            }
            if (!Array.isArray(cue.clips) || cue.clips.length === 0)
                  throw new Error(`${location}.clips must be a non-empty array.`);
            for (const entry of cue.clips) {
                  if (typeof entry === "string") continue;
                  const file = requireRecord(
                        entry,
                        `${location}.clips entry`,
                  );
                  requireString(file.id, `${location}.clips entry.id`);
                  requireString(file.path, `${location}.clips entry.path`);
            }
      };

      const shared = requireRecord(manifest.shared, "sound manifest.shared");
      for (const [cueName, cue] of Object.entries(shared))
            validateCue(cue, `sound manifest.shared.${cueName}`);

      const characters = requireRecord(
            manifest.characters,
            "sound manifest.characters",
      );
      for (const [fighterId, value] of Object.entries(characters)) {
            const profile = requireRecord(
                  value,
                  `sound manifest.characters.${fighterId}`,
            );
            if (profile.volume !== undefined)
                  requireVolume(
                        profile.volume,
                        `sound manifest.characters.${fighterId}.volume`,
                  );
            const cues = requireRecord(
                  profile.cues,
                  `sound manifest.characters.${fighterId}.cues`,
            );
            for (const [cueName, cue] of Object.entries(cues)) {
                  validateCue(
                        cue,
                        `sound manifest.characters.${fighterId}.cues.${cueName}`,
                  );
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
      const validatedGame = validateGameConfig(game);
      const validatedSounds = validateSoundManifest(sounds);
      const cues = [
            ...Object.entries(validatedSounds.shared),
            ...Object.values(validatedSounds.characters).flatMap((profile) =>
                  Object.entries(profile.cues),
            ),
      ];
      for (const [cueName, cue] of cues) {
            if (validatedGame.audio.categories[cue.category] === undefined)
                  throw new Error(
                        `Sound cue "${cueName}" references unknown audio category "${cue.category}".`,
                  );
      }
      return {
            game: validatedGame,
            indicators: validateIndicatorConfig(indicators),
            sounds: validatedSounds,
      };
}
