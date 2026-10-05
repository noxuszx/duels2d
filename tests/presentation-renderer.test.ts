import { Bodies, Body } from "matter-js";
import { describe, expect, it } from "vitest";
import type { RuntimeConfig } from "../src/config/runtime-config";
import { Entity } from "../src/engine/entity";
import { CanvasRenderer } from "../src/presentation/canvas-renderer";
import { entityView, viewChildTransform, viewRootTransform } from "../src/presentation/view";
import type { VisualTransform } from "../src/presentation/transform";

function matrix(transform: VisualTransform): number[] {
      return [transform.a, transform.b, transform.c, transform.d, transform.e, transform.f];
}

describe("presentation hierarchy rendering", () => {
      it.each(["left", "right"] as const)("transforms the %s-facing sprite, weapon and health together while keeping beams in world space", facing => {
            const owner = new Entity({ runtimeId: "owner", configId: "owner", teamId: "A",
                  config: { id: "visual", maxHealth: 100, speed: 0, radius: 10, defaultFacing: "right",
                        hitbox: { type: "circle", radius: 10 }, image: "body", imageOffset: { x: 3, y: 7 },
                        weaponIdle: "weapon", weaponOffset: { x: 12, y: 5 }, weaponPivot: { x: 2, y: 1 },
                        healthBarOffset: { x: 4, y: -3 } }, body: Bodies.circle(100, 120, 10) });
            owner.tags.add("contestant");
            owner.facing = facing;
            Body.setAngle(owner.body, 0.25);
            owner.presentation.acquireOffset({ x: 9, y: -4 });
            owner.presentation.acquireRotation(0.5);
            owner.presentation.acquireOrientation("sprite", { angle: -0.2, pivot: { x: 2, y: 3 } });
            owner.presentation.acquireOrientation("weapon", { angle: 0.4, pivot: { x: -3, y: 2 } });
            owner.presentation.acquireShape({ type: "segment", from: { x: 10, y: 20 }, to: { x: 300, y: 250 }, width: 4 }, "red");
            const transforms: number[][] = [];
            const beam: number[][] = [];
            let transformCountAtBeam = -1;
            const ctx = { clearRect() {}, strokeRect() {}, fillText() {}, save() {}, restore() {},
                  beginPath() {}, arc() {}, fill() {}, rect() {}, clip() {}, closePath() {}, fillRect() {}, drawImage() {},
                  measureText: () => ({ width: 80 }),
                  moveTo: (x: number, y: number) => { if (transformCountAtBeam === -1) beam.push([x, y]); },
                  lineTo: (x: number, y: number) => { if (transformCountAtBeam === -1) beam.push([x, y]); },
                  stroke: () => { transformCountAtBeam = transforms.length; },
                  transform: (...values: number[]) => transforms.push(values),
            } as unknown as CanvasRenderingContext2D;
            const renderer = new CanvasRenderer(ctx, { game: { arena: { borderColor: "", borderWidth: 1 }, text: { footer: "" } },
                  indicators: { health: { minFontSize: 10, sizeMultiplier: 1, fillColor: "white" }, text: { family: "sans-serif" } },
            } as RuntimeConfig);
            const images = (renderer as unknown as { images: Map<string, HTMLImageElement> }).images;
            for (const name of ["body", "weapon"]) images.set(name,
                  { complete: true, naturalWidth: 20, naturalHeight: 10 } as HTMLImageElement);
            const view = entityView(owner);
            renderer.render(500, 400, { ax: 0, ay: 0, aw: 500, ah: 400 }, [view], 0);
            expect(transforms).toEqual([matrix(viewChildTransform(view, "sprite")),
                  matrix(viewChildTransform(view, "weapon")), matrix(viewRootTransform(view))]);
            expect(beam.slice(-2)).toEqual([[10, 20], [300, 250]]);
            expect(transformCountAtBeam).toBe(0);
            expect(view.angle).toBe(0.75);
            expect(owner.body.position).toEqual({ x: 100, y: 120 });
            expect(owner.body.angle).toBe(0.25);
      });
});
