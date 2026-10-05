import type { Entity } from "../engine/entity";
import type { RuntimeEntityConfig } from "../types/entity";
import type { PoseOverrides, Vector2 } from "../types/fighter";

/** Detached render data. Drawing cannot advance tasks, contacts or physics. */
export interface EntityView {
      readonly runtimeId: string;
      readonly config: RuntimeEntityConfig;
      readonly x: number;
      readonly y: number;
      readonly angle: number;
      readonly rotationPivot?: Vector2 | null;
      readonly facing: "left" | "right";
      readonly health: number;
      readonly maxHealth: number;
      readonly dead: boolean;
      readonly busy: boolean;
      readonly showHealth: boolean;
      readonly pose: PoseOverrides;
}
export function entityPose(entity: Entity): PoseOverrides {
      const { config } = entity;
      const requested = config.poses?.[entity.presentation.pose ?? "idle"] ?? config.poses?.idle;
      const overrides = typeof requested === "string" ? { image: requested } : requested;
      return { image: config.image ?? "", imageScale: config.imageScale,
            imageCrop: config.imageCrop, imageOffset: { ...config.imageOffset }, ...overrides,
            ...entity.presentation.visual };
}

export function entityView(entity: Entity): EntityView {
      const { config } = entity;
      return {
            runtimeId: entity.runtimeId, config,
            x: entity.body.position.x - config.hitboxOffset.x,
            y: entity.body.position.y - config.hitboxOffset.y,
            angle: entity.presentation.rotation ?? entity.body.angle,
            rotationPivot: entity.presentation.rotationPivot ? { ...entity.presentation.rotationPivot } : null,
            facing: entity.facing, health: entity.health, maxHealth: entity.maxHealth,
            dead: !entity.isAlive, busy: entity.behavior?.isRunning ?? false,
            showHealth: entity.tags.has("contestant"),
            pose: entityPose(entity),
      };
}
