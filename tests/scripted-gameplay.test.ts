import { readFileSync } from "node:fs";
import { Body, Engine, World } from "matter-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AbilitySystem } from "../src/abilities/ability-system";
import { AbilityRunner } from "../src/gameplay/ability-runner";
import { ActionScope } from "../src/gameplay/action-scope";
import { Fighter } from "../src/entities/fighter";
import { DashSkill } from "../src/skills/dash-skill";
import { composeFighter } from "../src/config/fighter-config";
import { dashToward } from "../src/gameplay/dash-move";
import { StopMovementSkill } from "../src/skills/stop-movement-skill";

afterEach(() => vi.unstubAllGlobals());

function arena(id = "angryman") {
      const defaults = JSON.parse(readFileSync("config/fighters/defaults.json", "utf8"));
      const definition = JSON.parse(readFileSync("config/fighters/angryman.json", "utf8"));
      const config = composeFighter(defaults, { ...definition, id });
      config.image = null;
      config.poses = null;
      const game = JSON.parse(readFileSync("config/game-settings.json", "utf8"));
      const sounds = { shared: {}, characters: {} };
      let now = 0;
      const source = new Fighter(config, 0, 0, 4, 0, game, sounds, () => now);
      const targetConfig = composeFighter(defaults, { id: "target", name: "Target", color: "red" });
      const target = new Fighter(targetConfig, 300, 0, -4, 0, game, sounds, () => now);
      const engine = Engine.create({ gravity: { x: 0, y: 0 } });
      World.add(engine.world, [source.body, target.body]);
      const host = {
            characters: [source, target], projectiles: [], world: engine.world,
            COLLISION_COOLDOWN: 0, ARENA_BORDER: 0, now: () => now,
            indicators: { spawnDamageIndicator: vi.fn(), spawnHitSpark: vi.fn(), spawnCharacterLine: vi.fn() },
      };
      const system = new AbilitySystem(host as never);
      const step = (deltaMs: number) => { now += deltaMs; system.update(deltaMs); };
      return { source, target, engine, host, system, step, ability: config.abilities[0] };
}

describe("Angry Man scripted sequence", () => {
      it("stops voluntary movement, shakes in simulation time, then releases windup resources and dashes", () => {
            const { source, system, step } = arena();
            step(1);
            expect(source.abilities.state).toBe("windup");
            expect(source.body.velocity).toEqual({ x: 0, y: 0 });
            expect(source.movement.isCruiseSuppressed).toBe(true);
            source.applyCruiseForce();
            expect(source.body.force).toEqual({ x: 0, y: 0 });
            step(100);
            expect(source.presentation.motion.x).not.toBe(0);
            const motion = source.presentation.motion;
            step(0);
            expect(source.presentation.motion).toEqual(motion);
            expect(system.isDashing(source)).toBe(false);
            step(775);
            expect(source.abilities.state).toBe("active");
            expect(source.movement.isCruiseSuppressed).toBe(false);
            expect(source.presentation.motion).toEqual({ x: 0, y: 0, rotation: 0 });
            expect(system.isDashing(source)).toBe(true);
            step(8);
            expect(source.body.force.x).toBeGreaterThan(0);
      });

      it("retains external physics during windup rather than making the fighter immovable", () => {
            const { source, target, engine, step } = arena();
            step(1);
            source.applyForceKnockback({ x: -1, y: 0 }, 0.1, target.id, 1);
            source.applyPendingForce();
            Engine.update(engine, 1000 / 120);
            expect(source.body.velocity.x).toBeLessThan(0);
            expect(source.movement.isCruiseSuppressed).toBe(true);
      });

      it("applies configured damage and knockback once, then recovers while preserving cooldown", () => {
            const { source, target, system, step, ability, host } = arena();
            const knockback = vi.spyOn(target, "applyForceKnockback");
            step(1);
            step(875);
            system.handleCharacterCollision(source, target);
            system.handleCharacterCollision(source, target);
            expect(target.currentHealth).toBe(900);
            expect(knockback).toHaveBeenCalledOnce();
            expect(target.knockbackOwnerId).toBe(source.id);
            expect(host.indicators.spawnDamageIndicator).toHaveBeenCalledOnce();
            expect(source.abilities.state).toBe("recovery");
            expect(system.isDashing(source)).toBe(false);
            step(150);
            expect(source.abilities.state).toBe("idle");
            expect(source.abilities.tryStart(ability, source.facing, 1026)).toEqual({ started: false, reason: "cooldown" });
      });

      it("ends on wall collision and retains the pre-collision impact protection", () => {
            const { source, system, step } = arena();
            step(1); step(875);
            const wasDashing = system.isDashing(source);
            expect(system.handleWallCollision(source, "right", { minX: 0, maxX: 100, minY: 0, maxY: 100 }, wasDashing))
                  .toEqual({ defaultBounce: true, allowImpactDamage: false });
            expect(source.abilities.state).toBe("recovery");
            expect(system.isDashing(source)).toBe(false);
      });

      it.each(["windup", "active"])("stun cancels %s without delayed hits or cooldown loss", (phase) => {
            const { source, target, system, step, ability } = arena();
            step(1);
            if (phase === "active") step(875);
            source.applyStatus({ effect: "stun", durationMs: 500, sourceId: target.id });
            expect(source.abilities.state).toBe("idle");
            expect(source.presentation.motion).toEqual({ x: 0, y: 0, rotation: 0 });
            expect(source.movement.isCruiseSuppressed).toBe(false);
            expect(system.isDashing(source)).toBe(false);
            system.handleCharacterCollision(source, target);
            expect(target.currentHealth).toBe(1000);
            source.statuses.clear(); step(1);
            expect(source.abilities.tryStart(ability, source.facing, 2000)).toEqual({ started: false, reason: "cooldown" });
      });

      it.each(["death", "reset", "removed"])("releases phase resources on %s", (reason) => {
            const { source, step, system } = arena();
            step(1); step(100);
            if (reason === "death") { source.currentHealth = 0; step(1); }
            if (reason === "reset") system.resetAll();
            if (reason === "removed") source.destroy();
            expect(source.abilities.state).toBe("idle");
            expect(source.movement.isCruiseSuppressed).toBe(false);
            expect(source.presentation.motion).toEqual({ x: 0, y: 0, rotation: 0 });
            expect(system.isDashing(source)).toBe(false);
      });

      it("cancels when its target disappears during windup", () => {
            const { source, target, host, step, system } = arena();
            step(1);
            host.characters.splice(host.characters.indexOf(target), 1);
            step(875);
            expect(source.abilities.state).toBe("idle");
            expect(source.movement.isCruiseSuppressed).toBe(false);
            expect(system.isDashing(source)).toBe(false);
      });

      it("keeps phase timing identical when updates cross windup and active boundaries", () => {
            const advance = (chunks: number[]) => {
                  const { source, step, system } = arena();
                  step(1);
                  for (const delta of chunks) step(delta);
                  return { state: source.abilities.state, remainingMs: source.abilities.remainingMs,
                        dashing: system.isDashing(source), motion: source.presentation.motion };
            };
            expect(advance([900])).toEqual(advance([100, 100, 100, 100, 100, 100, 100, 100, 100]));
            expect(advance([6000])).toEqual(advance([875, 5000, 125]));
      });
});

describe("shared component contracts", () => {
      it("uses the same dash component for the default runner", () => {
            const { source, target, system, step } = arena("ordinary-dasher");
            step(1); step(875); step(8);
            expect(source.body.force.x).toBeGreaterThan(0);
            system.handleCharacterCollision(source, target);
            system.handleCharacterCollision(source, target);
            expect(target.currentHealth).toBe(900);
            expect(source.abilities.state).toBe("recovery");
      });

      it("rejects invalid targets before consuming a cooldown", () => {
            const { source, target, ability, host } = arena();
            const runner = new AbilityRunner(source, { ...host, executeTargetActions: vi.fn() } as never);
            target.currentHealth = 0;
            expect(runner.start(ability, target, {})).toEqual({ started: false, reason: "invalid-target" });
            target.currentHealth = 1000;
            expect(runner.start(ability, target, {})).toEqual({ started: true });
            runner.cancel();
      });

      it("cleans up a failed script and prevents a stale phase from restarting a dash", () => {
            const { source, target, ability, host } = arena();
            const runner = new AbilityRunner(source, host);
            expect(() => runner.start(ability, target, {
                  windup: (scope) => {
                        scope.use(new StopMovementSkill(source.movement));
                        throw new Error("script failed");
                  },
            })).toThrow("script failed");
            expect(source.movement.isCruiseSuppressed).toBe(false);
            expect(source.abilities.state).toBe("idle");
            expect(runner.start(ability, target, {})).toEqual({ started: false, reason: "cooldown" });

            const fresh = arena();
            const move = new AbilityRunner(fresh.source, fresh.host);
            let oldScope!: ActionScope;
            move.start(fresh.ability, fresh.target, { active: (scope) => { oldScope = scope; } });
            move.update(875);
            move.cancel();
            const settings = fresh.ability.actions.find((action) => action.type === "dash")!;
            dashToward(oldScope, move, fresh.target, settings, vi.fn());
            expect(move.isDashing).toBe(false);
            expect(fresh.source.abilities.state).toBe("idle");
      });

      it("cancellation does not invoke dash completion, and scoped cleanup is idempotent", () => {
            const { source, target } = arena();
            const scope = new ActionScope();
            const dash = scope.use(new DashSkill());
            const onComplete = vi.fn(), onEnd = vi.fn();
            dash.startToward(source, target, { speedMultiplier: 6, accelerationForce: 0.018, onComplete, onEnd });
            scope.cancel("reset"); scope.cancel("reset");
            expect(onComplete).not.toHaveBeenCalled();
            expect(onEnd).toHaveBeenCalledExactlyOnceWith({ reason: "cancelled", cancellation: "reset" });
            expect(dash.isActive).toBe(false);
      });

      it("emits timeout completion once and respects the target speed cap", () => {
            const { source, target } = arena();
            const dash = new DashSkill(), onComplete = vi.fn();
            dash.startToward(source, target, { speedMultiplier: 6, accelerationForce: 0.018, maxDurationMs: 100, onComplete });
            Body.setVelocity(source.body, { x: source.baseSpeed * 6, y: 0 });
            dash.update(99);
            expect(source.body.force.x).toBe(0);
            dash.update(1); dash.update(100);
            expect(onComplete).toHaveBeenCalledExactlyOnceWith("timeout");
      });
});
