import { describe, expect, it, vi } from "vitest";
import type { AbilityConfig } from "../src/abilities/types";
import type { Fighter } from "../src/entities/fighter";
import { FighterAbilities } from "../src/entities/fighter-abilities";
import { AutoUseAbility } from "../src/gameplay/auto-use-ability";
import type { AbilityRunner } from "../src/gameplay/ability-runner";
import { FighterRuntime, type FighterRuntimeComponent } from "../src/gameplay/fighter-runtime";

function component(update: (deltaMs: number) => void = () => {}): FighterRuntimeComponent & {
      update: ReturnType<typeof vi.fn>;
      cancel: ReturnType<typeof vi.fn>;
} {
      return {
            update: vi.fn(update),
            cancel: vi.fn(),
      };
}

function makeRuntime(options: { dead?: () => boolean; active?: () => boolean } = {}) {
      const fighter = { get isDead() { return options.dead?.() ?? false; } } as Fighter;
      const runtime = new FighterRuntime(fighter, {
            isCombatActive: options.active,
      });
      return { runtime, fighter };
}

function ability(): AbilityConfig {
      return {
            id: "auto-test",
            trigger: { type: "nearest-enemy" },
            timing: { cooldownMs: 100, windupMs: 0, activeMs: 0, recoveryMs: 0 },
            actions: [],
      };
}

describe("FighterRuntime", () => {
      it("keeps components reusable after an interruption", () => {
            const { runtime } = makeRuntime();
            const owned = component();
            runtime.use(owned);

            runtime.update(10);
            runtime.cancel("interrupted");
            runtime.update(5);

            expect(owned.update).toHaveBeenCalledTimes(2);
            expect(owned.cancel).toHaveBeenCalledWith("interrupted");
      });

      it("suspends on death and combat end, then resumes after reset", () => {
            let dead = false;
            let combatActive = true;
            const { runtime } = makeRuntime({ dead: () => dead, active: () => combatActive });
            const owned = component();
            runtime.use(owned);

            dead = true;
            runtime.update(10);
            expect(owned.cancel).toHaveBeenCalledWith("death");
            expect(owned.update).not.toHaveBeenCalled();
            dead = false;
            runtime.reset();
            runtime.update(10);
            expect(owned.update).toHaveBeenCalledTimes(1);

            combatActive = false;
            runtime.update(10);
            expect(owned.cancel).toHaveBeenCalledWith("interrupted");
            combatActive = true;
            runtime.reset();
            runtime.update(10);
            expect(owned.update).toHaveBeenCalledTimes(2);
      });

      it("does not call components after disposal", () => {
            const { runtime } = makeRuntime();
            const owned = component();
            runtime.use(owned);
            runtime.dispose();
            runtime.update(10);
            runtime.reset();

            expect(owned.cancel).toHaveBeenCalledWith("removed");
            expect(owned.update).not.toHaveBeenCalled();
      });

      it("invalidates sibling updates when a component cancels mid-tick", () => {
            const { runtime } = makeRuntime();
            let shouldCancel = true;
            const first = component(() => {
                  if (shouldCancel) {
                        shouldCancel = false;
                        runtime.cancel("interrupted");
                  }
            });
            const sibling = component();
            runtime.use(first);
            runtime.use(sibling);

            runtime.update(10);
            expect(first.update).toHaveBeenCalledOnce();
            expect(sibling.update).not.toHaveBeenCalled();

            runtime.update(10);
            expect(first.update).toHaveBeenCalledTimes(2);
            expect(sibling.update).toHaveBeenCalledOnce();
      });
});

describe("AutoUseAbility", () => {
      it("honors one initial delay and leaves repeat timing to FighterAbilities cooldowns", () => {
            const move = ability();
            const abilities = new FighterAbilities();
            let now = 0;
            const target = {} as Fighter;
            let currentTarget: Fighter | null = null;
            const starts = vi.fn(() => abilities.tryStart(move, "right", now));
            const runner = {
                  canStart: vi.fn((config: AbilityConfig) => abilities.isReady(config, now)),
                  validTarget: vi.fn((candidate: Fighter) => candidate === currentTarget),
                  start: starts,
            } as unknown as AbilityRunner;
            const automatic = new AutoUseAbility(runner, {
                  ability: move,
                  target: () => currentTarget,
                  script: () => ({}),
                  initialDelayMs: 50,
            });

            now = 25;
            automatic.update(25);
            now = 50;
            automatic.update(25); // Initial delay expires, but there is no target yet.
            expect(starts).not.toHaveBeenCalled();

            currentTarget = target;
            now = 51;
            automatic.update(1);
            expect(starts).toHaveBeenCalledOnce();
            expect(starts.mock.results[0].value).toEqual({ started: true });

            abilities.reset(); // Simulate the previous move finishing; cooldown remains owned here.
            now = 150;
            automatic.update(99);
            expect(starts).toHaveBeenCalledOnce();
            now = 151;
            automatic.update(1);
            expect(starts).toHaveBeenCalledTimes(2);
            expect(starts.mock.results[1].value).toEqual({ started: true });
      });
});
