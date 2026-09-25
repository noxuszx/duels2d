export interface ImpactDamageConfig {
  minSpeedMultiplier: number;
  damage: number;
}

export interface GameConfig {
  rendering: {
    scale: number;
  };
  physics: {
    globalSpeedMultiplier: number;
    collisionCooldownMs: number;
    impactDamage: ImpactDamageConfig;
  };
  effects: { hitSpark: boolean };
  audio: {
    masterVolume: number;
    defaultCooldownMs: number;
    idleIntervalMs: number;
    categories: Record<string, number>;
  };
  arena: {
    borderWidth: number;
    borderColor: string;
    backgroundColor: string;
    visualOverflow: number;
  };
  text: { statusFight: string; footer: string };
}

export interface IndicatorTextConfig {
  family: string;
  weight: string;
  align: CanvasTextAlign;
  baseline: CanvasTextBaseline;
}

export interface IndicatorStyleConfig {
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  minFontSize: number;
  sizeMultiplier: number;
  driftY?: number;
  velocityDamping?: number;
  fadeRate?: number;
  offsetYMultiplier?: number;
}

export interface IndicatorConfig {
  text: IndicatorTextConfig;
  damage: Required<Pick<IndicatorStyleConfig, "driftY" | "velocityDamping" | "fadeRate">> & IndicatorStyleConfig;
  dialogue: Required<Pick<IndicatorStyleConfig, "driftY" | "velocityDamping" | "fadeRate" | "offsetYMultiplier">> & IndicatorStyleConfig;
  health: IndicatorStyleConfig;
}

export interface SoundManifestFile {
  id: string;
  path: string;
}

export type SoundManifestEntry = string | SoundManifestFile;

export interface SoundCueConfig {
  category: string;
  clips: SoundManifestEntry[];
  volume?: number;
  cooldownMs?: number;
  intervalMs?: number;
  pitchVariation?: boolean;
  rate?: number;
  loop?: boolean;
}

export interface CharacterSoundProfile {
  volume?: number;
  cues: Record<string, SoundCueConfig>;
}

export interface SoundManifest {
  shared: Record<string, SoundCueConfig>;
  characters: Record<string, CharacterSoundProfile>;
}
