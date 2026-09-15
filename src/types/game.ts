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
    defaultCooldownMs: number;
    idleIntervalMs: number;
    ambientIntervalMs?: number;
    bounceCooldownMs?: number;
    bounceVolume?: number;
    volumes: Record<string, number>;
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

export interface SoundManifest {
  shared: Record<string, SoundManifestEntry[]>;
  characters: Record<string, Record<string, SoundManifestEntry[]>>;
}
