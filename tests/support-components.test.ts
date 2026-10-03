import { describe, expect, it, vi } from "vitest";
import type { SpawnedEntity } from "../src/gameplay/spawned-entity";
import { EntityAttachment } from "../src/gameplay/entity-attachment";
import { ScheduledAction } from "../src/gameplay/scheduled-action";
import { HealthThresholdSkill } from "../src/skills/health-threshold-skill";

function support(remove = vi.fn()): SpawnedEntity {
      return {
            owner: {} as never,
            removed: false,
            update: vi.fn(),
            remove,
            draw: vi.fn(),
      };
}

describe("ScheduledAction", () => {
      it("ignores zero and invalid ticks, retries rejected actions without consuming the limit, and stops at its accepted limit", () => {
            let now = 0;
            let accepts = false;
            const action = vi.fn(() => accepts);
            const schedule = new ScheduledAction(() => now, { delayMs: 10, intervalMs: 5, limit: 2, action });
            schedule.start();

            schedule.update(0);
            schedule.update(Number.NaN);
            schedule.update(-1);
            expect(action).not.toHaveBeenCalled();

            now = 10;
            schedule.update(1);
            schedule.update(1);
            expect(action).toHaveBeenCalledTimes(2);
            accepts = true;
            schedule.update(1);
            expect(action).toHaveBeenCalledTimes(3);
            now = 15;
            schedule.update(1);
            now = 100;
            schedule.update(1);
            expect(action).toHaveBeenCalledTimes(4);
      });

      it("preserves a schedule on interruption and clears it on reset", () => {
            let now = 0;
            const action = vi.fn(() => true);
            const schedule = new ScheduledAction(() => now, { delayMs: 20, intervalMs: 10, limit: 2, action });
            schedule.start();
            now = 10;
            schedule.cancel("interrupted");
            schedule.update(1);
            expect(action).not.toHaveBeenCalled();
            now = 20;
            schedule.update(1);
            expect(action).toHaveBeenCalledOnce();
            schedule.cancel("reset");
            now = 100;
            schedule.update(1);
            expect(action).toHaveBeenCalledOnce();
      });
});

describe("EntityAttachment", () => {
      it("creates once, keeps the support alive through interruption, and removes it on reset", () => {
            const entity = support();
            const create = vi.fn(() => entity);
            const addEntity = vi.fn();
            const attachment = new EntityAttachment({ addEntity }, create);

            attachment.update(1);
            attachment.update(1);
            expect(create).toHaveBeenCalledOnce();
            expect(addEntity).toHaveBeenCalledOnce();
            expect(attachment.current).toBe(entity);

            attachment.cancel("interrupted");
            expect(entity.remove).not.toHaveBeenCalled();
            expect(attachment.current).toBe(entity);
            attachment.cancel("reset");
            expect(entity.remove).toHaveBeenCalledWith("reset");
            expect(attachment.current).toBeNull();
      });

      it.each([
            ["death", "owner-death"],
            ["removed", "owner-removed"],
      ] as const)("removes the attached support with the owner on %s", (reason, removalReason) => {
            const entity = support();
            const attachment = new EntityAttachment({ addEntity: vi.fn() }, () => entity);
            attachment.update(1);
            attachment.cancel(reason);
            expect(entity.remove).toHaveBeenCalledWith(removalReason);
            expect(attachment.current).toBeNull();
      });
});

describe("HealthThresholdSkill", () => {
      it("uses an inclusive threshold, fires accepted transitions once, resets, and retries rejected transitions", () => {
            let ratio = 0.6;
            let accepts = false;
            const onReached = vi.fn(() => accepts);
            const threshold = new HealthThresholdSkill({ ratio: () => ratio, threshold: 0.5, enabled: () => true, onReached });

            threshold.update(1);
            expect(onReached).not.toHaveBeenCalled();
            ratio = 0.5;
            threshold.update(1);
            threshold.update(1);
            expect(onReached).toHaveBeenCalledTimes(2);

            accepts = true;
            threshold.update(1);
            threshold.update(1);
            expect(onReached).toHaveBeenCalledTimes(3);
            threshold.cancel("interrupted");
            threshold.update(1);
            expect(onReached).toHaveBeenCalledTimes(3);
            threshold.cancel("reset");
            threshold.update(1);
            expect(onReached).toHaveBeenCalledTimes(4);
      });
});
