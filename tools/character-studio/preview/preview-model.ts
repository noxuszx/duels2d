import type { FighterDefaults } from "../../../src/types/fighter";
import type { StudioConfig } from "../app/editor-types";

/** Resolve presentation defaults on a copy; drawing never fills in authored fields. */
export function preparePreviewConfig(
      config: StudioConfig,
      defaults?: FighterDefaults,
): StudioConfig {
      const preview = structuredClone(config);
      const presentation = defaults?.presentation;
      preview.imageScale ??= presentation?.imageScale ?? 1;
      preview.imageOffset ??= presentation?.imageOffset ?? { x: 0, y: 0 };
      preview.imageCrop ??= presentation?.imageCrop ?? null;
      preview.healthBarOffset ??= presentation?.healthBarOffset ?? {
            x: 0,
            y: -76,
      };
      preview.hitboxOffset ??= defaults?.body.hitboxOffset ?? { x: 0, y: -15 };
      preview.weaponScale ??= presentation?.weaponScale ?? 1;
      preview.weaponOffset ??= presentation?.weaponOffset ?? { x: 0, y: 0 };
      preview.weaponPivot ??= presentation?.weaponPivot ?? { x: 0, y: 0 };
      preview.defaultFacing ??= presentation?.defaultFacing ?? "right";
      preview.hitbox ??= structuredClone(
            defaults?.body.hitbox ?? { type: "box", width: 78, height: 112 },
      );
      if (preview.hitbox.type === "box") {
            preview.hitbox.width ??=
                  defaults?.body.hitbox.type === "box"
                        ? defaults.body.hitbox.width
                        : 78;
            preview.hitbox.height ??=
                  defaults?.body.hitbox.type === "box"
                        ? defaults.body.hitbox.height
                        : 112;
      } else {
            preview.hitbox.radius ??=
                  config.radius ?? defaults?.body.radius ?? 30;
      }
      return preview;
}
