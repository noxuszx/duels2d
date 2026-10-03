import { Bodies, Body, Composite, Engine, Events } from "matter-js";
import type * as Matter from "matter-js";
import { describe, expect, it, vi } from "vitest";
import { AbilitySystem } from "../src/abilities/ability-system";
import { ActionExecutor } from "../src/abilities/action-executor";
import { CombatSystem } from "../src/engine/combat-system";
import { GameManager } from "../src/engine/game-manager";
import { Fighter } from "../src/entities/fighter";
import { FighterAbilities } from "../src/entities/fighter-abilities";
import { Projectile } from "../src/entities/projectile";
import type { AbilityConfig } from "../src/abilities/types";
import { applyDamage } from "../src/combat/combat-resolver";
import { StatusEffectController } from "../src/status-effects";
import { createFighterBehavior } from "../src/behaviors/registry";
import { DefaultFighterBehavior } from "../src/behaviors/default-behavior";
import { BabyManBehavior } from "../src/behaviors/fighters/babyman.behavior";
import { AngryManBehavior } from "../src/behaviors/fighters/angryman.behavior";
import { TransformationController } from "../src/transformations";
import { getAttackHitboxGeometry } from "../src/abilities/actions/attack-hitbox-action";

function makeAbility(overrides: Partial<AbilityConfig> = {}): AbilityConfig {
      return {
            id: "test-ability",
            trigger: { type: "nearest-enemy" },
            timing: {
                  cooldownMs: 1_000,
                  windupMs: 1,
                  activeMs: 2,
                  recoveryMs: 1,
            },
            actions: [],
            ...overrides,
      };
}

describe("gameplay regression characterization", () => {
      it("registers only Baby Man and Angry Man as custom behaviors", () => {
            const standardHandler = {
                  updateStandardFighter: vi.fn(),
                  onWallCollision: vi.fn(),
                  onFighterCollision: vi.fn(),
                  reset: vi.fn(),
            };
            const context = {} as never;
            const create = (id: string) => createFighterBehavior(
                  { id } as Fighter,
                  context,
                  standardHandler,
            );

            expect(create("babyman")).toBeInstanceOf(BabyManBehavior);
            expect(create("angryman")).toBeInstanceOf(AngryManBehavior);
            for (const id of ["chefman", "depressedman", "happyman", "womanman"])
                  expect(create(id)).toBeInstanceOf(DefaultFighterBehavior);
      });

      it("applies accepted damage once and returns the actual lethal amount", () => {
            const target = makeCombatFighter("target", Bodies.circle(10, 0, 5));
            target.currentHealth = 12;
            const source = makeCombatFighter("source", Bodies.circle(0, 0, 5));
            const indicators = makeIndicators();

            const result = applyDamage({
                  source: source as never,
                  target: target as never,
                  amount: 20,
                  nowMs: 250,
                  cooldownMs: 100,
                  indicators: indicators as never,
            });

            expect(result).toEqual({ applied: true, actualDamage: 12, killed: true });
            expect(target.takeDamage).toHaveBeenCalledOnce();
            expect(target.takeDamage).toHaveBeenCalledWith(20, 250, 100);
            expect(target.playSound).toHaveBeenCalledTimes(1);
            expect(target.playSound).toHaveBeenCalledWith("hurt");
            expect(indicators.spawnDamageIndicator).toHaveBeenCalledTimes(1);
            expect(indicators.spawnDamageIndicator).toHaveBeenCalledWith(target, 12);
            expect(indicators.spawnHitSpark).toHaveBeenCalledOnce();
            expect(indicators.spawnCharacterLine).toHaveBeenCalledTimes(1);
            expect(indicators.spawnCharacterLine).toHaveBeenCalledWith(source, "weaponHit");
      });

      it("does not emit damage feedback when the target rejects damage", () => {
            const target = makeCombatFighter("target", Bodies.circle(10, 0, 5));
            target.takeDamage.mockReturnValue(false);
            const source = makeCombatFighter("source", Bodies.circle(0, 0, 5));
            const indicators = makeIndicators();

            const result = applyDamage({
                  source: source as never,
                  target: target as never,
                  amount: 20,
                  nowMs: 250,
                  cooldownMs: 100,
                  indicators: indicators as never,
            });

            expect(result).toEqual({ applied: false, actualDamage: 0, killed: false });
            expect(target.playSound).not.toHaveBeenCalled();
            expect(indicators.spawnDamageIndicator).not.toHaveBeenCalled();
            expect(indicators.spawnHitSpark).not.toHaveBeenCalled();
            expect(indicators.spawnCharacterLine).not.toHaveBeenCalled();
      });

      it("applies shared feedback without source dialogue when damage has no source", () => {
            const target = makeCombatFighter("target", Bodies.circle(10, 0, 5));
            const indicators = makeIndicators();

            const result = applyDamage({
                  target: target as never,
                  amount: 7,
                  nowMs: 250,
                  cooldownMs: 100,
                  indicators: indicators as never,
            });

            expect(result).toEqual({ applied: true, actualDamage: 7, killed: false });
            expect(target.playSound).toHaveBeenCalledTimes(1);
            expect(target.playSound).toHaveBeenCalledWith("hurt");
            expect(indicators.spawnDamageIndicator).toHaveBeenCalledTimes(1);
            expect(indicators.spawnDamageIndicator).toHaveBeenCalledWith(target, 7);
            expect(indicators.spawnHitSpark).toHaveBeenCalledOnce();
            expect(indicators.spawnCharacterLine).not.toHaveBeenCalled();
      });

      it("uses simulation timestamps for cooldown eligibility, including the exact boundary", () => {
            const runtime = new FighterAbilities();
            const ability = makeAbility();
            expect(runtime.tryStart(ability, "right", 500)).toEqual({ started: true });
            runtime.reset();

            expect(runtime.tryStart(ability, "right", 1_499)).toEqual({
                  started: false,
                  reason: "cooldown",
            });
            expect(runtime.tryStart(ability, "right", 1_500)).toEqual({ started: true });
      });

      it("reports applied damage and knockback from configured target actions", () => {
            const target = makeCombatFighter("target", Bodies.circle(10, 0, 5));
            target.currentHealth = 100;
            target.takeDamage.mockImplementation((amount: number) => {
                  target.currentHealth = Math.max(0, target.currentHealth - amount);
                  return true;
            });
            const source = makeCombatFighter("source", Bodies.circle(0, 0, 5));
            const executor = new ActionExecutor({
                  world: {} as never,
                  projectiles: [],
                  indicators: makeIndicators() as never,
                  COLLISION_COOLDOWN: 100,
                  now: () => 250,
            });
            const ability = makeAbility({
                  actions: [
                        { type: "damage", amount: 25 },
                        { type: "knockback", forceMagnitude: 0.5 },
                  ],
            });

            const result = executor.executeTargetActions(source, target, ability);

            expect(result).toEqual({
                  connected: true,
                  damageApplied: 25,
                  knockbackApplied: true,
                  statusesApplied: [],
            });
            expect(target.takeDamage).toHaveBeenCalledTimes(1);
            expect(target.applyForceKnockback).toHaveBeenCalledTimes(1);
      });

      it("applies status actions after connected damage and reports each ID once", () => {
            const target = makeCombatFighter("target", Bodies.circle(10, 0, 5));
            const source = makeCombatFighter("source", Bodies.circle(0, 0, 5));
            const executor = new ActionExecutor({
                  world: {} as never,
                  projectiles: [],
                  indicators: makeIndicators() as never,
                  COLLISION_COOLDOWN: 100,
                  now: () => 250,
            });

            const result = executor.executeTargetActions(source, target, makeAbility({
                  actions: [
                        { type: "apply-status", effect: "stun", durationMs: 300 },
                        { type: "damage", amount: 10 },
                        { type: "apply-status", effect: "stun", durationMs: 500 },
                  ],
            }));

            expect(result).toEqual({
                  connected: true,
                  damageApplied: 10,
                  knockbackApplied: false,
                  statusesApplied: ["stun"],
            });
            expect(target.statuses.getActiveEffects()[0]).toMatchObject({
                  effect: "stun",
                  sourceId: "source",
                  remainingMs: 500,
            });
      });

      it("skips status actions when mixed damage and knockback do not connect", () => {
            const target = makeCombatFighter("target", Bodies.circle(10, 0, 5));
            target.takeDamage.mockReturnValue(false);
            const source = makeCombatFighter("source", Bodies.circle(0, 0, 5));
            const executor = new ActionExecutor({
                  world: {} as never,
                  projectiles: [],
                  indicators: makeIndicators() as never,
                  COLLISION_COOLDOWN: 100,
                  now: () => 250,
            });

            const result = executor.executeTargetActions(source, target, makeAbility({
                  actions: [
                        { type: "damage", amount: 10 },
                        { type: "apply-status", effect: "ability-lock", durationMs: 500 },
                  ],
            }));

            expect(result).toEqual({
                  connected: false,
                  damageApplied: 0,
                  knockbackApplied: false,
                  statusesApplied: [],
            });
            expect(target.statuses.getActiveEffects()).toEqual([]);
      });

      it("counts a successfully applied status-only action as connected", () => {
            const target = makeCombatFighter("target", Bodies.circle(10, 0, 5));
            const source = makeCombatFighter("source", Bodies.circle(0, 0, 5));
            const executor = new ActionExecutor({
                  world: {} as never,
                  projectiles: [],
                  indicators: makeIndicators() as never,
                  COLLISION_COOLDOWN: 100,
                  now: () => 250,
            });

            expect(executor.executeTargetActions(source, target, makeAbility({
                  actions: [{ type: "apply-status", effect: "ability-lock", durationMs: 500 }],
            }))).toEqual({
                  connected: true,
                  damageApplied: 0,
                  knockbackApplied: false,
                  statusesApplied: ["ability-lock"],
            });
      });

      it("treats a status as target-only when paired with a swing action", () => {
            const target = makeCombatFighter("target", Bodies.circle(10, 0, 5));
            const source = makeCombatFighter("source", Bodies.circle(0, 0, 5));
            const executor = new ActionExecutor({
                  world: {} as never,
                  projectiles: [],
                  indicators: makeIndicators() as never,
                  COLLISION_COOLDOWN: 100,
                  now: () => 250,
            });

            expect(executor.executeTargetActions(source, target, makeAbility({
                  actions: [
                        { type: "swing", startDegrees: 0, endDegrees: 90 },
                        { type: "apply-status", effect: "stun", durationMs: 300 },
                  ],
            }))).toEqual({
                  connected: true,
                  damageApplied: 0,
                  knockbackApplied: false,
                  statusesApplied: ["stun"],
            });
      });

      it("stun resets custom behavior and the active ability without erasing cooldown", () => {
            const fighter = Object.create(Fighter.prototype) as Fighter;
            const runtime = new FighterAbilities();
            const behaviorReset = vi.fn();
            Object.assign(fighter, {
                  currentHealth: 100,
                  baseSpeed: 5,
                  body: { velocity: { x: 0, y: 0 } },
                  statuses: new StatusEffectController(),
                  transformation: new TransformationController(null),
                  abilities: runtime,
                  behavior: { handleInterrupt: behaviorReset },
            });
            const ability = makeAbility({ timing: {
                  cooldownMs: 1_000,
                  windupMs: 100,
                  activeMs: 100,
                  recoveryMs: 100,
            } });
            expect(runtime.tryStart(ability, "right", 0)).toEqual({ started: true });

            expect(fighter.applyStatus({ effect: "stun", durationMs: 500, sourceId: "opponent" }).applied)
                  .toBe(true);
            expect(behaviorReset).toHaveBeenCalledOnce();
            expect(runtime.state).toBe("idle");
            expect(runtime.active).toBeNull();
            expect(runtime.tryStart(ability, "right", 100)).toEqual({
                  started: false,
                  reason: "cooldown",
            });
      });

      it("ability-lock blocks new casts without interrupting an active ability", () => {
            const fighter = Object.create(Fighter.prototype) as Fighter;
            const runtime = new FighterAbilities();
            const behaviorReset = vi.fn();
            Object.assign(fighter, {
                  currentHealth: 100,
                  baseSpeed: 5,
                  body: { velocity: { x: 0, y: 0 } },
                  statuses: new StatusEffectController(),
                  transformation: new TransformationController(null),
                  abilities: runtime,
                  behavior: { handleReset: behaviorReset },
            });
            const ability = makeAbility();
            runtime.tryStart(ability, "right", 0);

            fighter.applyStatus({ effect: "ability-lock", durationMs: 250 });

            expect(behaviorReset).not.toHaveBeenCalled();
            expect(runtime.active).toBe(ability);
            expect(fighter.canStartAbility()).toBe(false);
            fighter.statuses.update(250);
            expect(fighter.canStartAbility()).toBe(true);
      });

      it("ticks statuses once before behavior and clears them for dead fighters and match reset", () => {
            const statuses = new StatusEffectController();
            statuses.apply({ effect: "ability-lock", durationMs: 100 });
            const order: string[] = [];
            const updateStatuses = vi.spyOn(statuses, "update").mockImplementation((deltaMs) => {
                  order.push("status");
                  StatusEffectController.prototype.update.call(statuses, deltaMs);
            });
            let alive = true;
            const fighter = {
                  get isDead() { return !alive; },
                  statuses,
                  behavior: {
                        tick: vi.fn(() => {
                              order.push("behavior");
                              if (alive)
                                    expect(statuses.getActiveEffects()[0]?.remainingMs).toBe(90);
                        }),
                        handleReset: vi.fn(),
                  },
                  abilities: { reset: vi.fn() },
                  updateTransformation: vi.fn(() => false),
                  resetTransformation: vi.fn(),
            } as unknown as Fighter;
            const abilitySystem = new AbilitySystem({
                  characters: [fighter],
                  projectiles: [],
                  world: {} as never,
                  COLLISION_COOLDOWN: 0,
                  indicators: {} as never,
                  ARENA_BORDER: 0,
                  now: () => 0,
            });

            abilitySystem.update(10);
            expect(updateStatuses).toHaveBeenCalledOnce();
            expect(order).toEqual(["status", "behavior"]);

            alive = false;
            abilitySystem.update(10);
            expect(updateStatuses).toHaveBeenCalledOnce();
            expect(statuses.getActiveEffects()).toEqual([]);

            statuses.apply({ effect: "stun", durationMs: 100 });
            abilitySystem.resetAll();
            expect(statuses.getActiveEffects()).toEqual([]);
            expect(fighter.abilities.reset).toHaveBeenCalledOnce();
      });

      it("stun leaves knockback and wall bounce active while suppressing voluntary movement", () => {
            const engine = Engine.create();
            const body = Bodies.circle(4, 50, 5);
            Body.setVelocity(body, { x: -4, y: 0 });
            const fighter = Object.assign(makeCombatFighter("stunned", body), {
                  hitbox: { halfWidth: 5, halfHeight: 5 },
                  statuses: new StatusEffectController(),
                  applyPendingForce: vi.fn(),
                  applyCruiseForce: vi.fn(),
                  applyUprightTorque: vi.fn(),
                  noteImpact: vi.fn(),
            });
            fighter.statuses.apply({ effect: "stun", durationMs: 500 });
            const abilitySystem = {
                  isWallCrawling: () => false,
                  isDashing: () => false,
                  handleWallCollision: () => ({ defaultBounce: true, allowImpactDamage: true }),
            };
            const combat = new CombatSystem(
                  engine,
                  {
                        characters: [fighter as never],
                        projectiles: [],
                        world: engine.world,
                        now: () => 0,
                        getArena: () => ({ ax: 0, ay: 0, aw: 100, ah: 100 }),
                        isGameOver: () => false,
                  } as never,
                  abilitySystem as never,
                  makeIndicators() as never,
                  { arena: { borderWidth: 0 }, physics: {
                        collisionCooldownMs: 100,
                        impactDamage: { minSpeed: 100 },
                  } } as never,
            );

            (combat as any).constrainFighters();
            expect(fighter.applyPendingForce).toHaveBeenCalledOnce();
            expect(fighter.applyCruiseForce).not.toHaveBeenCalled();
            expect(fighter.applyUprightTorque).not.toHaveBeenCalled();

            (combat as any).constrainFighter(
                  fighter,
                  { ax: 0, ay: 0, aw: 100, ah: 100 },
                  0,
                  0,
            );
            expect(body.position.x).toBe(5);
            expect(body.velocity.x).toBeGreaterThan(0);
      });

      it("still applies configured knockback when damage is rejected by cooldown", () => {
            const target = makeCombatFighter("target", Bodies.circle(10, 0, 5));
            target.currentHealth = 100;
            target.takeDamage.mockReturnValue(false);
            const source = makeCombatFighter("source", Bodies.circle(0, 0, 5));
            const executor = new ActionExecutor({
                  world: {} as never,
                  projectiles: [],
                  indicators: makeIndicators() as never,
                  COLLISION_COOLDOWN: 100,
                  now: () => 250,
            });

            const result = executor.executeTargetActions(source, target, makeAbility({
                  actions: [
                        { type: "damage", amount: 25 },
                        { type: "knockback", forceMagnitude: 0.5 },
                  ],
            }));

            expect(result).toEqual({
                  connected: true,
                  damageApplied: 0,
                  knockbackApplied: true,
                  statusesApplied: [],
            });
            expect(target.takeDamage).toHaveBeenCalledTimes(1);
            expect(target.applyForceKnockback).toHaveBeenCalledTimes(1);
      });

      it("runs a standard swing target action once on activation and cues only on connection", () => {
            const ability = makeAbility({
                  timing: { cooldownMs: 1_000, windupMs: 5, activeMs: 10, recoveryMs: 5 },
                  actions: [
                        { type: "swing", startDegrees: 0, endDegrees: 90 },
                        { type: "damage", amount: 10 },
                  ],
            });
            const source = makeAbilitySystemFighter("source", Bodies.circle(0, 0, 5), [ability]);
            const target = makeAbilitySystemFighter("target", Bodies.circle(20, 0, 5));
            const abilitySystem = makeTestAbilitySystem([source, target]);

            abilitySystem.update(0);
            expect(source.behavior).toBeInstanceOf(DefaultFighterBehavior);
            expect(source.abilities.active).toBe(ability);
            abilitySystem.update(5);
            expect(target.takeDamage).toHaveBeenCalledTimes(1);
            expect(source.audio.playAbilityCue).toHaveBeenCalledWith(ability, "hit");
            abilitySystem.update(1);
            expect(target.takeDamage).toHaveBeenCalledTimes(1);

            const rejectedSource = makeAbilitySystemFighter("rejected-source", Bodies.circle(0, 50, 5), [ability]);
            const rejectedTarget = makeAbilitySystemFighter("rejected-target", Bodies.circle(20, 50, 5));
            rejectedTarget.takeDamage.mockReturnValue(false);
            const rejectedSystem = makeTestAbilitySystem([rejectedSource, rejectedTarget]);
            rejectedSystem.update(0);
            rejectedSystem.update(5);
            expect(rejectedTarget.takeDamage).toHaveBeenCalledTimes(1);
            expect(rejectedSource.audio.playAbilityCue).not.toHaveBeenCalledWith(ability, "hit");
      });

      it("fires projectiles and recoil together once on active entry", () => {
            const engine = Engine.create();
            const ability = makeAbility({
                  timing: { cooldownMs: 1_000, windupMs: 10, activeMs: 10, recoveryMs: 10 },
                  actions: [
                        {
                              type: "spawn-projectile",
                              projectile: {
                                    radius: 3,
                                    speed: 4,
                                    damage: 8,
                                    lifetimeMs: 1_000,
                                    image: "",
                              },
                        },
                        { type: "recoil", forceMagnitude: 0.2 },
                  ],
            });
            const source = makeAbilitySystemFighter("source", Bodies.circle(0, 0, 5), [ability]);
            const target = makeAbilitySystemFighter("target", Bodies.circle(30, 0, 5));
            const projectiles: Projectile[] = [];
            const abilitySystem = makeTestAbilitySystem([source, target], {
                  world: engine.world,
                  projectiles,
            });

            abilitySystem.update(0);
            abilitySystem.update(9);
            expect(projectiles).toHaveLength(0);
            expect(source.applyRecoil).not.toHaveBeenCalled();

            abilitySystem.update(1);

            expect(projectiles).toHaveLength(1);
            expect(Composite.allBodies(engine.world)).toContain(projectiles[0].body);
            expect(projectiles[0].ownerId).toBe(source.id);
            expect(source.applyRecoil).toHaveBeenCalledOnce();
            expect(source.applyRecoil).toHaveBeenCalledWith(
                  { x: -1, y: -0 },
                  0.2,
                  0,
            );
            abilitySystem.update(1);
            expect(projectiles).toHaveLength(1);
            expect(source.applyRecoil).toHaveBeenCalledOnce();
      });

      it("keeps an attack hitbox active and hits each overlapping target once", () => {
            const ability = makeAbility({
                  timing: {
                        cooldownMs: 1_000,
                        windupMs: 5,
                        activeMs: 20,
                        recoveryMs: 5,
                  },
                  actions: [
                        {
                              type: "attack-hitbox",
                              width: 20,
                              height: 40,
                              offset: { x: 10, y: 0 },
                        },
                        { type: "damage", amount: 12 },
                  ],
            });
            const source = makeAbilitySystemFighter(
                  "source",
                  Bodies.circle(0, 0, 5),
                  [ability],
            );
            const target = makeAbilitySystemFighter(
                  "target",
                  Bodies.circle(18, 0, 5),
            );
            const abilitySystem = makeTestAbilitySystem([source, target]);

            abilitySystem.update(0);
            abilitySystem.update(5);
            expect(target.takeDamage).toHaveBeenCalledOnce();
            abilitySystem.update(5);
            expect(target.takeDamage).toHaveBeenCalledOnce();
      });

      it.each(["left", "right"] as const)("starts range-triggered melee only inside its %s-facing attack hitbox", (facing) => {
            const ability = makeAbility({
                  trigger: { type: "enemy-in-range", rangePadding: 42 },
                  timing: { cooldownMs: 1_000, windupMs: 5, activeMs: 20, recoveryMs: 5 },
                  actions: [
                        { type: "attack-hitbox", width: 20, height: 40, offset: { x: 88, y: 0 } },
                        { type: "damage", amount: 12 },
                  ],
            });
            const source = makeAbilitySystemFighter("source", Bodies.circle(0, 0, 5), [ability]);
            source.facing = facing;
            const direction = facing === "right" ? 1 : -1;
            const target = makeAbilitySystemFighter("target", Bodies.circle(-88 * direction, 0, 5));
            const system = makeTestAbilitySystem([source, target]);

            system.update(0);
            expect(source.abilities.state).toBe("idle");
            Body.setPosition(target.body, { x: 20 * direction, y: 0 });
            system.update(0);
            expect(source.abilities.state).toBe("idle");
            Body.setPosition(target.body, { x: 88 * direction, y: 0 });
            system.update(0);
            expect(source.abilities.state).toBe("windup");
            expect(target.takeDamage).not.toHaveBeenCalled();
            system.update(5);
            expect(target.takeDamage).toHaveBeenCalledOnce();
      });

      it("mirrors attack-hitbox forward offset and follows body rotation", () => {
            const source = makeAbilitySystemFighter(
                  "source",
                  Bodies.circle(0, 0, 5),
            );
            const action = {
                  type: "attack-hitbox" as const,
                  width: 20,
                  height: 40,
                  offset: { x: 10, y: 5 },
            };

            source.facing = "left";
            expect(getAttackHitboxGeometry(source, action).center).toEqual({
                  x: -10,
                  y: 5,
            });

            source.facing = "right";
            Body.setAngle(source.body, Math.PI / 2);
            const rotated = getAttackHitboxGeometry(source, action);
            expect(rotated.center.x).toBeCloseTo(-5);
            expect(rotated.center.y).toBeCloseTo(10);
            expect(rotated.angle).toBeCloseTo(Math.PI / 2);
      });

      it("interrupts and clears a standard ability through DefaultFighterBehavior reset", () => {
            const ability = makeAbility({
                  timing: { cooldownMs: 1_000, windupMs: 100, activeMs: 10, recoveryMs: 10 },
                  actions: [
                        { type: "swing", startDegrees: 0, endDegrees: 90 },
                        { type: "damage", amount: 10 },
                  ],
            });
            const source = makeAbilitySystemFighter("source", Bodies.circle(0, 0, 5), [ability]);
            const target = makeAbilitySystemFighter("target", Bodies.circle(20, 0, 5));
            const abilitySystem = makeTestAbilitySystem([source, target]);

            abilitySystem.update(0);
            expect(source.behavior).toBeInstanceOf(DefaultFighterBehavior);
            source.applyStatus({ effect: "stun", durationMs: 250, sourceId: target.id });
            expect(source.abilities.state).toBe("idle");
            expect(source.abilities.active).toBeNull();
            source.statuses.clear();
            abilitySystem.update(200);
            expect(target.takeDamage).not.toHaveBeenCalled();
            expect(source.audio.playAbilityCue).not.toHaveBeenCalledWith(ability, "hit");
            expect(source.abilities.tryStart(ability, "right", 100)).toEqual({
                  started: false,
                  reason: "cooldown",
            });
      });

      it("rejects a cooldown bypass without changing activation state or audio", () => {
            const onAudioEvent = vi.fn();
            const runtime = new FighterAbilities(onAudioEvent);
            const ability = makeAbility();
            expect(runtime.tryStart(ability, "right", 0)).toEqual({ started: true });
            runtime.reset();

            expect(runtime.active).toBeNull();
            expect(runtime.facing).toBeNull();
            const eventCountAfterStartAndReset = onAudioEvent.mock.calls.length;
            expect(runtime.tryStart(ability, "left", 100)).toEqual({
                  started: false,
                  reason: "cooldown",
            });
            expect(runtime.active).toBeNull();
            expect(runtime.facing).toBeNull();
            expect(runtime.state).toBe("idle");
            expect(runtime.remainingMs).toBe(0);
            expect(onAudioEvent).toHaveBeenCalledTimes(eventCountAfterStartAndReset);
      });

      it("reports already-active without replacing the ability or resetting its timer", () => {
            const runtime = new FighterAbilities();
            const first = makeAbility({ id: "first" });
            const second = makeAbility({ id: "second" });
            expect(runtime.tryStart(first, "right", 0)).toEqual({ started: true });
            const remainingMs = runtime.remainingMs;

            expect(runtime.tryStart(second, "left", 100)).toEqual({
                  started: false,
                  reason: "already-active",
            });
            expect(runtime.active).toBe(first);
            expect(runtime.facing).toBe("right");
            expect(runtime.remainingMs).toBe(remainingMs);
      });

      it("blocks new starts above twice base speed and allows the exact threshold", () => {
            const fighter = Object.create(Fighter.prototype) as Fighter;
            Object.assign(fighter, {
                  currentHealth: 1,
                  baseSpeed: 5,
                  body: { velocity: { x: 10, y: 0 } },
                  statuses: new StatusEffectController(),
                  transformation: new TransformationController(null),
            });

            expect(fighter.canStartAbility()).toBe(true);
            fighter.body.velocity.x = 10.001;
            expect(fighter.canStartAbility()).toBe(false);
            fighter.body.velocity.x = 0;
            fighter.currentHealth = 0;
            expect(fighter.canStartAbility()).toBe(false);
      });

      it("keeps an active ability running when the speed lock engages", () => {
            let canStart = true;
            const runtime = new FighterAbilities(
                  undefined,
                  undefined,
                  () => canStart,
            );
            expect(runtime.tryStart(makeAbility(), "right", 0)).toEqual({ started: true });
            runtime.update(1);
            expect(runtime.state).toBe("active");

            canStart = false;
            expect(runtime.tryStart(makeAbility({ id: "another-ability" }), "right", 5_000)).toEqual({
                  started: false,
                  reason: "already-active",
            });
            expect(runtime.state).toBe("active");
            runtime.update(1);
            expect(runtime.state).toBe("active");
      });

      it("reports a configured dash only while its ability is active", () => {
            const abilitySystem = new AbilitySystem({
                  characters: [],
                  projectiles: [],
                  world: {} as never,
                  COLLISION_COOLDOWN: 0,
                  indicators: {} as never,
                  ARENA_BORDER: 0,
                  now: () => 0,
            });
            const fighter = {
                  abilities: {
                        state: "active",
                        active: makeAbility({
                              actions: [{
                                    type: "dash",
                                    speedMultiplier: 5,
                                    accelerationForce: 0.02,
                                    endOn: ["wall-collision"],
                              }],
                        }),
                  },
            } as unknown as Fighter;

            expect(abilitySystem.isDashing(fighter)).toBe(true);
            fighter.abilities.state = "recovery";
            expect(abilitySystem.isDashing(fighter)).toBe(false);
      });

      it("keeps wall bounce and impact-damage decisions independent", () => {
            const behavior = {
                  handleWallCollision: vi.fn(() => ({
                        defaultBounce: false,
                        allowImpactDamage: false,
                  })),
            };
            const abilitySystem = new AbilitySystem({
                  characters: [],
                  projectiles: [],
                  world: {} as never,
                  COLLISION_COOLDOWN: 0,
                  indicators: {} as never,
                  ARENA_BORDER: 0,
                  now: () => 0,
            });
            const fighter = { behavior } as unknown as Fighter;
            const bounds = { minX: 0, maxX: 10, minY: 0, maxY: 10 };

            expect(abilitySystem.handleWallCollision(fighter, "left", bounds, false)).toEqual({
                  defaultBounce: false,
                  allowImpactDamage: false,
            });
            expect(abilitySystem.handleWallCollision(fighter, "left", bounds, true)).toEqual({
                  defaultBounce: false,
                  allowImpactDamage: false,
            });
            expect(behavior.handleWallCollision).toHaveBeenCalledTimes(2);
      });

      it("ignores a projectile collision with its owner and consumes a hit on another fighter", () => {
            const engine = Engine.create();
            const ownerBody = Bodies.circle(0, 0, 5);
            const targetBody = Bodies.circle(20, 0, 5);
            const owner = makeCombatFighter("owner", ownerBody);
            const target = makeCombatFighter("target", targetBody);
            const projectile = new Projectile(
                  { radius: 2, speed: 1, damage: 12, lifetimeMs: 1_000, image: "" },
                  owner,
                  0,
                  0,
                  1,
                  0,
                  "projectile-hit",
            );
            const host = {
                  characters: [owner, target],
                  projectiles: [projectile],
                  world: engine.world,
                  now: () => 250,
                  getArena: () => ({ ax: 0, ay: 0, aw: 100, ah: 100 }),
                  isGameOver: () => false,
            };
            const combat = new CombatSystem(
                  engine,
                  host as never,
                  { isDashing: () => false } as never,
                  makeIndicators() as never,
                  { physics: { collisionCooldownMs: 100 } } as never,
            );
            combat.register();
            Events.trigger(engine, "collisionStart", {
                  pairs: [{ bodyA: projectile.body, bodyB: ownerBody, collision: { normal: { x: 1, y: 0 } } }],
            } as never);

            expect(owner.takeDamage).not.toHaveBeenCalled();
            expect(projectile.dead).toBe(false);
            expect(host.projectiles).toContain(projectile);

            Events.trigger(engine, "collisionStart", {
                  pairs: [{ bodyA: projectile.body, bodyB: targetBody, collision: { normal: { x: 1, y: 0 } } }],
            } as never);
            expect(target.takeDamage).toHaveBeenCalledWith(12, 250, 100);
            expect(target.playSound).toHaveBeenCalledTimes(1);
            expect(target.playSound).toHaveBeenCalledWith("hurt");
            expect(owner.audio.play).toHaveBeenCalledTimes(1);
            expect(owner.audio.play).toHaveBeenCalledWith("projectile-hit");
            expect(target.currentHealth).toBe(88);
            expect(projectile.dead).toBe(true);
            expect(host.projectiles).not.toContain(projectile);
            Events.off(engine, "collisionStart");
      });

      it("expires a projectile when accumulated simulation time reaches its lifetime", () => {
            const projectile = new Projectile(
                  { radius: 2, speed: 1, damage: 1, lifetimeMs: 1_000, image: "" },
                  { id: "owner" },
                  0,
                  0,
                  1,
                  0,
            );

            const flightContext = {
                  characters: [], bounds: { minX: 0, maxX: 100, minY: 0, maxY: 100 }, matchEnded: false,
            };
            projectile.update(999, flightContext);
            expect(projectile.dead).toBe(false);
            projectile.update(1, flightContext);
            expect(projectile.dead).toBe(true);
      });

      it("routes impact damage through shared feedback with no source dialogue", () => {
            const engine = Engine.create();
            const target = makeCombatFighter("target", Bodies.circle(10, 0, 5));
            const indicators = makeIndicators();
            const combat = new CombatSystem(
                  engine,
                  {
                        characters: [target],
                        projectiles: [],
                        world: engine.world,
                        now: () => 250,
                        getArena: () => ({ ax: 0, ay: 0, aw: 100, ah: 100 }),
                        isGameOver: () => false,
                  } as never,
                  {} as never,
                  indicators as never,
                  { physics: { collisionCooldownMs: 100, impactDamage: { minSpeed: 1, damage: 10 } } } as never,
            );

            expect((combat as any).applyImpactDamage(target, 2, 250)).toBe(true);
            expect(target.takeDamage).toHaveBeenCalledTimes(1);
            expect(target.takeDamage).toHaveBeenCalledWith(10, 250, 100);
            expect(target.playSound).toHaveBeenCalledTimes(1);
            expect(target.playSound).toHaveBeenCalledWith("hurt");
            expect(indicators.spawnDamageIndicator).toHaveBeenCalledTimes(1);
            expect(indicators.spawnDamageIndicator).toHaveBeenCalledWith(target, 10);
            expect(indicators.spawnHitSpark).toHaveBeenCalledOnce();
            expect(indicators.spawnCharacterLine).not.toHaveBeenCalled();
      });

      it("snapshots dash state before a collision ends the dash, suppressing impact damage to the dasher", () => {
            const engine = Engine.create();
            const firstBody = Bodies.circle(0, 0, 5);
            const secondBody = Bodies.circle(20, 0, 5);
            Body.setVelocity(firstBody, { x: 20, y: 0 });
            const dasher = makeCombatFighter("dasher", firstBody);
            const opponent = makeCombatFighter("opponent", secondBody);
            let currentlyDashing = true;
            const abilitySystem = {
                  isDashing: vi.fn(() => currentlyDashing),
                  handleCharacterCollision: vi.fn(() => {
                        currentlyDashing = false;
                  }),
            };
            const combat = new CombatSystem(
                  engine,
                  {
                        characters: [dasher, opponent],
                        projectiles: [],
                        world: engine.world,
                        now: () => 500,
                        getArena: () => ({ ax: 0, ay: 0, aw: 100, ah: 100 }),
                        isGameOver: () => false,
                  } as never,
                  abilitySystem as never,
                  makeIndicators() as never,
                  { physics: { collisionCooldownMs: 100, impactDamage: { minSpeed: 1, damage: 10 } } } as never,
            );
            const resolveImpact = vi.spyOn(combat as any, "handleFighterImpact");
            combat.register();

            Events.trigger(engine, "collisionStart", {
                  pairs: [{
                        bodyA: firstBody,
                        bodyB: secondBody,
                        collision: { normal: { x: 1, y: 0 } },
                  }],
            } as never);

            expect(abilitySystem.isDashing).toHaveBeenCalledTimes(2);
            expect(abilitySystem.handleCharacterCollision).toHaveBeenCalledWith(dasher, opponent);
            expect(resolveImpact.mock.calls[0]?.[4]).toBe(true);
            expect(dasher.takeDamage).not.toHaveBeenCalled();

            combat["handleFighterImpact"](dasher, opponent, 500, 20, true, false);
            expect(dasher.takeDamage).not.toHaveBeenCalled();
            expect(opponent.takeDamage).toHaveBeenCalled();
            Events.off(engine, "collisionStart");
      });

      it("passes the pre-callback dash snapshot into the wall response and keeps normal bounce", () => {
            const engine = Engine.create();
            const body = Bodies.circle(96, 50, 5);
            Body.setVelocity(body, { x: 20, y: 0 });
            const dasher = Object.assign(makeCombatFighter("dasher", body), {
                  hitbox: { halfWidth: 5, halfHeight: 5 },
            });
            let currentlyDashing = true;
            const abilitySystem = {
                  isDashing: vi.fn(() => currentlyDashing),
                  handleWallCollision: vi.fn((_fighter, _wall, _bounds, wasDashing) => {
                        currentlyDashing = false;
                        return {
                              defaultBounce: true,
                              allowImpactDamage: !wasDashing,
                        };
                  }),
            };
            const combat = new CombatSystem(
                  engine,
                  {
                        characters: [dasher],
                        projectiles: [],
                        world: engine.world,
                        now: () => 500,
                        getArena: () => ({ ax: 0, ay: 0, aw: 100, ah: 100 }),
                        isGameOver: () => false,
                  } as never,
                  abilitySystem as never,
                  makeIndicators() as never,
                  { arena: { borderWidth: 0 }, physics: {
                        collisionCooldownMs: 100,
                        impactDamage: { minSpeed: 1, damage: 10 },
                  } } as never,
            );

            (combat as any).constrainFighter(
                  dasher,
                  { ax: 0, ay: 0, aw: 100, ah: 100 },
                  0,
                  500,
            );

            expect(abilitySystem.handleWallCollision).toHaveBeenCalledWith(
                  dasher,
                  "right",
                  { minX: 5, maxX: 95, minY: 5, maxY: 95 },
                  true,
            );
            expect(body.velocity.x).toBe(-20);
            expect(dasher.takeDamage).not.toHaveBeenCalled();
            expect(dasher.noteImpact).toHaveBeenCalledOnce();
            expect(dasher.playSound).toHaveBeenCalledWith("body-bounce");
      });

      it("advances the public simulation clock by each simulation step", () => {
            const manager = Object.create(GameManager.prototype) as GameManager & Record<string, any>;
            const engine = Engine.create();
            Object.assign(manager, {
                  simulationTimeMs: 0,
                  abilitySystem: { update: vi.fn(), updateFaceTargeting: vi.fn() },
                  engine,
                  indicators: {
                        updateDamageIndicators: vi.fn(),
                        updateDialogueIndicators: vi.fn(),
                        updateHitSparks: vi.fn(),
                  },
                  combatSystem: { updateProjectiles: vi.fn() },
                  _updateCharacterAudio: vi.fn(),
                  _updateCharacterLines: vi.fn(),
                  _checkWinCondition: vi.fn(),
            });

            manager["_stepSimulation"](1000 / 120);
            expect(manager.now()).toBeCloseTo(1000 / 120);
            expect(manager.abilitySystem.update).toHaveBeenCalledWith(1000 / 120);
            manager["_stepSimulation"](1000 / 120);
            expect(manager.now()).toBeCloseTo(1000 / 60);
      });
});

function makeCombatFighter(id: string, body: ReturnType<typeof Bodies.circle>) {
      return {
            id,
            body,
            config: { color: "red" },
            baseSpeed: 1,
            currentHealth: 100,
            get isDead() { return this.currentHealth <= 0; },
            takeDamage: vi.fn(function (this: { currentHealth: number }, amount: number) {
                  this.currentHealth = Math.max(0, this.currentHealth - amount);
                  return true;
            }),
            applyForceKnockback: vi.fn(),
            applyRecoil: vi.fn(),
            statuses: new StatusEffectController(),
            transformation: new TransformationController(null),
            applyStatus(application: Parameters<Fighter["applyStatus"]>[0]) {
                  return this.statuses.apply(application);
            },
            playSound: vi.fn(),
            noteImpact: vi.fn(),
            isKnockbackFrom: vi.fn(() => false),
            audio: { play: vi.fn() },
            get visualPosition() { return this.body.position; },
      };
}

function makeAbilitySystemFighter(
      id: string,
      body: ReturnType<typeof Bodies.circle>,
      abilities: AbilityConfig[] = [],
) {
      const fighter = makeCombatFighter(id, body) as ReturnType<typeof makeCombatFighter> & Partial<Fighter>;
      Object.assign(fighter, {
            config: { id, abilities, defaultFacing: "right" },
            activeAbilities: abilities,
            hitbox: { halfWidth: 5, halfHeight: 5 },
            facing: "right",
            audio: {
                  ...fighter.audio,
                  playAbilityCue: vi.fn(),
                  stopAbilityCue: vi.fn(),
            },
            canStartAbility: () => true,
            updateTransformation: vi.fn(() => false),
            resetTransformation: vi.fn(),
      });
      fighter.abilities = new FighterAbilities(
            (config, event) => fighter.audio.playAbilityCue(config, event),
            (config, event) => fighter.audio.stopAbilityCue(config, event),
            () => fighter.canStartAbility(),
      );
      fighter.applyStatus = Fighter.prototype.applyStatus;
      fighter.canStartAbility = Fighter.prototype.canStartAbility;
      return fighter as Fighter;
}

function makeTestAbilitySystem(
      characters: Fighter[],
      overrides: { world?: Matter.World; projectiles?: Projectile[] } = {},
) {
      return new AbilitySystem({
            characters,
            projectiles: overrides.projectiles ?? [],
            world: overrides.world ?? ({} as never),
            COLLISION_COOLDOWN: 0,
            indicators: makeIndicators() as never,
            ARENA_BORDER: 0,
            now: () => 0,
      });
}

function makeIndicators() {
      return {
            spawnDamageIndicator: vi.fn(),
            spawnHitSpark: vi.fn(),
            spawnCharacterLine: vi.fn(),
      };
}
