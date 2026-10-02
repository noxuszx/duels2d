import type {
      FighterDefaults,
      FighterDefinition,
      PoseConfig,
      PoseOverrides,
} from "../../../src/types/fighter";
import type { JSONValue, StudioConfig } from "../app/editor-types";

export const DEFAULT_FIGHTER_DEFAULTS: FighterDefaults = {
      combat: {
            maxHealth: 1000,
            speed: 10,
            baseDamage: 50,
            abilities: [],
            faceTarget: { mode: "never" },
      },
      body: {
            radius: 30,
            hitbox: { type: "box", width: 78, height: 112 },
            hitboxOffset: { x: 0, y: -15 },
      },
      presentation: {
            image: null,
            imageScale: 1,
            imageOffset: { x: 0, y: 0 },
            imageCrop: null,
            healthBarOffset: { x: 0, y: -76 },
            weaponScale: 1,
            weaponOffset: { x: 0, y: 0 },
            weaponPivot: { x: 0, y: 0 },
            weaponIdle: null,
            weaponAttack: null,
            defaultFacing: "right",
            poses: null,
      },
      lines: {},
};

function cleanNumber(value: number): number {
      return Math.abs(value) < 0.0005 ? 0 : Math.round(value * 1000) / 1000;
}

function isEqual(a: unknown, b: unknown): boolean {
      if (a === b) return true;
      if (typeof a === "number" && typeof b === "number") {
            return cleanNumber(a) === cleanNumber(b);
      }
      if (a == null || b == null) {
            return a === b;
      }
      if (typeof a !== "object" || typeof b !== "object") {
            return false;
      }
      if (Array.isArray(a) !== Array.isArray(b)) {
            return false;
      }
      if (Array.isArray(a) && Array.isArray(b)) {
            if (a.length !== b.length) return false;
            return a.every((item, i) => isEqual(item, b[i]));
      }
      const keysA = Object.keys(a as Record<string, unknown>);
      const keysB = Object.keys(b as Record<string, unknown>);
      if (keysA.length !== keysB.length) return false;
      return keysA.every((key) =>
            isEqual(
                  (a as Record<string, unknown>)[key],
                  (b as Record<string, unknown>)[key],
            ),
      );
}

export function syncFighterDefinition(
      definitions: FighterDefinition[],
      config: StudioConfig,
      defaults: FighterDefaults = DEFAULT_FIGHTER_DEFAULTS,
): FighterDefinition {
      const definition = definitions.find((item) => item.id === config.id);
      if (!definition)
            throw new Error(`Missing fighter definition for ${config.id}`);

      if (config.behavior) definition.behavior = structuredClone(config.behavior);
      else delete definition.behavior;

      if (config.skills?.aim)
            definition.skills = structuredClone(config.skills);
      else delete definition.skills;

      if (config.transformation) {
            definition.transformation = {
                  trigger: structuredClone(config.transformation.trigger),
                  ...(config.transformation.skills !== undefined
                        ? { skills: structuredClone(config.transformation.skills) }
                        : {}),
                  sequence: structuredClone(
                        config.transformation.sequence ?? [],
                  ),
                  combat: {
                        abilities: structuredClone(
                              config.transformation.abilities,
                        ),
                  },
                  presentation: {
                        poses: structuredClone(config.transformation.poses),
                  },
            };
      } else {
            delete definition.transformation;
      }

      // Body: strip hitbox and hitboxOffset if equal to defaults
      if (
            definition.body ||
            !isEqual(config.hitbox, defaults.body.hitbox) ||
            !isEqual(config.hitboxOffset, defaults.body.hitboxOffset)
      ) {
            definition.body = definition.body || {};
            if (!isEqual(config.hitbox, defaults.body.hitbox)) {
                  definition.body.hitbox = structuredClone(config.hitbox);
            } else {
                  delete definition.body.hitbox;
            }
            if (!isEqual(config.hitboxOffset, defaults.body.hitboxOffset)) {
                  definition.body.hitboxOffset = structuredClone(
                        config.hitboxOffset,
                  );
            } else {
                  delete definition.body.hitboxOffset;
            }
            if (
                  definition.body.radius !== undefined &&
                  isEqual(definition.body.radius, defaults.body.radius)
            ) {
                  delete definition.body.radius;
            }
            if (Object.keys(definition.body).length === 0) {
                  delete definition.body;
            }
      }

      definition.combat = definition.combat || {};
      if (!isEqual(config.abilities, defaults.combat.abilities)) {
            definition.combat.abilities = structuredClone(config.abilities);
      } else {
            delete definition.combat.abilities;
      }

      // Presentation: strip fields equal to defaults
      definition.presentation = definition.presentation || {};

      if (config.image && !isEqual(config.image, defaults.presentation.image)) {
            definition.presentation.image = config.image;
      } else {
            delete definition.presentation.image;
      }

      if (
            config.imageScale !== undefined &&
            !isEqual(config.imageScale, defaults.presentation.imageScale)
      ) {
            definition.presentation.imageScale = cleanNumber(config.imageScale);
      } else {
            delete definition.presentation.imageScale;
      }

      if (
            config.imageOffset &&
            !isEqual(config.imageOffset, defaults.presentation.imageOffset)
      ) {
            definition.presentation.imageOffset = {
                  x: cleanNumber(config.imageOffset.x),
                  y: cleanNumber(config.imageOffset.y),
            };
      } else {
            delete definition.presentation.imageOffset;
      }

      if (
            config.imageCrop &&
            !isEqual(config.imageCrop, defaults.presentation.imageCrop)
      ) {
            definition.presentation.imageCrop = {
                  x: cleanNumber(config.imageCrop.x),
                  y: cleanNumber(config.imageCrop.y),
                  width: cleanNumber(config.imageCrop.width),
                  height: cleanNumber(config.imageCrop.height),
            };
      } else {
            delete definition.presentation.imageCrop;
      }

      if (
            config.healthBarOffset &&
            !isEqual(
                  config.healthBarOffset,
                  defaults.presentation.healthBarOffset,
            )
      ) {
            definition.presentation.healthBarOffset = {
                  x: cleanNumber(config.healthBarOffset.x),
                  y: cleanNumber(config.healthBarOffset.y),
            };
      } else {
            delete definition.presentation.healthBarOffset;
      }

      if (
            config.weaponScale !== undefined &&
            !isEqual(config.weaponScale, defaults.presentation.weaponScale)
      ) {
            definition.presentation.weaponScale = cleanNumber(
                  config.weaponScale,
            );
      } else {
            delete definition.presentation.weaponScale;
      }

      if (
            config.weaponOffset &&
            !isEqual(config.weaponOffset, defaults.presentation.weaponOffset)
      ) {
            definition.presentation.weaponOffset = {
                  x: cleanNumber(config.weaponOffset.x),
                  y: cleanNumber(config.weaponOffset.y),
            };
      } else {
            delete definition.presentation.weaponOffset;
      }
      if (
            config.weaponPivot &&
            !isEqual(config.weaponPivot, defaults.presentation.weaponPivot)
      ) {
            definition.presentation.weaponPivot = {
                  x: cleanNumber(config.weaponPivot.x),
                  y: cleanNumber(config.weaponPivot.y),
            };
      } else {
            delete definition.presentation.weaponPivot;
      }
      if (
            config.weaponIdle &&
            !isEqual(config.weaponIdle, defaults.presentation.weaponIdle)
      ) {
            definition.presentation.weaponIdle = config.weaponIdle;
      } else {
            delete definition.presentation.weaponIdle;
      }

      if (
            config.defaultFacing &&
            !isEqual(config.defaultFacing, defaults.presentation.defaultFacing)
      ) {
            definition.presentation.defaultFacing = config.defaultFacing;
      } else {
            delete definition.presentation.defaultFacing;
      }

      if (
            !config.poses ||
            isEqual(config.poses, defaults.presentation.poses) ||
            Object.keys(config.poses).length === 0
      ) {
            delete definition.presentation.poses;
      } else {
            const cleanedPoses: Record<string, PoseConfig> = {};
            for (const [key, poseVal] of Object.entries(config.poses)) {
                  if (!poseVal) continue;
                  if (typeof poseVal === "string") {
                        cleanedPoses[key] = poseVal;
                  } else if (typeof poseVal === "object") {
                        const poseObj: PoseOverrides = { image: poseVal.image };
                        if (poseVal.aim)
                              poseObj.aim = structuredClone(poseVal.aim);
                        if (poseVal.imageCrop) {
                              poseObj.imageCrop = {
                                    x: cleanNumber(poseVal.imageCrop.x),
                                    y: cleanNumber(poseVal.imageCrop.y),
                                    width: cleanNumber(poseVal.imageCrop.width),
                                    height: cleanNumber(
                                          poseVal.imageCrop.height,
                                    ),
                              };
                        } else if ("imageCrop" in poseVal) {
                              poseObj.imageCrop = null;
                        }
                        if (poseVal.imageScale !== undefined) {
                              poseObj.imageScale = cleanNumber(
                                    poseVal.imageScale,
                              );
                        }
                        if (poseVal.imageOffset) {
                              poseObj.imageOffset = {
                                    x: cleanNumber(poseVal.imageOffset.x),
                                    y: cleanNumber(poseVal.imageOffset.y),
                              };
                        }
                        cleanedPoses[key] = poseObj;
                  }
            }
            if (Object.keys(cleanedPoses).length > 0) {
                  definition.presentation.poses = cleanedPoses;
            } else {
                  delete definition.presentation.poses;
            }
      }

      if (Object.keys(definition.presentation).length === 0) {
            delete definition.presentation;
      }

      if (definition.combat && Object.keys(definition.combat).length === 0) {
            delete definition.combat;
      }
      if (definition.lines && Object.keys(definition.lines).length === 0) {
            delete definition.lines;
      }

      return definition;
}

export function cleanForSave(value: JSONValue): JSONValue {
      if (typeof value === "number") {
            return cleanNumber(value);
      }
      if (Array.isArray(value)) {
            return value.map(cleanForSave);
      }
      if (value && typeof value === "object") {
            const cleaned: Record<string, JSONValue> = {};
            for (const [key, item] of Object.entries(value)) {
                  if (item === undefined) continue;
                  const cleanedItem = cleanForSave(item);
                  if (
                        cleanedItem !== null &&
                        typeof cleanedItem === "object" &&
                        !Array.isArray(cleanedItem) &&
                        key !== "poses" &&
                        Object.keys(cleanedItem).length === 0
                  ) {
                        continue;
                  }
                  cleaned[key] = cleanedItem;
            }
            return cleaned;
      }
      return value;
}

export function formatFighterJson(json: string): string {
      return json.replace(
            /\{\n\s*("[^"\n]+":\s*(?:"[^"\n]*"|[-0-9.]+|true|false|null)(?:,\n\s*"[^"\n]+":\s*(?:"[^"\n]*"|[-0-9.]+|true|false|null))*)\n\s*\}/g,
            (match, inner: string) => {
                  const formatted = inner
                        .split(",\n")
                        .map((line) => line.trim())
                        .join(", ");
                  if (formatted.length <= 80) {
                        return `{ ${formatted} }`;
                  }
                  return match;
            },
      );
}

export function getSaveContent(
      definitions: FighterDefinition[],
      config: StudioConfig,
      defaults?: FighterDefaults,
): string {
      const synced = syncFighterDefinition(
            structuredClone(definitions),
            config,
            defaults,
      );
      const cleaned = cleanForSave(synced as unknown as JSONValue);
      const rawJson = JSON.stringify(cleaned, null, 2);
      return `${formatFighterJson(rawJson)}\n`;
}
