import type {
      FighterConfig,
      FighterDefinition,
      FighterDefaults,
      FighterPoses,
      FighterPresentationOverrides,
      PoseConfig,
} from "../types/fighter";

type JsonValue =
      | null
      | boolean
      | number
      | string
      | JsonValue[]
      | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

function isJsonObject(value: JsonValue): value is JsonObject {
      return (
            value !== null && typeof value === "object" && !Array.isArray(value)
      );
}

function clone<T extends JsonValue>(value: T): T {
      if (Array.isArray(value)) return value.map(clone) as T;
      if (isJsonObject(value))
            return Object.fromEntries(
                  Object.entries(value).map(([key, item]) => [
                        key,
                        clone(item),
                  ]),
            ) as T;
      return value;
}

function merge(
      base: JsonObject,
      overrides: JsonObject | undefined,
): JsonObject {
      const result = clone(base);
      if (!overrides) return result;
      for (const [key, value] of Object.entries(overrides)) {
            const current = result[key];
            result[key] =
                  isJsonObject(value) && isJsonObject(current)
                        ? merge(current, value)
                        : clone(value);
      }
      return result;
}

/**
 * Converts compact pose declarations into independent visual records. A pose
 * may start with the base visual values, but it must not keep inheriting them
 * after the Studio begins editing either sprite.
 */
function materializePoses(
      presentation: FighterPresentationOverrides &
            FighterDefaults["presentation"],
      poses: FighterPoses = presentation.poses,
): FighterPoses {
      if (!poses) return null;
      return Object.fromEntries(
            Object.entries(poses).map(([key, pose]) => {
                  const poseObject = typeof pose === "string" ? null : pose;
                  const image = typeof pose === "string" ? pose : pose.image;
                  const imageCrop =
                        poseObject && "imageCrop" in poseObject
                              ? poseObject.imageCrop
                              : presentation.imageCrop;
                  const materialized: Exclude<PoseConfig, string> = {
                        image,
                        ...(poseObject?.aim ? { aim: structuredClone(poseObject.aim) } : {}),
                        imageScale:
                              poseObject?.imageScale ?? presentation.imageScale,
                        imageOffset: {
                              ...(poseObject?.imageOffset ??
                                    presentation.imageOffset),
                        },
                        imageCrop: imageCrop ? { ...imageCrop } : null,
                  };
                  return [key, materialized];
            }),
      );
}

/** Merges an editable definition with defaults and flattens it for runtime use. */
export function composeFighter(
      defaults: FighterDefaults,
      definition: FighterDefinition,
): FighterConfig {
      const merged = merge(
            defaults as unknown as JsonObject,
            definition as unknown as JsonObject,
      ) as unknown as FighterDefinition & FighterDefaults;
      return {
            id: merged.id,
            name: merged.name,
            color: merged.color,
            ...(definition.selectable !== undefined ? { selectable: definition.selectable } : {}),
            ...(definition.skills ? { skills: structuredClone(definition.skills) } : {}),
            ...(definition.behavior ? { behavior: structuredClone(definition.behavior) } : {}),
            maxHealth: merged.combat.maxHealth,
            speed: merged.combat.speed,
            baseDamage: merged.combat.baseDamage,
            abilities: merged.combat.abilities,
            faceTarget: merged.combat.faceTarget,
            radius: merged.body.radius,
            hitbox: merged.body.hitbox,
            hitboxOffset: merged.body.hitboxOffset,
            image: merged.presentation.image,
            imageScale: merged.presentation.imageScale,
            imageOffset: merged.presentation.imageOffset,
            imageCrop: merged.presentation.imageCrop,
            healthBarOffset: merged.presentation.healthBarOffset,
            weaponScale: merged.presentation.weaponScale,
            weaponOffset: merged.presentation.weaponOffset,
            weaponPivot: merged.presentation.weaponPivot,
            weaponIdle: merged.presentation.weaponIdle,
            weaponAttack: merged.presentation.weaponAttack,
            poses: materializePoses(merged.presentation),
            transformation: merged.transformation
                  ? {
                          trigger: merged.transformation.trigger,
                          ...(merged.transformation.skills !== undefined
                                ? { skills: structuredClone(merged.transformation.skills) }
                                : {}),
                          sequence: merged.transformation.sequence,
                          abilities:
                                merged.transformation.combat?.abilities ??
                                merged.combat.abilities,
                          poses: materializePoses(
                                merged.presentation,
                                merged.transformation.presentation?.poses ??
                                      merged.presentation.poses,
                          ),
                    }
                  : null,
            defaultFacing: merged.presentation.defaultFacing,
            lines: merged.lines,
      };
}

export function buildFighterRoster(
      defaults: FighterDefaults,
      definitions: readonly FighterDefinition[],
): FighterConfig[] {
      return definitions.map((definition) =>
            composeFighter(defaults, definition),
      );
}
