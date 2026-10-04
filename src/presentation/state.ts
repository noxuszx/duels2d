import type { Vector2 } from "../engine/contracts";

/** Simulation-owned visual intent; asset loading and drawing belong to the browser. */
export class PresentationState {
      private poseLeases: Array<{ token: object; pose: string }> = [];
      private rotationLeases: Array<{ token: object; angle: number }> = [];
      private events: Array<{ type: string; payload?: unknown }> = [];
      position: Vector2 = { x: 0, y: 0 };
      facing: "left" | "right" = "right";
      imagePath: string | null = null;

      get pose(): string | null { return this.poseLeases.at(-1)?.pose ?? null; }
      get rotation(): number | null { return this.rotationLeases.at(-1)?.angle ?? null; }

      acquirePose(pose: string): () => void {
            const token = {};
            this.poseLeases.push({ token, pose });
            return () => { this.poseLeases = this.poseLeases.filter(lease => lease.token !== token); };
      }

      acquireRotation(angle: number): () => void {
            const token = {};
            this.rotationLeases.push({ token, angle });
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
            this.rotationLeases = [];
            this.events = [];
      }
}
