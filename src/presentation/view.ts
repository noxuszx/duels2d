import type { Entity } from "../engine/entity";
import type { SpatialShape } from "../engine/spatial/shapes";
import type { RuntimeEntityConfig } from "../types/entity";
import type { PoseOverrides } from "../types/fighter";
import type { ShapeVisual, VisualOrientation } from "./state";
import { childTransform, rootTransform, type VisualTransform } from "./transform";

function snapshotShape(shape: SpatialShape): SpatialShape {
      switch (shape.type) {
            case "segment": return { ...shape, from: { ...shape.from }, to: { ...shape.to } };
            case "rectangle": return { ...shape, center: { ...shape.center } };
            case "circle": return { ...shape, center: { ...shape.center } };
      }
}

/** Detached render data. Drawing cannot advance tasks, contacts or physics. */
export interface EntityView {
      readonly runtimeId: string;
      readonly config: RuntimeEntityConfig;
      readonly x: number;
      readonly y: number;
      readonly angle: number;
      readonly spriteOrientation: VisualOrientation | null;
      readonly weaponOrientation: VisualOrientation | null;
      readonly facing: "left" | "right";
      readonly health: number;
      readonly maxHealth: number;
      readonly dead: boolean;
      readonly busy: boolean;
      readonly showHealth: boolean;
      readonly pose: PoseOverrides;
      readonly shapes?: readonly ShapeVisual[];
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
      const offset = entity.presentation.offset;
      return {
            runtimeId: entity.runtimeId, config,
            x: entity.body.position.x - config.hitboxOffset.x + offset.x,
            y: entity.body.position.y - config.hitboxOffset.y + offset.y,
            angle: entity.body.angle + entity.presentation.rotation,
            spriteOrientation: entity.presentation.orientation("sprite"),
            weaponOrientation: entity.presentation.orientation("weapon"),
            facing: entity.facing, health: entity.health, maxHealth: entity.maxHealth,
            dead: !entity.isAlive, busy: entity.behavior?.isRunning ?? false,
            showHealth: entity.tags.has("contestant"),
            pose: entityPose(entity),
            shapes: entity.presentation.shapes.map(visual => ({ ...visual, shape: snapshotShape(visual.shape) })),
      };
}

export function viewRootTransform(view: EntityView): VisualTransform {
      return rootTransform(view, view.angle);
}

export function viewChildTransform(view: EntityView, target: "sprite" | "weapon"): VisualTransform {
      const mirror = view.facing !== view.config.defaultFacing ? -1 : 1;
      const offset = target === "weapon" ? view.config.weaponOffset : view.pose.imageOffset;
      return childTransform(viewRootTransform(view),
            { x: (offset?.x ?? 0) * (target === "weapon" ? mirror : 1), y: offset?.y ?? 0 }, mirror,
            (target === "weapon" ? view.weaponOrientation : view.spriteOrientation) ??
                  { angle: 0, pivot: target === "weapon" ? view.config.weaponPivot : undefined });
}
