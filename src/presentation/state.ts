import type { Vector2 } from "../engine/contracts";
import type { PoseOverrides } from "../types/fighter";

/** Simulation-owned visual intent; asset loading and drawing belong to the browser. */
export class PresentationState {
      private poseLeases: Array<{ token: object; pose: string }> = [];
      private visualLeases: Array<{ token: object; visual: PoseOverrides }> = [];
      private rotationLeases: Array<{ token: object; angle: number; pivot: Vector2 | null }> = [];
      private events: Array<{ type: string; payload?: unknown }> = [];

      position: Vector2 = { x: 0, y: 0 };
      facing: "left" | "right" = "right";
      imagePath: string | null = null;

      get pose(): string | null { return this.poseLeases.at(-1)?.pose ?? null; }
      get visual(): PoseOverrides | null { return this.visualLeases.at(-1)?.visual ?? null; }
      get rotation(): number | null { return this.rotationLeases.at(-1)?.angle ?? null; }
      get rotationPivot(): Vector2 | null { return this.rotationLeases.at(-1)?.pivot ?? null; }


      
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

      acquireRotation(angle: number, pivot?: Vector2): () => void {
            const token = {};
            this.rotationLeases.push({ token, angle, pivot: pivot ? { ...pivot } : null });
            return () => { this.rotationLeases = this.rotationLeases.filter(lease => lease.token !== token); };
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
            this.rotationLeases = [];
            this.events = [];
      }
}
