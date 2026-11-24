import { Engine } from "matter-js";
import { EventScheduler } from "./events/scheduler";
import { EventSource } from "./events/source";
import { runAll } from "./cleanup";
import type { ArenaBounds, ArenaWall, ContactEvent, ContactPolicy, RuntimeTrace, Vector2 } from "./contracts";
import type { Entity, EntityRemovalReason } from "./entity";
import { EntityRegistry, type EntityRegistration } from "./entity-registry";
import { SeededRandom } from "./random";
import { SpatialQueries } from "./spatial/queries";
import { MatterContactCollector, type EntityContactSnapshot } from "./physics/contacts";
import { bounceFromWall, containEntity, type WallContactSnapshot } from "./physics/arena";
import { CombatResolver, type CombatEvent, type HitEffects, type HitResult, type HitOptions } from "../gameplay/combat/effects";
import { MatchRules, type ImpactSettings, type MatchOutcome } from "../gameplay/match-rules";

export const SIMULATION_STEP_MS = 1000 / 120;

export interface SimulationOptions {
      arena: ArenaBounds;
      seed: number;
      impact?: ImpactSettings;
      collisionCooldownMs?: number;
      globalSpeedMultiplier?: number;
}

type CollisionEvent =
      | { kind: "collision"; contact: "wall"; entityId: string; wall: ArenaWall; incomingSpeed: number }
      | { kind: "collision"; contact: "entity"; entityId: string; otherId: string; incomingSpeed: number };

export type SimulationEvent = CombatEvent | CollisionEvent | { kind: "match-ended"; outcome: MatchOutcome };

/** Headless, fixed-step lifetime and contact owner. The browser only drives step/render. */
export class Simulation {
      readonly engine = Engine.create({ gravity: { x: 0, y: 0 }, enableSleeping: false });
      readonly entities = new EntityRegistry(this.engine.world);
      readonly spatial = new SpatialQueries(this.entities);
      readonly arena: Readonly<ArenaBounds>;
      rng: SeededRandom;
      readonly trace: RuntimeTrace[] = [];
      readonly events: SimulationEvent[] = [];
      readonly rules: MatchRules;
      readonly combat: CombatResolver;
      private readonly contacts = new MatterContactCollector(this.engine, this.entities);
      private readonly baseSpeeds = new Map<string, number>();
      private readonly speedMultiplier: number;
      private seed: number;
      private nextEntitySerial = 0;
      /** Match completion records a result; only disposal stops the world. */
      state: "running" | "ended" | "disposed" = "running";
      nowMs = 0;
      tick = 0;
      readonly eventScheduler = new EventScheduler(this);

      createEventSource<Events extends object>(owner?: Entity): EventSource<Events> {
            if (this.state === "disposed") throw new Error("Cannot create an event source in a disposed simulation");
            if (owner?.events.isBound && owner.events.scheduler !== this.eventScheduler)
                  throw new Error("Event source owner belongs to another simulation");
            const source = new EventSource<Events>();
            source.bind(this.eventScheduler);
            owner?.lifetime.add(() => source.close());
            if (owner && !owner.isAlive) source.close();
            return source;
      }

      constructor(options: SimulationOptions) {
            if (![options.arena.minX, options.arena.maxX, options.arena.minY, options.arena.maxY]
                  .every(Number.isFinite) || options.arena.minX >= options.arena.maxX ||
                  options.arena.minY >= options.arena.maxY) throw new RangeError("Invalid simulation arena");
            this.arena = Object.freeze({ ...options.arena });
            this.seed = options.seed;
            this.rng = new SeededRandom(options.seed);
            this.rules = new MatchRules(options.impact);
            this.speedMultiplier = options.globalSpeedMultiplier ?? 1;
            this.combat = new CombatResolver(this.entities, () => this.nowMs,
                  event => this.events.push(event), options.collisionCooldownMs ?? 100);
            this.contacts.attach();
      }

      get isCombatActive(): boolean { return this.state !== "disposed"; }
      get globalSpeedMultiplier(): number { return this.speedMultiplier; }

      recordTrace(event: RuntimeTrace): void {
            this.trace.push(event);
            if (this.trace.length > 500) this.trace.shift();
      }

      /** Shared allocation lets several equipped emitters spawn without identity collisions. */
      nextRuntimeId(prefix = "entity"): string {
            let id: string;
            do { id = `${prefix}:${++this.nextEntitySerial}`; }
            while (this.entities.hasRuntimeId(id));
            return id;
      }

      add(entity: Entity, registration: EntityRegistration = {}): void {
            if (this.state === "disposed") throw new Error("Cannot spawn in a disposed simulation");
            if (entity.events.isClosed) throw new Error("Cannot register an entity with a closed event source");
            if (entity.events.isBound && entity.events.scheduler !== this.eventScheduler)
                  throw new Error("Entity already belongs to another simulation");
            this.entities.add(entity, registration);
            entity.events.bind(this.eventScheduler);
            entity.events.on("damaged", event => this.events.push({ kind: "damage", ...event }), entity.lifetime);
            this.rules.observeSpawn(entity);
            const initialSpeed = Math.hypot(entity.body.velocity.x, entity.body.velocity.y);
            this.baseSpeeds.set(entity.runtimeId, initialSpeed > 0
                  ? initialSpeed : entity.config.speed * this.speedMultiplier);
            entity.setPeriodicDamageHandler((target, amount, sourceId) => {
                  this.combat.damage(target, amount, { sourceId, independentCooldown: true });
            });
      }

      remove(runtimeId: string, reason: EntityRemovalReason = "removed"): boolean {
            try { return this.entities.remove(runtimeId, reason); }
            finally {
                  if (!this.entities.get(runtimeId)) {
                        this.combat.forget(runtimeId);
                        this.baseSpeeds.delete(runtimeId);
                  }
            }
      }

      hit(source: Entity, target: Entity, effects: HitEffects, options?: HitOptions): HitResult {
            return this.isCombatActive ? this.combat.hit(source, target, effects, options) : {
                  connected: false, actualDamage: 0, knockbackApplied: false,
                  statusesApplied: [], killed: false,
            };
      }

      /** Advances exactly one 120 Hz simulation tick. Callers own real-time accumulation. */
      step(): void {
            if (this.state === "disposed") return;
            this.entities.beginMutationBoundary();
            try {
                  this.nowMs += SIMULATION_STEP_MS;
                  this.tick++;
                  this.eventScheduler.flush();
                  for (const entity of this.entities.all()) if (entity.isAlive) entity.beforeStep(SIMULATION_STEP_MS);
                  this.entities.retireDeadOwners();
                  this.entities.commitRemovals();
                  Engine.update(this.engine, SIMULATION_STEP_MS);
                  const wallContacts: WallContactSnapshot[] = [];
                  for (const entity of this.entities.all()) {
                        if (entity.isAlive && entity.containWithinArena) wallContacts.push(...containEntity(entity, this.arena));
                  }
                  // Wall decisions can acquire a movement policy before default response.
                  for (const contact of wallContacts) this.resolveWall(contact);
                  for (const contact of this.contacts.drain()) this.resolveEntity(contact);
                  for (const entity of this.entities.all()) if (entity.isAlive) entity.afterStep(SIMULATION_STEP_MS);
                  this.entities.retireDeadOwners();
                  const outcome = this.rules.evaluate(this.entities.all());
                  if (outcome && this.state === "running") {
                        this.state = "ended";
                        this.events.push({ kind: "match-ended", outcome });
                        this.entities.retireMatchEnd();
                  }
            } finally {
                  this.entities.endMutationBoundary();
            }
      }

      reset(seed = this.seed): void {
            try { this.retireAll("reset"); }
            finally { this.resetState(seed); }
      }

      private resetState(seed: number): void {
            this.contacts.clear();
            Engine.clear(this.engine);
            this.engine.timing.timestamp = 0;
            this.baseSpeeds.clear();
            this.combat.reset();
            this.events.length = 0;
            this.trace.length = 0;
            this.rules.reset();
            this.nowMs = 0;
            this.tick = 0;
            this.nextEntitySerial = 0;
            this.seed = seed;
            this.rng = new SeededRandom(seed);
            this.state = "running";
      }

      dispose(): void {
            this.state = "disposed";
            try { this.contacts.dispose(); }
            finally { this.retireAll("removed"); }
      }

      /** Observer failures must not leave custom sources or staged delivery in a retired world. */
      private retireAll(reason: EntityRemovalReason): void {
            runAll([() => this.entities.clear(reason), () => this.eventScheduler.clear()]);
      }

      private resolveWall(contact: WallContactSnapshot): void {
            const entity = this.entities.get(contact.id);
            if (!entity || entity.isDead) return;
            const event: ContactEvent = {
                  kind: "wall", self: entity, wall: contact.wall,
                  normal: { ...contact.normal }, incomingSpeed: contact.incomingSpeed,
                  policy: { ...contact.policy }, hadForegroundTask: contact.hadForegroundTask,
            };
            entity.contact(event);
            if (!this.entities.isLive(entity)) return;
            const policy = this.mergePolicy(contact.policy, event.policy, entity.resources.contactPolicy);
            if (policy.defaultBounce) {
                  bounceFromWall(entity, contact);
                  this.events.push({ kind: "collision", contact: "wall", entityId: contact.id,
                        wall: contact.wall, incomingSpeed: contact.incomingSpeed });
            }
            if (policy.allowImpactDamage) this.impact(entity, contact.incomingSpeed);
      }

      private resolveEntity(contact: EntityContactSnapshot): void {
            const first = this.entities.get(contact.first.id);
            const second = this.entities.get(contact.second.id);
            if (!first || !second || first.isDead || second.isDead) return;
            if (!contact.isSensor)
                  this.events.push({ kind: "collision", contact: "entity", entityId: first.runtimeId,
                        otherId: second.runtimeId, incomingSpeed: contact.incomingSpeed });
            const firstEvent = this.entityEvent(first, second, contact.normal, contact.incomingSpeed,
                  contact.first.policy, contact.first.hadForegroundTask);
            const secondEvent = this.entityEvent(second, first,
                  { x: -contact.normal.x, y: -contact.normal.y }, contact.incomingSpeed,
                  contact.second.policy, contact.second.hadForegroundTask);
            first.contact(firstEvent);
            if (this.entities.isLive(second)) second.contact(secondEvent);
            // Components can observe ally/owner contacts (catch, attachments).
            // Ambient impact damage is a match rule for opposing contestants.
            if (first.teamId === second.teamId) return;
            if (!first.tags.has("contestant") || !second.tags.has("contestant")) return;
            if (this.entities.isLive(first) &&
                  this.mergePolicy(contact.first.policy, firstEvent.policy, first.resources.contactPolicy).allowImpactDamage)
                  this.impact(first, contact.incomingSpeed);
            if (this.entities.isLive(second) &&
                  this.mergePolicy(contact.second.policy, secondEvent.policy, second.resources.contactPolicy).allowImpactDamage)
                  this.impact(second, contact.incomingSpeed);
      }

      private entityEvent(self: Entity, other: Entity, normal: Readonly<Vector2>,
            incomingSpeed: number, policy: Readonly<ContactPolicy>, hadForegroundTask: boolean): ContactEvent {
            return { kind: "entity", self, other, normal: { ...normal }, incomingSpeed,
                  policy: { ...policy }, hadForegroundTask };
      }

      private impact(entity: Entity, incomingSpeed: number): void {
            const damage = this.rules.impactDamage(entity, incomingSpeed,
                  this.baseSpeeds.get(entity.runtimeId) ?? entity.config.speed * this.speedMultiplier);
            if (damage > 0) this.combat.damage(entity, damage);
      }

      private mergePolicy(...policies: readonly ContactPolicy[]): ContactPolicy {
            return { defaultBounce: policies.every(policy => policy.defaultBounce),
                  allowImpactDamage: policies.every(policy => policy.allowImpactDamage) };
      }
}
