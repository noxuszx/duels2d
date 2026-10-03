import { describe, expect, it, vi } from "vitest";
import type { Fighter } from "../src/entities/fighter";
import type { AbilityConfig } from "../src/abilities/types";
import type { AbilityRunner } from "../src/gameplay/ability-runner";
import { AutoUseAbility } from "../src/gameplay/auto-use-ability";
import { DamageRampSkill } from "../src/skills/damage-ramp-skill";
import { TimedPoseSkill } from "../src/skills/timed-pose-skill";

describe("Muscle Man reusable skills", () => {
      it("keeps the configured 1/2/3 increase schedule, cap, restart, and clear semantics", () => {
            const increases: Array<[number, number]> = [];
            const onCap = vi.fn();
            const ramp = new DamageRampSkill({
                  amountPerIncrease: 30,
                  maxDamage: 350,
                  ratesPerSecond: [1, 2, 3],
                  increasePoseMs: 150,
            }, {
                  enabled: () => true,
                  onIncrease: (value, ageMs) => increases.push([value, ageMs]),
                  onCap,
            });

            ramp.update(5000);
            expect(ramp.accumulatedDamage).toBe(350);
            expect(increases).toHaveLength(12);
            expect(increases[0]).toEqual([30, 1000]);
            expect(increases[1]).toEqual([60, 1500]);
            expect(increases[11][0]).toBe(350);
            expect(increases[11][1]).toBeCloseTo(5000);
            expect(onCap).toHaveBeenCalledOnce();

            ramp.restart();
            ramp.update(1000);
            expect(ramp.accumulatedDamage).toBe(350);
            ramp.clear();
            ramp.update(999);
            expect(ramp.accumulatedDamage).toBe(0);
            ramp.update(1);
            expect(ramp.accumulatedDamage).toBe(30);
      });

      it("expires timed pose leases, holds indefinite leases, and clears on cancellation", () => {
            const release = vi.fn();
            const acquirePose = vi.fn(() => release);
            const pose = new TimedPoseSkill({ presentation: { acquirePose } } as unknown as Fighter);

            pose.acquirePose("attackWindup", 150);
            pose.update(149);
            expect(pose.isHoldingPose).toBe(true);
            pose.update(1);
            expect(pose.isHoldingPose).toBe(false);
            expect(release).toHaveBeenCalledOnce();

            pose.acquirePose("attackActive");
            pose.update(10000);
            expect(pose.remainingMs).toBeNull();
            expect(pose.isHoldingPose).toBe(true);
            pose.cancel("death");
            expect(pose.isHoldingPose).toBe(false);
            expect(release).toHaveBeenCalledTimes(2);
      });

      it("supports immediate hurt-triggered attempts without bypassing an initial delay", () => {
            const move = {} as AbilityConfig;
            const target = {} as Fighter;
            let currentTarget: Fighter | null = target;
            const start = vi.fn(() => ({ started: true }));
            const runner = {
                  canStart: vi.fn(() => true),
                  validTarget: vi.fn((candidate: Fighter) => candidate === currentTarget),
                  start,
            } as unknown as AbilityRunner;
            const automatic = new AutoUseAbility(runner, {
                  ability: move,
                  target: () => currentTarget,
                  script: () => ({}),
                  initialDelayMs: 100,
            });

            expect(automatic.tryUse()).toBe(false);
            expect(start).not.toHaveBeenCalled();
            automatic.update(100);
            expect(start).toHaveBeenCalledOnce();
            start.mockClear();
            expect(automatic.tryUse()).toBe(true);
            expect(start).toHaveBeenCalledOnce();
            currentTarget = null;
            expect(automatic.tryUse()).toBe(false);
      });
});
