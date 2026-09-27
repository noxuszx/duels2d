import { Howl } from "howler";
import type { AbilityAudioEvent, AbilityConfig } from "../abilities/types";
import type {
      CharacterSoundProfile,
      GameConfig,
      SoundCueConfig,
      SoundManifest,
      SoundManifestEntry,
} from "../types/game";

interface LoadedCue {
      config: SoundCueConfig;
      sounds: Howl[];
}

type SoundCues = Record<string, LoadedCue>;

export interface PitchVariationOptions {
      minDelta?: number;
      lowRange?: [number, number];
      highRange?: [number, number];
}

export function getRandomPitch(
      lastRate: number | null = null,
      options: PitchVariationOptions = {},
): number {
      const {
            minDelta = 0.1,
            lowRange = [0.8, 0.93],
            highRange = [1.08, 1.24],
      } = options;

      let nextRate: number;
      let attempts = 0;
      do {
            const isHigh = Math.random() < 0.5;
            const [min, max] = isHigh ? highRange : lowRange;
            nextRate = min + Math.random() * (max - min);
            attempts++;
      } while (
            lastRate != null &&
            Math.abs(nextRate - lastRate) < minDelta &&
            attempts < 10
      );

      return Number(nextRate.toFixed(2));
}

export interface SoundPlayback {
      sound: Howl;
      playbackId: number;
}

/** Owns sound assets, playback rules, and ambient scheduling for a fighter. */
export class FighterAudio {
      private static sharedSoundCueCache: SoundCues | null = null;
      private static readonly sharedLastPitchRates: Record<string, number> = {};

      private readonly soundCues: SoundCues;
      private readonly sharedSoundCues: SoundCues;
      private readonly characterVolume: number;
      private readonly soundCooldowns: Record<string, number> = {};
      private readonly characterLastPitchRates: Record<string, number> = {};
      private readonly abilityPlaybacks = new Map<
            AbilityAudioEvent,
            SoundPlayback
      >();
      private lastIdleSoundTime = 0;
      private lastAmbientSoundTime = 0;
      constructor(
            fighterId: string,
            private readonly gameConfig: GameConfig,
            soundManifest: SoundManifest,
            private readonly now: () => number = () => performance.now(),
      ) {
            const profile: CharacterSoundProfile = soundManifest.characters[
                  fighterId
            ] ?? { cues: {} };
            this.characterVolume = profile.volume ?? 1;
            this.soundCues = FighterAudio.buildSoundCues(profile.cues);
            this.sharedSoundCues = FighterAudio.getSharedSoundCues(
                  soundManifest,
            );
      }

      play(
            type: string,
            cooldownMs: number | null = null,
      ): SoundPlayback | null {
            const characterCue = this.soundCues[type];
            const cue = characterCue ?? this.sharedSoundCues[type];
            if (!cue || cue.sounds.length === 0) return null;
            const cooldown =
                  cooldownMs ??
                  cue.config.cooldownMs ??
                  this.gameConfig.audio.defaultCooldownMs;
            const now = this.now();
            if (
                  cooldown > 0 &&
                  now - (this.soundCooldowns[type] ?? -Infinity) < cooldown
            )
                  return null;
            this.soundCooldowns[type] = now;
            const sound =
                  cue.sounds[Math.floor(Math.random() * cue.sounds.length)];
            const playbackId = sound.play();
            sound.volume(this.volumeForCue(cue.config), playbackId);
            if (cue.config.loop) {
                  sound.loop(true, playbackId);
            }
            this.applyPitchVariation(
                  type,
                  cue.config,
                  sound,
                  playbackId,
                  characterCue === undefined,
            );
            return { sound, playbackId };
      }

      stop(type: string): void {
            const characterCue = this.soundCues[type];
            const cue = characterCue ?? this.sharedSoundCues[type];
            if (!cue) return;
            cue.sounds.forEach((sound) => sound.stop());
      }

      playAbilityCue(ability: AbilityConfig, event: AbilityAudioEvent): void {
            const cueName = ability.audio?.[event];
            if (!cueName) return;
            this.stopTrackedAbilityPlayback(event);
            const cue = this.getCue(cueName);
            const playback = this.play(cueName);
            if (playback && cue && this.isPhaseBound(cue.config)) {
                  this.abilityPlaybacks.set(event, playback);
            }
      }

      stopAbilityCue(ability: AbilityConfig, event: AbilityAudioEvent): void {
            const cueName = ability.audio?.[event];
            if (!cueName) return;
            const cue = this.getCue(cueName);
            if (cue && this.isPhaseBound(cue.config)) {
                  this.stopTrackedAbilityPlayback(event);
            }
      }

      update(nowMs: number, canPlayIdleAudio: boolean): void {
            if (!canPlayIdleAudio) return;
            this.updateAmbient(nowMs);

            const idleCue = this.soundCues.idle ?? this.sharedSoundCues.idle;
            if (
                  !idleCue ||
                  idleCue.sounds.length === 0 ||
                  idleCue.sounds.some((sound) => sound.playing())
            )
                  return;
            if (
                  nowMs - this.lastIdleSoundTime <
                  (idleCue.config.intervalMs ??
                        this.gameConfig.audio.idleIntervalMs)
            )
                  return;
            this.lastIdleSoundTime = nowMs;
            this.play("idle", 0);
      }

      destroy(): void {
            this.abilityPlaybacks.clear();
            Object.values(this.soundCues).forEach((cue) =>
                  cue.sounds.forEach((sound) => {
                        sound.stop();
                        sound.unload();
                  }),
            );
      }

      static playShared(
            type: string,
            soundManifest: SoundManifest,
            gameConfig: GameConfig,
      ): SoundPlayback | null {
            const cue = this.getSharedSoundCues(soundManifest)[type];
            if (!cue || cue.sounds.length === 0) return null;
            const sound =
                  cue.sounds[Math.floor(Math.random() * cue.sounds.length)];
            const playbackId = sound.play();
            sound.volume(
                  this.calculateVolume(cue.config, gameConfig, 1),
                  playbackId,
            );
            return { sound, playbackId };
      }

      private updateAmbient(nowMs: number): void {
            const cue = this.soundCues.ambient ?? this.sharedSoundCues.ambient;
            if (
                  !cue ||
                  cue.sounds.length === 0 ||
                  cue.sounds.some((sound) => sound.playing())
            )
                  return;
            if (
                  nowMs - this.lastAmbientSoundTime <
                  (cue.config.intervalMs ??
                        this.gameConfig.audio.idleIntervalMs)
            )
                  return;
            this.lastAmbientSoundTime = nowMs;
            this.play("ambient", 0);
      }

      private getCue(type: string): LoadedCue | undefined {
            return this.soundCues[type] ?? this.sharedSoundCues[type];
      }

      private isPhaseBound(config: SoundCueConfig): boolean {
            return config.stopOnPhaseEnd ?? config.loop === true;
      }

      private stopTrackedAbilityPlayback(event: AbilityAudioEvent): void {
            const playback = this.abilityPlaybacks.get(event);
            if (!playback) return;
            playback.sound.stop(playback.playbackId);
            this.abilityPlaybacks.delete(event);
      }

      private applyPitchVariation(
            type: string,
            config: SoundCueConfig,
            sound: Howl,
            playbackId: number,
            isShared: boolean,
      ): void {
            if (config.rate !== undefined) {
                  sound.rate(config.rate, playbackId);
                  return;
            }

            if (!config.pitchVariation) {
                  sound.rate(1, playbackId);
                  return;
            }

            const lastRate = isShared
                  ? (FighterAudio.sharedLastPitchRates[type] ?? null)
                  : (this.characterLastPitchRates[type] ?? null);
            const nextRate = getRandomPitch(lastRate);

            if (isShared) FighterAudio.sharedLastPitchRates[type] = nextRate;
            else this.characterLastPitchRates[type] = nextRate;
            sound.rate(nextRate, playbackId);
      }

      private volumeForCue(config: SoundCueConfig): number {
            return FighterAudio.calculateVolume(
                  config,
                  this.gameConfig,
                  this.characterVolume,
            );
      }

      private static calculateVolume(
            config: SoundCueConfig,
            gameConfig: GameConfig,
            characterVolume: number,
      ): number {
            const audio = gameConfig.audio;
            const categoryVolume = audio.categories[config.category] ?? 1;
            return Math.max(
                  0,
                  audio.masterVolume *
                        categoryVolume *
                        characterVolume *
                        (config.volume ?? 1),
            );
      }

      private static getSharedSoundCues(
            soundManifest: SoundManifest,
      ): SoundCues {
            if (!this.sharedSoundCueCache)
                  this.sharedSoundCueCache = this.buildSoundCues(
                        soundManifest.shared,
                  );
            return this.sharedSoundCueCache;
      }

      private static buildSoundCues(
            manifest: Record<string, SoundCueConfig>,
      ): SoundCues {
            const cues: SoundCues = {};
            Object.entries(manifest).forEach(([type, config]) => {
                  if (config.clips.length > 0)
                        cues[type] = {
                              config,
                              sounds: config.clips.map(
                                    (entry) =>
                                          new Howl({
                                                src: [
                                                      this.resolveSoundSource(
                                                            entry,
                                                      ),
                                                ],
                                          }),
                              ),
                        };
            });
            return cues;
      }

      private static resolveSoundSource(entry: SoundManifestEntry): string {
            return typeof entry === "string" ? entry : entry.path;
      }
}
