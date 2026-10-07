import { Bodies, Body, Composite } from "matter-js";
import { describe, expect, it } from "vitest";
import type { ProjectileSettings } from "../src/config/component-settings";
import type { Entity, EntityRemovalReason } from "../src/engine/entity";
import { createEntity } from "../src/engine/entity-factory";
import { Simulation } from "../src/engine/simulation";
import { ScriptScope, wait } from "../src/engine/scripting";
import { createProjectile } from "../src/gameplay/components/combat/projectile/factory";
import type { ProjectileImpactEvent, ProjectileEndEvent } from "../src/gameplay/components/combat/projectile/events";
import { onProjectileEvents } from "../src/content/script-helpers";
import { spawnActor } from "../src/gameplay/actor-factory";
import { ProjectileFlight } from "../src/gameplay/components/combat/projectile/flight";

const config = { id: "fixture", radius: 5, hitbox: { type: "circle" as const, radius: 5 }, speed: 0, maxHealth: 100 };
function setup(overrides: Partial<ProjectileSettings> = {}) {
      const simulation = new Simulation({ arena: { minX: 0, maxX: 500, minY: 0, maxY: 500 }, seed: 5 });
      function target(id: string, teamId = "B", tags = ["targetable"]) {
            return createEntity(simulation, { runtimeId: id, configId: id, config, teamId, tags,
                  body: Bodies.circle(250, 250, 5, { isStatic: true, collisionFilter: { mask: 0 } }) });
      }
      const entity = target("owner", "A", []);
      const owner = { entity, simulation, get config() { return entity.config; } };
      const settings: ProjectileSettings = {
            radius: 5, speed: 1, damage: 10,
            flight: {
                  collision: { response: "sensor", enemyContact: "consume", ownerContact: "ignore", walls: "bounce" },
                  lifetime: { type: "persistent" },
                  ownership: { onOwnerDeath: "remove", onOwnerRemoval: "remove", onMatchEnd: "remove" },
            }, ...overrides,
      };
      const projectile = createProjectile(owner, settings, { position: { x: 100, y: 100 }, direction: { x: 1, y: 0 } });
      const enemy = target("enemy");
      return { simulation, owner, projectile, enemy, target, settings };
}
function contact(projectile: Entity, other: Entity): void {
      projectile.contact({ kind: "entity", self: projectile, other, normal: { x: -1, y: 0 },
            incomingSpeed: 1, hadForegroundTask: false, policy: { defaultBounce: true, allowImpactDamage: true } });
}
function wall(projectile: Entity): void {
      projectile.contact({ kind: "wall", wall: "right", self: projectile, normal: { x: -1, y: 0 },
            incomingSpeed: 1, hadForegroundTask: false, policy: { defaultBounce: true, allowImpactDamage: true } });
}

describe("projectile lifecycle events", () => {
      it("delivers the resolved impact before one end event with immutable snapshots", () => {
            const { simulation, projectile, enemy } = setup();
            const order: string[] = [];
            let impact!: ProjectileImpactEvent, end!: ProjectileEndEvent;
            onProjectileEvents(projectile, {
                  onImpact(event) { order.push("impact"); impact = event; expect(enemy.health).toBe(90); },
                  onEnd(event) { order.push("end"); end = event; },
            });
            contact(projectile, enemy);
            simulation.remove(projectile.runtimeId);
            expect(order).toEqual(["impact", "end"]);
            expect(impact.other).toBe(enemy);
            expect(impact.result).toMatchObject({ actualDamage: 10, connected: true });
            expect(end.reason).toBe("hit");
            expect(end.nowMs).toBe(0);
            Body.setPosition(projectile.body, { x: 300, y: 400 });
            expect(end.position).toEqual({ x: 100, y: 100 });
            expect(Object.isFrozen(impact.position)).toBe(true);
            expect(Object.isFrozen(impact.result.statusesApplied)).toBe(true);
            simulation.dispose();
      });

      it("finishes all impact listeners before end when a callback removes the projectile", () => {
            const { simulation, projectile, enemy } = setup();
            const order: string[] = [];
            onProjectileEvents(projectile, {
                  onImpact() { order.push("impact-a"); simulation.remove(projectile.runtimeId, "expired"); },
                  onEnd(event) { order.push(`end-a:${event.reason}`); },
            });
            onProjectileEvents(projectile, { onImpact() { order.push("impact-b"); }, onEnd() { order.push("end-b"); } });
            contact(projectile, enemy);
            expect(order).toEqual(["impact-a", "impact-b", "end-a:expired", "end-b"]);
            simulation.dispose();
      });

      it("retains impact-before-end ordering when hit resolution itself removes the projectile", () => {
            const { simulation, projectile, enemy } = setup({ damage: 100 });
            const order: string[] = [];
            enemy.components.use("death-response", { cancel() { simulation.remove(projectile.runtimeId, "hit"); } });
            onProjectileEvents(projectile, { onImpact() { order.push("impact"); }, onEnd() { order.push("end"); } });
            contact(projectile, enemy);
            expect(order).toEqual(["impact", "end"]);
            simulation.dispose();
      });

      it("reports a zero-damage impact and still applies the consume policy", () => {
            const { simulation, projectile, enemy } = setup({ damage: 0 });
            let result: ProjectileImpactEvent["result"] | undefined;
            onProjectileEvents(projectile, { onImpact(event) { result = event.result; } });
            contact(projectile, enemy);
            expect(result).toMatchObject({ connected: false, actualDamage: 0 });
            expect(projectile.removalReason).toBe("hit");
            simulation.dispose();
      });

      it("reports distinct piercing enemies once and excludes allies, owner, and non-targetable entities", () => {
            const fixture = setup();
            fixture.settings.flight.collision.enemyContact = "pierce";
            const { simulation, projectile, enemy, owner, target } = fixture;
            const impacts: string[] = [];
            onProjectileEvents(projectile, { onImpact({ other }) { impacts.push(other.runtimeId); } });
            contact(projectile, owner.entity);
            contact(projectile, target("ally", "A"));
            contact(projectile, target("decoration", "B", []));
            contact(projectile, enemy);
            contact(projectile, enemy);
            contact(projectile, target("second"));
            expect(impacts).toEqual(["enemy", "second"]);
            expect(projectile.isRemoved).toBe(false);
            simulation.dispose();
      });

      it("reports an owner catch as an end without an enemy impact", () => {
            const fixture = setup();
            fixture.settings.flight.collision.ownerContact = "catch";
            const order: string[] = [];
            onProjectileEvents(fixture.projectile, {
                  onImpact() { order.push("impact"); }, onEnd({ reason }) { order.push(reason); },
            });
            contact(fixture.projectile, fixture.owner.entity);
            expect(order).toEqual(["hit"]);
            fixture.simulation.dispose();
      });

      it("delivers wall events before bounce without ending the projectile", () => {
            const { simulation, projectile } = setup();
            const velocities: number[] = [];
            let ended = false;
            onProjectileEvents(projectile, {
                  onWall({ wall }) { expect(wall).toBe("right"); velocities.push(projectile.body.velocity.x); },
                  onEnd() { ended = true; },
            });
            Body.setPosition(projectile.body, { x: 499, y: 100 });
            simulation.step();
            expect(velocities).toHaveLength(1);
            expect(velocities[0]).toBeGreaterThan(0);
            expect(projectile.body.velocity.x).toBeLessThan(0);
            expect(ended).toBe(false);
            wall(projectile);
            expect(velocities).toHaveLength(2);
            simulation.dispose();
      });

      it("delivers wall-before-end when content consumes a wall contact", () => {
            const { simulation, projectile } = setup();
            const order: string[] = [];
            onProjectileEvents(projectile, {
                  onWall() { order.push("wall-a"); simulation.remove(projectile.runtimeId, "hit"); },
                  onEnd() { order.push("end"); },
            });
            onProjectileEvents(projectile, { onWall() { order.push("wall-b"); } });
            wall(projectile);
            expect(order).toEqual(["wall-a", "wall-b", "end"]);
            simulation.dispose();
      });

      it("expires by simulation time and releases rotation and contact resources before end", () => {
            const fixture = setup({ rotationSpeed: 1 });
            fixture.settings.flight.lifetime = { type: "duration", durationMs: 20 };
            const { simulation, projectile, owner } = fixture;
            let reason: EntityRemovalReason | undefined;
            onProjectileEvents(projectile, { onEnd(event) {
                  reason = event.reason;
                  expect(projectile.presentation.rotation).toBe(0);
                  expect(projectile.resources.ignoresContact(owner.entity.runtimeId)).toBe(false);
            } });
            simulation.step();
            expect(projectile.presentation.rotation).toBeGreaterThan(0);
            simulation.step(); simulation.step();
            expect(reason).toBe("expired");
            simulation.dispose();
      });

      it.each(["owner-death", "owner-removed", "match-ended", "reset", "removed"] as const)(
            "reports %s once without synthesizing an impact", reason => {
                  const { simulation, owner, projectile } = setup();
                  const events: string[] = [];
                  onProjectileEvents(projectile, { onImpact() { events.push("impact"); }, onEnd(event) { events.push(event.reason); } });
                  if (reason === "owner-death") { owner.entity.takeDamage(100); simulation.step(); }
                  if (reason === "owner-removed") simulation.remove(owner.entity.runtimeId);
                  if (reason === "match-ended") simulation.entities.retireMatchEnd();
                  if (reason === "reset") simulation.reset();
                  if (reason === "removed") simulation.remove(projectile.runtimeId);
                  simulation.dispose();
                  // Registry reset removes the owner first, so owned children retire as owner-removed.
                  expect(events).toEqual([reason === "reset" ? "owner-removed" : reason]);
            },
      );

      it("supports scoped unsubscription, including removal of a listener during dispatch", () => {
            const fixture = setup();
            fixture.settings.flight.collision.enemyContact = "pierce";
            const { simulation, projectile, enemy } = fixture;
            const events: string[] = [];
            const scope = new ScriptScope();
            scope.use(onProjectileEvents(projectile, { onImpact() { events.push("scoped"); } }));
            scope.release(); scope.release();
            let unsubscribe = () => {};
            onProjectileEvents(projectile, { onImpact() { events.push("first"); unsubscribe(); } });
            unsubscribe = onProjectileEvents(projectile, { onImpact() { events.push("second"); }, onEnd() { events.push("end"); } });
            contact(projectile, enemy);
            simulation.dispose();
            unsubscribe();
            expect(events).toEqual(["first"]);
      });

      it("preserves the first callback error while notifying others, consuming, and cleaning up", () => {
            const { simulation, projectile, enemy } = setup({ rotationSpeed: 1 });
            simulation.step();
            const failure = new Error("impact failed");
            const order: string[] = [];
            onProjectileEvents(projectile, {
                  onImpact() { order.push("impact-a"); throw failure; },
                  onEnd() { order.push("end-a"); throw new Error("end failed"); },
            });
            onProjectileEvents(projectile, { onImpact() { order.push("impact-b"); }, onEnd() { order.push("end-b"); } });
            expect(() => contact(projectile, enemy)).toThrow(failure);
            expect(order).toEqual(["impact-a", "impact-b", "end-a", "end-b"]);
            expect(projectile.removalReason).toBe("hit");
            expect(projectile.presentation.rotation).toBe(0);
            expect(Composite.allBodies(simulation.engine.world)).toHaveLength(2);
            simulation.dispose();
      });

      it("preserves the terminal event error when source-close observers also fail", () => {
            const { simulation, projectile } = setup();
            const failure = new Error("end failed");
            const calls: string[] = [];
            onProjectileEvents(projectile, { onEnd() { calls.push("end"); throw failure; } });
            const flight = projectile.components.get<ProjectileFlight>("flight")!;
            flight.events.onClose(() => { calls.push("close"); throw new Error("close failed"); });
            flight.events.onClose(() => { calls.push("later close"); });
            expect(() => simulation.remove(projectile.runtimeId)).toThrow(failure);
            expect(calls).toEqual(["end", "close", "later close"]);
            expect(flight.events.isClosed).toBe(true);
            expect(projectile.isRemoved).toBe(true);
            simulation.dispose();
      });

      it("rejects missing flight and removed projectiles without installing a fallback", () => {
            const { simulation, projectile, owner } = setup();
            expect(() => onProjectileEvents(owner.entity, {})).toThrow(/require ProjectileFlight/);
            simulation.remove(projectile.runtimeId);
            expect(() => onProjectileEvents(projectile, {})).toThrow(/removed projectile/);
            simulation.dispose();
      });

      it("lets an end callback spawn a delayed actor that survives projectile removal", () => {
            const { simulation, projectile, owner } = setup();
            let fired = false;
            onProjectileEvents(projectile, { onEnd({ position }) {
                  spawnActor(owner, { config: { ...config, id: "delayed-effect" },
                        body: Bodies.circle(position.x, position.y, 5, { isStatic: true, collisionFilter: { mask: 0 } }) },
                  function* () { yield wait(1); fired = true; });
            } });
            simulation.remove(projectile.runtimeId, "hit");
            expect(fired).toBe(false);
            simulation.step();
            expect(fired).toBe(false);
            simulation.step();
            expect(fired).toBe(true);
            expect(simulation.entities.all().some(entity => entity.configId === "delayed-effect")).toBe(false);
            simulation.dispose();
      });
});
