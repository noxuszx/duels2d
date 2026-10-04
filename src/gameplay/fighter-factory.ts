import { KnockbackReaction } from "./components/knockback-reaction";
import { Bodies, Body } from "matter-js";
import { Entity } from "../engine/entity";
import { BehaviorRuntime } from "../engine/behavior-runtime";
import type { EntityComponent } from "../engine/component";
import type { ArenaWall, ContactEvent, RuntimeTrace } from "../engine/contracts";
import type { ScriptOperation } from "../engine/scripting/operation";
import type { Simulation } from "../engine/simulation";
import type { FighterConfig, Vector2 } from "../types/fighter";
import { FloatingMovement } from "./components/movement";
import { assertComponentData } from "../config/validation";

export interface ComponentContext { entity: Entity; simulation: Simulation; config: FighterConfig; }
export type ComponentFactory<T extends EntityComponent> = (context: ComponentContext) => T;
export type BehaviorContact = { kind: "wall"; wall: ArenaWall } | { kind: "entity"; other: Entity };
export interface BehaviorHandlers {
      onSpawn?: () => Generator<ScriptOperation, void, unknown>;
      onUpdate?: () => Generator<ScriptOperation, void, unknown>;
      onContact?: (event: BehaviorContact) => Generator<ScriptOperation, void, unknown>;
      onWallContact?: (event: { wall: ArenaWall }) => Generator<ScriptOperation, void, unknown>;
}
type BehaviorFactory = (components: any) => BehaviorHandlers;
type Handles<B extends BehaviorFactory> = Parameters<B>[0];
interface DefinitionSpec<B extends BehaviorFactory> {
      id: string;
      components: { [K in keyof Handles<B>]: ComponentFactory<Handles<B>[K] & EntityComponent> };
      behavior: B;
      tasks: Partial<Record<keyof BehaviorHandlers, string>>;
}
export interface FighterBlueprint {
      id: string;
      install(context: ComponentContext): void;
}

/** Typed assembly binds components once. Scripts receive handles, never the runtime. */
export function defineFighter<const B extends BehaviorFactory>(
      spec: DefinitionSpec<B>,
): FighterBlueprint {
      return {
            id: spec.id,
            install(context) {
                  const { entity, simulation, config } = context;
                  const handles = {} as Handles<B>;
                  for (const name of Object.keys(spec.components) as Array<keyof Handles<B>>)
                        handles[name] = entity.components.use(String(name), spec.components[name](context)) as Handles<B>[typeof name];
                  const handlers = spec.behavior(handles);
                  for (const name of Object.keys(handlers) as Array<keyof BehaviorHandlers>) {
                        const id = spec.tasks[name];
                        if (handlers[name] && (!id || !config.moves[id]))
                              throw new Error(`${config.id}: ${name} requires a configured move`);
                  }
                  const runtime = new BehaviorRuntime(entity, {
                        now: () => simulation.nowMs,
                        entities: () => simulation.entities.all(),
                        isCombatActive: () => simulation.state === "running",
                        trace: (event: RuntimeTrace) => simulation.recordTrace(event),
                  });
                  entity.setBehavior(runtime);
                  const run = (name: keyof BehaviorHandlers,
                        script: () => Generator<ScriptOperation, void, unknown>) => {
                        if (runtime.isRunning) return;
                        const id = spec.tasks[name]!;
                        runtime.start({ id, cooldownMs: config.moves[id].cooldownMs }, null, script);
                  };
                  let awaitingSpawn = true;
                  entity.components.use("behavior-events", {
                        beforeStep() {
                              if (awaitingSpawn) {
                                    awaitingSpawn = false;
                                    if (handlers.onSpawn) run("onSpawn", handlers.onSpawn);
                              }
                              if (handlers.onUpdate) run("onUpdate", handlers.onUpdate);
                        },
                        contact(event: ContactEvent) {
                              if (event.hadForegroundTask) return;
                              if (event.kind === "wall" && handlers.onWallContact)
                                    run("onWallContact", () => handlers.onWallContact!({ wall: event.wall }));
                              else if (handlers.onContact)
                                    run("onContact", () => handlers.onContact!(event.kind === "wall"
                                          ? { kind: "wall", wall: event.wall }
                                          : { kind: "entity", other: event.other }));
                        },
                  });
            },
      };
}

export interface SpawnFighterOptions {
      runtimeId: string;
      teamId: string;
      ownerId?: string | null;
      position: Vector2;
      velocity: Vector2;
      collisionGroup?: number;
}

/** Common floating-box preset. A blueprint equips only that fighter's extra capabilities. */
export function createFighter(simulation: Simulation, config: FighterConfig, options: SpawnFighterOptions, blueprint?: FighterBlueprint,): Entity {

      assertComponentData(config.components, config.moves);
      const bodyOptions = {
            restitution: 0.82, friction: 0, frictionAir: 0.018, frictionStatic: 0,
            collisionFilter: { group: options.collisionGroup ?? 0, category: 1, mask: 0xffff },
      };
      
      const body = config.hitbox.type === "box"
            ? Bodies.rectangle(options.position.x + config.hitboxOffset.x, options.position.y + config.hitboxOffset.y,
                  config.hitbox.width, config.hitbox.height, bodyOptions)
            : Bodies.circle(options.position.x + config.hitboxOffset.x, options.position.y + config.hitboxOffset.y,
                  config.hitbox.radius, bodyOptions);

      Body.setVelocity(body, options.velocity);
      const entity = new Entity({
            runtimeId: options.runtimeId, configId: config.id,
            teamId: options.teamId, ownerId: options.ownerId, body, config
      });

      const context = { entity, simulation, config };
      try {
            entity.components.use("knockback-reaction", new KnockbackReaction(context));
            entity.components.use("movement", new FloatingMovement(context,
                  Math.hypot(options.velocity.x, options.velocity.y) || config.speed));
            blueprint?.install(context);
            simulation.add(entity);
      }

      catch (error) { entity.remove("removed"); throw error; }
      return entity;
}
