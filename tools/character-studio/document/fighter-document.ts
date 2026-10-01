import type { FighterDefaults } from "../../../src/types/fighter";
import type { StudioConfig } from "../app/editor-types";

/** Normalize a document at loading or explicit editing boundaries. */
export function normalizeFighterDocument(
      config: StudioConfig,
      defaults?: FighterDefaults,
): void {
      config.imageScale ??= defaults?.presentation.imageScale ?? 1;
      config.imageOffset ??= structuredClone(
            defaults?.presentation.imageOffset ?? { x: 0, y: 0 },
      );
      config.imageCrop ??= defaults?.presentation.imageCrop ?? null;
      config.healthBarOffset ??= structuredClone(
            defaults?.presentation.healthBarOffset ?? {
                  x: 0,
                  y: -76,
            },
      );
      config.hitboxOffset ??= structuredClone(
            defaults?.body.hitboxOffset ?? { x: 0, y: -15 },
      );
      config.weaponScale ??= defaults?.presentation.weaponScale ?? 1;
      config.weaponOffset ??= structuredClone(
            defaults?.presentation.weaponOffset ?? { x: 0, y: 0 },
      );
      config.weaponPivot ??= structuredClone(
            defaults?.presentation.weaponPivot ?? { x: 0, y: 0 },
      );
      config.defaultFacing ??= defaults?.presentation.defaultFacing ?? "right";
      config.hitbox ??= structuredClone(
            defaults?.body.hitbox ?? {
                  type: "box",
                  width: 78,
                  height: 112,
            },
      );

      if (config.hitbox.type === "box") {
            config.hitbox.width ??=
                  defaults?.body.hitbox.type === "box"
                        ? defaults.body.hitbox.width
                        : 78;
            config.hitbox.height ??=
                  defaults?.body.hitbox.type === "box"
                        ? defaults.body.hitbox.height
                        : 112;
      } else {
            config.hitbox.type = "circle";
            config.hitbox.radius ??=
                  config.radius ?? defaults?.body.radius ?? 30;
      }
}
