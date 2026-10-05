import type { Vector2 } from "../engine/contracts";
import type { SpatialShape } from "../engine/spatial/shapes";
import type { PoseOverrides } from "../types/fighter";

export interface ShapeVisual {
      readonly shape: SpatialShape;
      readonly color: string;
      readonly opacity: number;
}

export interface VisualOrientation {
      angle: number;
      pivot?: Vector2;
}

export interface PresentationLease<T> { set(value: T): void; release(): void; }

/** Simulation-owned visual intent; asset loading and drawing belong to the browser. */
export class PresentationState {
      private poseLeases: Array<{ token: object; pose: string }> = [];
      private visualLeases: Array<{ token: object; visual: PoseOverrides }> = [];
      private rotationLeases = new Map<object, number>();
      private orientationLeases: Record<"sprite" | "weapon", Map<object, VisualOrientation>> = {
            sprite: new Map(), weapon: new Map(),
      };
      private shapeLeases: Array<{ token: object; shape: SpatialShape | (() => SpatialShape); color: string; opacity: number }> = [];
      private offsetLeases = new Map<object, Vector2>();
      private events: Array<{ type: string; payload?: unknown }> = [];

      position: Vector2 = { x: 0, y: 0 };
      facing: "left" | "right" = "right";
      imagePath: string | null = null;

      get pose(): string | null { return this.poseLeases.at(-1)?.pose ?? null; }
      get visual(): PoseOverrides | null { return this.visualLeases.at(-1)?.visual ?? null; }
      get rotation(): number { return [...this.rotationLeases.values()].reduce((sum, angle) => sum + angle, 0); }
      orientation(target: "sprite" | "weapon"): VisualOrientation | null {
            const value = [...this.orientationLeases[target].values()].at(-1);
            return value ? { angle: value.angle, pivot: value.pivot ? { ...value.pivot } : undefined } : null;
      }
      get offset(): Vector2 {
            const total = { x: 0, y: 0 };
            for (const offset of this.offsetLeases.values()) {
                  total.x += offset.x;
                  total.y += offset.y;
            }
            return total;
      }
      get shapes(): readonly ShapeVisual[] {
            return this.shapeLeases.map(({ shape, color, opacity }) => ({
                  shape: typeof shape === "function" ? shape() : shape, color, opacity,
            }));
      }


      
      acquirePose(pose: string): () => void {
            const token = {};
            this.poseLeases.push({ token, pose });
            return () => { this.poseLeases = this.poseLeases.filter(lease => lease.token !== token); };
      }

      acquireVisual(visual: PoseOverrides): () => void {
            const token = {};
            this.visualLeases.push({ token, visual });
            return () => { this.visualLeases = this.visualLeases.filter(lease => lease.token !== token); };
      }

      /** Additive rotation of the entire visual hierarchy, around its root. */
      acquireRotation(angle = 0): PresentationLease<number> {
            return this.acquireValue(this.rotationLeases, angle, value => value);
      }

      /** Local child orientation; latest held lease wins without replacing root transforms. */
      acquireOrientation(target: "sprite" | "weapon", orientation: VisualOrientation = { angle: 0 }): PresentationLease<VisualOrientation> {
            return this.acquireValue(this.orientationLeases[target], orientation,
                  value => ({ angle: value.angle, pivot: value.pivot ? { ...value.pivot } : undefined }));
      }

      acquireShape(shape: SpatialShape | (() => SpatialShape), color: string, opacity = 1): () => void {
            const token = {};
            this.shapeLeases.push({ token, shape, color, opacity });
            return () => { this.shapeLeases = this.shapeLeases.filter(lease => lease.token !== token); };
      }

      /** Additive world-space displacement, leaving the physical body untouched. */
      acquireOffset(offset: Vector2 = { x: 0, y: 0 }): PresentationLease<Vector2> {
            return this.acquireValue(this.offsetLeases, offset, value => ({ ...value }));
      }

      private acquireValue<T>(values: Map<object, T>, initial: T, copy: (value: T) => T): PresentationLease<T> {
            const token = {};
            values.set(token, copy(initial));
            return {
                  set: value => {
                        if (values.has(token)) values.set(token, copy(value));
                  },
                  release: () => { values.delete(token); },
            };
      }

      emit(type: string, payload?: unknown): void { this.events.push({ type, payload }); }
      drainEvents(): readonly { type: string; payload?: unknown }[] {
            const events = this.events;
            this.events = [];
            return events;
      }
      clear(): void {
            this.poseLeases = [];
            this.visualLeases = [];
            this.rotationLeases.clear();
            this.orientationLeases.sprite.clear();
            this.orientationLeases.weapon.clear();
            this.shapeLeases = [];
            this.offsetLeases.clear();
            this.events = [];
      }
}
