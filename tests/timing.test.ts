import { describe, expect, it, vi } from "vitest";
import { executeDamageAction } from "../src/abilities/actions/damage-action";
import { FighterAbilities } from "../src/entities/fighter-abilities";
import { Projectile } from "../src/entities/projectile";
import type { AbilityConfig } from "../src/abilities/types";

describe("simulation timing", () => {
      it("uses the context clock for direct damage", () => {
            const takeDamage = vi.fn(() => true);
            const target = {
                  takeDamage,
                  playSound: vi.fn(),
                  body: { position: { x: 0, y: 0 } },
                  config: { color: "red" },
            };
            const indicators = {
                  spawnDamageIndicator: vi.fn(),
                  spawnHitSpark: vi.fn(),
                  spawnCharacterLine: vi.fn(),
            };

            executeDamageAction(
                  { type: "damage", amount: 12 },
                  {} as never,
                  target as never,
                  {
                        world: {} as never,
                        projectiles: [],
                        indicators: indicators as never,
                        COLLISION_COOLDOWN: 300,
                        now: () => 1_250,
                  },
            );

            expect(takeDamage).toHaveBeenCalledWith(12, 1_250, 300);
      });

      it("measures ability cooldowns only from supplied simulation time", () => {
            const ability: AbilityConfig = {
                  id: "test",
                  trigger: { type: "nearest-enemy" },
                  timing: {
                        cooldownMs: 1_000,
                        windupMs: 0,
                        activeMs: 1,
                        recoveryMs: 0,
                  },
                  actions: [],
            };
            const runtime = new FighterAbilities();
            expect(runtime.tryStart(ability, "right", 500)).toEqual({
                  started: true,
            });
            runtime.reset();

            expect(runtime.tryStart(ability, "right", 1_499)).toEqual({
                  started: false,
                  reason: "cooldown",
            });
            expect(runtime.tryStart(ability, "right", 1_500)).toEqual({
                  started: true,
            });
      });

      it("blocks new abilities without interrupting the active ability runtime", () => {
            let canStart = true;
            const ability: AbilityConfig = {
                  id: "test",
                  trigger: { type: "nearest-enemy" },
                  timing: {
                        cooldownMs: 1_000,
                        windupMs: 1,
                        activeMs: 2,
                        recoveryMs: 0,
                  },
                  actions: [],
            };
            const runtime = new FighterAbilities(
                  undefined,
                  undefined,
                  () => canStart,
            );
            expect(runtime.tryStart(ability, "right", 0)).toEqual({
                  started: true,
            });
            runtime.update(1);
            canStart = false;

            expect(runtime.tryStart(ability, "left", 1_000)).toEqual({
                  started: false,
                  reason: "already-active",
            });
            expect(runtime.state).toBe("active");

            runtime.update(1);
            expect(runtime.state).toBe("active");
      });

      it("rejects a casting lock without changing runtime state or producing audio", () => {
            const onAudioEvent = vi.fn();
            let canStart = false;
            const runtime = new FighterAbilities(
                  onAudioEvent,
                  vi.fn(),
                  () => canStart,
            );
            const ability: AbilityConfig = {
                  id: "locked",
                  trigger: { type: "nearest-enemy" },
                  timing: {
                        cooldownMs: 1_000,
                        windupMs: 0,
                        activeMs: 1,
                        recoveryMs: 0,
                  },
                  actions: [],
            };

            expect(runtime.tryStart(ability, "left", 250)).toEqual({
                  started: false,
                  reason: "casting-locked",
            });
            expect(runtime.state).toBe("idle");
            expect(runtime.active).toBeNull();
            expect(runtime.facing).toBeNull();
            expect(runtime.remainingMs).toBe(0);
            expect(onAudioEvent).not.toHaveBeenCalled();

            canStart = true;
            expect(runtime.tryStart(ability, "left", 250)).toEqual({
                  started: true,
            });
            expect(onAudioEvent).toHaveBeenCalledTimes(1);
      });

      it("keeps a zero windup through start, then carries no time into the active phase", () => {
            const onAudioEvent = vi.fn();
            const onAudioStop = vi.fn();
            const runtime = new FighterAbilities(onAudioEvent, onAudioStop);
            const ability: AbilityConfig = {
                  id: "zero-windup",
                  trigger: { type: "nearest-enemy" },
                  timing: {
                        cooldownMs: 0,
                        windupMs: 0,
                        activeMs: 10,
                        recoveryMs: 0,
                  },
                  actions: [],
            };

            expect(runtime.tryStart(ability, "right", 0)).toEqual({
                  started: true,
            });

            expect(runtime.state).toBe("windup");
            expect(runtime.remainingMs).toBe(0);
            expect(onAudioEvent).toHaveBeenLastCalledWith(ability, "windup");
            expect(onAudioStop).not.toHaveBeenCalled();

            runtime.update(3);

            expect(runtime.state).toBe("active");
            expect(runtime.remainingMs).toBe(7);
            expect(onAudioStop).toHaveBeenCalledWith(ability, "windup");
            expect(onAudioEvent).toHaveBeenLastCalledWith(ability, "active");
      });

      it("traverses a zero active phase and carries elapsed time into recovery", () => {
            const runtime = new FighterAbilities();
            const ability: AbilityConfig = {
                  id: "zero-active",
                  trigger: { type: "nearest-enemy" },
                  timing: {
                        cooldownMs: 0,
                        windupMs: 0,
                        activeMs: 0,
                        recoveryMs: 10,
                  },
                  actions: [],
            };

            runtime.tryStart(ability, "right", 0);
            runtime.update(4);

            expect(runtime.state).toBe("recovery");
            expect(runtime.remainingMs).toBe(6);
      });

      it("traverses a zero recovery phase without stalling", () => {
            const runtime = new FighterAbilities();
            const ability: AbilityConfig = {
                  id: "zero-recovery",
                  trigger: { type: "nearest-enemy" },
                  timing: {
                        cooldownMs: 0,
                        windupMs: 0,
                        activeMs: 10,
                        recoveryMs: 0,
                  },
                  actions: [],
            };

            runtime.tryStart(ability, "right", 0);
            runtime.update(10);

            expect(runtime.state).toBe("idle");
            expect(runtime.active).toBeNull();
            expect(runtime.remainingMs).toBe(0);
      });

      it("returns an all-zero ability to idle safely on the next positive update", () => {
            const runtime = new FighterAbilities();
            const ability: AbilityConfig = {
                  id: "all-zero",
                  trigger: { type: "nearest-enemy" },
                  timing: {
                        cooldownMs: 0,
                        windupMs: 0,
                        activeMs: 0,
                        recoveryMs: 0,
                  },
                  actions: [],
            };

            runtime.tryStart(ability, "right", 0);

            expect(runtime.state).toBe("windup");
            runtime.update(1);

            expect(runtime.state).toBe("idle");
            expect(runtime.active).toBeNull();
            expect(runtime.remainingMs).toBe(0);
      });

      it("keeps phase timing equivalent across different delta chunk sizes", () => {
            const ability: AbilityConfig = {
                  id: "chunked-phases",
                  trigger: { type: "nearest-enemy" },
                  timing: {
                        cooldownMs: 0,
                        windupMs: 25,
                        activeMs: 40,
                        recoveryMs: 15,
                  },
                  actions: [],
            };
            const advance = (chunks: number[]) => {
                  const runtime = new FighterAbilities();
                  runtime.tryStart(ability, "right", 0);
                  for (const deltaMs of chunks) runtime.update(deltaMs);
                  return { state: runtime.state, remainingMs: runtime.remainingMs };
            };

            expect(advance([5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5])).toEqual({
                  state: "recovery",
                  remainingMs: 10,
            });
            expect(advance([20, 20, 20, 10])).toEqual({
                  state: "recovery",
                  remainingMs: 10,
            });
      });

      it("transitions phases exactly at each millisecond boundary", () => {
            const runtime = new FighterAbilities();
            const ability: AbilityConfig = {
                  id: "exact-boundaries",
                  trigger: { type: "nearest-enemy" },
                  timing: {
                        cooldownMs: 0,
                        windupMs: 20,
                        activeMs: 30,
                        recoveryMs: 10,
                  },
                  actions: [],
            };
            runtime.tryStart(ability, "right", 0);

            runtime.update(19);
            expect(runtime.state).toBe("windup");
            expect(runtime.remainingMs).toBe(1);
            runtime.update(1);
            expect(runtime.state).toBe("active");
            expect(runtime.remainingMs).toBe(30);
            runtime.update(29);
            expect(runtime.state).toBe("active");
            expect(runtime.remainingMs).toBe(1);
            runtime.update(1);
            expect(runtime.state).toBe("recovery");
            expect(runtime.remainingMs).toBe(10);
            runtime.update(10);
            expect(runtime.state).toBe("idle");
      });

      it("ages projectiles only when the simulation advances", () => {
            const projectile = new Projectile(
                  {
                        radius: 2,
                        speed: 1,
                        damage: 1,
                        lifetimeMs: 1_000,
                        rotationSpeed: 0.1,
                        image: "",
                  },
                  { id: "owner" },
                  0,
                  0,
                  1,
                  0,
            );

            projectile.update(999);
            expect(projectile.expired).toBe(false);
            projectile.update(1);
            expect(projectile.expired).toBe(true);
            expect(projectile.angle).toBeCloseTo(6);
      });
});
