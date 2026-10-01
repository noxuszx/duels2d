import type {
      FighterTransformationConfig,
      FighterSkills,
      PoseConfig,
} from "../../../src/types/fighter";
import type { StudioConfig } from "../app/editor-types";

export type StudioForm = "base" | "transformed";

export function formSkills(config: StudioConfig, form: StudioForm): FighterSkills | undefined {
      return form === "transformed" && config.transformation
            ? config.transformation.skills ?? config.skills
            : config.skills;
}

/** Copy inherited skills only when editing the transformed form. */
export function ensureFormSkills(config: StudioConfig, form: StudioForm): FighterSkills {
      if (form === "transformed" && config.transformation)
            return config.transformation.skills ??= structuredClone(config.skills ?? {});
      return config.skills ??= {};
}

export function poseBank(
      config: StudioConfig,
      form: StudioForm,
): Record<string, PoseConfig> {
      if (form === "transformed" && config.transformation) {
            return config.transformation.poses ?? {};
      }
      return config.poses ?? {};
}

/** Create a pose bank only when an explicit authoring operation needs it. */
export function ensurePoseBank(
      config: StudioConfig,
      form: StudioForm,
): Record<string, PoseConfig> {
      if (form === "transformed" && config.transformation)
            return (config.transformation.poses ??= {});
      return (config.poses ??= {});
}

export function createTransformation(
      config: StudioConfig,
): FighterTransformationConfig {
      return {
            trigger: { type: "health-threshold", healthRatio: 0.4 },
            sequence: [],
            abilities: structuredClone(config.abilities),
            poses: structuredClone(config.poses),
      };
}
