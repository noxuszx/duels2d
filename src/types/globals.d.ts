import type { FighterConfig, FighterDefinition, FighterDefaults } from "./fighter";

declare global {
  interface Window {
    FighterDefaults?: FighterDefaults;
    FighterDefinitions?: FighterDefinition[];
    FighterRoster?: FighterConfig[];
    CharacterConfigs?: FighterConfig[];
    game?: unknown;
    commandLine?: unknown;
  }
}

export {};
