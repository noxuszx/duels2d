import { KnockbackReaction } from "./components/knockback-reaction";
import { Bodies, Body } from "matter-js";
import { Entity } from "../engine/entity";
import { BehaviorRuntime } from "../engine/behavior-runtime";
import type { EntityComponent, ComponentContext } from "../engine/component";
import type { ArenaWall, ContactEvent, RuntimeTrace } from "../engine/contracts";
import type { ScriptOperation } from "../engine/scripting/operation";
import type { Simulation } from "../engine/simulation";
import type { FighterConfig, Vector2 } from "../types/fighter";
import { FloatingMovement } from "./components/movement";
import { assertComponentData } from "../config/validation";

export type FighterContext = ComponentContext<FighterConfig>;
export type ComponentFactory<T extends EntityComponent> = (context: FighterContext) => T;
export type BehaviorContact = { kind: "wall"; wall: ArenaWall } | { kind: "entity"; other: Entity };

export interface BehaviorAction {
      when(): boolean;
      run(): Generator<ScriptOperation, void, unknown>;
      /** A ready high-priority action can replace the current foreground task. */
      interrupt?: boolean;
}
export interface BehaviorHandlers {
      /** Configured move IDs, checked in declaration order each simulation step. */
      actions?: Record<string, BehaviorAction>;
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
      tasks: Partial<Record<Exclude<keyof BehaviorHandlers, "actions">, string>>;
}
export interface FighterBlueprint {
      id: string;
      install(context: FighterContext): void;
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
                  for (const name of Object.keys(handlers).filter(name => name !== "actions") as Array<Exclude<keyof BehaviorHandlers, "actions">>) {
                        const id = spec.tasks[name];
                        if (handlers[name] && (!id || !config.moves[id]))
                              throw new Error(`${config.id}: ${name} requires a configured move`);
                  }
                  for (const id of Object.keys(handlers.actions ?? {})) {
                        if (!config.moves[id] && !Object.values(config.forms).some(form => form.moves[id]))
                              throw new Error(`${config.id}: action ${id} requires a configured move`);
                  }
                  const runtime = new BehaviorRuntime(entity, {
                        now: () => simulation.nowMs,
                        entities: () => simulation.entities.all(),
                        isCombatActive: () => simulation.isCombatActive,
                        trace: (event: RuntimeTrace) => simulation.recordTrace(event),
                  });
                  entity.setBehavior(runtime);
                  const run = (name: Exclude<keyof BehaviorHandlers, "actions">,
                        script: () => Generator<ScriptOperation, void, unknown>) => {
                        if (runtime.isRunning) return;
                        const id = spec.tasks[name]!;
                        const move = entity.config.moves[id];
                        if (move) runtime.start({ id, cooldownMs: move.cooldownMs }, null, script);
                  };
                  let awaitingSpawn = true;
                  entity.components.use("behavior-events", {
                        beforeStep() {
                              if (awaitingSpawn) {
                                    awaitingSpawn = false;
                                    if (handlers.onSpawn) run("onSpawn", handlers.onSpawn);
                              }
                              for (const [id, action] of Object.entries(handlers.actions ?? {})) {
                                    const move = entity.config.moves[id];
                                    if (!move || (runtime.isRunning && !action.interrupt)) continue;
                                    if (runtime.currentMove?.id === id) continue;
                                    const admission = { id, cooldownMs: move.cooldownMs };
                                    if (runtime.readiness(admission, null, action.interrupt) || !action.when()) continue;
                                    if (runtime.isRunning) runtime.cancel("interrupted");
                                    if (runtime.start(admission, null, () => action.run()).started) break;
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
export function createFighter(simulation: Simulation, config: FighterConfig, options: SpawnFighterOptions, blueprint?: FighterBlueprint,): Entity<FighterConfig> {

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

      const context = { entity, simulation, get config() { return entity.config; } };
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
