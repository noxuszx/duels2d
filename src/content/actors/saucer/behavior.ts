import { Body } from "matter-js";
import type { ComponentContext, EntityComponent } from "../../../engine/component";
import type { Entity } from "../../../engine/entity";
import type { RectangleShape } from "../../../engine/spatial/shapes";
import { wait } from "../../../engine/scripting/wait";
import type { BehaviorHandlers } from "../../../gameplay/behavior";
import { createFighter } from "../../../gameplay/fighter-factory";
import type { SaucerSettings } from "../../../config/component-settings";
import type { FighterConfig } from "../../../types/fighter";
import { alien } from "../../fighters/alien/definition";

/** The sweep's direction and reversal points are decisions owned by this actor. */
export function saucerSweep({ entity, simulation }: ComponentContext,
      settings: SaucerSettings, direction: number): EntityComponent {
      const left = simulation.arena.minX + settings.width / 2;
      const right = Math.max(left, simulation.arena.maxX - settings.width / 2);
      return { beforeStep(deltaMs) {
            let x = entity.body.position.x + direction * settings.speed * deltaMs / 1000;
            if (x >= right) { x = right; direction = -1; }
            if (x <= left) { x = left; direction = 1; }
            Body.setPosition(entity.body, { x, y: entity.body.position.y });
      } };
}

export function saucerBehavior({ entity, simulation }: ComponentContext, settings: SaucerSettings,
      signal: { deploying: boolean }, summon: FighterConfig, roster: readonly FighterConfig[],
      owner: Entity): BehaviorHandlers {
      let deployed = false;
      const beam = (): RectangleShape => {
            const top = entity.body.position.y + settings.height / 2;
            const bottom = simulation.arena.maxY;
            return { type: "rectangle", center: { x: entity.body.position.x, y: (top + bottom) / 2 },
                  width: settings.beamWidth, height: bottom - top };
      };
      return { actions: {
            deployment: {
                  interrupt: true,
                  when: () => signal.deploying && !deployed,
                  *run() {
                        deployed = true;
                        yield wait(settings.firstSpawnDelayMs);
                        for (let count = 0; count < settings.maxSpawns; count++) {
                              const speed = summon.speed * simulation.globalSpeedMultiplier;
                              createFighter(simulation, summon, {
                                    runtimeId: simulation.nextRuntimeId(`${owner.runtimeId}:alien`),
                                    teamId: owner.teamId, ownerId: owner.runtimeId, roster,
                                    collisionGroup: owner.body.collisionFilter.group,
                                    position: { x: entity.body.position.x, y: simulation.arena.minY + summon.radius + 1 },
                                    velocity: { x: simulation.rng.next() < .5 ? -speed : speed, y: speed * .6 },
                              }, alien);
                              if (count + 1 < settings.maxSpawns) yield wait(settings.spawnIntervalMs);
                        }
                  },
            },
            beam: {
                  when: () => !signal.deploying,
                  *run() {
                        const release = entity.presentation.acquireShape(beam, settings.beamColor, .25);
                        try {
                              for (let elapsed = 0; elapsed < settings.beamDurationMs;) {
                                    for (const target of simulation.spatial.overlapArea(beam(), {
                                          filter: other => other.teamId !== entity.teamId && other.tags.has("targetable"),
                                    })) simulation.hit(entity, target, { damage: settings.beamDamage },
                                          { independentCooldown: true, sourceId: owner.runtimeId });
                                    const duration = Math.min(settings.beamDamageIntervalMs, settings.beamDurationMs - elapsed);
                                    yield wait(duration);
                                    elapsed += duration;
                              }
                        } finally { release(); }
                        yield wait(Math.max(0, settings.beamIntervalMs - settings.beamDurationMs));
                  },
            },
      } };
}
