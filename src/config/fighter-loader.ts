import { buildFighterRoster } from "./fighter-config";
import type {
      FighterConfigLoadResult,
      FighterDefinition,
      FighterDefaults,
      FighterManifest,
} from "../types/fighter";

async function loadJson<T>(path: string): Promise<T> {
      const response = await fetch(path);
      if (!response.ok)
            throw new Error(
                  `Failed to load ${path}: ${response.status} ${response.statusText}`,
            );
      return (await response.json()) as T;
}

function validateManifest(manifest: FighterManifest, basePath: string): void {
      if (!Array.isArray(manifest.fighters))
            throw new Error(
                  `${basePath}/index.json must contain a fighters array`,
            );
      const files = new Set<string>();
      for (const file of manifest.fighters) {
            if (
                  typeof file !== "string" ||
                  file.includes("/") ||
                  file.includes("\\") ||
                  !file.endsWith(".json") ||
                  file === "defaults.json" ||
                  file === "fighter.schema.json"
            ) {
                  throw new Error(
                        `Invalid fighter filename in ${basePath}/index.json: ${String(file)}`,
                  );
            }
            if (files.has(file))
                  throw new Error(
                        `Duplicate fighter filename in ${basePath}/index.json: ${file}`,
                  );
            files.add(file);
      }
}

function validateDefinitions(
      definitions: readonly FighterDefinition[],
      files: readonly string[],
): void {
      const ids = new Set<string>();
      for (const [index, definition] of definitions.entries()) {
            const file = files[index];
            const expectedId = file.slice(0, -".json".length);
            if (definition.id !== expectedId)
                  throw new Error(
                        `${file} must contain the matching fighter id "${expectedId}"`,
                  );
            if (ids.has(definition.id))
                  throw new Error(`Duplicate fighter id: ${definition.id}`);
            ids.add(definition.id);
      }
}

/** Loads, validates, and composes fighter JSON without mutating global state. */
export async function loadFighterConfig(
      fightersPath: string,
): Promise<FighterConfigLoadResult> {
      const basePath = fightersPath.replace(/\/$/, "");
      const [defaults, manifest] = await Promise.all([
            loadJson<FighterDefaults>(`${basePath}/defaults.json`),
            loadJson<FighterManifest>(`${basePath}/index.json`),
      ]);
      validateManifest(manifest, basePath);
      const definitions = await Promise.all(
            manifest.fighters.map((file) =>
                  loadJson<FighterDefinition>(`${basePath}/${file}`),
            ),
      );
      validateDefinitions(definitions, manifest.fighters);
      return {
            defaults,
            definitions,
            roster: buildFighterRoster(defaults, definitions),
      };
}

/** Temporary bridge for remaining legacy scripts that still read configuration from `window`. */
export function installFighterConfigGlobals(
      result: FighterConfigLoadResult,
): void {
      window.FighterDefaults = result.defaults;
      window.FighterDefinitions = result.definitions;
      window.FighterRoster = result.roster;
      window.CharacterConfigs = result.roster;
}

export async function loadAndInstallFighterConfig(
      fightersPath: string,
): Promise<FighterConfigLoadResult> {
      const result = await loadFighterConfig(fightersPath);
      installFighterConfigGlobals(result);
      return result;
}
