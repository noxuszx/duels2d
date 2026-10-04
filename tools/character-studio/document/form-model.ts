import type { FighterComponents, FighterForm, PoseConfig } from "../../../src/types/fighter";
import type { StudioConfig } from "../app/editor-types";

export type StudioForm = string;

export function formComponents(config: StudioConfig, form: StudioForm): FighterComponents {
      return form === "base" ? config.components : (config.forms[form]?.components ?? config.components);
}

/** Editing a form never mutates inherited base component settings. */
export function ensureFormComponents(config: StudioConfig, form: StudioForm): FighterComponents {
      if (form === "base") return config.components;
      const selected = config.forms[form];
      if (!selected) return config.components;
      return (selected.components ??= structuredClone(config.components));
}

export function poseBank(config: StudioConfig, form: StudioForm): Record<string, PoseConfig> {
      return (form === "base" ? config.poses : config.forms[form]?.poses) ?? {};
}

export function ensurePoseBank(config: StudioConfig, form: StudioForm): Record<string, PoseConfig> {
      if (form !== "base" && config.forms[form]) return (config.forms[form].poses ??= {});
      return (config.poses ??= {});
}

export function createForm(config: StudioConfig): FighterForm {
      return {
            poses: structuredClone(config.poses),
            components: structuredClone(config.components),
            moves: structuredClone(config.moves),
            sequence: [],
      };
}
