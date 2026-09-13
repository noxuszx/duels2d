import type { FighterDefinition } from "../../src/types/fighter";
import type { JSONValue, StudioConfig, StudioFileHandle } from "./studio-types";

export function syncFighterDefinition(
  definitions: FighterDefinition[],
  config: StudioConfig,
): FighterDefinition {
  const definition = definitions.find((item) => item.id === config.id);
  if (!definition)
    throw new Error(`Missing fighter definition for ${config.id}`);

  definition.body = definition.body || {};
  definition.body.hitbox = structuredClone(config.hitbox);
  definition.body.hitboxOffset = structuredClone(config.hitboxOffset);
  definition.presentation = definition.presentation || {};
  definition.presentation.image = config.image;
  definition.presentation.imageScale = config.imageScale;
  definition.presentation.imageOffset = structuredClone(config.imageOffset);
  definition.presentation.imageCrop = config.imageCrop
    ? structuredClone(config.imageCrop)
    : null;
  definition.presentation.healthBarOffset = structuredClone(
    config.healthBarOffset,
  );
  definition.presentation.weaponScale = config.weaponScale;
  definition.presentation.weaponOffset = structuredClone(config.weaponOffset);
  definition.presentation.defaultFacing = config.defaultFacing;
  definition.presentation.poses = config.poses
    ? structuredClone(config.poses)
    : null;
  return definition;
}

export function cleanForSave(value: JSONValue): JSONValue {
  if (typeof value === "number")
    return Math.abs(value) < 0.0005 ? 0 : Math.round(value * 1000) / 1000;
  if (Array.isArray(value)) return value.map(cleanForSave);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cleanForSave(item)]),
    );
  }
  return value;
}

export function getSaveContent(
  definitions: FighterDefinition[],
  config: StudioConfig,
): string {
  return `${JSON.stringify(cleanForSave(syncFighterDefinition(definitions, config) as unknown as JSONValue), null, 2)}\n`;
}

export function downloadFighterFile(
  definitions: FighterDefinition[],
  config: StudioConfig,
): void {
  try {
    const blob = new Blob([getSaveContent(definitions, config)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${config.id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  } catch (error) {
    console.error("Failed to download file:", error);
  }
}

export async function writeFighterFile(
  definitions: FighterDefinition[],
  config: StudioConfig,
  fileHandle: StudioFileHandle | undefined,
): Promise<void> {
  if (!fileHandle) return;
  try {
    const writable = await fileHandle.createWritable();
    await writable.write(getSaveContent(definitions, config));
    await writable.close();
  } catch (error) {
    console.error("Failed to write to file:", error);
  }
}
