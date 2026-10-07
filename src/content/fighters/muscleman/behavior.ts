import { Body } from "matter-js";
import type { Entity } from "../../../engine/entity";
import type { ComponentContext } from "../../../engine/component";
import { SIMULATION_STEP_MS } from "../../../engine/simulation";
import { during, perform, waitForEvent, type ScriptGenerator } from "../../../engine/scripting";
import { installBehavior, type BehaviorHandlers } from "../../../gameplay/behavior";
import type { FighterContext } from "../../../gameplay/fighter-factory";
import { ProjectileEmitter, type Targeting } from "../../../gameplay/components";
import { ProjectileFlight } from "../../../gameplay/components/combat/projectile/flight";
import { onProjectileEvents, steer } from "../../script-helpers";

interface MuscleManComponents { targeting: Targeting; }

/** Charge, hurt-triggered throwing, and returning flight are Muscle Man's content decisions. */
export function muscleManBehavior({ targeting }: MuscleManComponents, context: FighterContext): BehaviorHandlers {
      const { entity, simulation, config } = context;
      const rampSettings = config.components.damageRamp;
      const projectileSettings = config.components.projectile;
      if (!rampSettings || !projectileSettings) throw new Error("Muscle Man requires damageRamp and projectile settings");
      const ramp = rampSettings;
      const gun = projectileSettings;
      if (!ramp.ratesPerSecond.length || ramp.ratesPerSecond.some(rate => !Number.isFinite(rate) || rate <= 0))
            throw new Error("Muscle Man requires positive ramp rates");

      let damage = 0;
      let heldMs = 0;
      let nextIncreaseMs = 1000 / ramp.ratesPerSecond[0];
      let dumbbell: Entity | null = null;
      let hurtSinceUpdate = false;
      entity.events.on("damaged", () => { hurtSinceUpdate = true; }, entity.lifetime);
      let releasePose: (() => void) | null = null;
      let poseUntilMs = 0;
      const pose = (name: string) => {
            releasePose?.();
            releasePose = entity.presentation.acquirePose(name);
      };
      const resetClock = () => { heldMs = 0; nextIncreaseMs = 1000 / ramp.ratesPerSecond[0]; };

      function throwDumbbell(): boolean {
            const target = targeting.nearestEnemy();
            const dx = target ? target.body.position.x - entity.body.position.x : (entity.facing === "left" ? -1 : 1);
            const dy = target ? target.body.position.y - entity.body.position.y : 0;
            const length = Math.hypot(dx, dy);
            const direction = length > 1e-9 ? { x: dx / length, y: dy / length } : { x: 1, y: 0 };
            const box = config.hitbox;
            const clearance = (box.type === "box" ? Math.hypot(box.width / 2, box.height / 2) : box.radius)
                  + gun.projectile.radius + 1;
            // Each throw owns a damage snapshot; authored settings are never mutated.
            const emitter = new ProjectileEmitter(context, { ...gun, projectile: { ...gun.projectile, damage } });
            const spawned = emitter.spawn({
                  position: { x: entity.body.position.x + direction.x * clearance,
                        y: entity.body.position.y + direction.y * clearance }, direction,
            });
            if (!spawned) return false;
            const projectile = spawned[0];
            dumbbell = projectile;
            damage = 0;
            resetClock();
            poseUntilMs = 0;
            pose("attackActive");
            let returning = false;
            const velocityHome = () => {
                  const x = entity.body.position.x - projectile.body.position.x;
                  const y = entity.body.position.y - projectile.body.position.y;
                  const distance = Math.hypot(x, y);
                  return distance > 1e-9
                        ? { x: x / distance * gun.projectile.speed, y: y / distance * gun.projectile.speed }
                        : { x: 0, y: 0 };
            };
            // Content supplies the wall response; containment and catch remain flight primitives.
            projectile.resources.acquireContactPolicy({ defaultBounce: false });
            onProjectileEvents(projectile, {
                  onWall() { returning = true; Body.setVelocity(projectile.body, velocityHome()); },
                  onEnd() {
                        if (dumbbell !== projectile) return;
                        dumbbell = null;
                        resetClock();
                        if (entity.isAlive && releasePose) pose("idle");
                  },
            });
            const actor: ComponentContext = { entity: projectile, simulation, get config() { return projectile.config; } };
            const flight = projectile.components.get("flight");
            if (!(flight instanceof ProjectileFlight)) throw new Error("Dumbbell requires projectile flight");
            installBehavior(actor, { *onSpawn() {
                  if (!returning) {
                        const outcome = yield* perform(waitForEvent(flight.events, "wall"));
                        if (outcome.kind !== "event") return;
                  }
                  while (projectile.isAlive) yield steer(projectile, SIMULATION_STEP_MS, velocityHome);
            } }, { onSpawn: "return" }, () => ({ cooldownMs: 0 }),
            { onTaskError: () => { simulation.remove(projectile.runtimeId); } });
            return true;
      }

      function tick(deltaMs: number): void {
            const hurt = hurtSinceUpdate;
            hurtSinceUpdate = false;
            if (dumbbell) return;
            if (hurt && damage >= (ramp.hurtThrowThreshold ?? ramp.amountPerIncrease) && throwDumbbell()) return;
            if (poseUntilMs && simulation.nowMs + 1e-9 >= poseUntilMs) { pose("idle"); poseUntilMs = 0; }
            heldMs += deltaMs;
            while (heldMs + 1e-9 >= nextIncreaseMs) {
                  damage = Math.min(ramp.maxDamage, damage + ramp.amountPerIncrease);
                  pose("attackWindup");
                  poseUntilMs = simulation.nowMs + ramp.increasePoseMs;
                  const second = Math.min(Math.floor((nextIncreaseMs + 1e-9) / 1000), ramp.ratesPerSecond.length - 1);
                  nextIncreaseMs += 1000 / ramp.ratesPerSecond[second];
                  if (damage >= ramp.maxDamage) { throwDumbbell(); break; }
            }
      }

      return { *onUpdate(): ScriptGenerator {
            pose(dumbbell ? "attackActive" : "idle");
            try { while (entity.isAlive) yield during(SIMULATION_STEP_MS, tick); }
            finally { releasePose?.(); releasePose = null; }
      } };
}
