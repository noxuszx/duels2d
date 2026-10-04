import type { Entity } from "../engine/entity";
import type { FighterConfig, PoseOverrides } from "../types/fighter";

/** Detached render data. Drawing cannot advance tasks, contacts or physics. */
export interface EntityView {
      readonly runtimeId: string;
      readonly config: FighterConfig;
      readonly x: number;
      readonly y: number;
      readonly angle: number;
      readonly facing: "left" | "right";
      readonly health: number;
      readonly maxHealth: number;
      readonly dead: boolean;
      readonly busy: boolean;
      readonly showHealth: boolean;
      readonly pose: PoseOverrides;
}
export function entityView(entity: Entity): EntityView {
      const { config } = entity;
      const requested = config.poses?.[entity.presentation.pose ?? "idle"] ?? config.poses?.idle;
      const overrides = typeof requested === "string" ? { image: requested } : requested;
      return {
            runtimeId: entity.runtimeId, config,
            x: entity.body.position.x - config.hitboxOffset.x,
            y: entity.body.position.y - config.hitboxOffset.y,
            angle: entity.presentation.rotation ?? entity.body.angle,
            facing: entity.facing, health: entity.health, maxHealth: entity.maxHealth,
            dead: !entity.isAlive, busy: entity.behavior?.isRunning ?? false,
            showHealth: entity.tags.has("contestant"),
            pose: { image: config.image ?? "", imageScale: config.imageScale,
                  imageCrop: config.imageCrop, imageOffset: { ...config.imageOffset }, ...overrides },
      };
}
