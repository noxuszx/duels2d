import { Howl } from "howler";
import type {
      GameConfig,
      SoundManifest,
      SoundManifestEntry,
} from "../types/game";

type SoundPools = Record<string, Howl[]>;

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

/** Owns sound assets, playback rules, and ambient scheduling for a fighter. */
export class FighterAudio {
      private static sharedSoundPoolCache: SoundPools | null = null;
      private static readonly sharedLastPitchRates: Record<string, number> = {};

      private readonly soundPools: SoundPools;
      private readonly sharedSoundPools: SoundPools;
      private readonly soundCooldowns: Record<string, number> = {};
      private readonly characterLastPitchRates: Record<string, number> = {};
      private lastIdleSoundTime = performance.now();
      private lastAmbientSoundTime = performance.now();
      lastAmbientLineTime = performance.now();

      constructor(
            fighterId: string,
            private readonly gameConfig: GameConfig,
            soundManifest: SoundManifest,
      ) {
            this.soundPools = FighterAudio.buildSoundPools(
                  soundManifest.characters[fighterId] ?? {},
                  gameConfig,
            );
            this.sharedSoundPools = FighterAudio.getSharedSoundPools(
                  soundManifest,
                  gameConfig,
            );
      }

      play(type: string, cooldownMs: number | null = null): void {
            const pool = this.soundPools[type] ?? this.sharedSoundPools[type];
            if (!pool || pool.length === 0) return;
            const audio = this.gameConfig.audio ?? {};
            const cooldown =
                  cooldownMs ??
                  audio.defaultCooldownMs ??
                  audio.bounceCooldownMs ??
                  80;
            const now = performance.now();
            if (
                  cooldown > 0 &&
                  now - (this.soundCooldowns[type] ?? 0) < cooldown
            )
                  return;
            this.soundCooldowns[type] = now;
            const sound = pool[Math.floor(Math.random() * pool.length)];
            this.applyPitchVariation(type, sound);
            sound.play();
      }

      update(nowMs: number, canPlayIdleAudio: boolean): void {
            if (!canPlayIdleAudio) return;
            this.updateAmbient(nowMs);

            const idlePool = this.soundPools.idle;
            if (
                  !idlePool ||
                  idlePool.length === 0 ||
                  idlePool.some((sound) => sound.playing())
            )
                  return;
            if (
                  nowMs - this.lastIdleSoundTime <
                  (this.gameConfig.audio?.idleIntervalMs ?? 4000)
            )
                  return;
            this.lastIdleSoundTime = nowMs;
            this.play("idle", 0);
      }

      destroy(): void {
            Object.values(this.soundPools).forEach((pool) =>
                  pool.forEach((sound) => {
                        sound.stop();
                        sound.unload();
                  }),
            );
      }

      static playShared(
            type: string,
            soundManifest: SoundManifest,
            gameConfig: GameConfig,
      ): void {
            const pool = this.getSharedSoundPools(soundManifest, gameConfig)[
                  type
            ];
            if (!pool || pool.length === 0) return;
            pool[Math.floor(Math.random() * pool.length)].play();
      }

      private updateAmbient(nowMs: number): void {
            const pool = this.soundPools.ambient;
            if (
                  !pool ||
                  pool.length === 0 ||
                  pool.some((sound) => sound.playing())
            )
                  return;
            const audio = this.gameConfig.audio ?? {};
            if (
                  nowMs - this.lastAmbientSoundTime <
                  (audio.ambientIntervalMs ?? audio.idleIntervalMs ?? 4000)
            )
                  return;
            this.lastAmbientSoundTime = nowMs;
            this.play("ambient", 0);
      }

      private applyPitchVariation(type: string, sound: Howl): void {
            const shouldVary =
                  type === "hurt" ||
                  type === "body-bounce" ||
                  type === "idle" ||
                  type === "ambient" ||
                  type === "attackActive" ||
                  type === "attackWindup";

            if (!shouldVary) {
                  sound.rate(1);
                  return;
            }

            const isShared = type === "hurt" || type === "body-bounce";
            const lastRate = isShared
                  ? (FighterAudio.sharedLastPitchRates[type] ?? null)
                  : (this.characterLastPitchRates[type] ?? null);
            const nextRate = getRandomPitch(lastRate);

            if (isShared) FighterAudio.sharedLastPitchRates[type] = nextRate;
            else this.characterLastPitchRates[type] = nextRate;
            sound.rate(nextRate);
      }

      private static getSharedSoundPools(
            soundManifest: SoundManifest,
            gameConfig: GameConfig,
      ): SoundPools {
            if (!this.sharedSoundPoolCache)
                  this.sharedSoundPoolCache = this.buildSoundPools(
                        soundManifest.shared,
                        gameConfig,
                  );
            return this.sharedSoundPoolCache;
      }

      private static buildSoundPools(
            manifest: Record<string, SoundManifestEntry[]>,
            gameConfig: GameConfig,
      ): SoundPools {
            const pools: SoundPools = {};
            Object.entries(manifest).forEach(([type, entries]) => {
                  if (entries.length > 0)
                        pools[type] = entries.map(
                              (entry) =>
                                    new Howl({
                                          src: [this.resolveSoundSource(entry)],
                                          volume: this.volumeForSoundType(
                                                type,
                                                gameConfig,
                                          ),
                                    }),
                        );
            });
            return pools;
      }

      private static resolveSoundSource(entry: SoundManifestEntry): string {
            return typeof entry === "string" ? entry : entry.path;
      }

      private static volumeForSoundType(
            type: string,
            gameConfig: GameConfig,
      ): number {
            const audio = gameConfig.audio ?? {};
            if (audio.volumes?.[type] != null) return audio.volumes[type];
            if (type === "body-bounce") return audio.bounceVolume ?? 0.55;
            return type === "death" ? 0.9 : 0.65;
      }
}
