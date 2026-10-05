import { describe, expect, it } from "vitest";
import { PresentationState } from "../src/presentation/state";

describe("presentation leases", () => {
      it("adds independent offsets and rotations and releases only the held contribution", () => {
            const state = new PresentationState();
            const initial = { x: 3, y: -2 };
            const first = state.acquireOffset(initial);
            const second = state.acquireOffset({ x: -1, y: 5 });
            const rotation = state.acquireRotation(0.4);
            const shake = state.acquireRotation(-0.1);
            initial.x = 100;
            expect(state.offset).toEqual({ x: 2, y: 3 });
            expect(state.rotation).toBeCloseTo(0.3);
            first.set({ x: 7, y: 1 });
            shake.set(0.2);
            expect(state.offset).toEqual({ x: 6, y: 6 });
            expect(state.rotation).toBeCloseTo(0.6);
            second.release(); second.release(); second.set({ x: 100, y: 100 });
            rotation.release(); rotation.set(100);
            expect(state.offset).toEqual({ x: 7, y: 1 });
            expect(state.rotation).toBe(0.2);
            first.release(); shake.release();
            expect(state.offset).toEqual({ x: 0, y: 0 });
            expect(state.rotation).toBe(0);
      });

      it("updates child orientation without changing lease priority and restores previous holds", () => {
            const state = new PresentationState();
            const pivot = { x: 2, y: 3 };
            const first = state.acquireOrientation("sprite", { angle: 0.1, pivot });
            const second = state.acquireOrientation("sprite", { angle: 0.2 });
            pivot.x = 100;
            first.set({ angle: 0.3, pivot: { x: 4, y: 5 } });
            expect(state.orientation("sprite")?.angle).toBe(0.2);
            second.release();
            expect(state.orientation("sprite")).toEqual({ angle: 0.3, pivot: { x: 4, y: 5 } });
            const snapshot = state.orientation("sprite")!;
            snapshot.pivot!.x = 100;
            expect(state.orientation("sprite")!.pivot!.x).toBe(4);
            expect(state.orientation("weapon")).toBeNull();
      });

      it("invalidates mutable handles on clear and cannot revive cancelled presentation", () => {
            const state = new PresentationState();
            const offset = state.acquireOffset({ x: 1, y: 2 });
            const rotation = state.acquireRotation(1);
            const orientation = state.acquireOrientation("weapon", { angle: 2 });
            state.clear();
            offset.set({ x: 3, y: 4 }); rotation.set(3); orientation.set({ angle: 4 });
            offset.release(); rotation.release(); orientation.release();
            expect(state.offset).toEqual({ x: 0, y: 0 });
            expect(state.rotation).toBe(0);
            expect(state.orientation("weapon")).toBeNull();
      });
});
