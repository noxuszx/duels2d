import { afterEach, describe, expect, it, vi } from "vitest";
import { AimSkill } from "../../../src/skills/aim-skill";
import { AimTool, type AimToolHost } from "../tools/aim/aim-tool";
import type { StudioConfig } from "../app/editor-types";
import { ensureFormSkills, formSkills } from "../document/form-model";

afterEach(() => vi.unstubAllGlobals());

describe("Original sprite facing", () => {
      it("edits transformed skills independently and can disable inherited aiming", () => {
            const config = {
                  skills: { aim: { muzzle: { x: -50, y: 0 } } },
                  transformation: { trigger: { type: "health-threshold", healthRatio: 0.4 }, abilities: [], poses: null },
            } as unknown as StudioConfig;
            expect(formSkills(config, "transformed")?.aim).toEqual(config.skills?.aim);
            const transformed = ensureFormSkills(config, "transformed");
            transformed.aim!.muzzle.x = -80;
            expect(config.skills?.aim?.muzzle.x).toBe(-50);
            delete transformed.aim;
            expect(formSkills(config, "transformed")?.aim).toBeUndefined();
            expect(formSkills(config, "base")?.aim).toBeDefined();
      });
      it.each(["left", "right"] as const)("keeps %s-facing aim markers and dragging in original image coordinates", (facing) => {
            const direction = facing === "left" ? -1 : 1;
            const config = {
                  id: "test", defaultFacing: facing,
                  skills: { aim: { muzzle: { x: 50 * direction, y: 0 }, pivot: { x: 0, y: 0 } } },
            } as StudioConfig;
            vi.stubGlobal("document", {
                  getElementById: () => ({ addEventListener: vi.fn(), classList: { contains: () => true } }),
            });
            const arc = vi.fn(), lineTo = vi.fn();
            const ctx = new Proxy({}, { get: (_, key) => key === "arc" ? arc : key === "lineTo" ? lineTo : vi.fn(), set: () => true });
            const host = {
                  canvas: { width: 500, height: 500,
                        getBoundingClientRect: () => ({ left: 0, top: 0, width: 500, height: 500 }),
                        setPointerCapture: vi.fn(), hasPointerCapture: () => true, releasePointerCapture: vi.fn() },
                  ctx, mode: "default", activePoseKey: "base", activeForm: "base",
                  _currentConfig: () => config, _poseBank: () => ({}),
                  _getPoseVisual: () => ({ imageOffset: { x: 10, y: -5 } }),
                  _draw: vi.fn(), _saveState: vi.fn(),
            } as unknown as AimToolHost;
            const tool = new AimTool(host);
            tool.draw();
            const muzzleX = 260 + direction * 50;
            expect(arc).toHaveBeenCalledWith(muzzleX, 245, 7, 0, Math.PI * 2);
            expect(lineTo).toHaveBeenCalledWith(muzzleX + direction * 45, 245);
            const pointer = (x: number) => ({ pointerId: 1, clientX: x, clientY: 245, preventDefault: vi.fn() }) as unknown as PointerEvent;
            expect(tool.onPointerDown(pointer(muzzleX))).toBe(true);
            tool.onPointerMove(pointer(muzzleX + 20));
            tool.onPointerUp(pointer(muzzleX + 20));
            expect(config.skills!.aim!.muzzle).toEqual({ x: direction * 50 + 20, y: 0 });
            expect(host._saveState).toHaveBeenCalledOnce();
      });

      it.each(["left", "right"] as const)("aims a native %s-facing sprite toward enemies on either side", (defaultFacing) => {
            const skill = new AimSkill();
            for (const facing of ["left", "right"] as const) {
                  const direction = facing === "left" ? -1 : 1;
                  skill.update({ center: { x: 0, y: 0 }, facing, defaultFacing },
                        { x: direction * 200, y: 0 },
                        { muzzle: { x: defaultFacing === "left" ? -50 : 50, y: 0 } });
                  expect(skill.current?.flip).toBe(facing !== defaultFacing);
                  expect(skill.current?.direction.x).toBeCloseTo(direction);
                  expect(skill.current?.direction.y).toBeCloseTo(0);
                  expect(skill.current?.origin.x).toBeCloseTo(direction * 50);
                  expect(skill.current?.angle).toBeCloseTo(0);
            }
      });
});
