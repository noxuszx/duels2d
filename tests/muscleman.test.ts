import { readFileSync } from "node:fs";
import { Body, Engine, Events, World } from "matter-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AbilityRunner } from "../src/gameplay/ability-runner";
import { AbilitySystem } from "../src/abilities/ability-system";
import { CombatSystem } from "../src/engine/combat-system";
import { composeFighter } from "../src/config/fighter-config";
import { FighterPresentation } from "../src/entities/fighter-presentation";
import { Fighter } from "../src/entities/fighter";
import { Projectile } from "../src/entities/projectile";
import { MuscleManBehavior } from "../src/behaviors/fighters/muscleman.behavior";
import { applyDamage } from "../src/combat/combat-resolver";
import { getSaveContent } from "../tools/character-studio/persistence/fighter-serializer";

const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));
// Current roster tuning: 12 increases at 1/2/3 per second, ending at 5.0 seconds.
const FULL_CHARGE_MS = 5000;
const DAMAGE_30_MS = 1000;
const DAMAGE_60_MS = 1500;
afterEach(() => vi.unstubAllGlobals());
function arena(id = "muscleman") {
      vi.stubGlobal("Image", class {
            onload: (() => void) | null = null;
            private path = "";
            set src(path: string) { this.path = path; this.onload?.(); }
            get src() { return this.path; }
      });
      const defaults = json("config/fighters/defaults.json");
      const definition = json("config/fighters/muscleman.json");
      const config = composeFighter(defaults, { ...definition, id });
      const game = json("config/game-settings.json");
      let now = 0, gameOver = false;
      const source = new Fighter(config, 100, 200, 4, 0, game, { shared: {}, characters: {} }, () => now);
      const target = new Fighter(composeFighter(defaults, { id: "target", name: "Target", color: "red",
            combat: { maxHealth: 10000 } }), 300, 200, -4, 0, game, { shared: {}, characters: {} }, () => now);
      const engine = Engine.create({ gravity: { x: 0, y: 0 } });
      World.add(engine.world, [source.body, target.body]);
      const indicators = { spawnDamageIndicator: vi.fn(), spawnHitSpark: vi.fn(), spawnCharacterLine: vi.fn() };
      const host = { characters: [source, target], projectiles: [] as Projectile[], world: engine.world,
            COLLISION_COOLDOWN: 0, ARENA_BORDER: 0, now: () => now, indicators,
            getArena: () => ({ ax: 0, ay: 0, aw: 600, ah: 800 }), isGameOver: () => gameOver };
      const system = new AbilitySystem(host as never);
      const combat = new CombatSystem(engine, host, system, indicators as never, game);
      combat.register();
      const step = (delta: number) => { now += delta; system.update(delta); };
      step(0);
      const behavior = source.behavior as MuscleManBehavior;
      const hurt = (amount = 1, cooldownMs = 0) => applyDamage({ source: target, target: source, amount,
            nowMs: now, cooldownMs, indicators: indicators as never });
      const contact = (projectile: Projectile, fighter: Fighter) => Events.trigger(engine, "collisionStart", {
            pairs: [{ bodyA: projectile.body, bodyB: fighter.body, collision: { normal: { x: 1, y: 0 } } }],
      });
      return { source, target, behavior, step, host, hurt, contact, combat, engine, config, defaults, definition, system,
            endGame: () => { gameOver = true; } };
}

describe("Muscle Man", () => {
      it("ramps 1/2/3 times per second, preserves movement, and pauses on zero delta", () => {
            const { source, behavior, step, host } = arena();
            step(999); expect(behavior.accumulatedDamage).toBe(0);
            step(1); expect(behavior.accumulatedDamage).toBe(30);
            expect(source.body.velocity.x).toBe(4);
            expect(source.movement.isCruiseSuppressed).toBe(false);
            step(0); expect(behavior.accumulatedDamage).toBe(30);
            step(1000); expect(behavior.accumulatedDamage).toBe(90);
            step(1000); expect(behavior.accumulatedDamage).toBe(180);
            step(1000); expect(behavior.accumulatedDamage).toBe(270);
            expect(host.projectiles).toHaveLength(0);
      });

      it("launches at 350 after 5.0 seconds with a fixed snapshot and pauses charging during flight", () => {
            const { behavior, host, step, hurt } = arena();
            step(FULL_CHARGE_MS);
            expect(host.projectiles).toHaveLength(1);
            expect(host.projectiles[0].damage).toBe(350);
            step(10000); hurt(); step(1000);
            expect(host.projectiles).toHaveLength(1);
            expect(host.projectiles[0].damage).toBe(350);
            expect(behavior.accumulatedDamage).toBe(350);
      });

      it("briefly shows the ramp sprite and holds the throw sprite until caught", () => {
            const { source, step, host, contact, combat } = arena();
            const sprite = () => source.presentation.getCurrentSprite(source.abilities.state)!.image.src;
            expect(sprite()).toContain("muscleman-idle");
            step(1000); expect(sprite()).toContain("muscleman-ramp");
            step(150); expect(sprite()).toContain("muscleman-idle");
            step(FULL_CHARGE_MS - 1150); expect(sprite()).toContain("muscleman-throw");
            step(5000); expect(sprite()).toContain("muscleman-throw");
            combat.updateProjectiles(1);
            contact(host.projectiles[0], source);
            expect(sprite()).toContain("muscleman-idle");
      });

      it("is identical across large and small simulation updates", () => {
            const large = arena(); large.step(FULL_CHARGE_MS);
            const small = arena(); for (let i = 0; i < 600; i++) small.step(1000 / 120);
            expect(large.host.projectiles.map(p => p.damage)).toEqual(small.host.projectiles.map(p => p.damage));
      });

      it("resets charge and rate when hurt without throwing; rejected damage does not reset", () => {
            const { behavior, step, hurt, host } = arena();
            step(DAMAGE_60_MS); hurt();
            expect(behavior.accumulatedDamage).toBe(0);
            expect(host.projectiles).toHaveLength(0);
            step(1000); expect(behavior.accumulatedDamage).toBe(30);
            step(500); expect(behavior.accumulatedDamage).toBe(60);
            expect(hurt(1, 5000).applied).toBe(false);
            expect(behavior.accumulatedDamage).toBe(60);
      });

      it("does not throw on hurt by default and clears charge when hurt before 350", () => {
            const { behavior, step, hurt, host } = arena();
            step(DAMAGE_60_MS);
            expect(behavior.accumulatedDamage).toBe(60);
            hurt();
            expect(behavior.accumulatedDamage).toBe(0);
            expect(host.projectiles).toHaveLength(0);
      });

      it("can configure an optional hurtThrowThreshold to throw on hurt above threshold", () => {
            const defaults = json("config/fighters/defaults.json");
            const definition = json("config/fighters/muscleman.json");
            const config = composeFighter(defaults, {
                  ...definition,
                  behavior: {
                        type: "damage-ramp",
                        settings: { ...definition.behavior.settings, hurtThrowThreshold: 50 },
                  },
            });
            const game = json("config/game-settings.json");
            let now = 0;
            const source = new Fighter(config, 100, 200, 4, 0, game, { shared: {}, characters: {} }, () => now);
            const target = new Fighter(composeFighter(defaults, { id: "target", name: "Target", color: "red",
                  combat: { maxHealth: 10000 } }), 300, 200, -4, 0, game, { shared: {}, characters: {} }, () => now);
            const engine = Engine.create({ gravity: { x: 0, y: 0 } });
            World.add(engine.world, [source.body, target.body]);
            const indicators = { spawnDamageIndicator: vi.fn(), spawnHitSpark: vi.fn(), spawnCharacterLine: vi.fn() };
            const host = { characters: [source, target], projectiles: [] as Projectile[], world: engine.world,
                  COLLISION_COOLDOWN: 0, ARENA_BORDER: 0, now: () => now, indicators,
                  getArena: () => ({ ax: 0, ay: 0, aw: 600, ah: 800 }), isGameOver: () => false };
            const system = new AbilitySystem(host as never);
            const combat = new CombatSystem(engine, host, system, indicators as never, game);
            combat.register();
            const step = (delta: number) => { now += delta; system.update(delta); };
            step(DAMAGE_60_MS);
            applyDamage({ source: target, target: source, amount: 1, nowMs: now, cooldownMs: 0, indicators: indicators as never });
            expect(source.behavior!.accumulatedDamage).toBe(60);
            expect(host.projectiles).toHaveLength(1);
            expect(host.projectiles[0].damage).toBe(60);
      });

      it("respects casting locks and launches a pending hurt throw after unlock when threshold configured", () => {
            const defaults = json("config/fighters/defaults.json");
            const definition = json("config/fighters/muscleman.json");
            const config = composeFighter(defaults, {
                  ...definition,
                  behavior: {
                        type: "damage-ramp",
                        settings: { ...definition.behavior.settings, hurtThrowThreshold: 50 },
                  },
            });
            const game = json("config/game-settings.json");
            let now = 0;
            const source = new Fighter(config, 100, 200, 4, 0, game, { shared: {}, characters: {} }, () => now);
            const target = new Fighter(composeFighter(defaults, { id: "target", name: "Target", color: "red",
                  combat: { maxHealth: 10000 } }), 300, 200, -4, 0, game, { shared: {}, characters: {} }, () => now);
            const engine = Engine.create({ gravity: { x: 0, y: 0 } });
            World.add(engine.world, [source.body, target.body]);
            const indicators = { spawnDamageIndicator: vi.fn(), spawnHitSpark: vi.fn(), spawnCharacterLine: vi.fn() };
            const host = { characters: [source, target], projectiles: [] as Projectile[], world: engine.world,
                  COLLISION_COOLDOWN: 0, ARENA_BORDER: 0, now: () => now, indicators,
                  getArena: () => ({ ax: 0, ay: 0, aw: 600, ah: 800 }), isGameOver: () => false };
            const system = new AbilitySystem(host as never);
            const combat = new CombatSystem(engine, host, system, indicators as never, game);
            combat.register();
            const step = (delta: number) => { now += delta; system.update(delta); };
            step(DAMAGE_60_MS);
            source.applyStatus({ effect: "ability-lock", durationMs: 500, sourceId: target.id });
            applyDamage({ source: target, target: source, amount: 1, nowMs: now, cooldownMs: 0, indicators: indicators as never });
            expect(host.projectiles).toHaveLength(0);
            step(499); expect(host.projectiles).toHaveLength(0);
            step(1); expect(host.projectiles[0].damage).toBe(60);
      });

      it("waits for a live target without losing charge or spawning duplicates", () => {
            const { target, step, host } = arena();
            target.currentHealth = 0; step(FULL_CHARGE_MS);
            expect(host.projectiles).toHaveLength(0);
            target.currentHealth = 10000; step(1); step(1000);
            expect(host.projectiles).toHaveLength(1);
      });

      it("pierces enemies without exchanging forces, and hits again after separation", () => {
            const { source, target, step, host, combat, engine } = arena();
            step(FULL_CHARGE_MS);
            const projectile = host.projectiles[0];
            expect(projectile.body.isSensor).toBe(true);
            source.movement.suspendCruise();
            target.movement.suspendCruise();
            Body.setVelocity(source.body, { x: 0, y: 0 });
            Body.setVelocity(target.body, { x: 0, y: 0 });
            const pass = () => {
                  Body.setPosition(projectile.body, { x: target.body.position.x, y: target.body.position.y });
                  Body.setVelocity(projectile.body, { x: 12, y: 0 });
                  Engine.update(engine, 1000 / 120);
                  combat.updateProjectiles(1000 / 120);
            };
            pass();
            expect(target.currentHealth).toBe(9650);
            expect(target.body.velocity.x).toBe(0);
            expect(projectile.body.velocity.x).toBeCloseTo(12);
            Engine.update(engine, 1000 / 120); // Still touching: no duplicate hit.
            expect(target.currentHealth).toBe(9650);
            Body.setPosition(projectile.body, { x: 500, y: 500 });
            Engine.update(engine, 1000 / 120);
            step(1000); pass();
            expect(target.currentHealth).toBe(9300);
            expect(projectile.dead).toBe(false);
      });

      it("bounces at walls/corners, ignores projectiles, and catches without self damage", () => {
            const { behavior, source, step, host, combat, contact, config } = arena();
            step(FULL_CHARGE_MS);
            const projectile = host.projectiles[0];
            const other = new Projectile(config.abilities[0].actions.find(a => a.type === "spawn-projectile")!.projectile,
                  { id: "other" }, 10, 10, 1, 0);
            expect(projectile.body.collisionFilter.mask! & other.body.collisionFilter.category!).toBe(0);
            expect(projectile.flight.ownerCatchArmed).toBe(true); // Spawn is already clear of the owner.
            Body.setPosition(projectile.body, { x: 610, y: 810 });
            Body.setVelocity(projectile.body, { x: 12, y: 8 });
            combat.updateProjectiles(1);
            expect(projectile.body.velocity.x).toBeCloseTo(-12);
            expect(projectile.body.velocity.y).toBeCloseTo(-8);
            expect(projectile.flight.ownerCatchArmed).toBe(true);
            contact(projectile, source); contact(projectile, source);
            combat.updateProjectiles(1);
            expect(source.currentHealth).toBe(1000);
            expect(host.projectiles).toHaveLength(0);
            expect(behavior.accumulatedDamage).toBe(0);
            step(999); expect(behavior.accumulatedDamage).toBe(0);
            step(1); expect(behavior.accumulatedDamage).toBe(30);
      });

      it.each(["death", "reset", "removed"])("cleans up the owned projectile on %s", reason => {
            const { source, step, host, combat } = arena();
            step(FULL_CHARGE_MS);
            const projectile = host.projectiles[0];
            if (reason === "death") { source.currentHealth = 0; step(1); }
            if (reason === "reset") source.behavior!.handleReset();
            if (reason === "removed") source.destroy();
            combat.updateProjectiles(1);
            expect(projectile.dead).toBe(true);
            expect(host.projectiles).toHaveLength(0);
      });

      it("suppresses projectile damage after victory", () => {
            const { step, host, target, contact, endGame } = arena();
            step(FULL_CHARGE_MS); endGame(); contact(host.projectiles[0], target);
            expect(target.currentHealth).toBe(10000);
      });

      it("preserves editable ramp tuning and all three sprites through Studio serialization", () => {
            const { config, defaults, definition } = arena();
            config.behavior!.settings.amountPerIncrease = 25;
            const saved = JSON.parse(getSaveContent([definition], config as never, defaults));
            const reloaded = composeFighter(defaults, saved);
            expect(reloaded.behavior).toEqual(config.behavior);
            expect(Object.keys(reloaded.poses!)).toEqual(["idle", "attackWindup", "attackActive"]);
            expect(reloaded.abilities).toEqual(config.abilities);
      });
      it("continues harmless owner catching after victory while suppressing damage", () => {
            const { step, host, source, target, contact, endGame, behavior } = arena();
            step(FULL_CHARGE_MS);
            const projectile = host.projectiles[0];
            endGame();
            contact(projectile, target);
            expect(target.currentHealth).toBe(10000);
            contact(projectile, source);
            expect(projectile.removalReason).toBe("caught");
            expect(behavior.accumulatedDamage).toBe(0);
            expect(source.presentation.getCurrentSprite("idle")!.image.src).toContain("muscleman-idle");
      });

      it("retires an unreturned shot at match end and cannot resume charging after victory", () => {
            const { step, host, source, combat, endGame } = arena();
            step(FULL_CHARGE_MS);
            const projectile = host.projectiles[0];
            endGame(); combat.updateProjectiles(0);
            expect(projectile.removalReason).toBe("match-ended");
            expect(host.projectiles).toHaveLength(0);
            expect(source.presentation.getCurrentSprite("idle")!.image.src).toContain("muscleman-idle");
            step(FULL_CHARGE_MS);
            expect(host.projectiles).toHaveLength(0);
      });

      it("can pierce with sensor contacts and explicitly configured shared knockback", () => {
            const { config, target, step, host, contact } = arena();
            const action = config.abilities[0].actions.find(a => a.type === "spawn-projectile")!;
            action.projectile.flight!.knockback = { forceMagnitude: 0.1 };
            const knockback = vi.spyOn(target, "applyForceKnockback");
            step(FULL_CHARGE_MS);
            contact(host.projectiles[0], target);
            expect(knockback).toHaveBeenCalledOnce();
            expect(host.projectiles[0].dead).toBe(false);
            expect(host.projectiles[0].body.isSensor).toBe(true);
      });

      it.each(["catch", "ignore"] as const)("owner-death cleanup is explicit with %s contacts", ownerContact => {
            const { source, config, host, combat } = arena();
            const original = config.abilities[0].actions.find(a => a.type === "spawn-projectile")!.projectile;
            const flight = structuredClone(original.flight!);
            flight.collision.ownerContact = ownerContact;
            flight.ownership.onOwnerDeath = "persist";
            const shot = new Projectile({ ...original, flight }, source, 200, 300, 1, 0);
            host.projectiles.push(shot); World.add(host.world, shot.body);
            source.currentHealth = 0; combat.updateProjectiles(1);
            expect(shot.dead).toBe(false);
            host.characters.splice(host.characters.indexOf(source), 1);
            combat.updateProjectiles(1);
            expect(shot.removalReason).toBe("owner-removed");
      });

      it("arms after actual launch overlap ends and catches a later overlap without an event", () => {
            const { source, config, host, combat } = arena();
            const original = config.abilities[0].actions.find(a => a.type === "spawn-projectile")!.projectile;
            const shot = new Projectile(original, source, source.body.position.x, source.body.position.y, 1, 0);
            host.projectiles.push(shot); World.add(host.world, shot.body);
            combat.updateProjectiles(1);
            expect(shot.flight.ownerCatchArmed).toBe(false);
            expect(shot.dead).toBe(false);
            Body.setPosition(shot.body, { x: 400, y: 400 });
            combat.updateProjectiles(1);
            expect(shot.flight.ownerCatchArmed).toBe(true);
            Body.setPosition(shot.body, source.body.position);
            combat.updateProjectiles(1);
            expect(shot.removalReason).toBe("caught");
      });

      it("cancels once and an old flight callback cannot reset a later charge", () => {
            const { step, host, source, behavior, combat } = arena();
            step(FULL_CHARGE_MS);
            const projectile = host.projectiles[0];
            source.behavior!.handleReset(); combat.updateProjectiles(0);
            step(1000);
            expect(behavior.accumulatedDamage).toBe(30);
            projectile.remove("caught");
            expect(projectile.removalReason).toBe("reset");
            expect(behavior.accumulatedDamage).toBe(30);
      });

      it("drains zero-duration scripted phases in order without spending simulation time", () => {
            const { source, target, host, config } = arena();
            const runner = new AbilityRunner(source, host);
            const phases: string[] = [];
            const release = vi.fn();
            const result = runner.start(config.abilities[0], target, {
                  windup: scope => { phases.push("windup"); scope.use({ update: vi.fn(), cancel: release }); },
                  active: () => { phases.push("active"); },
                  recovery: () => { phases.push("recovery"); },
            });
            expect(result.started).toBe(true);
            expect(phases).toEqual(["windup", "active", "recovery"]);
            expect(source.abilities.state).toBe("idle");
            expect(release).toHaveBeenCalledOnce();
            expect(runner.start(config.abilities[0], target, {})).toEqual({ started: false, reason: "cooldown" });
      });

      it("uses the same zero-duration timing for a legacy projectile move", () => {
            const { source, system, host } = arena("legacy-projectile");
            expect(host.projectiles).toHaveLength(1);
            expect(source.abilities.state).toBe("idle");
            // Repeated same-time adapter updates do not bypass the cooldown.
            system.update(0);
            expect(host.projectiles).toHaveLength(1);
      });

      it("loads arbitrary leased base poses, inherits them in a transformed form, and prioritizes transition poses", () => {
            const { config } = arena();
            config.imageCrop = { x: 1, y: 1, width: 10, height: 10 };
            config.poses!.flex = { image: "assets/flex.png", imageScale: 3,
                  imageOffset: { x: 2, y: 4 }, imageCrop: null };
            config.transformation = { trigger: { type: "health-threshold", healthRatio: 0.4 },
                  abilities: config.abilities,
                  poses: { idle: "assets/transformed-idle.png", transition: "assets/transition.png" } };
            const presentation = new FighterPresentation(config);
            const release = presentation.acquirePose("flex");
            expect(presentation.getCurrentSprite("idle")?.image.src).toBe("assets/flex.png");
            expect(presentation.getCurrentSprite("idle")?.imageScale).toBe(3);
            expect(presentation.getCurrentSprite("idle")?.imageCrop).toBeNull();
            presentation.setTransformed(true);
            expect(presentation.getCurrentSprite("idle")?.image.src).toBe("assets/flex.png");
            presentation.setTransformationPose("transition");
            expect(presentation.getCurrentSprite("idle")?.image.src).toBe("assets/transition.png");
            presentation.setTransformationPose(null);
            const releaseNew = presentation.acquirePose("attackActive");
            release(); release();
            expect(presentation.getCurrentSprite("idle")?.image.src).toContain("muscleman-throw");
            releaseNew();
            expect(presentation.getCurrentSprite("idle")?.image.src).toBe("assets/transformed-idle.png");
      });

});
